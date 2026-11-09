"""Unit and integration tests for PCAP packet parsing, flow extraction, and classification."""

from __future__ import annotations

import io
from pathlib import Path
import tempfile
import pytest
import pandas as pd
from scapy.layers.inet import IP, TCP, UDP
from scapy.layers.l2 import Ether, ARP
from scapy.utils import wrpcap

from src.pcap_extractor import (
    extract_flows_from_pcap,
    EXPECTED_FEATURE_COLUMNS,
)
from src.predict import predict_pcap, load_artifacts


SAMPLE_DIR = Path("data/sample_pcaps")


@pytest.fixture(scope="module")
def artifacts():
    return load_artifacts()


def test_expected_feature_columns_count():
    """Verify that feature extraction defines exactly the 23 timing features expected by the model."""
    assert len(EXPECTED_FEATURE_COLUMNS) == 23


def test_extract_flows_from_browsing_pcap():
    """Verify flow extraction on browsing HTTPS PCAP capture."""
    pcap_path = SAMPLE_DIR / "browsing_https.pcap"
    assert pcap_path.exists(), f"Sample pcap not found at {pcap_path}"

    features_df, metadata_df = extract_flows_from_pcap(str(pcap_path))

    assert len(features_df) > 0
    assert len(metadata_df) == len(features_df)

    # Check that all 23 expected features are present
    for col in EXPECTED_FEATURE_COLUMNS:
        assert col in features_df.columns

    # Check metadata columns
    for meta_col in ["src_ip", "dst_ip", "src_port", "dst_port", "protocol", "packet_count", "byte_count", "duration_sec"]:
        assert meta_col in metadata_df.columns


@pytest.mark.parametrize(
    "pcap_filename",
    [
        "browsing_https.pcap",
        "streaming_video.pcap",
        "voip_call.pcap",
        "file_transfer.pcap",
    ],
)
def test_extract_flows_all_samples(pcap_filename):
    """Verify flow extraction runs without error across all bundled sample PCAPs."""
    pcap_path = SAMPLE_DIR / pcap_filename
    if not pcap_path.exists():
        pytest.skip(f"Sample {pcap_filename} not found.")

    features_df, metadata_df = extract_flows_from_pcap(str(pcap_path))
    assert not features_df.empty
    assert len(features_df.columns) == 23
    assert not features_df.isnull().values.any(), "Extracted features must not contain NaN"


def test_extract_flows_empty_pcap():
    """Verify that an empty PCAP file yields empty DataFrames gracefully without crashing."""
    with tempfile.NamedTemporaryFile(suffix=".pcap", delete=False) as tf:
        wrpcap(tf.name, [])
        empty_pcap_path = tf.name

    try:
        features_df, metadata_df = extract_flows_from_pcap(empty_pcap_path)
        assert isinstance(features_df, pd.DataFrame)
        assert isinstance(metadata_df, pd.DataFrame)
        assert len(features_df) == 0
        assert len(metadata_df) == 0
    finally:
        Path(empty_pcap_path).unlink(missing_ok=True)


def test_extract_flows_non_ip_packets():
    """Verify that non-IP packets (such as ARP broadcasts) are safely ignored without error."""
    arp_pkts = [
        Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst="192.168.1.1", psrc="192.168.1.50")
        for _ in range(5)
    ]
    with tempfile.NamedTemporaryFile(suffix=".pcap", delete=False) as tf:
        wrpcap(tf.name, arp_pkts)
        arp_pcap_path = tf.name

    try:
        features_df, metadata_df = extract_flows_from_pcap(arp_pcap_path)
        assert len(features_df) == 0
        assert len(metadata_df) == 0
    finally:
        Path(arp_pcap_path).unlink(missing_ok=True)


def test_extract_flows_corrupt_file():
    """Verify that invalid/corrupt PCAP data raises a descriptive error."""
    with tempfile.NamedTemporaryFile(suffix=".pcap", delete=False) as tf:
        tf.write(b"NOT_A_VALID_PCAP_HEADER_1234567890")
        corrupt_pcap_path = tf.name

    try:
        with pytest.raises(Exception):
            extract_flows_from_pcap(corrupt_pcap_path)
    finally:
        import gc
        gc.collect()
        try:
            Path(corrupt_pcap_path).unlink(missing_ok=True)
        except Exception:
            pass


def test_predict_pcap_end_to_end(artifacts):
    """Verify full end-to-end pipeline: PCAP -> Flow Extraction -> Feature Extraction -> LightGBM Classification."""
    model, scaler, feature_cols, label_map = artifacts
    pcap_path = SAMPLE_DIR / "voip_call.pcap"

    combined_df, features_df, latency_ms = predict_pcap(
        pcap_path=str(pcap_path),
        model=model,
        scaler=scaler,
        feature_columns=feature_cols,
        label_map=label_map,
    )

    assert not combined_df.empty
    assert "predicted_class" in combined_df.columns
    assert "confidence" in combined_df.columns
    assert "src_ip" in combined_df.columns
    assert "dst_ip" in combined_df.columns
    assert "protocol" in combined_df.columns
    assert latency_ms > 0

    # VoIP traffic should be recognized as VoIP with high confidence
    top_pred = combined_df["predicted_class"].iloc[0]
    assert "VoIP" in top_pred
    assert combined_df["confidence"].iloc[0] > 0.80


def test_predict_pcap_confidence_threshold_unknown(artifacts):
    """Verify that flows with confidence below the threshold are flagged as Unknown / Uncertain traffic."""
    model, scaler, feature_cols, label_map = artifacts
    pcap_path = SAMPLE_DIR / "browsing_https.pcap"

    # Set threshold unnaturally high to trigger uncertain detection
    combined_df, _, _ = predict_pcap(
        pcap_path=str(pcap_path),
        model=model,
        scaler=scaler,
        feature_columns=feature_cols,
        label_map=label_map,
        confidence_threshold=0.9999,
    )

    assert not combined_df.empty
    assert (combined_df["is_uncertain"] == True).all()
    assert (combined_df["status"] == "Uncertain (Unknown Traffic)").all()
    assert combined_df["predicted_class"].iloc[0].startswith("Uncertain")
