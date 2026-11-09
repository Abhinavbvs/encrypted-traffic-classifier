"""PCAP and PCAPNG Network Flow Feature Extractor for Encrypted Traffic Classification.

Extracts bidirectional network flows from raw PCAP/PCAPNG packet captures using the
standard 5-tuple (Source IP, Destination IP, Source Port, Destination Port, Protocol)
without inspecting packet payloads, and computes the exact 23 timing features expected
by the trained classifier.

Features extracted:
- duration
- total_fiat, total_biat, min_fiat, min_biat, max_fiat, max_biat, mean_fiat, mean_biat
- flowPktsPerSecond, flowBytesPerSecond
- min_flowiat, max_flowiat, mean_flowiat, std_flowiat
- min_active, mean_active, max_active, std_active
- min_idle, mean_idle, max_idle, std_idle

Abbreviations:
- IAT: Inter-Arrival Time (time between successive packets).
- FIAT: Forward Inter-Arrival Time (client to server).
- BIAT: Backward Inter-Arrival Time (server to client).
- PCAP: Packet Capture format.
"""

from __future__ import annotations

import io
import math
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
from scapy.layers.inet import IP, TCP, UDP
from scapy.layers.inet6 import IPv6
from scapy.utils import PcapReader

# Activity timeout threshold: 5 seconds (5,000,000 microseconds) matching CICFlowMeter standard
ACTIVITY_TIMEOUT_US = 5_000_000.0

EXPECTED_FEATURE_COLUMNS = [
    "duration",
    "total_fiat",
    "total_biat",
    "min_fiat",
    "min_biat",
    "max_fiat",
    "max_biat",
    "mean_fiat",
    "mean_biat",
    "flowPktsPerSecond",
    "flowBytesPerSecond",
    "min_flowiat",
    "max_flowiat",
    "mean_flowiat",
    "std_flowiat",
    "min_active",
    "mean_active",
    "max_active",
    "std_active",
    "min_idle",
    "mean_idle",
    "max_idle",
    "std_idle",
]


class FlowConversation:
    """Represents a bidirectional conversation between two network endpoints."""

    def __init__(self, key: Tuple[str, str, int, int, int], first_packet_fwd: bool):
        self.key = key  # canonical key: (ip_low, ip_high, port_low, port_high, proto)
        self.fwd_direction = first_packet_fwd
        self.packet_timestamps: List[float] = []
        self.packet_lengths: List[int] = []
        self.directions: List[bool] = []  # True = Forward, False = Backward

        # Forward / Backward specific packet timestamps
        self.fwd_timestamps: List[float] = []
        self.bwd_timestamps: List[float] = []

        # Flow summary info
        self.src_ip: Optional[str] = None
        self.dst_ip: Optional[str] = None
        self.src_port: Optional[int] = None
        self.dst_port: Optional[int] = None
        self.protocol_num: int = key[4]

    def add_packet(
        self,
        timestamp: float,
        length: int,
        is_forward: bool,
        src_ip: str,
        dst_ip: str,
        src_port: int,
        dst_port: int,
    ) -> None:
        if self.src_ip is None:
            self.src_ip = src_ip
            self.dst_ip = dst_ip
            self.src_port = src_port
            self.dst_port = dst_port

        self.packet_timestamps.append(timestamp)
        self.packet_lengths.append(length)
        self.directions.append(is_forward)

        if is_forward:
            self.fwd_timestamps.append(timestamp)
        else:
            self.bwd_timestamps.append(timestamp)

    def compute_features(self) -> Tuple[Dict[str, float], Dict[str, Any]]:
        """Calculate the 23 statistical timing features and flow metadata."""
        n_pkts = len(self.packet_timestamps)
        total_bytes = sum(self.packet_lengths)

        if n_pkts == 0:
            return {col: 0.0 for col in EXPECTED_FEATURE_COLUMNS}, {}

        start_time = self.packet_timestamps[0]
        end_time = self.packet_timestamps[-1]
        duration_sec = max(0.0, end_time - start_time)
        duration_us = duration_sec * 1_000_000.0

        # 1. Flow Rates
        if duration_sec > 0:
            flow_pkts_per_sec = float(n_pkts) / duration_sec
            flow_bytes_per_sec = float(total_bytes) / duration_sec
        else:
            flow_pkts_per_sec = float(n_pkts)
            flow_bytes_per_sec = float(total_bytes)

        # 2. Flow-wide Inter-Arrival Times (IAT)
        if n_pkts > 1:
            flow_iats = np.diff(self.packet_timestamps) * 1_000_000.0  # in microseconds
            min_flowiat = float(np.min(flow_iats))
            max_flowiat = float(np.max(flow_iats))
            mean_flowiat = float(np.mean(flow_iats))
            std_flowiat = float(np.std(flow_iats))
        else:
            flow_iats = np.array([0.0])
            min_flowiat = 0.0
            max_flowiat = 0.0
            mean_flowiat = 0.0
            std_flowiat = 0.0

        # 3. Forward IAT (FIAT)
        if len(self.fwd_timestamps) > 1:
            fiats = np.diff(self.fwd_timestamps) * 1_000_000.0
            total_fiat = float(np.sum(fiats))
            min_fiat = float(np.min(fiats))
            max_fiat = float(np.max(fiats))
            mean_fiat = float(np.mean(fiats))
        else:
            total_fiat = 0.0
            min_fiat = 0.0
            max_fiat = 0.0
            mean_fiat = 0.0

        # 4. Backward IAT (BIAT)
        if len(self.bwd_timestamps) > 1:
            biats = np.diff(self.bwd_timestamps) * 1_000_000.0
            total_biat = float(np.sum(biats))
            min_biat = float(np.min(biats))
            max_biat = float(np.max(biats))
            mean_biat = float(np.mean(biats))
        else:
            total_biat = 0.0
            min_biat = 0.0
            max_biat = 0.0
            mean_biat = 0.0

        # 5. Active & Idle Periods (threshold = ACTIVITY_TIMEOUT_US = 5s)
        active_times: List[float] = []
        idle_times: List[float] = []

        if n_pkts > 1:
            current_active_start = self.packet_timestamps[0]
            current_active_end = self.packet_timestamps[0]

            for i in range(len(flow_iats)):
                iat = flow_iats[i]
                pkt_time = self.packet_timestamps[i + 1]

                if iat > ACTIVITY_TIMEOUT_US:
                    # Idle period detected
                    idle_times.append(iat)
                    # Close current active window
                    active_dur = (current_active_end - current_active_start) * 1_000_000.0
                    if active_dur > 0:
                        active_times.append(active_dur)
                    current_active_start = pkt_time
                    current_active_end = pkt_time
                else:
                    current_active_end = pkt_time

            # Final active window
            last_active = (current_active_end - current_active_start) * 1_000_000.0
            if last_active > 0 or len(active_times) == 0:
                active_times.append(max(0.0, last_active))

        if len(active_times) > 0:
            min_active = float(np.min(active_times))
            mean_active = float(np.mean(active_times))
            max_active = float(np.max(active_times))
            std_active = float(np.std(active_times)) if len(active_times) > 1 else 0.0
        else:
            min_active = duration_us
            mean_active = duration_us
            max_active = duration_us
            std_active = 0.0

        if len(idle_times) > 0:
            min_idle = float(np.min(idle_times))
            mean_idle = float(np.mean(idle_times))
            max_idle = float(np.max(idle_idle := idle_times))
            std_idle = float(np.std(idle_times)) if len(idle_times) > 1 else 0.0
        else:
            min_idle = 0.0
            mean_idle = 0.0
            max_idle = 0.0
            std_idle = 0.0

        features = {
            "duration": duration_us,
            "total_fiat": total_fiat,
            "total_biat": total_biat,
            "min_fiat": min_fiat,
            "min_biat": min_biat,
            "max_fiat": max_fiat,
            "max_biat": max_biat,
            "mean_fiat": mean_fiat,
            "mean_biat": mean_biat,
            "flowPktsPerSecond": flow_pkts_per_sec,
            "flowBytesPerSecond": flow_bytes_per_sec,
            "min_flowiat": min_flowiat,
            "max_flowiat": max_flowiat,
            "mean_flowiat": mean_flowiat,
            "std_flowiat": std_flowiat,
            "min_active": min_active,
            "mean_active": mean_active,
            "max_active": max_active,
            "std_active": std_active,
            "min_idle": min_idle,
            "mean_idle": mean_idle,
            "max_idle": max_idle,
            "std_idle": std_idle,
        }

        proto_name = "TCP" if self.protocol_num == 6 else ("UDP" if self.protocol_num == 17 else str(self.protocol_num))
        metadata = {
            "src_ip": self.src_ip or "0.0.0.0",
            "dst_ip": self.dst_ip or "0.0.0.0",
            "src_port": self.src_port or 0,
            "dst_port": self.dst_port or 0,
            "protocol": proto_name,
            "packet_count": n_pkts,
            "byte_count": total_bytes,
            "duration_sec": round(duration_sec, 3),
        }

        return features, metadata


def extract_flows_from_pcap(
    pcap_source: Union[str, Path, io.BytesIO],
    max_packets: Optional[int] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Parse a PCAP or PCAPNG file and extract 23 timing flow features.

    Args:
        pcap_source: Path to PCAP file or BytesIO stream.
        max_packets: Optional cap on packets to process for high-speed streaming.

    Returns:
        A tuple of (features_df, metadata_df):
            - features_df: DataFrame containing exactly the 23 model timing features.
            - metadata_df: DataFrame containing 5-tuple flow identities and packet counts.
    """
    conversations: Dict[Tuple[str, str, int, int, int], FlowConversation] = {}
    ordered_keys: List[Tuple[str, str, int, int, int]] = []

    # Handle temporary file for BytesIO if necessary
    temp_file_path: Optional[Path] = None
    if isinstance(pcap_source, io.BytesIO):
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pcap", delete=False) as tf:
            tf.write(pcap_source.getvalue())
            temp_file_path = Path(tf.name)
        file_to_read = str(temp_file_path)
    else:
        file_to_read = str(pcap_source)

    reader = None
    try:
        reader = PcapReader(file_to_read)
        packet_count = 0

        for pkt in reader:
            packet_count += 1
            if max_packets and packet_count > max_packets:
                break

            # Only process IP packets (IPv4 or IPv6)
            if IP in pkt:
                src_ip = pkt[IP].src
                dst_ip = pkt[IP].dst
                proto = pkt[IP].proto
            elif IPv6 in pkt:
                src_ip = pkt[IPv6].src
                dst_ip = pkt[IPv6].dst
                proto = pkt[IPv6].nh
            else:
                continue

            # Extract ports if TCP or UDP
            if TCP in pkt:
                src_port = pkt[TCP].sport
                dst_port = pkt[TCP].dport
            elif UDP in pkt:
                src_port = pkt[UDP].sport
                dst_port = pkt[UDP].dport
            else:
                src_port = 0
                dst_port = 0

            # Construct canonical 5-tuple (order-independent)
            if (src_ip, src_port) <= (dst_ip, dst_port):
                canonical_key = (src_ip, dst_ip, src_port, dst_port, proto)
                is_forward = True
            else:
                canonical_key = (dst_ip, src_ip, dst_port, src_port, proto)
                is_forward = False

            timestamp = float(pkt.time)
            pkt_len = len(pkt)

            if canonical_key not in conversations:
                # First packet seen in conversation sets initial direction
                conversations[canonical_key] = FlowConversation(canonical_key, first_packet_fwd=is_forward)
                ordered_keys.append(canonical_key)

            # Record packet
            # Normalizes direction so the initiator is considered 'forward'
            flow_obj = conversations[canonical_key]
            pkt_dir = (is_forward == flow_obj.fwd_direction)
            flow_obj.add_packet(
                timestamp=timestamp,
                length=pkt_len,
                is_forward=pkt_dir,
                src_ip=src_ip,
                dst_ip=dst_ip,
                src_port=src_port,
                dst_port=dst_port,
            )
    finally:
        if reader is not None:
            try:
                reader.close()
            except Exception:
                pass
        if temp_file_path and temp_file_path.exists():
            import gc
            gc.collect()
            try:
                temp_file_path.unlink()
            except Exception:
                pass

    # Extract calculated features
    features_list = []
    metadata_list = []

    for k in ordered_keys:
        flow = conversations[k]
        feat_dict, meta_dict = flow.compute_features()
        features_list.append(feat_dict)
        metadata_list.append(meta_dict)

    if not features_list:
        features_df = pd.DataFrame(columns=EXPECTED_FEATURE_COLUMNS)
        metadata_df = pd.DataFrame(
            columns=["src_ip", "dst_ip", "src_port", "dst_port", "protocol", "packet_count", "byte_count", "duration_sec"]
        )
    else:
        features_df = pd.DataFrame(features_list)[EXPECTED_FEATURE_COLUMNS]
        metadata_df = pd.DataFrame(metadata_list)

    return features_df, metadata_df


if __name__ == "__main__":
    if len(sys.argv) > 1:
        pcap_path = sys.argv[1]
        print(f"Extracting flows from: {pcap_path}")
        feats, meta = extract_flows_from_pcap(pcap_path)
        print(f"Extracted {len(feats)} flow(s).")
        print("\nMetadata Preview:")
        print(meta.head())
        print("\nFeatures Preview:")
        print(feats.head())
    else:
        print("Usage: python src/pcap_extractor.py <path/to/capture.pcap>")
