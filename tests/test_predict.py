"""Unit tests for src/predict.py inference module.

Tests cover:
1. Feature column validation (missing and unexpected extra columns).
2. Output shape and column presence in prediction results.
3. Consistency between predict_flows and the training pipeline predictions.
4. Single-flow prediction via predict_one.
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest

from src.predict import load_artifacts, predict_flows, predict_one, validate_features


@pytest.fixture(scope="module")
def artifacts():
    """Load and cache model, scaler, feature columns, and label map."""
    return load_artifacts()


@pytest.fixture(scope="module")
def feature_columns():
    """Load the official 23 feature column names."""
    with open("data/processed/feature_columns.json", "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def label_map():
    """Load the official label mapping."""
    with open("data/processed/label_map.json", "r", encoding="utf-8") as f:
        return {int(k): v for k, v in json.load(f).items()}


def test_column_validation_exact_columns(feature_columns):
    """Validates that a DataFrame with the exact 23 columns passes validation."""
    dummy_df = pd.DataFrame(columns=feature_columns)
    validate_features(dummy_df, feature_columns)


def test_column_validation_missing_columns(feature_columns):
    """Validates that missing columns trigger a ValueError with column names."""
    # Omit the first two columns
    missing_cols = feature_columns[:2]
    df_missing = pd.DataFrame(columns=feature_columns[2:])
    with pytest.raises(ValueError) as exc_info:
        validate_features(df_missing, feature_columns)
    for col in missing_cols:
        assert col in str(exc_info.value)


def test_column_validation_extra_columns(feature_columns):
    """Validates that extra unexpected columns trigger a ValueError with column names."""
    df_extra = pd.DataFrame(columns=feature_columns + ["extra_feature", "malware_flag"])
    with pytest.raises(ValueError) as exc_info:
        validate_features(df_extra, feature_columns)
    assert "extra_feature" in str(exc_info.value)
    assert "malware_flag" in str(exc_info.value)


def test_predict_flows_output_shape(artifacts, feature_columns):
    """Test output shape and columns for batch flow prediction."""
    model, scaler, _, label_map = artifacts
    n_samples = 5
    # Generate random raw feature inputs
    raw_df = pd.DataFrame(
        np.random.uniform(0, 100, size=(n_samples, len(feature_columns))),
        columns=feature_columns,
    )
    results_df, latency_ms = predict_flows(
        raw_df, model=model, scaler=scaler, feature_columns=feature_columns, label_map=label_map
    )

    assert len(results_df) == n_samples
    assert latency_ms >= 0.0
    expected_core_cols = [
        "predicted_class",
        "confidence",
        "top1_class",
        "top1_prob",
        "top2_class",
        "top2_prob",
        "top3_class",
        "top3_prob",
    ]
    for col in expected_core_cols:
        assert col in results_df.columns

    for _, class_name in label_map.items():
        assert f"prob_{class_name}" in results_df.columns


def test_predict_matches_training_pipeline(artifacts, feature_columns, label_map):
    """Verify that predictions on test data match direct model predictions."""
    model, scaler, _, _ = artifacts
    test_df = pd.read_csv("data/processed/test.csv")
    sample_test = test_df.head(10)

    # Invert scaling to obtain the raw feature values
    raw_values = scaler.inverse_transform(sample_test[feature_columns])
    raw_df = pd.DataFrame(raw_values, columns=feature_columns)

    # Run through predict_flows
    results_df, _ = predict_flows(
        raw_df, model=model, scaler=scaler, feature_columns=feature_columns, label_map=label_map
    )

    # Run direct model prediction on the scaled test split
    direct_pred_ids = model.predict(sample_test[feature_columns])
    direct_pred_classes = [label_map[i] for i in direct_pred_ids]
    direct_probs = model.predict_proba(sample_test[feature_columns])

    # Check that predicted classes match exactly
    assert results_df["predicted_class"].tolist() == direct_pred_classes
    # Check that max probability matches closely
    np.testing.assert_allclose(
        results_df["confidence"].values,
        np.max(direct_probs, axis=1),
        rtol=1e-5,
        atol=1e-5,
    )


def test_predict_one(artifacts, feature_columns, label_map):
    """Test single-flow prediction output structure."""
    model, scaler, _, _ = artifacts
    test_df = pd.read_csv("data/processed/test.csv")
    raw_values = scaler.inverse_transform(test_df[feature_columns].iloc[[0]])[0]
    row_dict = dict(zip(feature_columns, raw_values))

    res = predict_one(
        row_dict, model=model, scaler=scaler, feature_columns=feature_columns, label_map=label_map
    )

    assert "predicted_class" in res
    assert "confidence" in res
    assert "top3" in res
    assert len(res["top3"]) == 3
    assert "probabilities" in res
    assert len(res["probabilities"]) == len(label_map)
    assert res["predicted_class"] in label_map.values()
