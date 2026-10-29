# Encrypted Traffic Classifier (Without Payload Inspection)

Classifies encrypted network traffic into **7 categories** (`Browsing`, `Streaming`, `VoIP`, `FileTransfer`, `P2P`, `Chat`, `Mail`) using **ONLY 23 flow timing features**. No packet payload is ever read or decrypted, preserving user privacy.

---

## Dataset

- **Dataset**: ISCX VPN-NonVPN (ISCXVPN2016), Scenario A2 (`TimeBasedFeatures-Dataset-15s-NO-VPN.arff`).
- **Flow Window**: 15-second time windows, non-VPN traffic only.
- **Cleaning**: 8,694 total valid rows after dropping 271 exact duplicates and missing values.
- **Splits**: Stratified 70% Train (6,085 flows) / 15% Validation (1,304 flows) / 15% Test (1,305 flows).
- **Features**: Exactly 23 statistical timing features (such as flow duration, packet rates, active/idle times, and Inter-Arrival Times [IAT]).

> **Note**: Processed CSV splits, feature lists, and label maps are readily available in `data/processed/`. The original ARFF file is only needed if rebuilding from scratch.

---

## Setup

Install required Python packages:

```bash
pip install -r requirements.txt
```

---

## How to Predict

### 1. Batch Prediction via Command-Line Interface (CLI)

Run inference on any CSV file containing the 23 timing feature columns:

```bash
python src/predict.py --input data/processed/sample_raw_flows.csv --output predictions.csv
```

The script automatically:
1. Validates that all 23 expected timing feature columns are present (raising an informative error if any are missing or if unexpected extra columns exist).
2. Applies the trained `StandardScaler` (`models/scaler.pkl`).
3. Runs the best model (`models/best_model.pkl`, LightGBM) to generate predictions.
4. Outputs predicted class, confidence, top-3 ranked classes with their probabilities, and full per-class probability columns.
5. Measures and logs average inference latency per flow (typically < 1 ms per flow).

### 2. Python API Usage

#### Batch Flows:
```python
import pandas as pd
from src.predict import predict_flows

df = pd.read_csv("data/processed/sample_raw_flows.csv")
results_df, avg_latency_ms = predict_flows(df)
print(results_df[["predicted_class", "confidence", "top1_class", "top2_class", "top3_class"]])
```

#### Single Flow:
```python
from src.predict import predict_one

flow_features = {
    "duration": 14995200.0,
    "total_fiat": 7497600.0,
    "total_biat": 7497600.0,
    # ... all 23 timing features
}

prediction = predict_one(flow_features)
print(f"Class: {prediction['predicted_class']} (Confidence: {prediction['confidence']:.2%})")
print("Top 3 Candidates:", prediction["top3"])
```

---

## Running Pipeline Scripts

All commands should be executed from the repository root:

| Command | Description | Outputs |
| :--- | :--- | :--- |
| `streamlit run app.py` | Launches interactive web dashboard for batch inference, single-flow tuning, and visual reports. | Interactive UI at `http://localhost:8501` |
| `python src/train.py` | Trains Random Forest, XGBoost, and LightGBM baseline models. Evaluates on test set. | `models/best_model.pkl`, `models/scaler.pkl`, `reports/val_comparison.csv`, `reports/plots/` |
| `python src/predict.py --input <csv> --output <csv>` | Runs inference on input flows with column validation and top-3 ranked confidence. | `predictions.csv`, latency metrics |
| `python src/llm_explainer.py` | Generates natural-language Computer Networks explanations with multi-tier fallback (Ollama -> Cloud -> Heuristic Rule Engine). | Technical explanation & provider metadata |
| `python src/tune.py` | Performs Randomized Search Cross-Validation (CV) on training split only (scored on macro F1). | `models/best_params.json`, `reports/tuning_results.csv` |
| `python src/cross_validate.py` | Executes 5-fold Stratified Cross-Validation on combined train+val data for all 3 models. | `reports/cv_results.csv`, `reports/cv_comparison.png` |
| `python src/analyze_weak_spot.py` | Analyzes Streaming vs Browsing confusion, feature overlap, and suggests concrete improvements. | `reports/streaming_vs_browsing_analysis.md`, `reports/plots/streaming_vs_browsing.png` |
| `pytest` | Runs complete 17-test suite (unit tests, fallback resilience, end-to-end integration). | Test results summary |

---

## LLM Explanation Layer & Multi-Tier Fallback

Classifications are translated into human-readable Computer Networks rationales via `src/llm_explainer.py`:
- **Tier 1 (Local Ollama)**: Queries local Mistral or Phi-3 server at `http://localhost:11434` (free, offline, private).
- **Tier 2 (Cloud LLM)**: Seamlessly uses Groq, OpenAI, or Gemini if an API key is present in `.env`.
- **Tier 3 (Domain-Expert Rule Engine)**: Deterministic, zero-dependency Computer Networks heuristic fallback that guarantees 100% operational availability without internet or API keys.

---

## Continuous Integration (CI)

A GitHub Actions workflow is configured in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) to automatically validate every push and pull request:
- Environment setup on `ubuntu-latest` with Python 3.11.
- Full artifact verification (23 features, 7 classes).
- 17 automated tests (`pytest -v`).
- CLI prediction execution test.
- LLM explainer fallback execution test.
- Weak spot diagnostic analysis generation test.

---

## Model Benchmark & Results

### Test Set Performance (Best Model: LightGBM)
- **Overall Accuracy**: 96.9%
- **Macro-Averaged F1 Score**: 0.950
- **Average Inference Latency**: ~ 2.2 ms per flow

### 5-Fold Stratified Cross-Validation (Train + Validation: 7,389 Flows)

| Model | Accuracy (Mean &plusmn; SD) | Macro F1 (Mean &plusmn; SD) | Avg Fit Time |
| :--- | :---: | :---: | :---: |
| **Random Forest** | 93.90% &plusmn; 0.88% | 0.9042 &plusmn; 0.0141 | 1.01s |
| **XGBoost** | 95.18% &plusmn; 0.48% | 0.9217 &plusmn; 0.0103 | 5.96s |
| **LightGBM** | **95.61% &plusmn; 0.57%** | **0.9268 &plusmn; 0.0128** | 3.51s |

---

## Primary Weak Spot: Streaming vs Browsing

- **Diagnosis**: Streaming achieves an F1 score of **0.874** (lowest among all 7 classes). Out of 67 Streaming flows in the test split, 7 flows (10.4%) were misclassified as Browsing due to short 15-second window chunk buffering resembling web page downloads.
- **Detailed Report**: See [`reports/streaming_vs_browsing_analysis.md`](reports/streaming_vs_browsing_analysis.md) and [`reports/plots/streaming_vs_browsing.png`](reports/plots/streaming_vs_browsing.png).
- **Recommended Improvements**:
  1. Asymmetric class weighting (e.g., `class_weight={"Streaming": 2.2, "Browsing": 1.0, ...}`).
  2. Decision threshold tuning for Streaming (`prob_Streaming > 0.35`).
  3. Multi-window ensembling over longer observation periods (30s / 60s).

---

## Directory Structure

```text
encrypted-traffic-classifier/
├── data/
│   └── processed/
│       ├── train.csv                      # Scaled training split (70%)
│       ├── val.csv                        # Scaled validation split (15%)
│       ├── test.csv                       # Scaled test split (15%)
│       ├── sample_raw_flows.csv           # Unscaled sample flows for inference testing
│       ├── feature_columns.json           # Exact list of the 23 timing features
│       └── label_map.json                 # Class ID to name mapping (7 classes)
├── models/
│   ├── best_model.pkl                     # Serialized best LightGBM classifier
│   ├── scaler.pkl                         # Fitted StandardScaler instance
│   └── best_params.json                   # Optimal hyperparameters from randomized search
├── reports/
│   ├── cv_results.csv                     # 5-fold CV summary across models
│   ├── cv_fold_details.csv                # Per-fold CV metrics
│   ├── cv_comparison.png                  # Cross-validation comparison chart
│   ├── tuning_results.csv                 # Detailed hyperparameter search iterations
│   ├── streaming_vs_browsing_analysis.md  # Weak spot diagnostic report
│   ├── test_classification_report.txt     # Test set per-class precision/recall/F1
│   ├── val_comparison.csv                 # Baseline validation comparison
│   └── plots/                             # High-resolution evaluation charts
├── src/
│   ├── prepare_data.py                    # ARFF loading, cleaning, scaling, and splitting
│   ├── train.py                           # Baseline training and evaluation script
│   ├── predict.py                         # Inference engine (CLI + API) with top-3 ranking
│   ├── tune.py                            # Hyperparameter randomized search
│   ├── cross_validate.py                  # 5-fold stratified cross-validation
│   └── analyze_weak_spot.py               # Weak spot diagnostic analysis
├── tests/
│   └── test_predict.py                    # Pytest test suite for predict.py
├── pytest.ini                             # Pytest path configuration
├── requirements.txt                       # Project dependencies
└── README.md                              # Project documentation
```
