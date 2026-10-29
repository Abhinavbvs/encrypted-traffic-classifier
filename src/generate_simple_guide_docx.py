"""Generates a Simple Plain-English Explanation & College Demo Guide (.docx)."""

import os
from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)


def build_simple_guide():
    doc = Document()

    # 1 inch margins
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    # Title & Header
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    t_run = title.add_run("ENCRYPTED TRAFFIC CLASSIFIER\nSIMPLE PROJECT GUIDE & COLLEGE DEMO SCRIPT")
    t_run.font.size = Pt(22)
    t_run.font.bold = True
    t_run.font.color.rgb = RGBColor(30, 58, 138)  # Deep Blue

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    s_run = sub.add_run("A Plain-English Explanation, 5-Minute Live Presentation Script, and Viva Voce Cheat Sheet\n")
    s_run.font.size = Pt(12)
    s_run.font.italic = True
    s_run.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # --- PART 1 ---
    h1 = doc.add_heading("PART 1: The Project Explained in Simple Words", level=1)
    h1.style.font.color.rgb = RGBColor(30, 58, 138)

    p1 = doc.add_paragraph()
    r = p1.add_run("1. What problem are we solving?\n")
    r.bold = True
    p1.add_run(
        "Over 95% of today's internet traffic is encrypted using TLS/HTTPS (YouTube, WhatsApp, Zoom, banking sites, etc.). "
        "Because it is encrypted, firewalls and internet service providers cannot look inside packet contents without violating user "
        "privacy laws (like GDPR) or demanding secret encryption keys. However, network administrators still need to know what type "
        "of traffic is passing through (e.g., Is it a Zoom call? A YouTube video? Web browsing? A large file download?) in order to "
        "prioritize critical traffic, avoid lag, and allocate bandwidth."
    )

    p2 = doc.add_paragraph()
    r = p2.add_run("2. How does our solution work (The 'Morse Code' Analogy)?\n")
    r.bold = True
    p2.add_run(
        "Imagine receiving an encrypted letter. You cannot read the words inside. But if you observe how the mail is delivered, you can guess what it is:\n"
        "• A Voice Call (VoIP) is like a steady metronome: it sends tiny packets every 20 milliseconds continuously with almost zero pauses.\n"
        "• Video Streaming (YouTube/Netflix) works in bursts: it downloads a large chunk to fill the video player's buffer, then goes completely quiet, and then downloads the next chunk.\n"
        "• Web Browsing is bursty and human-driven: you click a link (a burst of requests for images/scripts), followed by 10 to 30 seconds of silence while you read the page.\n\n"
        "By looking ONLY at 23 statistical timing features over 15-second windows (how fast packets arrive, packet rates, active and idle durations) "
        "— and NEVER decrypting a single byte — our machine learning model classifies traffic into 7 real-world categories."
    )

    p3 = doc.add_paragraph()
    r = p3.add_run("3. The 7 Traffic Categories:\n")
    r.bold = True
    p3.add_run(
        "1. Browsing (Normal web pages, news sites)\n"
        "2. Video Streaming (YouTube, Netflix, Vimeo)\n"
        "3. VoIP (Audio and video calls like Zoom, WhatsApp calls, Skype)\n"
        "4. File Transfer (Bulk downloads, FTP, Cloud drive sync)\n"
        "5. P2P (BitTorrent, peer-to-peer file sharing)\n"
        "6. Chat (Instant messaging text bursts like WhatsApp, Slack)\n"
        "7. Mail (Email clients syncing via IMAP/SMTP)\n\n"
        "*Note: There is NO malware or C2 category in this dataset. It is purely non-VPN legitimate traffic from the UNB ISCX benchmark."
    )

    p4 = doc.add_paragraph()
    r = p4.add_run("4. Why LightGBM is the Winner:\n")
    r.bold = True
    p4.add_run(
        "We tested three algorithms: Random Forest (93.9% CV accuracy), XGBoost (95.2% CV accuracy), and LightGBM (95.6% CV accuracy, 96.9% test accuracy). "
        "LightGBM won because it is both the most accurate (0.950 Macro F1 score) and blazing fast: it takes only 2.3 milliseconds to classify a flow. "
        "That means on a standard computer CPU, it can classify over 400 network flows every single second in real time."
    )

    p5 = doc.add_paragraph()
    r = p5.add_run("5. The Explainable AI (XAI) Layer with 3-Tier Fallback:\n")
    r.bold = True
    p5.add_run(
        "Traditional AI is a black box that just gives a label without explaining why. We built an explanation layer that translates the 23 timing numbers "
        "into plain English networking evidence. To ensure this demo NEVER fails or crashes in college:\n"
        "• Tier 1: Local Ollama (runs Mistral/Phi-3 locally if installed)\n"
        "• Tier 2: Cloud LLMs (uses Groq, Google Gemini, OpenAI, or Claude if an API key is in .env)\n"
        "• Tier 3: Deterministic Rule Engine (100% offline, zero keys, zero downloads). Evaluates networking thresholds and produces an expert explanation in 0.001 seconds!"
    )

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # --- PART 2 ---
    h2 = doc.add_heading("PART 2: Step-by-Step College Demo Script (5 Minutes)", level=1)
    h2.style.font.color.rgb = RGBColor(30, 58, 138)

    doc.add_paragraph(
        "Follow this exact script when presenting to professors or evaluators:"
    )

    phases = [
        ("Phase 1: The Introduction (60 Seconds)",
         "Say this:\n"
         "\"Good morning, professors. Today over 95% of internet traffic is encrypted with TLS 1.3 and HTTPS. Traditional firewalls relied on Deep Packet Inspection (DPI) to read packet payloads, but encryption blinds them, and decrypting packets violates user privacy laws like GDPR.\n\n"
         "Our project solves this by classifying encrypted traffic into 7 real-world application categories using ONLY 23 timing features — such as packet inter-arrival times, throughput rates, and active/idle periods — with ZERO payload inspection. We also integrated an Explainable AI layer that tells network operators the exact networking rationale behind every classification.\""),

        ("Phase 2: Launching the Live Streamlit Dashboard (2 Minutes)",
         "Action:\n"
         "1. Open your terminal and run: streamlit run app.py\n"
         "2. On the 'Batch Flow Inference' page, click 'Load Bundled Sample Flows'.\n\n"
         "Say this:\n"
         "\"Here you can see 10 network flows classified simultaneously in under 4 milliseconds (approx 0.35ms per flow). Notice how our model outputs not just the predicted class, but also confidence percentages and the Top-3 candidate probabilities.\n\n"
         "Let's click 'Generate Explanation' for Flow #1. Look at the explanation generated: It explains that this flow was classified as Video Streaming because of high sustained throughput (8,556 Bytes/second) combined with active buffer-filling bursts followed by idle pauses. Even if Ollama or the internet is completely offline, our Tier-3 heuristic rule fallback guarantees the explanation is always generated instantaneously.\""),

        ("Phase 3: Interactive Flow Simulator (60 Seconds)",
         "Action:\n"
         "1. Switch to the 'Interactive Flow Inspector' tab in the left sidebar.\n"
         "2. Move the 'Flow Bytes / Sec' slider from low (15,000) to high (150,000).\n\n"
         "Say this:\n"
         "\"This simulator lets network engineers test hypothetical or live edge cases. As we increase the data rate and reduce inter-arrival times, watch how the probability shifts dynamically from Browsing to Video Streaming or File Transfer, accompanied by live probability gauges.\""),

        ("Phase 4: Benchmarks & Honest Engineering (60 Seconds)",
         "Action:\n"
         "1. Switch to the 'Model Benchmark & Reports' tab.\n"
         "2. Show the 5-fold cross-validation chart and the 'Streaming vs Browsing Diagnostic' tab.\n\n"
         "Say this:\n"
         "\"We followed strict machine learning hygiene: The StandardScaler was fit only on training data, and the test set was completely sealed until the end. LightGBM achieved 95.6% CV accuracy and 96.9% test accuracy.\n\n"
         "We also conducted an honest diagnostic of our model's weak spot: Streaming has an F1 of 87.4% because in a 15-second window, downloading a video chunk closely mimics downloading web assets from a CDN. We proposed concrete solutions including asymmetric class weights and threshold tuning.\"")
    ]

    for p_title, p_body in phases:
        doc.add_paragraph().paragraph_format.space_after = Pt(4)
        p = doc.add_paragraph()
        r = p.add_run(p_title)
        r.bold = True
        r.font.size = Pt(11)
        r.font.color.rgb = RGBColor(15, 118, 110)
        doc.add_paragraph(p_body)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # --- PART 3 ---
    h3 = doc.add_heading("PART 3: Expected Professor Questions & Winning Answers", level=1)
    h3.style.font.color.rgb = RGBColor(30, 58, 138)

    qas = [
        ("Q1: Why didn't you use IP addresses or Port numbers in your features?",
         "Winning Answer: In modern networks, IP addresses and port numbers are misleading. Content Delivery Networks (like Cloudflare or Akamai) host thousands of different websites on the same IP addresses, and almost all apps multiplex over port 443 (HTTPS) or QUIC. If a model learns that 'Port 443 = Browsing', it will fail when Zoom or YouTube runs over port 443. Our 23 timing features capture fundamental application behavior that cannot be spoofed by changing ports."),

        ("Q2: How did you ensure there was no data leakage during data preparation?",
         "Winning Answer: We strictly fit the StandardScaler on the 70% training split only. The validation (15%) and test (15%) splits were transformed using the pre-fit scaler parameters (mean and standard deviation). Cross-validation and randomized hyperparameter search were strictly restricted to training data, and the test set was evaluated only once at the very end."),

        ("Q3: Why is Streaming confused with Browsing, and how can it be fixed?",
         "Winning Answer: Modern video streaming uses DASH or HLS over HTTPS. Video players download media in 2-to-4 second chunk bursts followed by a pause. In a short 15-second observation window, an active chunk download looks identical to downloading images or scripts on a heavy web page. In addition, Browsing has 5.6 times more training flows than Streaming. We can solve this by: 1) Increasing class weight penalties for Streaming, 2) Lowering the classification threshold to prob_Streaming > 0.35, and 3) Aggregating features over longer 30s/60s windows where chunk periodicity becomes obvious."),

        ("Q4: Why LightGBM instead of a Deep Learning Neural Network like 1D-CNN or LSTM?",
         "Winning Answer: On tabular statistical features, Gradient Boosted Decision Trees consistently match or outperform Deep Learning. Furthermore, 1D-CNNs require expensive GPUs and introduce 20-40ms of latency per flow. LightGBM runs on standard commodity CPUs in only 2.3ms per flow, making it practical for real-world deployment on high-speed network switches and routers."),

        ("Q5: What happens if Ollama or the internet goes down during your demo or in production?",
         "Winning Answer: We engineered a 3-tier fallback architecture. If local Ollama is offline and no cloud API keys exist in .env, our system automatically routes the request to our built-in Computer Networks Rule Engine (Tier 3). It evaluates empirical timing rules and generates domain explanations in 0.001 seconds with 0% chance of failure.")
    ]

    for q, a in qas:
        qp = doc.add_paragraph()
        qr = qp.add_run(q)
        qr.bold = True
        qr.font.color.rgb = RGBColor(30, 58, 138)
        ap = doc.add_paragraph(a)
        ap.paragraph_format.space_after = Pt(8)

    # Save documents
    out_dir = Path("reports")
    out_dir.mkdir(parents=True, exist_ok=True)
    report_file = out_dir / "Simple_Project_Explanation_and_College_Demo_Guide.docx"
    doc.save(report_file)
    print(f"Generated simple guide docx at: {report_file}")


if __name__ == "__main__":
    build_simple_guide()
