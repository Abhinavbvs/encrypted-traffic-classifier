"""Hyperparameter tuning module for encrypted traffic classification.

This script uses Randomized Search Cross-Validation (RandomizedSearchCV) on the
training split only to find optimal hyperparameters for LightGBM and XGBoost,
scored on macro-averaged F1 score.

Abbreviations used in this module:
- CV: Cross-Validation.
- F1: Harmonic mean of precision and recall.
- Macro F1: Unweighted average of F1 scores across all 7 traffic classes.
- IAT: Inter-Arrival Time (time between successive packets in a flow).
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold
from xgboost import XGBClassifier

# Project paths
DATA_DIR = Path("data/processed")
MODEL_DIR = Path("models")
REPORT_DIR = Path("reports")
RANDOM_STATE = 42


def tune_lightgbm(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    n_iter: int = 20,
    cv_folds: int = 5,
    random_state: int = RANDOM_STATE,
) -> Tuple[LGBMClassifier, Dict[str, Any], float, pd.DataFrame]:
    """Run randomized hyperparameter search for LightGBM on training data only.

    Args:
        X_train: Training feature DataFrame.
        y_train: Training class IDs.
        n_iter: Number of randomized parameter combinations to test.
        cv_folds: Number of stratified cross-validation folds.
        random_state: Seed for reproducibility.

    Returns:
        Tuple of (best_estimator, best_params, best_cv_score, results_df).
    """
    param_dist = {
        "n_estimators": [100, 200, 300],
        "learning_rate": [0.03, 0.05, 0.1, 0.15],
        "num_leaves": [15, 31, 63],
        "max_depth": [-1, 6, 8, 10],
        "min_child_samples": [10, 20, 30],
        "subsample": [0.7, 0.8, 1.0],
        "colsample_bytree": [0.7, 0.8, 1.0],
        "class_weight": ["balanced", None],
    }

    # Set n_jobs=1 on estimator to prevent nested multi-threading contention with RandomizedSearchCV
    base_lgbm = LGBMClassifier(
        random_state=random_state,
        n_jobs=1,
        verbose=-1,
    )

    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=random_state)

    search = RandomizedSearchCV(
        estimator=base_lgbm,
        param_distributions=param_dist,
        n_iter=n_iter,
        scoring="f1_macro",
        cv=cv,
        random_state=random_state,
        n_jobs=-1,
        verbose=1,
    )

    print(f"\n--- Tuning LightGBM ({n_iter} iterations, {cv_folds}-fold CV) ---", flush=True)
    start = time.time()
    search.fit(X_train, y_train)
    duration = time.time() - start
    print(f"LightGBM tuning completed in {duration:.1f}s", flush=True)
    print(f"Best CV Macro F1: {search.best_score_:.4f}", flush=True)
    print(f"Best parameters: {search.best_params_}", flush=True)

    cv_results = pd.DataFrame(search.cv_results_)
    cv_results["model"] = "LightGBM"

    return search.best_estimator_, search.best_params_, search.best_score_, cv_results


def tune_xgboost(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    n_iter: int = 12,
    cv_folds: int = 5,
    random_state: int = RANDOM_STATE,
) -> Tuple[XGBClassifier, Dict[str, Any], float, pd.DataFrame]:
    """Run randomized hyperparameter search for XGBoost on training data only.

    Args:
        X_train: Training feature DataFrame.
        y_train: Training class IDs.
        n_iter: Number of randomized parameter combinations to test.
        cv_folds: Number of stratified cross-validation folds.
        random_state: Seed for reproducibility.

    Returns:
        Tuple of (best_estimator, best_params, best_cv_score, results_df).
    """
    param_dist = {
        "n_estimators": [150, 250],
        "max_depth": [4, 6, 8],
        "learning_rate": [0.05, 0.1, 0.15],
        "subsample": [0.8, 1.0],
        "colsample_bytree": [0.8, 1.0],
        "min_child_weight": [1, 3],
    }

    # Set n_jobs=1 on estimator to avoid nested threading contention
    base_xgb = XGBClassifier(
        eval_metric="mlogloss",
        random_state=random_state,
        n_jobs=1,
    )

    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=random_state)

    search = RandomizedSearchCV(
        estimator=base_xgb,
        param_distributions=param_dist,
        n_iter=n_iter,
        scoring="f1_macro",
        cv=cv,
        random_state=random_state,
        n_jobs=-1,
        verbose=1,
    )

    print(f"\n--- Tuning XGBoost ({n_iter} iterations, {cv_folds}-fold CV) ---", flush=True)
    start = time.time()
    search.fit(X_train, y_train)
    duration = time.time() - start
    print(f"XGBoost tuning completed in {duration:.1f}s", flush=True)
    print(f"Best CV Macro F1: {search.best_score_:.4f}", flush=True)
    print(f"Best parameters: {search.best_params_}", flush=True)

    cv_results = pd.DataFrame(search.cv_results_)
    cv_results["model"] = "XGBoost"

    return search.best_estimator_, search.best_params_, search.best_score_, cv_results


def main():
    """Execute hyperparameter tuning on training data only and save results."""
    parser = argparse.ArgumentParser(
        description="Tune hyperparameters for LightGBM and XGBoost on training set."
    )
    parser.add_argument(
        "--lgbm-iter",
        type=int,
        default=20,
        help="Number of iterations for LightGBM randomized search (default: 20).",
    )
    parser.add_argument(
        "--xgb-iter",
        type=int,
        default=10,
        help="Number of iterations for XGBoost randomized search (default: 10).",
    )
    parser.add_argument(
        "--skip-xgb",
        action="store_true",
        help="Skip XGBoost tuning and tune LightGBM only.",
    )
    args = parser.parse_args()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    # 1) Load training and validation datasets
    feature_cols = json.load(open(DATA_DIR / "feature_columns.json", "r", encoding="utf-8"))
    train_df = pd.read_csv(DATA_DIR / "train.csv")
    val_df = pd.read_csv(DATA_DIR / "val.csv")

    X_train, y_train = train_df[feature_cols], train_df["label_id"]
    X_val, y_val = val_df[feature_cols], val_df["label_id"]

    print(f"Training split: {X_train.shape[0]} flows, {X_train.shape[1]} features", flush=True)
    print(f"Validation split (for post-tuning evaluation only): {X_val.shape[0]} flows", flush=True)
    print("NOTE: Test split is NEVER accessed during hyperparameter tuning.", flush=True)

    # 2) Tune LightGBM
    lgbm_model, lgbm_params, lgbm_cv_score, lgbm_results = tune_lightgbm(
        X_train, y_train, n_iter=args.lgbm_iter
    )

    # Evaluate tuned LightGBM on validation split
    val_pred_lgbm = lgbm_model.predict(X_val)
    val_acc_lgbm = float(accuracy_score(y_val, val_pred_lgbm))
    val_f1_lgbm = float(f1_score(y_val, val_pred_lgbm, average="macro"))
    print(f"Tuned LightGBM on Val: Accuracy={val_acc_lgbm:.4f}, Macro F1={val_f1_lgbm:.4f}", flush=True)

    best_params_data: Dict[str, Any] = {
        "LightGBM": {
            "best_params": lgbm_params,
            "best_cv_macro_f1": round(float(lgbm_cv_score), 4),
            "val_accuracy": round(val_acc_lgbm, 4),
            "val_macro_f1": round(val_f1_lgbm, 4),
        }
    }

    all_cv_results = [lgbm_results]

    # 3) Optionally tune XGBoost
    if not args.skip_xgb:
        xgb_model, xgb_params, xgb_cv_score, xgb_results = tune_xgboost(
            X_train, y_train, n_iter=args.xgb_iter
        )
        val_pred_xgb = xgb_model.predict(X_val)
        val_acc_xgb = float(accuracy_score(y_val, val_pred_xgb))
        val_f1_xgb = float(f1_score(y_val, val_pred_xgb, average="macro"))
        print(f"Tuned XGBoost on Val: Accuracy={val_acc_xgb:.4f}, Macro F1={val_f1_xgb:.4f}", flush=True)

        best_params_data["XGBoost"] = {
            "best_params": xgb_params,
            "best_cv_macro_f1": round(float(xgb_cv_score), 4),
            "val_accuracy": round(val_acc_xgb, 4),
            "val_macro_f1": round(val_f1_xgb, 4),
        }
        all_cv_results.append(xgb_results)

    # 4) Save best parameters to models/best_params.json
    best_params_path = MODEL_DIR / "best_params.json"
    with open(best_params_path, "w", encoding="utf-8") as f:
        json.dump(best_params_data, f, indent=2)
    print(f"\nSaved best parameters to: {best_params_path}", flush=True)

    # 5) Combine and save search results table to reports/
    combined_results = pd.concat(all_cv_results, ignore_index=True)
    summary_cols = [
        "model",
        "rank_test_score",
        "mean_test_score",
        "std_test_score",
        "params",
        "mean_fit_time",
    ]
    existing_cols = [c for c in summary_cols if c in combined_results.columns]
    tuning_table = combined_results[existing_cols].sort_values(
        ["model", "rank_test_score"]
    )

    results_csv_path = REPORT_DIR / "tuning_results.csv"
    tuning_table.to_csv(results_csv_path, index=False)
    print(f"Saved tuning results table to: {results_csv_path}", flush=True)


if __name__ == "__main__":
    main()
