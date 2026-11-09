"""Inference module for encrypted traffic classification.

Loads the trained LightGBM model and StandardScaler, validates the 23 timing-based flow
features, applies scaling, and produces predictions with class probabilities, top-3
ranked classes per flow, and optional unknown/uncertain traffic thresholding.
Supports both CSV flow input and raw PCAP/PCAPNG network packet captures.

Abbreviations used in this module:
- IAT: Inter-Arrival Time (time between successive packets in a flow).
- FIAT: Forward Inter-Arrival Time (IAT between packets in forward direction).
- BIAT: Backward Inter-Arrival Time (IAT between packets in backward direction).
- PCAP: Packet Capture network file format.
- CLI: Command-Line Interface.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import joblib
import numpy as np
import pandas as pd

# Default project paths relative to repository root
DEFAULT_MODEL_PATH = Path("models/best_model.pkl")
DEFAULT_SCALER_PATH = Path("models/scaler.pkl")
DEFAULT_FEATURE_COLS_PATH = Path("data/processed/feature_columns.json")
DEFAULT_LABEL_MAP_PATH = Path("data/processed/label_map.json")


def load_artifacts(
    model_path: Path | str = DEFAULT_MODEL_PATH,
    scaler_path: Path | str = DEFAULT_SCALER_PATH,
    feature_cols_path: Path | str = DEFAULT_FEATURE_COLS_PATH,
    label_map_path: Path | str = DEFAULT_LABEL_MAP_PATH,
) -> Tuple[Any, Any, List[str], Dict[int, str]]:
    """Load the trained classifier, standard scaler, feature list, and label map.

    Args:
        model_path: Path to the serialized model file (.pkl).
        scaler_path: Path to the serialized StandardScaler file (.pkl).
        feature_cols_path: Path to JSON listing the 23 feature column names.
        label_map_path: Path to JSON mapping class IDs to class names.

    Returns:
        A tuple of (model, scaler, feature_columns, label_map).
    """
    model_path = Path(model_path)
    scaler_path = Path(scaler_path)
    feature_cols_path = Path(feature_cols_path)
    label_map_path = Path(label_map_path)

    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    if not scaler_path.exists():
        raise FileNotFoundError(f"Scaler file not found: {scaler_path}")
    if not feature_cols_path.exists():
        raise FileNotFoundError(f"Feature columns file not found: {feature_cols_path}")
    if not label_map_path.exists():
        raise FileNotFoundError(f"Label map file not found: {label_map_path}")

    model = joblib.load(model_path)
    scaler = joblib.load(scaler_path)

    with open(feature_cols_path, "r", encoding="utf-8") as f:
        feature_columns: List[str] = json.load(f)

    with open(label_map_path, "r", encoding="utf-8") as f:
        raw_map: Dict[str, str] = json.load(f)
        # Convert keys from string ("0") to int (0) for numeric indexing
        label_map: Dict[int, str] = {int(k): v for k, v in raw_map.items()}

    return model, scaler, feature_columns, label_map


def validate_features(df: pd.DataFrame, expected_features: List[str]) -> None:
    """Validate that input DataFrame contains exactly the expected feature columns.

    Args:
        df: Input DataFrame to validate.
        expected_features: List of the 23 expected timing feature names.

    Raises:
        ValueError: If any expected columns are missing or unexpected extra columns exist.
    """
    expected_set = set(expected_features)
    actual_set = set(df.columns)

    missing = [c for c in expected_features if c not in actual_set]
    extra = [c for c in df.columns if c not in expected_set]

    if missing or extra:
        errors = []
        if missing:
            errors.append(f"Missing {len(missing)} required column(s): {missing}")
        if extra:
            errors.append(f"Found {len(extra)} unexpected extra column(s): {extra}")
        raise ValueError(
            "Feature column validation failed. " + "; ".join(errors)
        )


def predict_flows(
    df: pd.DataFrame,
    model: Any = None,
    scaler: Any = None,
    feature_columns: List[str] | None = None,
    label_map: Dict[int, str] | None = None,
    confidence_threshold: float = 0.0,
) -> Tuple[pd.DataFrame, float]:
    """Predict traffic classes and probabilities for a batch of flows.

    Args:
        df: Pandas DataFrame containing the 23 timing feature columns.
        model: Optional pre-loaded classifier. If None, loaded from DEFAULT_MODEL_PATH.
        scaler: Optional pre-loaded StandardScaler. If None, loaded from DEFAULT_SCALER_PATH.
        feature_columns: Optional list of feature names. If None, loaded from DEFAULT_FEATURE_COLS_PATH.
        label_map: Optional class ID to class name mapping. If None, loaded from DEFAULT_LABEL_MAP_PATH.
        confidence_threshold: Minimum confidence score (0.0 to 1.0). If confidence is below this
            threshold, the flow is marked as 'Uncertain / Unknown Traffic'.

    Returns:
        A tuple of:
            - results_df: DataFrame with predictions, class probabilities, top-3 ranking, and uncertainty flags.
            - avg_latency_ms: Average inference latency per flow in milliseconds.
    """
    if model is None or scaler is None or feature_columns is None or label_map is None:
        loaded_model, loaded_scaler, loaded_cols, loaded_map = load_artifacts()
        model = model or loaded_model
        scaler = scaler or loaded_scaler
        feature_columns = feature_columns or loaded_cols
        label_map = label_map or loaded_map

    # 1) Validate feature columns
    validate_features(df, feature_columns)

    if len(df) == 0:
        empty_cols = [
            "predicted_class", "confidence", "is_uncertain", "status",
            "top1_class", "top1_prob", "top2_class", "top2_prob", "top3_class", "top3_prob"
        ] + [f"prob_{c}" for c in label_map.values()]
        return pd.DataFrame(columns=empty_cols), 0.0

    # 2) Ensure data is aligned and numeric
    X_raw = df[feature_columns].apply(pd.to_numeric, errors="coerce")
    if X_raw.isna().any().any():
        raise ValueError(
            "Input contains non-numeric or NaN values after numeric conversion."
        )

    # 3) Scale features using the saved StandardScaler
    X_scaled = pd.DataFrame(
        scaler.transform(X_raw),
        columns=feature_columns,
        index=df.index,
    )

    # 4) Predict with latency measurement
    start_time = time.perf_counter()
    probabilities = model.predict_proba(X_scaled)
    elapsed_time = time.perf_counter() - start_time
    n_flows = len(df)
    avg_latency_ms = (elapsed_time / n_flows) * 1000.0 if n_flows > 0 else 0.0

    # 5) Format predictions and top-3 ranked classes
    num_classes = len(label_map)
    pred_ids = np.argmax(probabilities, axis=1)
    pred_classes = [label_map[idx] for idx in pred_ids]
    pred_probs = np.max(probabilities, axis=1)

    # Sort probabilities descending to extract top-3
    sorted_indices = np.argsort(-probabilities, axis=1)

    top1_names = [label_map[sorted_indices[i, 0]] for i in range(n_flows)]
    top1_probs = [float(probabilities[i, sorted_indices[i, 0]]) for i in range(n_flows)]

    top2_names = [
        label_map[sorted_indices[i, 1]] if num_classes > 1 else None
        for i in range(n_flows)
    ]
    top2_probs = [
        float(probabilities[i, sorted_indices[i, 1]]) if num_classes > 1 else 0.0
        for i in range(n_flows)
    ]

    top3_names = [
        label_map[sorted_indices[i, 2]] if num_classes > 2 else None
        for i in range(n_flows)
    ]
    top3_probs = [
        float(probabilities[i, sorted_indices[i, 2]]) if num_classes > 2 else 0.0
        for i in range(n_flows)
    ]

    # Confidence Thresholding & Unknown Traffic Detection
    is_uncertain = [float(p) < confidence_threshold for p in pred_probs]
    statuses = ["Uncertain (Unknown Traffic)" if u else "Confident" for u in is_uncertain]
    display_classes = [
        f"Uncertain ({top1_names[i]})" if is_uncertain[i] else top1_names[i]
        for i in range(n_flows)
    ]

    results = {
        "predicted_class": display_classes,
        "confidence": pred_probs,
        "is_uncertain": is_uncertain,
        "status": statuses,
        "top1_class": top1_names,
        "top1_prob": top1_probs,
        "top2_class": top2_names,
        "top2_prob": top2_probs,
        "top3_class": top3_names,
        "top3_prob": top3_probs,
    }

    # Include per-class probabilities
    for c_id, c_name in label_map.items():
        results[f"prob_{c_name}"] = probabilities[:, c_id]

    results_df = pd.DataFrame(results, index=df.index)
    return results_df, avg_latency_ms


def predict_one(
    row_dict: Dict[str, Any],
    model: Any = None,
    scaler: Any = None,
    feature_columns: List[str] | None = None,
    label_map: Dict[int, str] | None = None,
    confidence_threshold: float = 0.0,
) -> Dict[str, Any]:
    """Predict traffic category for a single network flow.

    Args:
        row_dict: Dictionary mapping the 23 timing feature names to numeric values.
        model: Optional pre-loaded classifier.
        scaler: Optional pre-loaded StandardScaler.
        feature_columns: Optional feature list.
        label_map: Optional label map.
        confidence_threshold: Threshold below which prediction is marked uncertain.

    Returns:
        Dictionary containing predicted_class, confidence, top3 candidates, and
        full class probability breakdown.
    """
    df = pd.DataFrame([row_dict])
    results_df, latency_ms = predict_flows(
        df,
        model=model,
        scaler=scaler,
        feature_columns=feature_columns,
        label_map=label_map,
        confidence_threshold=confidence_threshold,
    )

    row = results_df.iloc[0]
    top3 = [
        {"class": row["top1_class"], "probability": round(float(row["top1_prob"]), 4)},
        {"class": row["top2_class"], "probability": round(float(row["top2_prob"]), 4)},
        {"class": row["top3_class"], "probability": round(float(row["top3_prob"]), 4)},
    ]

    all_probs = {
        col.replace("prob_", ""): round(float(row[col]), 4)
        for col in results_df.columns
        if col.startswith("prob_")
    }

    return {
        "predicted_class": row["predicted_class"],
        "confidence": round(float(row["confidence"]), 4),
        "is_uncertain": bool(row["is_uncertain"]),
        "status": row["status"],
        "top3": top3,
        "probabilities": all_probs,
        "latency_ms": round(latency_ms, 3),
    }


def predict_pcap(
    pcap_path: Union[str, Path],
    model: Any = None,
    scaler: Any = None,
    feature_columns: List[str] | None = None,
    label_map: Dict[int, str] | None = None,
    confidence_threshold: float = 0.0,
) -> Tuple[pd.DataFrame, pd.DataFrame, float]:
    """Extract flows directly from a raw PCAP/PCAPNG file and classify them.

    Args:
        pcap_path: Path to the raw .pcap or .pcapng packet capture.
        confidence_threshold: Threshold to flag uncertain / unknown flows.

    Returns:
        Tuple of (combined_results_df, extracted_features_df, latency_ms)
    """
    from src.pcap_extractor import extract_flows_from_pcap

    features_df, metadata_df = extract_flows_from_pcap(pcap_path)
    if len(features_df) == 0:
        return pd.DataFrame(), pd.DataFrame(), 0.0

    predictions_df, latency_ms = predict_flows(
        features_df,
        model=model,
        scaler=scaler,
        feature_columns=feature_columns,
        label_map=label_map,
        confidence_threshold=confidence_threshold,
    )

    combined_df = pd.concat([metadata_df, predictions_df], axis=1)
    return combined_df, features_df, latency_ms


def main():
    """Command-line interface entry point for flow prediction (CSV or raw PCAP)."""
    parser = argparse.ArgumentParser(
        description="Predict encrypted traffic category from 23 timing flow features or raw PCAP."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--input",
        "-i",
        type=str,
        help="Path to CSV containing 23 timing flow features.",
    )
    group.add_argument(
        "--pcap",
        "-p",
        type=str,
        help="Path to raw .pcap or .pcapng network packet capture file.",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default="predictions.csv",
        help="Path where prediction output CSV will be saved (default: predictions.csv).",
    )
    parser.add_argument(
        "--threshold",
        "-t",
        type=float,
        default=0.0,
        help="Confidence threshold (0.0 - 1.0) for Unknown Traffic detection (default: 0.0).",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=str(DEFAULT_MODEL_PATH),
        help=f"Path to model file (default: {DEFAULT_MODEL_PATH}).",
    )
    parser.add_argument(
        "--scaler",
        type=str,
        default=str(DEFAULT_SCALER_PATH),
        help=f"Path to scaler file (default: {DEFAULT_SCALER_PATH}).",
    )

    args = parser.parse_args()
    output_path = Path(args.output)

    model, scaler, feature_columns, label_map = load_artifacts(
        model_path=args.model,
        scaler_path=args.scaler,
    )

    if args.pcap:
        pcap_path = Path(args.pcap)
        if not pcap_path.exists():
            raise FileNotFoundError(f"PCAP file not found: {pcap_path}")

        print(f"Reading raw packets and extracting flows from PCAP: {pcap_path}")
        combined_df, features_df, latency_ms = predict_pcap(
            pcap_path,
            model=model,
            scaler=scaler,
            feature_columns=feature_columns,
            label_map=label_map,
            confidence_threshold=args.threshold,
        )

        if len(combined_df) == 0:
            print("No IP network flows detected in PCAP.")
            return

        output_path.parent.mkdir(parents=True, exist_ok=True)
        combined_df.to_csv(output_path, index=False)
        print(f"Extracted and classified {len(combined_df)} network flow(s).")
        print(f"Saved results to: {output_path}")
        print(f"Average classification latency: {latency_ms:.3f} ms / flow")

        print("\nFlows Classification Summary:")
        summary_cols = ["src_ip", "dst_ip", "protocol", "packet_count", "predicted_class", "confidence", "status"]
        print(combined_df[[c for c in summary_cols if c in combined_df.columns]].to_string(index=False))

    else:
        input_path = Path(args.input)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        print(f"Loading input flows from: {input_path}")
        df = pd.read_csv(input_path)
        print(f"Read {len(df)} row(s).")

        predictions_df, latency_ms = predict_flows(
            df,
            model=model,
            scaler=scaler,
            feature_columns=feature_columns,
            label_map=label_map,
            confidence_threshold=args.threshold,
        )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        predictions_df.to_csv(output_path, index=False)
        print(f"Saved predictions to: {output_path}")
        print(f"Average latency per flow: {latency_ms:.3f} ms ({len(df)} flow(s) processed)")

        print("\nPredicted class breakdown:")
        print(predictions_df["predicted_class"].value_counts().to_string())


if __name__ == "__main__":
    main()
