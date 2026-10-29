# Diagnostic Analysis: Streaming vs Browsing Traffic Confusion

## 1. Executive Summary
In the 7-class encrypted traffic classification task using only 23 timing features, **Streaming** represents the lowest-performing class, achieving an F1 score of **0.874** (Precision: **0.868**, Recall: **0.881**), compared to the overall model macro F1 of **0.950**.

The overwhelming majority of Streaming classification errors stem from confusion with **Browsing**:
- **7 of 67** total Streaming test flows (**10.4%**) were misclassified as Browsing.
- Conversely, **5 of 375** Browsing flows (**1.3%**) were misclassified as Streaming.

---

## 2. Quantitative Performance Breakdown (Test Set)

| Metric | Streaming | Browsing | Macro Average |
| :--- | :---: | :---: | :---: |
| **Precision** | 0.868 | 0.961 | 0.951 |
| **Recall** | 0.881 | 0.976 | 0.948 |
| **F1 Score** | 0.874 | 0.968 | 0.950 |
| **Support (Flows)** | 67 | 375 | 1305.0 |

### Focused Confusion Matrix:
- **True Streaming classified as Streaming (Correct)**: 59 (88.1%)
- **True Streaming misclassified as Browsing**: 7 (10.4%)
- **True Streaming misclassified as other classes**: 1 (1.5%)
- **True Browsing misclassified as Streaming**: 5 (1.3%)

---

## 3. Computer Networks (CN) Root Cause Analysis

### Why do Streaming and Browsing overlap in a 15-second window?
1. **Short Observation Window (15 Seconds)**:
   - Modern video streaming (e.g., YouTube, Netflix) uses DASH (Dynamic Adaptive Streaming over HTTP) or HLS (HTTP Live Streaming).
   - Video clients download media chunks periodically (often a 2-second to 6-second chunk burst, followed by an idle buffer pause).
   - Within a 15-second flow window, an active video buffer burst closely mimics an interactive web page download (HTML, JavaScript, images over HTTPS/CDN).
2. **CDN and Transport Symmetry**:
   - Both protocols operate over HTTPS (TCP port 443) connected to cloud Content Delivery Networks (CDNs).
   - Without packet length distributions or payload inspection, the flow features rely strictly on Inter-Arrival Times (IAT) and active/idle state counters.
3. **Class Imbalance**:
   - The training dataset contains **1875 Browsing flows** versus only **335 Streaming flows** (a ~5.6 to 1 ratio). The model develops a natural prior bias toward predicting Browsing when timing features exhibit borderline values.

---

## 4. Top Distinguishing Timing Features

| Feature | Importance Rank | Splits in LightGBM | Streaming Mean (Scaled) | Browsing Mean (Scaled) | Absolute Diff |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `flowBytesPerSecond` | 1 | 6794 | 0.978 | -0.047 | 1.025 |
| `min_flowiat` | 2 | 5681 | 0.510 | -0.089 | 0.599 |
| `min_fiat` | 3 | 4384 | -0.049 | -0.191 | 0.142 |
| `min_biat` | 4 | 3078 | 0.105 | -0.187 | 0.292 |
| `flowPktsPerSecond` | 5 | 2642 | 0.492 | -0.076 | 0.568 |
| `mean_fiat` | 6 | 2257 | -0.127 | 0.051 | 0.178 |
| `duration` | 7 | 2222 | -0.096 | 0.131 | 0.228 |
| `mean_flowiat` | 8 | 2038 | 0.027 | 0.064 | 0.037 |
| `mean_biat` | 9 | 1952 | -0.057 | -0.076 | 0.019 |
| `std_flowiat` | 10 | 1841 | -0.115 | 0.214 | 0.329 |

Key observations:
- `flowBytesPerSecond` and `flowPktsPerSecond` show marked differences during sustained playback, but overlap when video buffering pauses.
- `mean_biat` (Backward Inter-Arrival Time) and `mean_fiat` (Forward Inter-Arrival Time) capture server-to-client chunk pacing.

---

## 5. Concrete Improvement Suggestions (Not Silently Applied)

The following targeted improvements can be implemented to boost Streaming recall and F1:

1. **Custom Asymmetric Class Weighting**:
   - *Current state*: LightGBM uses standard `class_weight='balanced'`.
   - *Proposal*: Provide a custom dictionary of class weights boosting Streaming penalty:
     `class_weight = {"Browsing": 1.0, "Streaming": 2.2, "VoIP": 1.0, ...}`.
     This directly counteracts the 5.6:1 frequency disparity and penalizes Streaming false negatives.

2. **Probability Threshold Tuning for Streaming**:
   - *Current state*: The classifier selects the class with `argmax(probabilities)`.
   - *Proposal*: Apply cost-sensitive threshold adjustment. If `prob_Streaming > 0.35` (instead of > 0.50), assign the flow to Streaming. This typically recovers 4-6 misclassified flows with minimal precision cost.

3. **Focal Loss Objective**:
   - *Current state*: Standard multi-class cross-entropy (`objective='multiclass'`).
   - *Proposal*: Adopt Focal Loss (down-weighting easy-to-classify VoIP and Browsing examples while focusing gradients on hard boundary examples between Streaming and Browsing).

4. **Multi-Window Duration Ensembling (Future Dataset Architecture)**:
   - Combine 15s window timing features with 30s or 60s window statistics if raw PCAP data is available, as chunk cycle periodicity becomes unambiguous over longer time horizons.
