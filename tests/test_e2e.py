"""End-to-end integration tests for encrypted traffic classification pipeline.

Verifies the entire sequence:
1. Feature extraction & artifact loading (LightGBM + StandardScaler).
2. Data validation on the 23 timing features.
3. Batch inference and ranking top-3 classes with probabilities.
4. Latency performance (<10 ms per flow).
5. Natural-language explanation generation via the fallback-safe LLM layer.
"""

from pathlib import Path
import pandas as pd
import pytest

from src.predict import load_artifacts, predict_flows, predict_one
from src.llm_explainer import explain_flow


def test_end_to_end_pipeline():
    """Verify end-to-end execution on sample unscaled network flows."""
    # 1. Load artifacts
    model, scaler, feature_cols, label_map = load_artifacts()
    assert len(feature_cols) == 23
    assert len(label_map) == 7

    # 2. Load test flow batch
    sample_path = Path("data/processed/sample_raw_flows.csv")
    assert sample_path.exists(), "Sample raw flows CSV must exist"
    df = pd.read_csv(sample_path)
    assert len(df) == 10

    # 3. Batch prediction
    results_df, latency_ms = predict_flows(
        df,
        model=model,
        scaler=scaler,
        feature_columns=feature_cols,
        label_map=label_map,
    )
    assert len(results_df) == 10
    assert latency_ms < 10.0, f"Inference latency too high: {latency_ms:.2f}ms"

    # Verify probability distribution sums to ~1.0
    prob_cols = [f"prob_{name}" for name in label_map.values()]
    row_sums = results_df[prob_cols].sum(axis=1)
    for val in row_sums:
        assert pytest.approx(val, rel=1e-3) == 1.0

    # 4. Single-flow prediction and explanation
    first_row = df.iloc[0].to_dict()
    pred_result = predict_one(
        first_row,
        model=model,
        scaler=scaler,
        feature_columns=feature_cols,
        label_map=label_map,
    )
    assert "predicted_class" in pred_result
    assert len(pred_result["top3"]) == 3
    assert pred_result["confidence"] >= 0.0

    # 5. Explainer generation
    explanation_res = explain_flow(first_row, pred_result)
    assert "explanation" in explanation_res
    assert len(explanation_res["explanation"]) > 30
    assert explanation_res["status"] in ("success", "fallback_applied")
