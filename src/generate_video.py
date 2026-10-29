"""Generates a professional high-definition animated demo video explaining the project.

Creates a 1920x1080 animated walkthrough with 6 distinct scenes:
1. Title & Problem Statement: The Encryption Challenge
2. The Solution: Timing-Based Flow Fingerprinting (23 Features, Zero Payload)
3. Model Benchmark & Results: LightGBM vs XGBoost vs Random Forest
4. Live Batch Classification & Top-3 Ranked Candidates
5. Explainable AI (XAI) & 3-Tier Fallback Layer
6. Summary & Live Demo Call-to-Action
"""

import cv2
import numpy as np
from pathlib import Path

WIDTH, HEIGHT = 1920, 1080
FPS = 30


def create_gradient_bg(c1=(15, 23, 42), c2=(30, 41, 59)):
    """Generate smooth vertical gradient background in BGR."""
    bg = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        color = [int(c1[i] * (1 - ratio) + c2[i] * ratio) for i in range(3)]
        bg[y, :] = color
    return bg


def draw_header(frame, title, subtitle):
    # Top bar accent
    cv2.rectangle(frame, (0, 0), (WIDTH, 8), (59, 130, 246), -1)
    # Header box
    cv2.putText(frame, title.upper(), (100, 110), cv2.FONT_HERSHEY_DUPLEX, 1.3, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, subtitle, (100, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (148, 163, 184), 1, cv2.LINE_AA)
    cv2.line(frame, (100, 190), (WIDTH - 100, 190), (51, 65, 85), 2)


def draw_card(frame, x, y, w, h, bg_color=(30, 41, 59), border_color=(71, 85, 105)):
    cv2.rectangle(frame, (x, y), (x + w, y + h), bg_color, -1)
    cv2.rectangle(frame, (x, y), (x + w, y + h), border_color, 2)


def generate_video():
    out_dir = Path("reports")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = str(out_dir / "encrypted_traffic_classifier_demo.mp4")

    # Define video writer (mp4v codec works universally)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_path, fourcc, FPS, (WIDTH, HEIGHT))

    print(f"Rendering demo video to: {out_path} ...")

    # --- Scene 1: Title & Overview (6 seconds = 180 frames) ---
    base_bg = create_gradient_bg((15, 23, 42), (30, 41, 59))
    for f in range(180):
        frame = base_bg.copy()
        # Top banner
        cv2.rectangle(frame, (0, 0), (WIDTH, 12), (59, 130, 246), -1)

        # Title card
        draw_card(frame, 150, 220, 1620, 640, (24, 32, 47), (59, 130, 246))

        # Main Title
        cv2.putText(frame, "ENCRYPTED TRAFFIC CLASSIFIER", (220, 340), cv2.FONT_HERSHEY_DUPLEX, 2.0, (255, 255, 255), 3, cv2.LINE_AA)
        cv2.putText(frame, "WITHOUT PAYLOAD INSPECTION", (220, 420), cv2.FONT_HERSHEY_DUPLEX, 1.4, (96, 165, 250), 2, cv2.LINE_AA)

        # Tagline
        cv2.putText(frame, "Privacy-Preserving Machine Learning & Explainable AI (XAI) for High-Speed Networks", (220, 500), cv2.FONT_HERSHEY_SIMPLEX, 0.95, (203, 213, 225), 2, cv2.LINE_AA)

        # 3 Key Feature Badges
        badges = [
            ("ZERO PAYLOAD", "Never reads packet body"),
            ("EXACTLY 23 FEATURES", "Only timing & rates"),
            ("96.9% TEST ACCURACY", "2.3ms latency (LightGBM)")
        ]
        bx = 220
        for b_title, b_sub in badges:
            draw_card(frame, bx, 570, 460, 160, (30, 41, 59), (71, 85, 105))
            cv2.putText(frame, b_title, (bx + 30, 630), cv2.FONT_HERSHEY_DUPLEX, 0.85, (52, 211, 153), 2, cv2.LINE_AA)
            cv2.putText(frame, b_sub, (bx + 30, 680), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (148, 163, 184), 1, cv2.LINE_AA)
            bx += 500

        # Footer
        cv2.putText(frame, "ISCX VPN-NonVPN Dataset (Scenario A2) | 7 Application Classes | 8,694 Cleaned Flows", (WIDTH // 2 - 480, 930), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (148, 163, 184), 1, cv2.LINE_AA)
        writer.write(frame)

    # --- Scene 2: The Core Concept: Timing Signatures (7 seconds = 210 frames) ---
    for f in range(210):
        frame = base_bg.copy()
        draw_header(frame, "The Core Concept: Timing-Based Flow Fingerprinting", "How we classify encrypted traffic without ever decrypting or inspecting payloads")

        # Left Card: Traditional DPI vs Our Approach
        draw_card(frame, 100, 240, 820, 720, (24, 32, 47), (239, 68, 68))
        cv2.putText(frame, "Traditional Deep Packet Inspection (DPI)", (140, 310), cv2.FONT_HERSHEY_DUPLEX, 0.95, (248, 113, 113), 2, cv2.LINE_AA)
        dpi_pts = [
            "Fails on TLS 1.3, HTTPS, and modern encryption",
            "Violates user privacy laws (GDPR, HIPAA)",
            "Huge CPU overhead for decryption & buffering",
            "Infeasible at 10Gbps+ backbone network speeds",
            "Requires dangerous private key sharing"
        ]
        dy = 380
        for pt in dpi_pts:
            cv2.circle(frame, (160, dy - 8), 6, (239, 68, 68), -1)
            cv2.putText(frame, pt, (185, dy), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (226, 232, 240), 1, cv2.LINE_AA)
            dy += 70

        # Right Card: Our Timing Feature Fingerprint
        draw_card(frame, 1000, 240, 820, 720, (24, 32, 47), (16, 185, 129))
        cv2.putText(frame, "Our Solution: 23 Statistical Timing Features", (1040, 310), cv2.FONT_HERSHEY_DUPLEX, 0.95, (52, 211, 153), 2, cv2.LINE_AA)
        our_pts = [
            "Packet Inter-Arrival Times (IAT): Forward & Backward",
            "Throughput Dynamics: Bytes/sec & Packets/sec",
            "Active vs. Idle State Distributions (User vs App pauses)",
            "15-Second Flow Windows: Fast line-rate classification",
            "100% Privacy-Preserving: Payloads never decrypted"
        ]
        dy = 380
        for pt in our_pts:
            cv2.circle(frame, (1060, dy - 8), 6, (16, 185, 129), -1)
            cv2.putText(frame, pt, (1085, dy), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (226, 232, 240), 1, cv2.LINE_AA)
            dy += 70

        writer.write(frame)

    # --- Scene 3: Benchmark & Model Results (7 seconds = 210 frames) ---
    for f in range(210):
        frame = base_bg.copy()
        draw_header(frame, "Comprehensive Model Benchmarks & Results", "5-Fold Stratified Cross-Validation on 7,389 Flows + Test Set Evaluation")

        # 3 Model Cards
        models_data = [
            ("Random Forest", "93.90% ± 0.88%", "0.9042", "3.8 ms", (71, 85, 105), False),
            ("XGBoost", "95.18% ± 0.48%", "0.9217", "3.2 ms", (71, 85, 105), False),
            ("LightGBM (BEST)", "95.61% ± 0.57%", "0.9268", "2.31 ms", (59, 130, 246), True),
        ]
        mx = 100
        for name, acc, f1, lat, b_color, is_best in models_data:
            draw_card(frame, mx, 240, 520, 450, (24, 32, 47), b_color)
            if is_best:
                cv2.rectangle(frame, (mx, 240), (mx + 520, 290), (37, 99, 235), -1)
                cv2.putText(frame, "★ SELECTED BEST MODEL ★", (mx + 110, 275), cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)

            cv2.putText(frame, name, (mx + 40, 350), cv2.FONT_HERSHEY_DUPLEX, 1.1, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(frame, "5-Fold CV Accuracy:", (mx + 40, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (148, 163, 184), 1, cv2.LINE_AA)
            cv2.putText(frame, acc, (mx + 40, 465), cv2.FONT_HERSHEY_DUPLEX, 0.95, (52, 211, 153), 2, cv2.LINE_AA)

            cv2.putText(frame, "Macro F1 Score:", (mx + 40, 530), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (148, 163, 184), 1, cv2.LINE_AA)
            cv2.putText(frame, f1, (mx + 40, 575), cv2.FONT_HERSHEY_DUPLEX, 0.95, (96, 165, 250), 2, cv2.LINE_AA)

            cv2.putText(frame, f"Inference Latency: {lat}", (mx + 40, 640), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (203, 213, 225), 1, cv2.LINE_AA)
            mx += 580

        # Bottom Bar: Test Set Final Score
        draw_card(frame, 100, 730, 1720, 230, (20, 28, 42), (16, 185, 129))
        cv2.putText(frame, "HELD-OUT TEST SET EVALUATION (1,305 UNSEEN FLOWS)", (140, 780), cv2.FONT_HERSHEY_DUPLEX, 0.95, (52, 211, 153), 2, cv2.LINE_AA)
        cv2.putText(frame, "• Overall Test Accuracy: 96.9%  |  Macro F1 Score: 0.950  |  VoIP F1: 0.999  |  Browsing F1: 0.968", (140, 835), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (241, 245, 249), 1, cv2.LINE_AA)
        cv2.putText(frame, "• Transparent Weak Spot Analysis: Streaming F1 = 0.874 (10.4% confused with Browsing due to 15s DASH buffer bursts)", (140, 890), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (251, 191, 36), 1, cv2.LINE_AA)
        cv2.putText(frame, "• Mitigation Strategies: Asymmetric class weights, decision threshold tuning, and multi-window aggregation", (140, 935), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (148, 163, 184), 1, cv2.LINE_AA)

        writer.write(frame)

    # --- Scene 4: Streamlit UI & Interactive Prediction (7 seconds = 210 frames) ---
    for f in range(210):
        frame = base_bg.copy()
        draw_header(frame, "Interactive Streamlit Web Dashboard (app.py)", "Real-time batch classification, top-3 confidence rankings, and live flow simulator")

        # Top sample table
        draw_card(frame, 100, 240, 1720, 360, (24, 32, 47), (71, 85, 105))
        cv2.putText(frame, "BATCH CLASSIFICATION RESULTS (Sample Network Flows)", (140, 290), cv2.FONT_HERSHEY_DUPLEX, 0.85, (96, 165, 250), 2, cv2.LINE_AA)

        # Table header
        cols = ["Flow ID", "Predicted Class", "Confidence", "Top 1 Candidate", "Top 2 Candidate", "Top 3 Candidate"]
        cx_pos = [140, 280, 540, 760, 1080, 1400]
        for idx, col_name in enumerate(cols):
            cv2.putText(frame, col_name, (cx_pos[idx], 340), cv2.FONT_HERSHEY_DUPLEX, 0.7, (148, 163, 184), 1, cv2.LINE_AA)
        cv2.line(frame, (140, 355), (1780, 355), (71, 85, 105), 1)

        # 3 Rows
        sample_rows = [
            ("Flow #1", "Streaming", "99.96%", "Streaming (99.9%)", "FileTransfer (0.0%)", "Browsing (0.0%)", (52, 211, 153)),
            ("Flow #2", "P2P", "100.0%", "P2P (100.0%)", "Streaming (0.0%)", "Chat (0.0%)", (96, 165, 250)),
            ("Flow #3", "VoIP", "100.0%", "VoIP (100.0%)", "Browsing (0.0%)", "FileTransfer (0.0%)", (251, 191, 36)),
        ]
        ry = 405
        for fid, pclass, conf, t1, t2, t3, color in sample_rows:
            cv2.putText(frame, fid, (cx_pos[0], ry), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (203, 213, 225), 1, cv2.LINE_AA)
            cv2.putText(frame, pclass, (cx_pos[1], ry), cv2.FONT_HERSHEY_DUPLEX, 0.75, color, 2, cv2.LINE_AA)
            cv2.putText(frame, conf, (cx_pos[2], ry), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (241, 245, 249), 1, cv2.LINE_AA)
            cv2.putText(frame, t1, (cx_pos[3], ry), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (148, 163, 184), 1, cv2.LINE_AA)
            cv2.putText(frame, t2, (cx_pos[4], ry), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (148, 163, 184), 1, cv2.LINE_AA)
            cv2.putText(frame, t3, (cx_pos[5], ry), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (148, 163, 184), 1, cv2.LINE_AA)
            ry += 50

        # Bottom 2 feature highlights
        draw_card(frame, 100, 640, 830, 320, (24, 32, 47), (59, 130, 246))
        cv2.putText(frame, "Interactive Single-Flow Simulator", (140, 695), cv2.FONT_HERSHEY_DUPLEX, 0.85, (59, 130, 246), 2, cv2.LINE_AA)
        cv2.putText(frame, "• Adjust flowBytesPerSecond, FIAT, and Active/Idle periods live", (140, 750), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (226, 232, 240), 1, cv2.LINE_AA)
        cv2.putText(frame, "• Instant prediction probability distribution across all 7 classes", (140, 810), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (226, 232, 240), 1, cv2.LINE_AA)
        cv2.putText(frame, "• Allows network engineers to test boundary and edge cases", (140, 870), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (226, 232, 240), 1, cv2.LINE_AA)

        draw_card(frame, 990, 640, 830, 320, (24, 32, 47), (16, 185, 129))
        cv2.putText(frame, "Automated Diagnostic Reports Tab", (1030, 695), cv2.FONT_HERSHEY_DUPLEX, 0.85, (16, 185, 129), 2, cv2.LINE_AA)
        cv2.putText(frame, "• Interactive 5-fold cross-validation error bar charts", (1030, 750), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (226, 232, 240), 1, cv2.LINE_AA)
        cv2.putText(frame, "• 15-feature importance ranking and correlation matrices", (1030, 810), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (226, 232, 240), 1, cv2.LINE_AA)
        cv2.putText(frame, "• Focused 2x2 confusion analysis between Streaming & Browsing", (1030, 870), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (226, 232, 240), 1, cv2.LINE_AA)

        writer.write(frame)

    # --- Scene 5: Explainable AI & 3-Tier Fallback (7 seconds = 210 frames) ---
    for f in range(210):
        frame = base_bg.copy()
        draw_header(frame, "Explainable AI (XAI) & 3-Tier Fallback Layer", "Translating black-box model predictions into human-readable Computer Networks evidence")

        # 3 Tier Pillars
        tiers = [
            ("TIER 1: Local Ollama", "Mistral 7B / Phi-3 (Port 11434)", "100% offline & local", "Zero cloud API keys needed", (59, 130, 246)),
            ("TIER 2: Cloud LLM API", "Groq / OpenAI (gpt-4o-mini)", "Fast cloud acceleration", "Uses .env API key when provided", (168, 85, 247)),
            ("TIER 3: CN Heuristic Fallback", "Domain-Expert Rule Engine", "Zero external dependencies", "GUARANTEES 100% DEMO UPTIME", (16, 185, 129)),
        ]
        tx = 100
        for t_title, t_model, t_sub1, t_sub2, t_color in tiers:
            draw_card(frame, tx, 240, 520, 360, (24, 32, 47), t_color)
            cv2.putText(frame, t_title, (tx + 30, 305), cv2.FONT_HERSHEY_DUPLEX, 0.85, t_color, 2, cv2.LINE_AA)
            cv2.putText(frame, t_model, (tx + 30, 360), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.line(frame, (tx + 30, 385), (tx + 490, 385), (71, 85, 105), 1)
            cv2.putText(frame, f"• {t_sub1}", (tx + 30, 440), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (203, 213, 225), 1, cv2.LINE_AA)
            cv2.putText(frame, f"• {t_sub2}", (tx + 30, 500), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (203, 213, 225), 1, cv2.LINE_AA)
            tx += 580

        # Sample Generated Explanation Box
        draw_card(frame, 100, 640, 1720, 320, (15, 23, 42), (96, 165, 250))
        cv2.putText(frame, "LIVE GENERATED EXPLANATION EXAMPLE (Flow #1 - Video Streaming)", (140, 695), cv2.FONT_HERSHEY_DUPLEX, 0.85, (96, 165, 250), 2, cv2.LINE_AA)
        expl_text1 = '"Classified as Video Streaming (99.96% confidence) due to sustained high-throughput downlink (8,556 B/s)'
        expl_text2 = 'with active buffer fill bursts (mean active: 30,100,000 us) followed by periodic idle pauses.'
        expl_text3 = 'While sometimes confused with FileTransfer, the higher data rate and chunked delivery pattern strongly match media playback."'
        cv2.putText(frame, expl_text1, (140, 760), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (241, 245, 249), 1, cv2.LINE_AA)
        cv2.putText(frame, expl_text2, (140, 815), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (241, 245, 249), 1, cv2.LINE_AA)
        cv2.putText(frame, expl_text3, (140, 870), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (241, 245, 249), 1, cv2.LINE_AA)
        cv2.putText(frame, "Provider: rule_based_fallback (cn_expert_heuristics) | Latency: 0.001s | Zero Decryption", (140, 925), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (52, 211, 153), 1, cv2.LINE_AA)

        writer.write(frame)

    # --- Scene 6: College Viva Defense & Summary (6 seconds = 180 frames) ---
    for f in range(180):
        frame = base_bg.copy()
        draw_header(frame, "Engineering Rigor & College Defense Highlights", "Why this project stands out to evaluators and professors")

        points = [
            ("1. Complete Automated CI Pipeline", "Every commit is verified across 17 unit & e2e tests via GitHub Actions on Ubuntu runner in 54s."),
            ("2. True Data Leakage Prevention", "StandardScaler fit strictly on 70% train data; test set (15%) was completely sealed until final benchmarking."),
            ("3. Privacy-Preserving Protocol Compliance", "Never inspects payloads, cookies, certificates, or IP/port numbers; fully compliant with modern encryption (TLS 1.3 / QUIC)."),
            ("4. Production Line-Rate Feasibility", "Inference takes only 2.3ms on CPU (>400 flows/second), proving deployment readiness on network middleboxes."),
            ("5. Deployable Interactive Artifacts", "Complete Streamlit dashboard (app.py), comprehensive project report (.docx), and high-resolution plots.")
        ]
        py = 270
        for p_title, p_desc in points:
            draw_card(frame, 100, py, 1720, 115, (24, 32, 47), (71, 85, 105))
            cv2.putText(frame, p_title, (140, py + 45), cv2.FONT_HERSHEY_DUPLEX, 0.85, (52, 211, 153), 2, cv2.LINE_AA)
            cv2.putText(frame, p_desc, (140, py + 90), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (203, 213, 225), 1, cv2.LINE_AA)
            py += 135

        writer.write(frame)

    writer.release()
    print(f"Demo video successfully generated: {out_path} ({1170/FPS:.1f}s, 1920x1080)")


if __name__ == "__main__":
    generate_video()
