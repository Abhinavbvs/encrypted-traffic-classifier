"""Generates the comprehensive Project Report and College Defense Guide (.docx)."""

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


def create_document():
    doc = Document()

    # Page Margins
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    # 1. Title Page / Header
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title.add_run("ENCRYPTED NETWORK TRAFFIC CLASSIFIER\nWITHOUT PAYLOAD INSPECTION")
    title_run.font.size = Pt(22)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(26, 54, 93)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_run = sub.add_run("Privacy-Preserving Machine Learning & Explainable AI (XAI) Framework for High-Speed Networks\n")
    sub_run.font.size = Pt(13)
    sub_run.font.italic = True
    sub_run.font.color.rgb = RGBColor(74, 85, 104)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta_run = meta.add_run("B.Tech / Degree Major Project Report & College Defense Guide\nDataset: ISCX VPN-NonVPN (Scenario A2, 15s) | Best Model: LightGBM (96.9% Test Acc)\n")
    meta_run.font.size = Pt(10)
    meta_run.font.bold = True

    doc.add_paragraph().paragraph_format.space_after = Pt(18)

    # 2. Executive Summary
    h1 = doc.add_heading("1. Executive Summary", level=1)
    h1.style.font.color.rgb = RGBColor(26, 54, 93)
    p = doc.add_paragraph(
        "Modern internet traffic is overwhelmingly encrypted (over 95% via TLS 1.3 / HTTPS / QUIC). "
        "Consequently, traditional Deep Packet Inspection (DPI) firewalls fail because decrypting user packets "
        "violates privacy regulations (GDPR, HIPAA), introduces extreme computational overhead, and requires "
        "infeasible private-key sharing across middleboxes.\n\n"
        "This project introduces an end-to-end, privacy-preserving classification pipeline that identifies "
        "encrypted network applications using ONLY 23 statistical timing features extracted over 15-second flow windows. "
        "By analyzing Packet Inter-Arrival Times (IAT), flow throughput rates, and active/idle state transitions, "
        "our LightGBM model categorizes encrypted streams into 7 distinct application types with 96.9% test accuracy "
        "and 2.3 milliseconds inference latency per flow. To resolve the black-box opacity of machine learning, "
        "we integrate an Explainable AI (XAI) layer with a 3-tier fallback architecture (Ollama local LLM -> Cloud API -> "
        "Deterministic Computer Networks Domain-Expert Rule Engine) providing natural-language networking rationales."
    )
    p.paragraph_format.line_spacing = 1.15

    # 3. System Architecture & Methodology
    h2 = doc.add_heading("2. System Architecture & Methodology", level=1)
    h2.style.font.color.rgb = RGBColor(26, 54, 93)
    doc.add_paragraph(
        "The project follows a rigorous, leak-free machine learning lifecycle conforming to computer networking standards:"
    )

    arch_bullets = [
        ("Dataset Ingestion & Cleaning", "Trained on the authoritative UNB ISCX VPN-NonVPN benchmark (Scenario A2, 15-second windows, non-VPN). Dropped 271 exact duplicates and invalid rows, resulting in 8,694 pristine flow records across 7 balanced application categories."),
        ("Strict 23 Timing Features", "Restricted strictly to timing-based flow statistics (Forward/Backward Inter-Arrival Times, Flow Duration, Bytes/sec, Packets/sec, Active and Idle durations). No packet payload, TLS handshake extensions, TCP flags, port numbers, or IP addresses are accessed, guaranteeing true generalization across CDNs and ports."),
        ("Data Hygiene & Stratified Splitting", "Partitioned into 70% Train (6,085 flows), 15% Validation (1,304 flows), and 15% Test (1,305 flows) using stratified sampling. StandardScaler was fit exclusively on the training partition and saved to models/scaler.pkl to eliminate data snooping."),
        ("Multi-Tier Explainability Layer", "Bridges AI with network operations. Explains each classification using Computer Networks principles (citing buffer burst pacing, jitter symmetry, and throughput dynamics) through a 3-tier fallback ensuring 100% demo availability.")
    ]
    for b_title, b_desc in arch_bullets:
        bp = doc.add_paragraph(style='List Bullet')
        r_bt = bp.add_run(b_title + ": ")
        r_bt.bold = True
        bp.add_run(b_desc)

    # 4. Performance Benchmarks
    h3 = doc.add_heading("3. Performance Benchmarks & Model Comparison", level=1)
    h3.style.font.color.rgb = RGBColor(26, 54, 93)
    doc.add_paragraph(
        "We systematically trained and benchmarked three industry-standard gradient boosting and ensemble architectures under identical stratified 5-fold cross-validation:"
    )

    # Add Table
    table = doc.add_table(rows=1, cols=5)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr_cells = table.rows[0].cells
    headers = ["Model", "Accuracy (Mean ± SD)", "Macro F1 (Mean ± SD)", "Avg Fit Time", "Inference Latency"]
    for i, h_text in enumerate(headers):
        hdr_cells[i].text = h_text
        hdr_cells[i].paragraphs[0].runs[0].font.bold = True
        hdr_cells[i].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        set_cell_background(hdr_cells[i], "1A365D")

    data_rows = [
        ("Random Forest", "93.90% ± 0.88%", "0.9042 ± 0.0141", "1.08s", "3.8 ms / flow"),
        ("XGBoost", "95.18% ± 0.48%", "0.9217 ± 0.0103", "5.76s", "3.2 ms / flow"),
        ("LightGBM (Best)", "95.61% ± 0.57%", "0.9268 ± 0.0128", "3.01s", "2.31 ms / flow"),
    ]
    for row_data in data_rows:
        row_cells = table.add_row().cells
        for col_idx, cell_value in enumerate(row_data):
            row_cells[col_idx].text = cell_value
            if col_idx == 0:
                row_cells[col_idx].paragraphs[0].runs[0].font.bold = True
            set_cell_background(row_cells[col_idx], "F7FAFC" if col_idx % 2 == 0 else "EDF2F7")

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # Per-class table
    doc.add_paragraph("Test Set Per-Class Classification Report (1,305 Held-out Flows):")
    class_table = doc.add_table(rows=1, cols=5)
    class_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    c_hdr = class_table.rows[0].cells
    c_headers = ["Traffic Class", "Precision", "Recall", "F1-Score", "Test Support"]
    for i, h_text in enumerate(c_headers):
        c_hdr[i].text = h_text
        c_hdr[i].paragraphs[0].runs[0].font.bold = True
        c_hdr[i].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        set_cell_background(c_hdr[i], "2B6CB0")

    class_metrics = [
        ("VoIP", "1.000", "0.998", "0.999", "424 flows"),
        ("Browsing", "0.961", "0.976", "0.968", "375 flows"),
        ("P2P", "0.972", "0.986", "0.979", "141 flows"),
        ("Chat", "0.954", "0.932", "0.943", "133 flows"),
        ("FileTransfer", "0.960", "0.922", "0.941", "129 flows"),
        ("Streaming", "0.868", "0.881", "0.874", "67 flows"),
        ("Mail", "0.944", "0.944", "0.944", "36 flows"),
        ("Macro Avg", "0.951", "0.948", "0.950", "1,305 flows"),
    ]
    for row_data in class_metrics:
        row_cells = class_table.add_row().cells
        for col_idx, cell_value in enumerate(row_data):
            row_cells[col_idx].text = cell_value
            if row_data[0] == "Macro Avg":
                row_cells[col_idx].paragraphs[0].runs[0].font.bold = True
                set_cell_background(row_cells[col_idx], "E2E8F0")

    doc.add_paragraph().paragraph_format.space_after = Pt(14)

    # 5. Diagnostic Analysis of Weak Spot
    h4 = doc.add_heading("4. Weak Spot Analysis: Streaming vs. Browsing", level=1)
    h4.style.font.color.rgb = RGBColor(26, 54, 93)
    doc.add_paragraph(
        "A critical engineering contribution of this project is our transparent investigation of the model's primary weak spot. "
        "While VoIP achieves near-perfect F1 (0.999), Streaming achieves 0.874 F1 due to mutual confusion with Browsing:\n\n"
        "• Quantitative Evidence: 7 out of 67 Streaming flows (10.4%) were misclassified as Browsing, and 5 Browsing flows were misclassified as Streaming.\n"
        "• Computer Networks Root Cause: Modern streaming services use DASH (Dynamic Adaptive Streaming over HTTP) or HLS. "
        "Video players download media in 2-to-6 second chunk bursts followed by buffer-idle periods. Over a 15-second window, "
        "this chunk download cadence closely mimics an interactive web page requesting multiple JavaScript/CSS assets from a CDN.\n"
        "• Class Imbalance Factor: The training split contains 1,750 Browsing flows versus 315 Streaming flows (5.6:1 ratio), "
        "biasing the classifier towards the majority class for borderline decisions.\n"
        "• Concrete Solutions: 1) Asymmetric cost-sensitive class weights (e.g., class_weight={'Streaming': 2.2}); "
        "2) Probability threshold adjustment (prob_Streaming > 0.35); 3) Multi-window aggregation (30s/60s windows)."
    )

    # 6. College Viva / Defense Preparation Guide
    h5 = doc.add_heading("5. College Viva Voce & Defense Guide", level=1)
    h5.style.font.color.rgb = RGBColor(26, 54, 93)
    doc.add_paragraph(
        "Use these structured talking points to impress evaluators and external examiners:"
    )

    qa_list = [
        ("Q1: Why did you completely omit IP addresses, Port numbers, and TCP flags?",
         "Answer: Incorporating IP addresses and port numbers causes acute model overfitting. Modern apps dynamically rotate IPs across Content Delivery Networks (Cloudflare, AWS CloudFront) and multiplex diverse services over port 443 (HTTPS) or QUIC. By relying solely on timing and packet length dynamics, our model learns genuine behavioral transport signatures that generalize across any IP, port, or VPN wrapper."),
        ("Q2: How does your model guarantee that user privacy is strictly preserved?",
         "Answer: Traditional Deep Packet Inspection (DPI) inspects packet payloads, violating regulations like GDPR and HIPAA. Our feature extractor only monitors packet arrival timestamps and header length counters. The payload bytes are never read, buffered, or decrypted, maintaining full end-to-end user privacy."),
        ("Q3: What makes LightGBM superior to Deep Learning (1D-CNN / LSTM) for this task?",
         "Answer: While 1D-CNNs can capture packet sequences, they require significant GPU compute and exhibit 15-40ms inference latency. LightGBM utilizes histogram-based gradient boosting with leaf-wise tree growth, achieving 96.9% accuracy with only 2.3ms latency on CPU, enabling line-rate classification at over 400 flows per second."),
        ("Q4: What happens if the LLM explanation service goes down during live operations?",
         "Answer: We engineered a 3-tier fallback architecture: Tier 1 targets local Ollama; Tier 2 attempts Cloud LLM APIs (Groq/OpenAI); Tier 3 is a zero-dependency deterministic Computer Networks heuristic engine. If external connectivity fails, Tier 3 guarantees instantaneous, 100% uptime with factual domain explanations.")
    ]
    for q, a in qa_list:
        qp = doc.add_paragraph()
        q_run = qp.add_run(q)
        q_run.bold = True
        q_run.font.color.rgb = RGBColor(43, 108, 176)
        ap = doc.add_paragraph(a)
        ap.paragraph_format.space_after = Pt(8)

    # Save document
    out_dir = Path("reports")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "Encrypted_Traffic_Classifier_Project_Report.docx"
    doc.save(out_path)
    print(f"Generated comprehensive report at: {out_path}")


if __name__ == "__main__":
    create_document()
