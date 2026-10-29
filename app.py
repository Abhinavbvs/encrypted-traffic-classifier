"""Streamlit Web Application for Encrypted Traffic Classification.

Provides an interactive dashboard for:
1. Batch flow classification with top-3 candidate confidence and latency tracking.
2. Interactive single-flow timing parameter simulation.
3. Natural-language explanation layer using Ollama with multi-tier fallback.
4. Model performance analytics and weak spot (Streaming vs Browsing) diagnostics.
"""

from __future__ import annotations

import json
from pathlib import Path
import time
import pandas as pd
import streamlit as st

from src.predict import load_artifacts, predict_flows, predict_one
from src.llm_explainer import explain_flow

st.set_page_config(
    page_title="Encrypted Traffic Classifier",
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
        padding: 16px;
        border: 1px solid #e2e8f0;
    }
    .badge-primary {
        background-color: #3b82f6;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.85em;
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
Classifies traffic into 7 categories using **ONLY 23 flow timing features**.
Preserves user privacy by never inspecting packet content.
"""
)

page = st.sidebar.radio(
    "Navigation",
    ["Batch Flow Inference", "Interactive Flow Inspector", "Model Benchmark & Reports"],
)

st.sidebar.markdown("---")
st.sidebar.caption("Dataset: ISCX VPN-NonVPN (15s Time Windows)")
st.sidebar.caption("Best Model: LightGBM (96.9% Test Accuracy)")

# --- Page 1: Batch Flow Inference ---
if page == "Batch Flow Inference":
    st.title("📊 Batch Encrypted Flow Classification")
    st.markdown(
        "Upload a CSV containing the 23 timing features or test with the bundled sample flows."
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

            # Interactive Explanation Drawer
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

# --- Page 2: Interactive Flow Inspector ---
elif page == "Interactive Flow Inspector":
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
    )

    st.markdown("---")
    st.subheader(f"Prediction: **{pred['predicted_class']}** ({pred['confidence']:.1%})")

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

# --- Page 3: Model Benchmark & Reports ---
elif page == "Model Benchmark & Reports":
    st.title("📈 Model Benchmarks & Diagnostic Reports")

    tab1, tab2, tab3 = st.tabs(["5-Fold Cross-Validation", "Confusion Matrix & F1", "Streaming vs Browsing Diagnostic"])

    with tab1:
        st.subheader("5-Fold Stratified Cross-Validation Benchmark (7,389 Flows)")
        if Path("reports/cv_results.csv").exists():
            cv_df = pd.read_csv("reports/cv_results.csv")
            st.dataframe(cv_df, use_container_width=True)

        if Path("reports/cv_comparison.png").exists():
            st.image("reports/cv_comparison.png", caption="Model Comparison across 5 Folds (Accuracy & Macro F1)")

    with tab2:
        st.subheader("Test Set Performance (LightGBM)")
        if Path("reports/metrics.json").exists():
            metrics = json.load(open("reports/metrics.json"))
            col1, col2, col3 = st.columns(3)
            col1.metric("Test Accuracy", f"{metrics.get('test_accuracy', 0.969):.1%}")
            col2.metric("Test Macro F1", f"{metrics.get('test_macro_f1', 0.950):.3f}")
            col3.metric("Classification Latency", f"{metrics.get('latency_ms_per_flow', 2.3):.2f} ms")

        if Path("reports/plots/results_dashboard.png").exists():
            st.image("reports/plots/results_dashboard.png", caption="Results Dashboard: Confusion Matrix, Feature Importance, and Per-Class F1")

    with tab3:
        st.subheader("Weak Spot Analysis: Streaming vs Browsing Confusion")
        if Path("reports/plots/streaming_vs_browsing.png").exists():
            st.image("reports/plots/streaming_vs_browsing.png", caption="Streaming vs Browsing Diagnostic Submatrix and Top Features")

        if Path("reports/streaming_vs_browsing_analysis.md").exists():
            content = Path("reports/streaming_vs_browsing_analysis.md").read_text(encoding="utf-8")
            st.markdown(content)
