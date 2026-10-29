"""Unit tests for src/llm_explainer.py explanation layer with fallback.

Tests verify:
1. Prompt construction from 23 timing features.
2. Deterministic rule-based fallback coverage for all 7 classes.
3. Fallback resilience when external endpoints are unreachable.
4. Correct output structure and latency calculation.
"""

import pytest
from src.llm_explainer import (
    build_prompt,
    explain_flow,
    explain_with_rule_fallback,
)


@pytest.fixture
def sample_flow():
    """Sample timing feature dictionary."""
    return {
        "duration": 14995200.0,
        "total_fiat": 7497600.0,
        "total_biat": 7497600.0,
        "min_fiat": 12.0,
        "min_biat": 15.0,
        "max_fiat": 250000.0,
        "max_biat": 240000.0,
        "mean_fiat": 3200.0,
        "mean_biat": 3100.0,
        "flowPktsPerSecond": 45.2,
        "flowBytesPerSecond": 15200.0,
        "min_flowiat": 8.0,
        "max_flowiat": 250000.0,
        "mean_flowiat": 1600.0,
        "std_flowiat": 4200.0,
        "min_active": 100000.0,
        "mean_active": 450000.0,
        "max_active": 800000.0,
        "std_active": 50000.0,
        "min_idle": 200000.0,
        "mean_idle": 500000.0,
        "max_idle": 900000.0,
        "std_idle": 60000.0,
    }


@pytest.fixture
def sample_prediction():
    """Sample prediction dictionary."""
    return {
        "predicted_class": "Streaming",
        "confidence": 0.985,
        "top3": [
            {"class": "Streaming", "probability": 0.985},
            {"class": "Browsing", "probability": 0.012},
            {"class": "FileTransfer", "probability": 0.003},
        ],
        "probabilities": {"Streaming": 0.985, "Browsing": 0.012, "FileTransfer": 0.003},
    }


def test_build_prompt(sample_flow, sample_prediction):
    """Test prompt building includes timing stats and top candidates."""
    prompt = build_prompt(sample_flow, sample_prediction)
    assert "Streaming" in prompt
    assert "Flow Timing Features" in prompt
    assert "mean_fiat" in prompt or "Forward IAT" in prompt
    assert "flowBytesPerSecond" in prompt or "Flow Rate" in prompt


@pytest.mark.parametrize(
    "class_name",
    ["Browsing", "Streaming", "VoIP", "FileTransfer", "P2P", "Chat", "Mail"],
)
def test_rule_based_fallback_all_classes(sample_flow, class_name):
    """Verify deterministic fallback generates valid explanations for all 7 classes."""
    pred = {
        "predicted_class": class_name,
        "confidence": 0.95,
        "top3": [
            {"class": class_name, "probability": 0.95},
            {"class": "Browsing" if class_name != "Browsing" else "Streaming", "probability": 0.05},
        ],
    }
    explanation = explain_with_rule_fallback(sample_flow, pred)
    assert isinstance(explanation, str)
    assert len(explanation) > 50
    assert class_name in explanation


def test_explain_flow_with_forced_fallback(sample_flow, sample_prediction):
    """Verify explain_flow executes smoothly when selecting fallback explicitly."""
    result = explain_flow(sample_flow, sample_prediction, preferred_provider="rule_fallback")
    assert result["status"] == "fallback_applied"
    assert result["provider"] == "rule_based_fallback"
    assert "Streaming" in result["explanation"]
    assert result["latency_seconds"] >= 0.0


def test_explain_flow_auto_fallback_resilience(sample_flow, sample_prediction):
    """Verify auto mode falls back cleanly without throwing exceptions when Ollama is offline."""
    result = explain_flow(sample_flow, sample_prediction, preferred_provider="auto")
    assert "explanation" in result
    assert result["status"] in ("success", "fallback_applied")
    assert len(result["explanation"]) > 20
