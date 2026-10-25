# Encrypted Traffic Classifier

Classifies encrypted network traffic into 7 types (Browsing, Streaming, VoIP, FileTransfer, P2P, Chat, Mail) using only flow timing features. No packet payload is ever read.

## Dataset
ISCX VPN-NonVPN (ISCXVPN2016), Scenario A2, file TimeBasedFeatures-Dataset-15s-NO-VPN.arff.

The raw files are not in this repo. Download them from https://unb.ca/cic/datasets/vpn.html and extract so the file ends up at:
data/raw/Scenario A2-ARFF/Scenario A2-ARFF/TimeBasedFeatures-Dataset-15s-NO-VPN.arff

You only need the raw data if you want to rebuild the processed CSVs. The ready-made ones are already in data/processed/.

## Setup
    pip install -r requirements.txt

## Run
    python src/prepare_data.py     (only to rebuild the CSVs)
    python src/train.py            (trains 3 models, prints results, saves charts)

## Results (test set, LightGBM)
Accuracy 96.9%, macro F1 0.95, about 3 ms per flow. Weakest class: Streaming (F1 0.874), mostly confused with Browsing.

## Folders
- data/processed: train/val/test CSVs, feature list, label map
- models: scaler.pkl and best_model.pkl
- reports: metrics, classification report, charts (reports/plots)
- src: prepare_data.py and train.py
