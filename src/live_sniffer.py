"""Live Network Interface Sniffer and Real-Time Flow Classifier.

Sniffs active packets off local network interfaces (Wi-Fi, Ethernet, loopback),
groups them into bidirectional 5-tuple IP flows without inspecting payload content,
extracts the 23 timing features, and predicts traffic categories in real time.
"""

from __future__ import annotations

import argparse
import tempfile
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import pandas as pd
from scapy.all import conf, get_working_ifaces, sniff, wrpcap

from src.llm_explainer import explain_flow
from src.pcap_extractor import extract_flows_from_pcap
from src.predict import explain_feature_contributions, load_artifacts, predict_flows


def list_interfaces() -> List[Dict[str, str]]:
    """Return available network interfaces with their name and description."""
    ifaces = []
    try:
        working = get_working_ifaces()
        for iface in working:
            ifaces.append({
                "name": iface.name,
                "description": getattr(iface, "description", iface.name),
                "ip": getattr(iface, "ip", "N/A"),
                "mac": getattr(iface, "mac", "N/A"),
            })
    except Exception:
        # Fallback to conf.ifaces
        for k, v in conf.ifaces.items():
            ifaces.append({
                "name": str(k),
                "description": getattr(v, "description", str(k)),
                "ip": getattr(v, "ip", "N/A"),
                "mac": getattr(v, "mac", "N/A"),
            })
    return ifaces


def sniff_and_classify(
    iface: Optional[str] = None,
    duration: float = 10.0,
    count: int = 150,
    bpf_filter: str = "ip and (tcp or udp)",
    confidence_threshold: float = 0.5,
    model_artifacts: Optional[Tuple[Any, Any, List[str], Dict[int, str]]] = None,
) -> Dict[str, Any]:
    """Capture live packets from a network interface, extract flows, and predict classes.

    Args:
        iface: Interface name or None for Scapy default.
        duration: Sniff duration in seconds.
        count: Maximum number of packets to capture.
        bpf_filter: BPF filter string (defaults to IP TCP/UDP).
        confidence_threshold: Minimum confidence score before flagging uncertain.
        model_artifacts: Optional preloaded (model, scaler, feature_cols, label_map).

    Returns:
        Dictionary containing captured flow count, metadata, predictions, and latency.
    """
    if model_artifacts is None:
        model, scaler, feature_cols, label_map = load_artifacts()
    else:
        model, scaler, feature_cols, label_map = model_artifacts

    t0 = time.perf_counter()
    packets = []

    # Sniff packets defensively
    try:
        kwargs: Dict[str, Any] = {
            "timeout": max(0.5, float(duration)),
            "filter": bpf_filter,
            "store": True,
        }
        if iface:
            kwargs["iface"] = iface
        if count > 0:
            kwargs["count"] = count

        packets = sniff(**kwargs)
    except Exception as e:
        return {
            "status": "error",
            "message": f"Sniffing error ({type(e).__name__}: {e}). Ensure you have sufficient permissions (Administrator/libpcap/npcap).",
            "flows": [],
            "packets_captured": 0,
            "elapsed_seconds": round(time.perf_counter() - t0, 2),
        }

    sniff_dur = round(time.perf_counter() - t0, 3)

    if not packets:
        return {
            "status": "no_packets",
            "message": f"No IP TCP/UDP packets observed during {sniff_dur}s capture window.",
            "flows": [],
            "packets_captured": 0,
            "elapsed_seconds": sniff_dur,
        }

    # Persist captured packets to a temporary PCAP for Scapy PcapReader extraction
    tmp_path: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pcap", delete=False) as tf:
            tmp_path = Path(tf.name)
        wrpcap(str(tmp_path), packets)
        features_df, metadata_df = extract_flows_from_pcap(tmp_path)
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
    if len(features_df) == 0:
        return {
            "status": "no_flows",
            "message": f"Captured {len(packets)} packets, but no complete IP flow sessions were reconstructed.",
            "flows": [],
            "packets_captured": len(packets),
            "elapsed_seconds": sniff_dur,
        }

    # Predict flows
    pred_df, infer_latency = predict_flows(
        features_df,
        model=model,
        scaler=scaler,
        feature_columns=feature_cols,
        label_map=label_map,
        confidence_threshold=confidence_threshold,
    )

    combined = pd.concat([metadata_df, pred_df], axis=1)
    flows = []
    for i in range(len(combined)):
        row = combined.iloc[i]
        feats = features_df.iloc[i].to_dict()
        top3 = [
            {"class": row[f"top{k}_class"], "probability": round(float(row[f"top{k}_prob"]), 4)}
            for k in (1, 2, 3) if row.get(f"top{k}_class") is not None
        ]
        probabilities = {
            k[5:]: round(float(row[k]), 6)
            for k in combined.columns
            if k.startswith("prob_")
        }
        drivers = explain_feature_contributions(
            feats, model, scaler, feature_cols, label_map, target_class=row["top1_class"], top_k=5
        )
        exp = explain_flow(feats, {"predicted_class": row["top1_class"], "confidence": float(row["confidence"]), "top3": top3})
        flows.append({
            "id": i,
            "src_ip": row["src_ip"],
            "src_port": int(row["src_port"]),
            "dst_ip": row["dst_ip"],
            "dst_port": int(row["dst_port"]),
            "protocol": row["protocol"],
            "packet_count": int(row["packet_count"]),
            "byte_count": int(row["byte_count"]),
            "duration_sec": float(row["duration_sec"]),
            "predicted_class": row["predicted_class"],
            "top_class": row["top1_class"],
            "confidence": round(float(row["confidence"]), 4),
            "is_uncertain": bool(row["is_uncertain"]),
            "status": row["status"],
            "top3": top3,
            "probabilities": probabilities,
            "top_drivers": drivers,
            "explanation": exp.get("explanation"),
            "explainer": exp.get("provider"),
            "features": feats,
        })

    iface_name = iface or getattr(conf.iface, "name", "default")
    return {
        "status": "success",
        "file": f"live:{iface_name}",
        "interface": iface_name,
        "threshold": confidence_threshold,
        "mode": "live",
        "packets_captured": len(packets),
        "flow_count": len(flows),
        "sniff_seconds": sniff_dur,
        "latency_ms": round(infer_latency, 3),
        "inference_latency_ms": round(infer_latency, 3),
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
        "total_elapsed_seconds": round(time.perf_counter() - t0, 3),
        "flows": flows,
    }


def main():
    parser = argparse.ArgumentParser(description="Live encrypted network traffic sniffer & classifier.")
    parser.add_argument("--iface", default=None, help="Interface name to sniff on (omit for default).")
    parser.add_argument("--duration", type=float, default=8.0, help="Sniff duration in seconds (default: 8.0).")
    parser.add_argument("--count", type=int, default=150, help="Maximum packets to capture (default: 150).")
    parser.add_argument("--threshold", type=float, default=0.5, help="Confidence threshold (default: 0.5).")
    parser.add_argument("--list-ifaces", action="store_true", help="List available interfaces and exit.")
    args = parser.parse_args()

    if args.list_ifaces:
        print("\nAvailable Network Interfaces:")
        for idx, iface in enumerate(list_interfaces(), 1):
            print(f"  [{idx}] {iface['name']} - {iface['description']} (IP: {iface['ip']}, MAC: {iface['mac']})")
        return

    print(f"\n[*] Starting live sniffer on interface '{args.iface or 'default'}' for {args.duration}s (max {args.count} pkts)...")
    res = sniff_and_classify(
        iface=args.iface,
        duration=args.duration,
        count=args.count,
        confidence_threshold=args.threshold,
    )

    if res["status"] != "success":
        print(f"\n[!] {res['message']}")
        return

    print(f"\n[+] Captured {res['packets_captured']} packets in {res['sniff_seconds']}s -> reconstructed {res['flow_count']} flows.")
    print(f"[+] Model latency: {res['inference_latency_ms']} ms/flow\n")
    print(f"{'#':<3} {'5-Tuple':<38} {'Verdict':<15} {'Confidence':<12} {'Runner-up':<15}")
    print("-" * 88)

    for f in res["flows"]:
        tuple_str = f"{f['src_ip']}:{f['src_port']} -> {f['dst_ip']}:{f['dst_port']} ({f['protocol']})"
        conf_str = f"{f['confidence']:.1%}"
        runner = f"{f['top3'][1]['class']} ({f['top3'][1]['probability']:.1%})" if len(f["top3"]) > 1 else "None"
        print(f"{f['id']+1:<3} {tuple_str:<38} {f['predicted_class']:<15} {conf_str:<12} {runner:<15}")
        print(f"    Reason: {f['explanation']}\n")


if __name__ == "__main__":
    main()
