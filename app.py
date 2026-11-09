"""Streamlit Web Application for Encrypted Traffic Classification & PCAP Analysis.

Provides an interactive dashboard for:
1. Live PCAP / PCAPNG packet capture analysis with 5-tuple bidirectional flow extraction.
2. Batch flow classification from CSV with Unknown Traffic / Out-of-Distribution detection.
3. Interactive single-flow timing parameter simulation.
4. Natural-language explanation layer using Ollama with multi-tier fallback.
5. Model performance analytics, feature importances, confusion matrix, and weak-spot diagnostics.
"""

from __future__ import annotations

import io
import json
import os
from pathlib import Path
import time
from typing import Optional

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st

from src.pcap_extractor import extract_flows_from_pcap, EXPECTED_FEATURE_COLUMNS
from src.predict import load_artifacts, predict_flows, predict_one, predict_pcap
from src.llm_explainer import explain_flow

st.set_page_config(
    page_title="Encrypted Traffic Classifier & PCAP Analyzer",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom Styling
st.markdown(
    """
    <style>
    .metric-card {
        background-color: #f8fafc;
        border-radius: 8px;
        padding: 14px;
        border: 1px solid #e2e8f0;
    }
    .badge-primary {
        background-color: #3b82f6;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.85em;
    }
    .badge-uncertain {
        background-color: #f59e0b;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.85em;
    }
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_resource
def get_artifacts():
    return load_artifacts()


model, scaler, feature_cols, label_map = get_artifacts()

# Sidebar
st.sidebar.title("🛡️ Traffic Classifier")
st.sidebar.markdown(
    """
**Zero Payload Inspection**
Classifies encrypted network traffic into 7 real-world categories using **ONLY 23 flow timing features**.
Preserves user privacy by never inspecting packet content or payload bytes.
"""
)

page = st.sidebar.radio(
    "Navigation",
    [
        "🚀 PCAP Traffic Analyzer",
        "📊 Batch CSV Flow Inference",
        "⚙️ Interactive Flow Simulator",
        "📈 Model Benchmark & Reports",
    ],
)

st.sidebar.markdown("---")
st.sidebar.markdown("### ⚙️ Inference Settings")
confidence_threshold = st.sidebar.slider(
    "Unknown Traffic Confidence Threshold",
    min_value=0.0,
    max_value=0.99,
    value=0.50,
    step=0.05,
    help="Predictions below this confidence level are flagged as Uncertain / Unknown Traffic rather than forced into a known category.",
)

st.sidebar.markdown("---")
st.sidebar.caption("Dataset: UNB ISCX VPN-NonVPN (15s Windowing)")
st.sidebar.caption("Selected Model: LightGBM (96.9% Test Accuracy)")


# ==============================================================================
# Page 1: PCAP Traffic Analyzer
# ==============================================================================
if page == "🚀 PCAP Traffic Analyzer":
    st.title("🚀 Raw PCAP / PCAPNG Network Traffic Analyzer")
    st.markdown(
        """
        Upload raw packet captures (**`.pcap`** or **`.pcapng`**) or select bundled ground-truth captures.
        The system groups packets into **bidirectional 5-tuple flows** `(Src IP, Dst IP, Src Port, Dst Port, Protocol)`,
        computes the exact **23 statistical timing features**, and runs **LightGBM classification** with zero payload inspection.
        """
    )

    st.markdown(
        """
        ```
        Raw Packet Capture (.pcap / .pcapng)
                     │
                     ▼
          [ Scapy Packet Ingestion ] ➔ Filters IP packets, preserves timestamps & sizes
                     │
                     ▼
          [ Bidirectional 5-Tuple ]  ➔ (Src IP, Dst IP, Src Port, Dst Port, Protocol)
                     │
                     ▼
          [ 23 Timing Features ]     ➔ Duration, Rates, FIAT, BIAT, Flow IAT, Active/Idle
                     │
                     ▼
          [ LightGBM Inference ]     ➔ Class Predictions + Top 3 Candidates + Uncertainty Tag
                     │
                     ▼
          [ Interactive Dashboard ]  ➔ Flow table, distribution charts & natural-language XAI
        ```
        """
    )

    col_up, col_btn = st.columns([2, 1])

    with col_up:
        uploaded_pcap = st.file_uploader(
            "Upload Network Packet Capture (.pcap or .pcapng)",
            type=["pcap", "pcapng"],
            help="Upload raw pcap file captured using Wireshark, tcpdump, or tshark.",
        )

    with col_btn:
        st.markdown("**Or load a bundled sample PCAP:**")
        sample_options = {
            "None": None,
            "🌐 Browsing (HTTPS/TLS)": "data/sample_pcaps/browsing_https.pcap",
            "📞 VoIP Call (UDP/RTP)": "data/sample_pcaps/voip_call.pcap",
            "🎬 Video Streaming (Buffering)": "data/sample_pcaps/streaming_video.pcap",
            "📁 File Transfer (Large Chunks)": "data/sample_pcaps/file_transfer.pcap",
        }
        selected_sample = st.selectbox("Select Sample Capture:", list(sample_options.keys()))

    pcap_source = None
    source_name = ""

    if uploaded_pcap is not None:
        pcap_source = io.BytesIO(uploaded_pcap.read())
        source_name = uploaded_pcap.name
    elif selected_sample and sample_options[selected_sample]:
        sample_path = Path(sample_options[selected_sample])
        if sample_path.exists():
            pcap_source = str(sample_path)
            source_name = sample_path.name
        else:
            st.warning(f"Sample file {sample_path} not found. Run `python src/generate_sample_pcaps.py` first.")

    if pcap_source is not None:
        st.markdown("---")
        with st.spinner(f"Parsing packet capture '{source_name}' and constructing bidirectional flows..."):
            start_extract_t = time.perf_counter()
            try:
                features_df, metadata_df = extract_flows_from_pcap(pcap_source)
                extract_dur = time.perf_counter() - start_extract_t
            except Exception as exc:
                st.error(f"Error parsing PCAP file: {exc}")
                features_df = pd.DataFrame()
                metadata_df = pd.DataFrame()

        if len(features_df) == 0:
            st.warning("⚠️ No valid IPv4/IPv6 TCP or UDP flows were extracted from this capture.")
        else:
            with st.spinner("Classifying network flows with LightGBM..."):
                pred_df, infer_latency = predict_flows(
                    features_df,
                    model=model,
                    scaler=scaler,
                    feature_columns=feature_cols,
                    label_map=label_map,
                    confidence_threshold=confidence_threshold,
                )

            combined_results = pd.concat([metadata_df, pred_df], axis=1)

            # Summary metrics
            total_flows = len(combined_results)
            total_pkts = int(metadata_df["packet_count"].sum())
            total_bytes = int(metadata_df["byte_count"].sum())
            uncertain_flows = int(combined_results["is_uncertain"].sum())

            m1, m2, m3, m4, m5 = st.columns(5)
            m1.metric("Total Flows", total_flows)
            m2.metric("Total Packets", f"{total_pkts:,}")
            m3.metric("Total Volume", f"{total_bytes / 1024:.1f} KB")
            m4.metric("Inference Latency", f"{infer_latency:.2f} ms/flow")
            m5.metric("Uncertain / Unknown", f"{uncertain_flows} ({uncertain_flows/total_flows:.0%})")

            # Flow table
            st.subheader(f"📋 Extracted 5-Tuple Flows & Classifications ({total_flows} flows)")

            display_cols = [
                "src_ip",
                "src_port",
                "dst_ip",
                "dst_port",
                "protocol",
                "packet_count",
                "duration_sec",
                "predicted_class",
                "confidence",
                "status",
                "top2_class",
                "top2_prob",
            ]
            st.dataframe(
                combined_results[display_cols].style.format(
                    {
                        "confidence": "{:.1%}",
                        "top2_prob": "{:.1%}",
                        "duration_sec": "{:.2f}s",
                    }
                ),
                use_container_width=True,
            )

            # Visual Statistics
            st.subheader("📊 Traffic Distribution & Protocol Statistics")
            c_chart1, c_chart2 = st.columns(2)

            with c_chart1:
                st.markdown("#### Flow Count by Predicted Category")
                class_counts = combined_results["predicted_class"].value_counts()
                st.bar_chart(class_counts)

            with c_chart2:
                st.markdown("#### Transport Layer Protocol Distribution")
                proto_counts = combined_results["protocol"].value_counts()
                st.bar_chart(proto_counts)

            # Expandable 23 Features Table
            with st.expander("🔍 View All 23 Extracted Timing Features"):
                st.dataframe(features_df, use_container_width=True)

            # Single Flow Natural-Language Explanation
            st.markdown("---")
            st.subheader("💡 Explain Flow Prediction (Natural Language XAI)")
            st.markdown("Select an individual flow to inspect its top candidate probabilities and networking rationale:")

            flow_selector = st.selectbox(
                "Choose Flow to Explain:",
                range(total_flows),
                format_func=lambda idx: (
                    f"Flow #{idx}: {combined_results.iloc[idx]['src_ip']}:{combined_results.iloc[idx]['src_port']} "
                    f"➔ {combined_results.iloc[idx]['dst_ip']}:{combined_results.iloc[idx]['dst_port']} "
                    f"({combined_results.iloc[idx]['protocol']}) — {combined_results.iloc[idx]['predicted_class']} "
                    f"({combined_results.iloc[idx]['confidence']:.1%})"
                ),
            )

            if st.button("Generate Technical Explanation"):
                chosen_row = features_df.iloc[flow_selector].to_dict()
                pred_info = predict_one(
                    chosen_row,
                    model=model,
                    scaler=scaler,
                    feature_columns=feature_cols,
                    label_map=label_map,
                    confidence_threshold=confidence_threshold,
                )

                with st.spinner("Generating Computer Networks explanation..."):
                    expl_data = explain_flow(chosen_row, pred_info)

                st.success(
                    f"**Predicted Class**: {pred_info['predicted_class']} ({pred_info['confidence']:.1%} confidence) "
                    f"| Status: {pred_info['status']}"
                )
                st.info(f"**Explanation**:\n\n{expl_data['explanation']}")
                st.caption(
                    f"Provider: **{expl_data['provider']}** ({expl_data['model']}) | "
                    f"Latency: {expl_data['latency_seconds']}s"
                )

            # Export classification report
            st.markdown("---")
            csv_data = combined_results.to_csv(index=False).encode("utf-8")
            st.download_button(
                label="📥 Download Classified Flows Report (CSV)",
                data=csv_data,
                file_name=f"classified_{Path(source_name).stem}_report.csv",
                mime="text/csv",
                use_container_width=True,
            )


# ==============================================================================
# Page 2: Batch CSV Flow Inference
# ==============================================================================
elif page == "📊 Batch CSV Flow Inference":
    st.title("📊 Batch CSV Flow Inference")
    st.markdown(
        "Upload a CSV containing pre-extracted 23 timing features or test with the bundled sample flows."
    )

    col1, col2 = st.columns([3, 1])
    with col1:
        uploaded_file = st.file_uploader("Upload Network Flow CSV", type=["csv"])
    with col2:
        use_sample = st.button("Load Bundled Sample Flows", use_container_width=True)

    if uploaded_file is not None:
        df = pd.read_csv(uploaded_file)
    elif use_sample or Path("data/processed/sample_raw_flows.csv").exists():
        df = pd.read_csv("data/processed/sample_raw_flows.csv")
    else:
        df = None

    if df is not None:
        st.write(f"Loaded **{len(df)}** flow(s) with **{len(df.columns)}** columns.")

        try:
            results_df, latency_ms = predict_flows(
                df,
                model=model,
                scaler=scaler,
                feature_columns=feature_cols,
                label_map=label_map,
                confidence_threshold=confidence_threshold,
            )

            # Performance Metrics
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Flows Processed", len(results_df))
            m2.metric("Avg Latency / Flow", f"{latency_ms:.3f} ms")
            m3.metric("Throughput", f"{int(1000 / (latency_ms + 1e-6)):,} flows/sec")
            m4.metric("Top Class", results_df["predicted_class"].mode()[0])

            st.subheader("Classification Results & Top Candidates")
            display_cols = [
                "predicted_class",
                "confidence",
                "status",
                "top1_class",
                "top1_prob",
                "top2_class",
                "top2_prob",
                "top3_class",
                "top3_prob",
            ]
            st.dataframe(
                results_df[display_cols].style.format(
                    {
                        "confidence": "{:.1%}",
                        "top1_prob": "{:.1%}",
                        "top2_prob": "{:.1%}",
                        "top3_prob": "{:.1%}",
                    }
                ),
                use_container_width=True,
            )

            # Download CSV
            csv_exp = results_df.to_csv(index=False).encode("utf-8")
            st.download_button(
                label="📥 Export Predictions to CSV",
                data=csv_exp,
                file_name="predictions_output.csv",
                mime="text/csv",
            )

            # Explanation Drawer
            st.markdown("---")
            st.subheader("🔍 Explain a Flow with LLM (Multi-Tier Fallback)")
            flow_idx = st.selectbox(
                "Select a flow index to generate Computer Networks explanation:",
                range(len(df)),
            )

            if st.button("Generate Explanation"):
                selected_row = df.iloc[flow_idx].to_dict()
                pred_dict = predict_one(
                    selected_row,
                    model=model,
                    scaler=scaler,
                    feature_columns=feature_cols,
                    label_map=label_map,
                    confidence_threshold=confidence_threshold,
                )

                with st.spinner("Generating technical explanation..."):
                    explanation_data = explain_flow(selected_row, pred_dict)

                st.success(
                    f"**Prediction**: {pred_dict['predicted_class']} ({pred_dict['confidence']:.1%} confidence)"
                )
                st.info(f"**Explanation**:\n{explanation_data['explanation']}")
                st.caption(
                    f"Generated by: **{explanation_data['provider']}** ({explanation_data['model']}) "
                    f"in {explanation_data['latency_seconds']}s"
                )

        except Exception as e:
            st.error(f"Prediction Error: {e}")


# ==============================================================================
# Page 3: Interactive Single-Flow Simulator
# ==============================================================================
elif page == "⚙️ Interactive Flow Simulator":
    st.title("⚙️ Interactive Single-Flow Simulator")
    st.markdown(
        "Adjust primary timing features to observe real-time classification changes and explanation reasoning."
    )

    sample_df = pd.read_csv("data/processed/sample_raw_flows.csv")
    base_flow = sample_df.iloc[0].to_dict()

    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown("#### Flow Rates")
        base_flow["flowBytesPerSecond"] = st.slider(
            "Flow Bytes / Sec", 0.0, 500000.0, float(base_flow.get("flowBytesPerSecond", 15000.0))
        )
        base_flow["flowPktsPerSecond"] = st.slider(
            "Flow Packets / Sec", 0.0, 500.0, float(base_flow.get("flowPktsPerSecond", 30.0))
        )
        base_flow["duration"] = st.number_input(
            "Flow Duration (microseconds)", value=float(base_flow.get("duration", 15000000.0))
        )

    with c2:
        st.markdown("#### Packet Inter-Arrival Times (IAT)")
        base_flow["mean_fiat"] = st.slider(
            "Mean Forward IAT (us)", 0.0, 2000000.0, float(base_flow.get("mean_fiat", 5000.0))
        )
        base_flow["mean_biat"] = st.slider(
            "Mean Backward IAT (us)", 0.0, 2000000.0, float(base_flow.get("mean_biat", 5000.0))
        )
        base_flow["min_flowiat"] = st.number_input(
            "Min Flow IAT (us)", value=float(base_flow.get("min_flowiat", 10.0))
        )

    with c3:
        st.markdown("#### Active / Idle Periods")
        base_flow["mean_active"] = st.slider(
            "Mean Active Time (us)", 0.0, 15000000.0, float(base_flow.get("mean_active", 500000.0))
        )
        base_flow["mean_idle"] = st.slider(
            "Mean Idle Time (us)", 0.0, 15000000.0, float(base_flow.get("mean_idle", 1000000.0))
        )

    pred = predict_one(
        base_flow,
        model=model,
        scaler=scaler,
        feature_columns=feature_cols,
        label_map=label_map,
        confidence_threshold=confidence_threshold,
    )

    st.markdown("---")
    st.subheader(f"Prediction: **{pred['predicted_class']}** ({pred['confidence']:.1%}) | Status: **{pred['status']}**")

    p1, p2 = st.columns([1, 1])
    with p1:
        st.markdown("#### Top 3 Candidates")
        for i, cand in enumerate(pred["top3"], 1):
            st.write(f"**#{i} {cand['class']}**: {cand['probability']:.1%}")
            st.progress(cand["probability"])

    with p2:
        st.markdown("#### Computer Networks Explanation")
        expl = explain_flow(base_flow, pred)
        st.write(expl["explanation"])
        st.caption(f"Provider: {expl['provider']} ({expl['model']})")


# ==============================================================================
# Page 4: Model Benchmark & Diagnostic Reports
# ==============================================================================
elif page == "📈 Model Benchmark & Reports":
    st.title("📈 Model Benchmarks & Diagnostic Reports")

    tab1, tab2, tab3, tab4 = st.tabs(
        [
            "5-Fold Cross-Validation",
            "Confusion Matrix & Feature Importance",
            "Streaming vs Browsing Diagnostic",
            "Session Validation & Real-World Evaluation",
        ]
    )

    with tab1:
        st.subheader("5-Fold Stratified Cross-Validation Benchmark (7,389 Flows)")
        if Path("reports/cv_results.csv").exists():
            cv_df = pd.read_csv("reports/cv_results.csv")
            st.dataframe(cv_df, use_container_width=True)

        if Path("reports/plots/cv_comparison.png").exists():
            st.image("reports/plots/cv_comparison.png", caption="Model Comparison across 5 Folds (Accuracy & Macro F1)")
        elif Path("reports/cv_comparison.png").exists():
            st.image("reports/cv_comparison.png", caption="Model Comparison across 5 Folds (Accuracy & Macro F1)")

    with tab2:
        st.subheader("Test Set Performance, Confusion Matrix & Feature Importances")
        if Path("reports/metrics.json").exists():
            metrics = json.load(open("reports/metrics.json"))
            col1, col2, col3 = st.columns(3)
            col1.metric("Test Accuracy", f"{metrics.get('test_accuracy', 0.969):.1%}")
            col2.metric("Test Macro F1", f"{metrics.get('test_macro_f1', 0.950):.3f}")
            col3.metric("Classification Latency", f"{metrics.get('latency_ms_per_flow', 2.3):.2f} ms")

        c_m1, c_m2 = st.columns(2)
        with c_m1:
            if Path("reports/plots/confusion_matrix.png").exists():
                st.image("reports/plots/confusion_matrix.png", caption="Multi-Class Confusion Matrix (7 Application Categories)")
            elif Path("reports/plots/results_dashboard.png").exists():
                st.image("reports/plots/results_dashboard.png", caption="Results Dashboard: Confusion Matrix & Metrics")

        with c_m2:
            if Path("reports/plots/feature_importance.png").exists():
                st.image("reports/plots/feature_importance.png", caption="LightGBM Top Timing Feature Importances")
            elif Path("reports/plots/top_features_by_class.png").exists():
                st.image("reports/plots/top_features_by_class.png", caption="Top Distinguishing Features by Traffic Class")

    with tab3:
        st.subheader("Weak Spot Analysis: Streaming vs Browsing Overlap")
        if Path("reports/plots/streaming_vs_browsing.png").exists():
            st.image("reports/plots/streaming_vs_browsing.png", caption="Streaming vs Browsing Diagnostic Submatrix and Top Features")

        if Path("reports/streaming_vs_browsing_analysis.md").exists():
            content = Path("reports/streaming_vs_browsing_analysis.md").read_text(encoding="utf-8")
            st.markdown(content)

    with tab4:
        st.subheader("Session Validation & Real-World PCAP Evaluation")
        if Path("reports/session_validation_analysis.md").exists():
            session_content = Path("reports/session_validation_analysis.md").read_text(encoding="utf-8")
            st.markdown(session_content)
        else:
            st.info("Session validation analysis report will appear here.")
