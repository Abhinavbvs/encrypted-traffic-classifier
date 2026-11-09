"""Automated end-to-end integration tests for the Streamlit Front-End Dashboard."""

from __future__ import annotations

from pathlib import Path
import pytest
from streamlit.testing.v1 import AppTest

APP_PATH = str(Path(__file__).resolve().parent.parent / "app.py")


def test_frontend_page1_pcap_analyzer():
    """Verify Page 1: PCAP Traffic Analyzer loads and processes bundled sample PCAP."""
    at = AppTest.from_file(APP_PATH)
    at.run(timeout=30)
    assert not at.exception

    # Select bundled sample VoIP PCAP
    sample_select = at.selectbox[0]
    sample_select.select("📞 VoIP Call (UDP/RTP)")
    at.run(timeout=30)
    assert not at.exception

    # Verify flow dataframe and metrics rendered
    assert len(at.dataframe) >= 1
    assert len(at.metric) >= 4

    metric_labels = [m.label for m in at.metric]
    assert "Total Flows" in metric_labels
    assert "Total Packets" in metric_labels


def test_frontend_page2_csv_batch():
    """Verify Page 2: Batch CSV Inference loads and processes sample flows."""
    at = AppTest.from_file(APP_PATH)
    at.run(timeout=30)
    at.sidebar.radio[0].set_value("📊 Batch CSV Flow Inference")
    at.run(timeout=30)
    assert not at.exception

    metric_labels = [m.label for m in at.metric]
    assert "Flows Processed" in metric_labels
    assert "Avg Latency / Flow" in metric_labels


def test_frontend_page3_simulator():
    """Verify Page 3: Interactive Flow Simulator initializes sliders and outputs predictions."""
    at = AppTest.from_file(APP_PATH)
    at.run(timeout=30)
    at.sidebar.radio[0].set_value("⚙️ Interactive Flow Simulator")
    at.run(timeout=30)
    assert not at.exception

    # Verify sliders for timing parameters
    assert len(at.slider) >= 5


def test_frontend_page4_reports():
    """Verify Page 4: Model Benchmark & Diagnostic Reports loads all tabs and metrics."""
    at = AppTest.from_file(APP_PATH)
    at.run(timeout=30)
    at.sidebar.radio[0].set_value("📈 Model Benchmark & Reports")
    at.run(timeout=30)
    assert not at.exception
