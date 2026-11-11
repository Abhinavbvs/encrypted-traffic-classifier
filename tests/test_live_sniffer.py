"""Unit tests for src/live_sniffer.py (mocked Scapy capture & interface enumeration)."""

from types import SimpleNamespace

import pytest
from scapy.all import rdpcap

from src.live_sniffer import list_interfaces, sniff_and_classify
from src.predict import load_artifacts


@pytest.fixture(scope="module")
def artifacts():
    """Load cached classifier artifacts once per module."""
    return load_artifacts()


def test_list_interfaces_working_and_fallback(monkeypatch):
    """list_interfaces handles both get_working_ifaces() and conf.ifaces fallback."""
    fake_iface = SimpleNamespace(name="eth0", description="Ethernet", ip="192.168.1.10", mac="00:11:22:33:44:55")
    monkeypatch.setattr("src.live_sniffer.get_working_ifaces", lambda: [fake_iface])

    res = list_interfaces()
    assert len(res) == 1
    assert res[0]["name"] == "eth0"
    assert res[0]["ip"] == "192.168.1.10"

    def raise_err():
        raise OSError("ifaces unavailable")

    monkeypatch.setattr("src.live_sniffer.get_working_ifaces", raise_err)
    monkeypatch.setattr(
        "src.live_sniffer.conf",
        SimpleNamespace(ifaces={"lo0": SimpleNamespace(description="Loopback", ip="127.0.0.1", mac="00:00:00:00:00:00")}),
    )
    fallback = list_interfaces()
    assert len(fallback) == 1
    assert fallback[0]["name"] == "lo0"
    assert fallback[0]["description"] == "Loopback"


def test_sniff_and_classify_error_handling(monkeypatch, artifacts):
    """Permission / WinPcap errors return structured status='error' with empty flows."""
    def boom(**kwargs):
        raise RuntimeError("winpcap is not installed")

    monkeypatch.setattr("src.live_sniffer.sniff", boom)
    res = sniff_and_classify(iface="eth0", duration=1.0, count=10, model_artifacts=artifacts)

    assert res["status"] == "error"
    assert res["flows"] == []
    assert res["packets_captured"] == 0
    assert "RuntimeError" in res["message"]


def test_sniff_and_classify_empty_window(monkeypatch, artifacts):
    """Empty capture window returns status='no_packets' cleanly."""
    monkeypatch.setattr("src.live_sniffer.sniff", lambda **kwargs: [])
    res = sniff_and_classify(iface="eth0", duration=1.0, count=10, model_artifacts=artifacts)

    assert res["status"] == "no_packets"
    assert res["flows"] == []
    assert res["packets_captured"] == 0


def test_sniff_and_classify_mocked_capture(monkeypatch, artifacts):
    """Mocked live packet list runs full 23-feature extraction, TreeSHAP drivers, and classification."""
    sample_pkts = rdpcap("data/sample_pcaps/voip_call.pcap")[:40]
    monkeypatch.setattr("src.live_sniffer.sniff", lambda **kwargs: sample_pkts)

    res = sniff_and_classify(
        iface="mock0",
        duration=2.0,
        count=40,
        confidence_threshold=0.5,
        model_artifacts=artifacts,
    )

    assert res["status"] == "success"
    assert res["file"] == "live:mock0"
    assert res["mode"] == "live"
    assert res["packets_captured"] == len(sample_pkts)
    assert res["flow_count"] >= 1
    assert len(res["flows"]) == res["flow_count"]

    first = res["flows"][0]
    assert first["top_class"]
    assert 0.0 <= first["confidence"] <= 1.0
    assert len(first["probabilities"]) == 7
    assert len(first["features"]) == 23
    assert isinstance(first["top_drivers"], list)
    assert len(first["top_drivers"]) > 0
    assert "shap" in first["top_drivers"][0]
    assert first["explanation"]
