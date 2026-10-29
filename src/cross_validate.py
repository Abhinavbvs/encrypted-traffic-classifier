"""5-fold Stratified Cross-Validation module for encrypted traffic classification.

This script evaluates all three candidate models (Random Forest, XGBoost, and
LightGBM) using 5-fold stratified cross-validation on the combined training and
validation splits (7,389 flows). The test split is held out and remains untouched.

Abbreviations used in this module:
- CV: Cross-Validation.
- F1: Harmonic mean of precision and recall.
- Macro F1: Arithmetic mean of F1 scores computed across all 7 traffic classes.
- IAT: Inter-Arrival Time (interval between successive packets in a network flow).
- SD: Standard Deviation (variation around the mean score across CV folds).
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, List

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for headless execution and report generation
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

# Project paths
DATA_DIR = Path("data/processed")
REPORT_DIR = Path("reports")
PLOT_DIR = REPORT_DIR / "plots"
RANDOM_STATE = 42


def get_models(random_state: int = RANDOM_STATE) -> Dict[str, Any]:
    """Instantiate the 3 baseline classification models matching the training pipeline.

    Args:
        random_state: Random seed for deterministic reproducibility.

    Returns:
        Dictionary mapping model names to un-fitted classifier instances.
    """
    return {
        "RandomForest": RandomForestClassifier(
            n_estimators=300,
            class_weight="balanced",
            n_jobs=-1,
            random_state=random_state,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=300,
            max_depth=8,
            learning_rate=0.1,
            eval_metric="mlogloss",
            n_jobs=-1,
            random_state=random_state,
        ),
        "LightGBM": LGBMClassifier(
            n_estimators=300,
            learning_rate=0.1,
            class_weight="balanced",
            n_jobs=-1,
            random_state=random_state,
            verbose=-1,
        ),
    }


def run_cross_validation(
    X: pd.DataFrame,
    y: pd.Series,
    n_splits: int = 5,
    random_state: int = RANDOM_STATE,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Execute stratified k-fold cross-validation on all three classifiers.

    Args:
        X: Combined train+val features DataFrame (23 timing columns).
        y: Combined train+val class IDs.
        n_splits: Number of stratified folds (default: 5).
        random_state: Random state seed.

    Returns:
        A tuple of:
            - fold_records_df: Detailed scores for each model and fold.
            - summary_df: Aggregated mean and standard deviation per model.
    """
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=random_state)
    fold_records: List[Dict[str, Any]] = []

    models = get_models(random_state=random_state)

    print(f"Running {n_splits}-fold Stratified Cross-Validation on {len(X)} flows...")

    for model_name, model_instance in models.items():
        print(f"\n--- Cross-validating {model_name} ---")
        fold_accs = []
        fold_f1s = []
        fold_times = []

        for fold_idx, (train_idx, val_idx) in enumerate(skf.split(X, y), start=1):
            X_tr, y_tr = X.iloc[train_idx], y.iloc[train_idx]
            X_va, y_va = X.iloc[val_idx], y.iloc[val_idx]

            # Clone clean model instance
            current_model = get_models(random_state=random_state)[model_name]

            start_t = time.perf_counter()
            if model_name == "XGBoost":
                weights = compute_sample_weight("balanced", y_tr)
                current_model.fit(X_tr, y_tr, sample_weight=weights, verbose=False)
            else:
                current_model.fit(X_tr, y_tr)
            fit_duration = time.perf_counter() - start_t

            preds = current_model.predict(X_va)
            acc = accuracy_score(y_va, preds)
            macro_f1 = f1_score(y_va, preds, average="macro")

            fold_accs.append(acc)
            fold_f1s.append(macro_f1)
            fold_times.append(fit_duration)

            fold_records.append(
                {
                    "model": model_name,
                    "fold": fold_idx,
                    "accuracy": round(float(acc), 4),
                    "macro_f1": round(float(macro_f1), 4),
                    "fit_time_seconds": round(float(fit_duration), 2),
                }
            )
            print(
                f"  Fold {fold_idx}/{n_splits}: Accuracy={acc:.4f}, Macro F1={macro_f1:.4f} "
                f"({fit_duration:.1f}s)"
            )

        mean_acc, std_acc = np.mean(fold_accs), np.std(fold_accs)
        mean_f1, std_f1 = np.mean(fold_f1s), np.std(fold_f1s)
        print(
            f"  => {model_name} Summary: Accuracy = {mean_acc:.4f} +/- {std_acc:.4f} | "
            f"Macro F1 = {mean_f1:.4f} +/- {std_f1:.4f}"
        )

    fold_df = pd.DataFrame(fold_records)

    # Compute summary table (mean and std for Accuracy and Macro F1)
    summary_rows = []
    for model_name in models.keys():
        subset = fold_df[fold_df["model"] == model_name]
        summary_rows.append(
            {
                "model": model_name,
                "accuracy_mean": round(float(subset["accuracy"].mean()), 4),
                "accuracy_std": round(float(subset["accuracy"].std()), 4),
                "macro_f1_mean": round(float(subset["macro_f1"].mean()), 4),
                "macro_f1_std": round(float(subset["macro_f1"].std()), 4),
                "mean_fit_time_seconds": round(float(subset["fit_time_seconds"].mean()), 2),
            }
        )
    summary_df = pd.DataFrame(summary_rows)

    return fold_df, summary_df


def plot_cv_results(summary_df: pd.DataFrame, output_path: Path) -> None:
    """Generate and save a bar chart with error bars showing CV mean +/- std.

    Args:
        summary_df: DataFrame with accuracy_mean, accuracy_std, macro_f1_mean, macro_f1_std.
        output_path: Path where the PNG image will be saved.
    """
    fig, ax = plt.subplots(figsize=(8, 5.5))
    x = np.arange(len(summary_df))
    width = 0.35

    bars1 = ax.bar(
        x - width / 2,
        summary_df["accuracy_mean"],
        width,
        yerr=summary_df["accuracy_std"],
        capsize=5,
        label="Accuracy (Mean +/- SD)",
        color="#2b5c8f",
        alpha=0.9,
    )
    bars2 = ax.bar(
        x + width / 2,
        summary_df["macro_f1_mean"],
        width,
        yerr=summary_df["macro_f1_std"],
        capsize=5,
        label="Macro F1 (Mean +/- SD)",
        color="#38a169",
        alpha=0.9,
    )

    # Add numeric labels on top of bars
    for bar in bars1:
        h = bar.get_height()
        ax.annotate(
            f"{h:.3f}",
            xy=(bar.get_x() + bar.get_width() / 2, h),
            xytext=(0, 7),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=9,
            fontweight="bold",
        )
    for bar in bars2:
        h = bar.get_height()
        ax.annotate(
            f"{h:.3f}",
            xy=(bar.get_x() + bar.get_width() / 2, h),
            xytext=(0, 7),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=9,
            fontweight="bold",
        )

    ax.set_xticks(x)
    ax.set_xticklabels(summary_df["model"], fontsize=11, fontweight="bold")
    ax.set_ylabel("Metric Score", fontsize=11)
    ax.set_ylim(0.85, 1.0)
    ax.set_title(
        "5-Fold Stratified Cross-Validation on Train + Validation Splits (7,389 Flows)\n"
        "(Error bars represent 1 Standard Deviation across folds)",
        fontsize=11,
        pad=12,
    )
    ax.legend(loc="lower right", framealpha=0.9)
    ax.grid(axis="y", linestyle="--", alpha=0.5)

    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    print(f"Saved CV comparison chart to: {output_path}")


def main():
    """Execute cross-validation workflow."""
    parser = argparse.ArgumentParser(
        description="Run 5-fold stratified cross-validation on train+val data for all 3 models."
    )
    parser.add_argument(
        "--folds",
        type=int,
        default=5,
        help="Number of stratified folds (default: 5).",
    )
    args = parser.parse_args()

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    PLOT_DIR.mkdir(parents=True, exist_ok=True)

    # 1) Load feature list and train+val splits
    feature_cols = json.load(open(DATA_DIR / "feature_columns.json", "r", encoding="utf-8"))
    train_df = pd.read_csv(DATA_DIR / "train.csv")
    val_df = pd.read_csv(DATA_DIR / "val.csv")

    combined_df = pd.concat([train_df, val_df], ignore_index=True)
    X = combined_df[feature_cols]
    y = combined_df["label_id"]

    print(f"Combined Train+Val dataset: {X.shape[0]} flows, {X.shape[1]} timing features.")
    print("Test set is preserved untouched for final unbiased evaluation.\n")

    # 2) Run cross-validation
    fold_df, summary_df = run_cross_validation(X, y, n_splits=args.folds)

    # 3) Save results to reports/cv_results.csv
    cv_results_path = REPORT_DIR / "cv_results.csv"
    summary_df.to_csv(cv_results_path, index=False)
    print(f"\nSaved CV summary table to: {cv_results_path}")

    # Also save the fold-by-fold detail
    detailed_cv_path = REPORT_DIR / "cv_fold_details.csv"
    fold_df.to_csv(detailed_cv_path, index=False)
    print(f"Saved fold-by-fold details to: {detailed_cv_path}")

    # 4) Generate and save bar chart
    chart_path = REPORT_DIR / "cv_comparison.png"
    plot_cv_results(summary_df, chart_path)

    # Also mirror into plots/ directory
    plot_mirror_path = PLOT_DIR / "cv_comparison.png"
    plot_cv_results(summary_df, plot_mirror_path)

    print("\n--- Final Cross-Validation Results Summary ---")
    print(summary_df.to_string(index=False))


if __name__ == "__main__":
    main()
