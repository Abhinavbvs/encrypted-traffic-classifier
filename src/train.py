import json
import time
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    f1_score,
)
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

# ---------- Settings ----------
DATA_DIR = Path("data/processed")
MODEL_DIR = Path("models")
REPORT_DIR = Path("reports")
PLOT_DIR = REPORT_DIR / "plots"
RANDOM_STATE = 42


def main():
    MODEL_DIR.mkdir(exist_ok=True)
    PLOT_DIR.mkdir(parents=True, exist_ok=True)

    # 1) Load data
    feature_cols = json.load(open(DATA_DIR / "feature_columns.json"))
    label_map = json.load(open(DATA_DIR / "label_map.json"))
    class_names = [label_map[str(i)] for i in range(len(label_map))]
    class_ids = list(range(len(class_names)))

    train = pd.read_csv(DATA_DIR / "train.csv")
    val = pd.read_csv(DATA_DIR / "val.csv")
    test = pd.read_csv(DATA_DIR / "test.csv")
    all_data = pd.concat([train, val, test], ignore_index=True)

    X_train, y_train = train[feature_cols], train["label_id"]
    X_val, y_val = val[feature_cols], val["label_id"]
    X_test, y_test = test[feature_cols], test["label_id"]
    print(f"Train {X_train.shape}, Val {X_val.shape}, Test {X_test.shape}")

    # 2) Define the three models (all handle the small classes with weights)
    models = {
        "RandomForest": RandomForestClassifier(
            n_estimators=300,
            class_weight="balanced",
            n_jobs=-1,
            random_state=RANDOM_STATE,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=300,
            max_depth=8,
            learning_rate=0.1,
            eval_metric="mlogloss",
            early_stopping_rounds=20,
            n_jobs=-1,
            random_state=RANDOM_STATE,
        ),
        "LightGBM": LGBMClassifier(
            n_estimators=300,
            learning_rate=0.1,
            class_weight="balanced",
            n_jobs=-1,
            random_state=RANDOM_STATE,
            verbose=-1,
        ),
    }

    # 3) Train each model and score it on the VALIDATION set
    rows = []
    for name, model in models.items():
        start = time.time()
        if name == "XGBoost":
            weights = compute_sample_weight("balanced", y_train)
            model.fit(
                X_train,
                y_train,
                sample_weight=weights,
                eval_set=[(X_val, y_val)],
                verbose=False,
            )
        else:
            model.fit(X_train, y_train)
        seconds = time.time() - start

        pred = model.predict(X_val)
        rows.append(
            {
                "model": name,
                "val_accuracy": accuracy_score(y_val, pred),
                "val_macro_f1": f1_score(y_val, pred, average="macro"),
                "train_seconds": seconds,
            }
        )
        print(
            f"{name:13s} val accuracy={rows[-1]['val_accuracy']:.4f} "
            f"macro F1={rows[-1]['val_macro_f1']:.4f} ({seconds:.1f}s)"
        )

    comparison = pd.DataFrame(rows).round(4)
    comparison.to_csv(REPORT_DIR / "val_comparison.csv", index=False)

    # 4) Pick the best model by validation macro F1
    best_name = comparison.sort_values("val_macro_f1", ascending=False).iloc[0]["model"]
    best_model = models[best_name]
    print(f"\nBest model on validation: {best_name}")

    # 5) Final evaluation on the TEST set (only the best model, only once)
    y_pred = best_model.predict(X_test)
    test_acc = accuracy_score(y_test, y_pred)
    test_f1 = f1_score(y_test, y_pred, average="macro")
    f1_per_class = f1_score(y_test, y_pred, labels=class_ids, average=None)
    report = classification_report(
        y_test, y_pred, labels=class_ids, target_names=class_names, digits=3
    )
    print(f"\nTEST accuracy={test_acc:.4f}  macro F1={test_f1:.4f}\n")
    print(report)
    (REPORT_DIR / "test_classification_report.txt").write_text(report)

    # 6) Inference latency (one flow at a time)
    one_row = X_test.iloc[[0]]
    best_model.predict(one_row)  # warm up
    start = time.time()
    for _ in range(100):
        best_model.predict(one_row)
    latency_ms = (time.time() - start) / 100 * 1000
    print(f"Average time to classify one flow: {latency_ms:.2f} ms")

    importances = pd.Series(best_model.feature_importances_, index=feature_cols)
    print("\nTop 5 features:")
    print(importances.sort_values(ascending=False).head(5).round(4))

    # 7) Save model and metrics
    joblib.dump(best_model, MODEL_DIR / "best_model.pkl")
    metrics = {
        "best_model": best_name,
        "test_accuracy": round(float(test_acc), 4),
        "test_macro_f1": round(float(test_f1), 4),
        "latency_ms_per_flow": round(latency_ms, 3),
        "validation_comparison": comparison.to_dict(orient="records"),
    }
    json.dump(metrics, open(REPORT_DIR / "metrics.json", "w"), indent=2)

    # ---------- Charts ----------
    def draw_model_comparison(ax):
        x = np.arange(len(comparison))
        width = 0.35
        b1 = ax.bar(x - width / 2, comparison["val_accuracy"], width, label="Accuracy")
        b2 = ax.bar(x + width / 2, comparison["val_macro_f1"], width, label="Macro F1")
        ax.bar_label(b1, fmt="%.3f", fontsize=9)
        ax.bar_label(b2, fmt="%.3f", fontsize=9)
        ax.set_xticks(x)
        ax.set_xticklabels(comparison["model"])
        ax.set_ylim(0.8, 1.06)
        ax.set_ylabel("Score")
        ax.set_title("Validation: accuracy and macro F1 (axis starts at 0.8)")
        ax.legend(loc="upper center", ncol=2)

    def draw_per_class_f1(ax):
        bars = ax.bar(class_names, f1_per_class, color="tab:green")
        ax.bar_label(bars, fmt="%.3f", fontsize=9)
        ax.set_ylim(0, 1.1)
        ax.set_ylabel("F1 score")
        ax.set_title(f"F1 score per class - {best_name} (test set)")
        plt.setp(ax.get_xticklabels(), rotation=30, ha="right")

    def draw_confusion(ax):
        ConfusionMatrixDisplay.from_predictions(
            y_test,
            y_pred,
            labels=class_ids,
            display_labels=class_names,
            xticks_rotation=45,
            cmap="Blues",
            colorbar=False,
            ax=ax,
        )
        ax.set_title(f"Confusion matrix - {best_name} (test set)")

    def draw_feature_importance(ax):
        top = importances.sort_values(ascending=False).head(15)[::-1]
        ax.barh(top.index, top.values, color="tab:purple")
        ax.set_xlabel("Times used in a split")
        ax.set_title(f"Top 15 features - {best_name}")

    def draw_class_distribution(ax):
        counts = all_data["label"].value_counts().reindex(class_names)
        bars = ax.bar(counts.index, counts.values, color="tab:orange")
        ax.bar_label(bars, fontsize=9)
        ax.set_ylabel("Number of flows")
        ax.set_title("Class distribution (train + val + test)")
        plt.setp(ax.get_xticklabels(), rotation=30, ha="right")

    def draw_top_features_by_class(ax):
        top_features = importances.sort_values(ascending=False).head(8).index.tolist()
        means = train.groupby("label")[top_features].mean().reindex(class_names)
        limit = float(np.abs(means.values).max())
        im = ax.imshow(means.values, cmap="RdBu_r", vmin=-limit, vmax=limit, aspect="auto")
        ax.set_xticks(range(len(top_features)))
        ax.set_xticklabels(top_features, rotation=30, ha="right", fontsize=8)
        ax.set_yticks(range(len(class_names)))
        ax.set_yticklabels(class_names)
        for i in range(means.shape[0]):
            for j in range(means.shape[1]):
                ax.text(j, i, f"{means.values[i, j]:.2f}", ha="center", va="center", fontsize=8)
        ax.figure.colorbar(im, ax=ax, fraction=0.046)
        ax.set_title("Average of top 8 features per class (scaled, 0 = overall average)")

    def draw_correlation(ax):
        corr = train[feature_cols].corr()
        im = ax.imshow(corr.values, cmap="RdBu_r", vmin=-1, vmax=1)
        ax.set_xticks(range(len(feature_cols)))
        ax.set_yticks(range(len(feature_cols)))
        ax.set_xticklabels(feature_cols, rotation=90, fontsize=7)
        ax.set_yticklabels(feature_cols, fontsize=7)
        ax.figure.colorbar(im, ax=ax, fraction=0.046)
        ax.set_title("Feature correlation heatmap (train set)")

    # 8) Save every chart as its own PNG (for the report)
    singles = [
        ("model_comparison.png", draw_model_comparison, (8, 5)),
        ("per_class_f1.png", draw_per_class_f1, (8, 5)),
        ("confusion_matrix.png", draw_confusion, (8, 7)),
        ("feature_importance.png", draw_feature_importance, (8, 6)),
        ("class_distribution.png", draw_class_distribution, (8, 5)),
        ("top_features_by_class.png", draw_top_features_by_class, (10, 5)),
        ("correlation_heatmap.png", draw_correlation, (10, 9)),
    ]
    for filename, draw, size in singles:
        fig, ax = plt.subplots(figsize=size)
        draw(ax)
        fig.tight_layout()
        fig.savefig(PLOT_DIR / filename, dpi=150)
        plt.close(fig)

    # 9) Build 3 combined windows and save them too
    fig1, axes = plt.subplots(2, 2, figsize=(15, 11))
    draw_model_comparison(axes[0, 0])
    draw_per_class_f1(axes[0, 1])
    draw_confusion(axes[1, 0])
    draw_feature_importance(axes[1, 1])
    fig1.suptitle("Model results", fontsize=15)
    fig1.tight_layout(rect=[0, 0, 1, 0.96])
    fig1.savefig(PLOT_DIR / "results_dashboard.png", dpi=150)

    fig2, axes = plt.subplots(1, 2, figsize=(16, 6))
    draw_class_distribution(axes[0])
    draw_top_features_by_class(axes[1])
    fig2.suptitle("Data overview", fontsize=15)
    fig2.tight_layout(rect=[0, 0, 1, 0.94])
    fig2.savefig(PLOT_DIR / "data_overview.png", dpi=150)

    fig3, ax3 = plt.subplots(figsize=(9, 8))
    draw_correlation(ax3)
    fig3.tight_layout()

    print("\nSaved: models/best_model.pkl")
    print("Saved in reports/: val_comparison.csv, test_classification_report.txt, metrics.json")
    print("Saved in reports/plots/: 7 single charts + results_dashboard.png + data_overview.png")
    print("\nOpening chart windows... close them to finish the program.")
    # plt.show()  # disabled for headless/terminal execution


if __name__ == "__main__":
    main()


