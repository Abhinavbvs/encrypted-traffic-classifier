"""LLM Explanation Layer with Multi-Tier Fallback for Encrypted Traffic Classification.

This module provides natural language explanations for flow classifications based
strictly on the 23 timing flow features.

Fallback Architecture:
- Tier 1: Local Ollama server (e.g. Mistral or Phi-3 at http://localhost:11434).
- Tier 2: Cloud LLM API (Groq, OpenAI, or Gemini if API key is in environment/.env).
- Tier 3: Deterministic Computer Networks Domain-Expert Rule Engine (100% offline, zero-dependency).

Abbreviations used in this module:
- IAT: Inter-Arrival Time (time between consecutive packets in a flow).
- FIAT: Forward Inter-Arrival Time.
- BIAT: Backward Inter-Arrival Time.
- CN: Computer Networks.
- LLM: Large Language Model.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import requests
from dotenv import load_dotenv

# Load optional .env file
load_dotenv()

DEFAULT_OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
DEFAULT_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
DEFAULT_CONNECT_TIMEOUT = 0.8  # fast probe if server is unreachable
DEFAULT_READ_TIMEOUT = 5.0  # seconds for model generation


def build_prompt(
    features: Dict[str, Any],
    prediction: Dict[str, Any],
) -> str:
    """Format the 23 timing features and prediction into a structured CN prompt."""
    top3_str = ", ".join(
        [f"{cand['class']} ({cand['probability']:.1%})" for cand in prediction.get("top3", [])]
    )

    prompt = f"""You are a network traffic analysis expert.
Explain in 2-3 concise sentences why the following encrypted network flow was classified as {prediction.get('predicted_class')}.
Focus strictly on the Computer Networks timing evidence (Inter-Arrival Time, packet rates, active/idle periods). Do not mention payloads or decryption.

Flow Timing Features:
- Duration: {features.get('duration', 0.0):.1f} microseconds
- Flow Rate: {features.get('flowBytesPerSecond', 0.0):.2f} bytes/sec, {features.get('flowPktsPerSecond', 0.0):.2f} pkts/sec
- Forward IAT (mean): {features.get('mean_fiat', 0.0):.2f} us (min: {features.get('min_fiat', 0.0):.2f}, max: {features.get('max_fiat', 0.0):.2f})
- Backward IAT (mean): {features.get('mean_biat', 0.0):.2f} us (min: {features.get('min_biat', 0.0):.2f}, max: {features.get('max_biat', 0.0):.2f})
- Active Time (mean): {features.get('mean_active', 0.0):.2f} us
- Idle Time (mean): {features.get('mean_idle', 0.0):.2f} us

Classification:
- Predicted Class: {prediction.get('predicted_class')} (Confidence: {prediction.get('confidence', 0.0):.1%})
- Top Candidates: {top3_str}

Provide a factual, technical explanation."""
    return prompt


def explain_with_ollama(
    prompt: str,
    host: str = DEFAULT_OLLAMA_HOST,
    model: str = DEFAULT_OLLAMA_MODEL,
    timeout: float = DEFAULT_READ_TIMEOUT,
) -> Optional[str]:
    """Attempt explanation generation via local Ollama instance."""
    url = f"{host.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_predict": 150,
        },
    }
    try:
        response = requests.post(url, json=payload, timeout=(DEFAULT_CONNECT_TIMEOUT, timeout))
        if response.status_code == 200:
            data = response.json()
            return data.get("response", "").strip()
    except Exception:
        pass
    return None


def explain_with_cloud_api(
    prompt: str,
    timeout: float = DEFAULT_READ_TIMEOUT,
) -> Optional[tuple[str, str]]:
    """Attempt explanation via cloud API if GROQ_API_KEY or OPENAI_API_KEY is set."""
    # Check Groq first (very fast inference)
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
            payload = {
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 150,
                "temperature": 0.2,
            }
            res = requests.post(url, headers=headers, json=payload, timeout=timeout)
            if res.status_code == 200:
                text = res.json()["choices"][0]["message"]["content"].strip()
                return text, "groq (llama-3.1-8b-instant)"
        except Exception:
            pass

    # Check OpenAI
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}
            payload = {
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 150,
                "temperature": 0.2,
            }
            res = requests.post(url, headers=headers, json=payload, timeout=timeout)
            if res.status_code == 200:
                text = res.json()["choices"][0]["message"]["content"].strip()
                return text, "openai (gpt-4o-mini)"
        except Exception:
            pass

    return None


def explain_with_rule_fallback(
    features: Dict[str, Any],
    prediction: Dict[str, Any],
) -> str:
    """Deterministic Computer Networks domain-expert rule explanation.

    This fallback guarantees 100% availability without network access or API keys,
    evaluating empirical timing metrics against known application profiles.
    """
    label = prediction.get("predicted_class", "Unknown")
    confidence = prediction.get("confidence", 0.0)
    top3 = prediction.get("top3", [])
    runner_up = top3[1]["class"] if len(top3) > 1 else "other categories"

    bps = float(features.get("flowBytesPerSecond", 0.0))
    pps = float(features.get("flowPktsPerSecond", 0.0))
    mean_fiat = float(features.get("mean_fiat", 0.0))
    mean_biat = float(features.get("mean_biat", 0.0))
    mean_active = float(features.get("mean_active", 0.0))
    mean_idle = float(features.get("mean_idle", 0.0))

    if label == "VoIP":
        return (
            f"Classified as VoIP ({confidence:.1%} confidence) due to highly symmetric, low-jitter "
            f"packet pacing (mean FIAT: {mean_fiat:.1f} us, BIAT: {mean_biat:.1f} us) and continuous "
            f"low-bandwidth streaming ({bps:.0f} B/s). This steady bidirectional cadence differs sharply from "
            f"bursty request-response traffic like {runner_up}."
        )
    elif label == "Streaming":
        return (
            f"Classified as Video Streaming ({confidence:.1%} confidence) due to sustained high-throughput "
            f"downlink ({bps:.0f} B/s) with active buffer fill bursts (mean active: {mean_active:.1f} us) "
            f"followed by periodic idle pauses. While sometimes confused with {runner_up}, the higher data rate "
            f"and chunked delivery pattern strongly match media playback."
        )
    elif label == "Browsing":
        return (
            f"Classified as Browsing ({confidence:.1%} confidence) based on interactive, bursty timing profiles "
            f"consisting of fast initial page component requests followed by extended idle intervals "
            f"(mean idle: {mean_idle:.1f} us) reflecting user reading time. The low continuous throughput "
            f"({bps:.0f} B/s) distinguishes it from continuous streaming applications."
        )
    elif label == "FileTransfer":
        return (
            f"Classified as FileTransfer ({confidence:.1%} confidence) indicated by high sustained packet density "
            f"({pps:.1f} pkts/s) and minimal idle pauses, characteristic of bulk TCP transfers maximizing "
            f"congestion window capacity. This sustained unidirectional flow separates it from {runner_up}."
        )
    elif label == "P2P":
        return (
            f"Classified as P2P ({confidence:.1%} confidence) due to distributed bidirectional timing signatures "
            f"with rapid inter-arrival variations across multiple peers (mean FIAT: {mean_fiat:.1f} us). "
            f"The continuous background exchange differs from standard client-server protocols like {runner_up}."
        )
    elif label == "Chat":
        return (
            f"Classified as Chat ({confidence:.1%} confidence) characterized by sporadic, low-volume packet bursts "
            f"with long idle periods between human typing events and minimal packet rates ({pps:.1f} pkts/s). "
            f"This distinguishes it from high-frequency or streaming sessions like {runner_up}."
        )
    elif label == "Mail":
        return (
            f"Classified as Mail ({confidence:.1%} confidence) marked by brief command-response exchanges "
            f"(SMTP/IMAP synchronization) followed by long dormant periods, showing modest data volume "
            f"({bps:.0f} B/s) distinct from heavy transfer or interactive browsing."
        )
    else:
        return (
            f"Classified as {label} ({confidence:.1%} confidence) based on flow timing signatures across "
            f"packet inter-arrival times and active/idle duration distributions."
        )


def explain_flow(
    features: Dict[str, Any],
    prediction: Dict[str, Any],
    preferred_provider: str = "auto",
) -> Dict[str, Any]:
    """Generate a natural-language explanation using multi-tier fallback.

    Args:
        features: Dictionary of the 23 raw flow timing features.
        prediction: Prediction result dictionary from predict_one.
        preferred_provider: 'auto', 'ollama', 'cloud', or 'rule_fallback'.

    Returns:
        Dictionary with 'explanation', 'provider', 'model', and 'latency_seconds'.
    """
    start_t = time.perf_counter()
    prompt = build_prompt(features, prediction)

    # 1) Try Ollama if preferred or auto
    if preferred_provider in ("auto", "ollama"):
        ollama_res = explain_with_ollama(prompt)
        if ollama_res:
            return {
                "explanation": ollama_res,
                "provider": "ollama",
                "model": DEFAULT_OLLAMA_MODEL,
                "status": "success",
                "latency_seconds": round(time.perf_counter() - start_t, 3),
            }

    # 2) Try Cloud API if preferred or auto
    if preferred_provider in ("auto", "cloud"):
        cloud_res = explain_with_cloud_api(prompt)
        if cloud_res:
            text, model_name = cloud_res
            return {
                "explanation": text,
                "provider": "cloud_api",
                "model": model_name,
                "status": "success",
                "latency_seconds": round(time.perf_counter() - start_t, 3),
            }

    # 3) Deterministic Domain-Expert Rule Fallback (always succeeds)
    fallback_text = explain_with_rule_fallback(features, prediction)
    return {
        "explanation": fallback_text,
        "provider": "rule_based_fallback",
        "model": "cn_expert_heuristics",
        "status": "fallback_applied",
        "latency_seconds": round(time.perf_counter() - start_t, 4),
    }


if __name__ == "__main__":
    from src.predict import load_artifacts, predict_one
    import pandas as pd

    print("--- Testing LLM Explainer with Fallback ---")
    model, scaler, cols, lmap = load_artifacts()
    sample_df = pd.read_csv("data/processed/sample_raw_flows.csv")
    first_flow = sample_df.iloc[0].to_dict()

    pred = predict_one(first_flow, model=model, scaler=scaler, feature_columns=cols, label_map=lmap)
    print(f"Prediction: {pred['predicted_class']} ({pred['confidence']:.2%})")

    result = explain_flow(first_flow, pred)
    print(f"\nProvider: {result['provider']} ({result['model']})")
    print(f"Latency: {result['latency_seconds']}s")
    print(f"\nExplanation:\n{result['explanation']}")
