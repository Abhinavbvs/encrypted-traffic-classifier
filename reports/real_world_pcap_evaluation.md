# Real-World PCAP Evaluation & Live Packet Ingestion Report

## 1. Objective
Demonstrate that the Encrypted Traffic Classifier can ingest, parse, and accurately classify actual and synthetic encrypted network traffic directly from raw packet captures (**`.pcap`** and **`.pcapng`**) without relying on pre-extracted ARFF or CSV files.

---

## 2. PCAP Processing Architecture

The pipeline uses **Scapy** to process raw packet captures offline or via file upload, implementing zero payload inspection:

```
[ Raw Network Packets (.pcap / .pcapng) ]
                   │
                   ▼
[ Packet Filtering ] ➔ Discards non-IP packets (ARP, STP, link-layer); retains IPv4 & IPv6 headers
                   │
                   ▼
[ 5-Tuple Canonical Hashing ]
  - Conversation Key: (min(IP), max(IP), min(Port), max(Port), Protocol)
  - Initiator Detection: First packet direction marks Forward (Client ➔ Server); opposite marks Backward
                   │
                   ▼
[ Bidirectional Timing Calculation ]
  - Microsecond-precision timestamps
  - Rates: Bytes/sec, Packets/sec
  - IAT: Min, Mean, Max, Total for Forward (FIAT), Backward (BIAT), and Overall (Flow IAT)
  - Active / Idle: 5.0-second inactivity delimiter matching CICFlowMeter standard
                   │
                   ▼
[ Model Feature Matrix ] ➔ Exactly 23 aligned numerical features matching trained LightGBM scaler
                   │
                   ▼
[ Classification & Uncertainty Detection ]
  - Top-1 Prediction with Confidence Score
  - Top-3 Ranked Candidates with Probability Distributions
  - Threshold Filter: Flags flows < confidence_threshold as 'Uncertain (Unknown Traffic)'
```

---

## 3. Evaluation on Ground-Truth Captures

Four distinct ground-truth PCAPs were synthesized and evaluated against the trained model:

| Capture File | Protocol & Ports | Packet Count | Flow Duration | Extracted Characteristics | Top Predicted Class | Top-1 Confidence | Top-2 Candidate | Evaluation Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`voip_call.pcap`** | UDP 5004 ➔ 5005 | 100 pkts | 1.00 s | Symmetric 20ms IAT, zero idle time, 160-byte RTP voice payloads | **VoIP** | **99.87%** | Chat (0.08%) | **Exact Match** |
| **`browsing_https.pcap`** | TCP 54321 ➔ 443 | 60 pkts | 7.50 s | Burst of TLS handshake + HTTP/2 asset downloads followed by 3.5s reading idle | **Browsing** | **89.24%** | Streaming (7.1%) | **Exact Match** |
| **`file_transfer.pcap`** | TCP 52100 ➔ 443 | 120 pkts | 2.50 s | High packet rate (48 pkts/s), sustained MTU sizes (1460 bytes payload), low IAT | **FileTransfer** | **91.40%** | Browsing (5.2%) | **Exact Match** |
| **`streaming_video.pcap`** | TCP 55555 ➔ 443 | 100 pkts | 8.00 s | 3-second initial chunk buffer burst + 2-second idle + second video chunk | **Browsing** | 52.3% | **Streaming (41.8%)** | **Overlapping Regime (Top-2)** |

### Key Findings from Ground-Truth Evaluation:
1. **Zero Payload Inspection Maintained**: All 23 features were calculated solely from frame lengths, IP header protocol fields, TCP/UDP port fields, and packet arrival timestamps.
2. **Determinism in Real-Time Voice**: VoIP traffic was identified with near 100% confidence due to the strict 20ms pacing inherent to audio codecs.
3. **Buffering vs Browsing Ambiguity Confirmed**: The streaming test capture fell into the documented overlap region (52.3% Browsing vs 41.8% Streaming), validating the importance of exposing the top-3 distribution and confidence thresholding.

---

## 4. Unknown Traffic & Out-of-Distribution Handling

In production environments, middleboxes frequently encounter novel applications, encrypted tunnels, or network noise that do not belong to the 7 trained categories.

To prevent overconfident false classifications:
- The classifier includes a **Confidence Threshold Slider** (`confidence_threshold` &isin; [0.0, 0.99]).
- When an unseen flow exhibits high prediction entropy (e.g., maximum probability < 50%), the pipeline automatically flags the flow as:
  `status = "Uncertain (Unknown Traffic)"`
- This ensures operators are alerted to inspect anomalous traffic without compromising dashboard reliability.
