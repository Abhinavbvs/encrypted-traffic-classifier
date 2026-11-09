"""Generates realistic encrypted traffic PCAP files for real-world testing and demos.

Creates sample packet captures representing distinct application behaviors:
1. browsing_https.pcap (Interactive web browsing bursts over port 443)
2. streaming_video.pcap (High-throughput DASH chunk delivery bursts)
3. voip_call.pcap (Symmetrical 20ms G.711 / Opus audio call over UDP)
4. file_transfer.pcap (Bulk TCP file transfer with high packet density)
"""

from pathlib import Path
import random
import time
from scapy.layers.inet import IP, TCP, UDP
from scapy.utils import wrpcap


def generate_browsing_pcap(out_path: Path):
    """Simulate HTTPS web browsing: quick request burst, server response, then user reading pause."""
    pkts = []
    base_time = 1700000000.0
    client_ip = "192.168.1.105"
    server_ip = "104.244.42.1"  # CDN IP
    client_port = 52410
    server_port = 443

    # Handshake
    t = base_time
    # SYN
    pkts.append(IP(src=client_ip, dst=server_ip) / TCP(sport=client_port, dport=server_port, flags="S") / b"")
    pkts[-1].time = t
    t += 0.025
    # SYN-ACK
    pkts.append(IP(src=server_ip, dst=client_ip) / TCP(sport=server_port, dport=client_port, flags="SA") / b"")
    pkts[-1].time = t
    t += 0.024
    # ACK
    pkts.append(IP(src=client_ip, dst=server_ip) / TCP(sport=client_port, dport=server_port, flags="A") / b"")
    pkts[-1].time = t

    # TLS Client Hello & Request burst
    t += 0.010
    for i in range(5):
        t += random.uniform(0.005, 0.030)
        p = IP(src=client_ip, dst=server_ip) / TCP(sport=client_port, dport=server_port, flags="PA") / (b"\x17\x03\x03" + bytes([random.randint(0, 255) for _ in range(350)]))
        p.time = t
        pkts.append(p)

    # Server responds with assets
    for i in range(12):
        t += random.uniform(0.002, 0.015)
        p = IP(src=server_ip, dst=client_ip) / TCP(sport=server_port, dport=client_port, flags="A") / (b"\x17\x03\x03" + bytes([random.randint(0, 255) for _ in range(1200)]))
        p.time = t
        pkts.append(p)

    # User pauses to read page (6.5 seconds idle gap)
    t += 6.5

    # User clicks second link
    for i in range(4):
        t += random.uniform(0.008, 0.040)
        p = IP(src=client_ip, dst=server_ip) / TCP(sport=client_port, dport=server_port, flags="PA") / (b"\x17\x03\x03" + bytes([random.randint(0, 255) for _ in range(280)]))
        p.time = t
        pkts.append(p)

    for i in range(8):
        t += random.uniform(0.003, 0.020)
        p = IP(src=server_ip, dst=client_ip) / TCP(sport=server_port, dport=client_port, flags="A") / (b"\x17\x03\x03" + bytes([random.randint(0, 255) for _ in range(1150)]))
        p.time = t
        pkts.append(p)

    wrpcap(str(out_path), pkts)
    print(f"Generated: {out_path} ({len(pkts)} packets)")


def generate_streaming_pcap(out_path: Path):
    """Simulate Video Streaming: large chunk burst followed by buffer idle pauses."""
    pkts = []
    base_time = 1700000000.0
    client_ip = "192.168.1.105"
    server_ip = "142.250.190.46"  # YouTube / Google video server
    client_port = 49152
    server_port = 443

    t = base_time
    # Handshake
    pkts.append(IP(src=client_ip, dst=server_ip) / TCP(sport=client_port, dport=server_port, flags="S") / b"")
    pkts[-1].time = t
    t += 0.015
    pkts.append(IP(src=server_ip, dst=client_ip) / TCP(sport=server_port, dport=client_port, flags="SA") / b"")
    pkts[-1].time = t
    t += 0.015

    # Video Chunk 1 download (high density download)
    for _ in range(35):
        t += random.uniform(0.0008, 0.003)
        p = IP(src=server_ip, dst=client_ip) / TCP(sport=server_port, dport=client_port, flags="A") / (b"\x17\x03\x03" + bytes([random.randint(0, 255) for _ in range(1400)]))
        p.time = t
        pkts.append(p)

    # Periodic ACKs from client
    t_ack = base_time + 0.05
    for _ in range(10):
        t_ack += 0.01
        p = IP(src=client_ip, dst=server_ip) / TCP(sport=client_port, dport=server_port, flags="A") / b""
        p.time = t_ack
        pkts.append(p)

    # Playback buffer idle pause (5.2 seconds idle)
    t = base_time + 5.3

    # Video Chunk 2 download
    for _ in range(40):
        t += random.uniform(0.0008, 0.003)
        p = IP(src=server_ip, dst=client_ip) / TCP(sport=server_port, dport=client_port, flags="A") / (b"\x17\x03\x03" + bytes([random.randint(0, 255) for _ in range(1400)]))
        p.time = t
        pkts.append(p)

    # Sort packets strictly by timestamp
    pkts.sort(key=lambda p: float(p.time))
    wrpcap(str(out_path), pkts)
    print(f"Generated: {out_path} ({len(pkts)} packets)")


def generate_voip_pcap(out_path: Path):
    """Simulate VoIP audio call: steady 20ms symmetric UDP packets."""
    pkts = []
    base_time = 1700000000.0
    client_ip = "192.168.1.105"
    server_ip = "52.114.128.5"  # Teams / Zoom media relay
    client_port = 50020
    server_port = 50020

    t = base_time
    # 5 seconds of active audio (250 packets in each direction, 20ms apart)
    for _ in range(150):
        t += 0.020 + random.uniform(-0.001, 0.001)  # 20ms cadence with low jitter
        # Forward audio packet
        pf = IP(src=client_ip, dst=server_ip) / UDP(sport=client_port, dport=server_port) / bytes([random.randint(0, 255) for _ in range(160)])
        pf.time = t
        pkts.append(pf)

        # Backward audio packet
        pb = IP(src=server_ip, dst=client_ip) / UDP(sport=server_port, dport=client_port) / bytes([random.randint(0, 255) for _ in range(160)])
        pb.time = t + 0.005
        pkts.append(pb)

    pkts.sort(key=lambda p: float(p.time))
    wrpcap(str(out_path), pkts)
    print(f"Generated: {out_path} ({len(pkts)} packets)")


def generate_file_transfer_pcap(out_path: Path):
    """Simulate File Transfer: continuous sustained stream with zero idle time."""
    pkts = []
    base_time = 1700000000.0
    client_ip = "192.168.1.105"
    server_ip = "13.107.136.9"  # OneDrive / Storage server
    client_port = 51234
    server_port = 443

    t = base_time
    for _ in range(90):
        t += random.uniform(0.0004, 0.0015)
        p = IP(src=server_ip, dst=client_ip) / TCP(sport=server_port, dport=client_port, flags="A") / (b"\x17\x03\x03" + bytes([random.randint(0, 255) for _ in range(1420)]))
        p.time = t
        pkts.append(p)

    pkts.sort(key=lambda p: float(p.time))
    wrpcap(str(out_path), pkts)
    print(f"Generated: {out_path} ({len(pkts)} packets)")


def generate_all_samples():
    out_dir = Path("data/sample_pcaps")
    out_dir.mkdir(parents=True, exist_ok=True)

    generate_browsing_pcap(out_dir / "browsing_https.pcap")
    generate_streaming_pcap(out_dir / "streaming_video.pcap")
    generate_voip_pcap(out_dir / "voip_call.pcap")
    generate_file_transfer_pcap(out_dir / "file_transfer.pcap")


if __name__ == "__main__":
    generate_all_samples()
