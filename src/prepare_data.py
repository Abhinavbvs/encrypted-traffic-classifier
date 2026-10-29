from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd
from scipy.io import arff
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# ---------- Settings ----------
RAW_FILE = Path(
    "data/raw/Scenario A2-ARFF/"
    "TimeBasedFeatures-Dataset-15s-NO-VPN.arff"
)
OUT_DIR = Path("data/processed")
MODEL_DIR = Path("models")
LABEL_COL = "class1"
RANDOM_STATE = 42

# Original label -> project class name (the order here = class id 0..6)
LABEL_MAP = {
    "BROWSING": "Browsing",
    "STREAMING": "Streaming",
    "VOIP": "VoIP",
    "FT": "FileTransfer",
    "P2P": "P2P",
    "CHAT": "Chat",
    "MAIL": "Mail",
}
CLASS_NAMES = list(LABEL_MAP.values())
LABEL_TO_ID = {name: i for i, name in enumerate(CLASS_NAMES)}


def to_text(x):
    return x.decode("utf-8") if isinstance(x, bytes) else str(x)


def main():
    if not RAW_FILE.exists():
        raise FileNotFoundError(f"Cannot find: {RAW_FILE}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    # 1) Load
    data, _meta = arff.loadarff(RAW_FILE)
    df = pd.DataFrame(data)
    print(f"Loaded: {df.shape[0]} rows, {df.shape[1]} columns")

    # 2) Clean the label column and map to project classes
    df[LABEL_COL] = df[LABEL_COL].map(to_text).str.strip().str.upper()
    unknown = set(df[LABEL_COL]) - set(LABEL_MAP)
    if unknown:
        print(f"WARNING: dropping unknown labels: {unknown}")
    df = df[df[LABEL_COL].isin(LABEL_MAP)].copy()
    df["label"] = df[LABEL_COL].map(LABEL_MAP)
    df["label_id"] = df["label"].map(LABEL_TO_ID)
    df = df.drop(columns=[LABEL_COL])

    # 3) Clean the features
    feature_cols = [c for c in df.columns if c not in ("label", "label_id")]
    df[feature_cols] = df[feature_cols].apply(pd.to_numeric, errors="coerce")
    df[feature_cols] = df[feature_cols].replace([np.inf, -np.inf], np.nan)

    before = len(df)
    df = df.dropna(subset=feature_cols)
    print(f"Dropped {before - len(df)} rows with missing/infinite values")

    before = len(df)
    df = df.drop_duplicates()
    print(f"Dropped {before - len(df)} duplicate rows")
    print(f"Rows after cleaning: {len(df)}")

    X = df[feature_cols]
    y = df["label_id"]

    # 4) Split 70 / 15 / 15, stratified by class
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.30, stratify=y, random_state=RANDOM_STATE
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.50, stratify=y_temp, random_state=RANDOM_STATE
    )

    # 5) Scale: fit on TRAIN only, then apply to val and test
    scaler = StandardScaler()
    scaler.fit(X_train)

    def build(X_part, y_part):
        scaled = pd.DataFrame(
            scaler.transform(X_part), columns=feature_cols, index=X_part.index
        )
        scaled["label"] = [CLASS_NAMES[i] for i in y_part]
        scaled["label_id"] = y_part.values
        return scaled

    splits = {
        "train": build(X_train, y_train),
        "val": build(X_val, y_val),
        "test": build(X_test, y_test),
    }

    # 6) Save everything
    for name, part in splits.items():
        part.to_csv(OUT_DIR / f"{name}.csv", index=False)
    joblib.dump(scaler, MODEL_DIR / "scaler.pkl")
    with open(OUT_DIR / "feature_columns.json", "w") as f:
        json.dump(feature_cols, f, indent=2)
    with open(OUT_DIR / "label_map.json", "w") as f:
        json.dump({str(i): n for i, n in enumerate(CLASS_NAMES)}, f, indent=2)

    # 7) Summary
    print("\nClass counts per split:")
    summary = pd.DataFrame(
        {name: part["label"].value_counts() for name, part in splits.items()}
    ).fillna(0).astype(int)
    print(summary)
    print("\nSaved in data/processed/: train.csv, val.csv, test.csv,")
    print("  feature_columns.json, label_map.json")
    print("Saved in models/: scaler.pkl")


if __name__ == "__main__":
    main()
