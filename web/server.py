"""MetaFlow local server: the landing site plus a live API over the repository's real model.

Run from the repository root:
    python web/server.py            # http://127.0.0.1:8600
    python web/server.py --port 9000

Routes
    GET  /api/health                         model status, classes, bundled sample captures
    GET  /api/metrics                        reports/metrics.json + reports/cv_results.csv
    GET  /api/classify?sample=<name>.pcap    classify a capture from data/sample_pcaps
    POST /api/classify                       classify an uploaded capture (raw body, X-Filename header)
    GET  /api/batch                          classify data/processed/sample_raw_flows.csv
    All of them accept ?threshold=0.0-0.99 (default 0.5).
    GET  /reports/...  /data/sample_pcaps/...  repository files, read-only
    GET  /...                                the site in web/

Only the standard library is used for HTTP; inference goes through src.predict and
src.llm_explainer exactly as the CLI and the Streamlit app do.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import mimetypes
import os
import sys
import tempfile
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

WEB_DIR = Path(__file__).resolve().parent
REPO_DIR = WEB_DIR.parent
sys.path.insert(0, str(REPO_DIR))
os.chdir(REPO_DIR)  # src.* modules resolve models/ and data/ relative to the repo root

from src.llm_explainer import explain_flow  # noqa: E402
from src.predict import load_artifacts, predict_flows, predict_pcap  # noqa: E402

SAMPLES_DIR = REPO_DIR / "data" / "sample_pcaps"
REPORTS_DIR = REPO_DIR / "reports"
BATCH_CSV = REPO_DIR / "data" / "processed" / "sample_raw_flows.csv"
MAX_UPLOAD = 50 * 1024 * 1024
EXPLAINER = os.getenv("METAFLOW_EXPLAINER", "auto")  # auto | ollama | cloud | rule_fallback

mimetypes.add_type("text/plain; charset=utf-8", ".md")
mimetypes.add_type("text/csv; charset=utf-8", ".csv")
mimetypes.add_type("application/vnd.tcpdump.pcap", ".pcap")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("video/mp4", ".mp4")

print("Loading model artefacts...", flush=True)
MODEL, SCALER, FEATURES, LABELS = load_artifacts()
INFER_LOCK = threading.Lock()  # LightGBM and scapy are not guaranteed thread-safe
print("Model ready: %s, %d features, %d classes" % (type(MODEL).__name__, len(FEATURES), len(LABELS)), flush=True)


def _num(v):
    """JSON-safe number."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    if math.isnan(f) or math.isinf(f):
        return None
    return int(f) if f.is_integer() and abs(f) < 2**53 else round(f, 6)


def _threshold(qs) -> float:
    try:
        t = float(qs.get("threshold", ["0.5"])[0])
    except ValueError:
        t = 0.5
    return min(max(t, 0.0), 0.99)


def _prob_map(row) -> dict:
    return {k[5:]: round(float(row[k]), 6) for k in row.index if k.startswith("prob_")}


def _flow_payload(i, row, feats, meta_cols) -> dict:
    top3 = [{"class": row["top%d_class" % k], "probability": round(float(row["top%d_prob" % k]), 6)}
            for k in (1, 2, 3) if row.get("top%d_class" % k) is not None]
    pred = {
        "predicted_class": row["top1_class"],
        "confidence": float(row["confidence"]),
        "top3": top3,
    }
    exp = explain_flow(feats, pred, preferred_provider=EXPLAINER)
    out = {
        "id": i,
        "predicted_class": row["predicted_class"],
        "top_class": row["top1_class"],
        "confidence": round(float(row["confidence"]), 6),
        "is_uncertain": bool(row["is_uncertain"]),
        "status": row["status"],
        "top3": top3,
        "probabilities": _prob_map(row),
        "explanation": exp.get("explanation"),
        "explainer": exp.get("provider"),
        "features": {k: _num(v) for k, v in feats.items()},
    }
    for c in meta_cols:
        out[c] = _num(row[c])
    return out


def classify_pcap(path: Path, threshold: float, name: str) -> dict:
    t0 = time.perf_counter()
    with INFER_LOCK:
        combined, features_df, latency = predict_pcap(path, MODEL, SCALER, FEATURES, LABELS, threshold)
    if len(combined) == 0:
        return {"file": name, "threshold": threshold, "flows": [], "latency_ms": 0, "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
                "message": "No IP flows found in this capture."}
    pred_cols = {"predicted_class", "confidence", "is_uncertain", "status"} | {c for c in combined.columns if c.startswith(("top", "prob_"))}
    meta_cols = [c for c in combined.columns if c not in pred_cols and c not in FEATURES]
    flows = [_flow_payload(i, combined.iloc[i], features_df.iloc[i].to_dict(), meta_cols) for i in range(len(combined))]
    return {
        "file": name,
        "threshold": threshold,
        "flows": flows,
        "latency_ms": round(latency, 3),
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
        "model": type(MODEL).__name__,
    }


def classify_batch(threshold: float) -> dict:
    import pandas as pd

    df = pd.read_csv(BATCH_CSV)
    with INFER_LOCK:
        res, latency = predict_flows(df[FEATURES], MODEL, SCALER, FEATURES, LABELS, threshold)
    rows = []
    for i in range(len(res)):
        r = res.iloc[i]
        rows.append({
            "id": i,
            "predicted_class": r["predicted_class"],
            "top_class": r["top1_class"],
            "confidence": round(float(r["confidence"]), 6),
            "is_uncertain": bool(r["is_uncertain"]),
            "top3": [{"class": r["top%d_class" % k], "probability": round(float(r["top%d_prob" % k]), 6)} for k in (1, 2, 3)],
            "duration": _num(df.iloc[i]["duration"]),
            "flowBytesPerSecond": _num(df.iloc[i]["flowBytesPerSecond"]),
            "flowPktsPerSecond": _num(df.iloc[i]["flowPktsPerSecond"]),
        })
    counts = res["predicted_class"].value_counts().to_dict()
    return {"file": "data/processed/sample_raw_flows.csv", "threshold": threshold, "rows": rows,
            "counts": {k: int(v) for k, v in counts.items()}, "latency_ms": round(latency, 4)}


def metrics() -> dict:
    out = json.loads((REPORTS_DIR / "metrics.json").read_text(encoding="utf-8"))
    cv = REPORTS_DIR / "cv_results.csv"
    if cv.exists():
        with open(cv, newline="", encoding="utf-8") as f:
            out["cv_results"] = [{k: _num(v) if k != "model" else v for k, v in r.items()} for r in csv.DictReader(f)]
    return out


def health() -> dict:
    return {
        "status": "live",
        "model": type(MODEL).__name__,
        "features": FEATURES,
        "classes": [LABELS[k] for k in sorted(LABELS)],
        "explainer": EXPLAINER,
        "samples": [{"name": p.name, "bytes": p.stat().st_size} for p in sorted(SAMPLES_DIR.glob("*.pcap*"))],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "MetaFlow/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    # ---- helpers
    def _json(self, obj, status=HTTPStatus.OK):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _err(self, status, msg):
        self._json({"error": msg}, status)

    def _file(self, root: Path, rel: str):
        root = root.resolve()
        target = (root / rel).resolve()
        if root != target and root not in target.parents:
            return self._err(HTTPStatus.FORBIDDEN, "Path outside served folder.")
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            nf = WEB_DIR / "404.html"
            if nf.is_file() and root == WEB_DIR.resolve():
                data = nf.read_bytes()
                self.send_response(HTTPStatus.NOT_FOUND)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return self.wfile.write(data)
            return self._err(HTTPStatus.NOT_FOUND, "Not found: " + rel)
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") and "charset" not in ctype or ctype in ("application/javascript", "text/javascript"):
            ctype += "; charset=utf-8"
        size = target.stat().st_size
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):  # lets <video> seek
            a, _, b = rng[6:].partition("-")
            start = int(a) if a else max(0, size - int(b))
            end = int(b) if a and b else size - 1
            end = min(end, size - 1)
            if start > end:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", "bytes */%d" % size)
                return self.end_headers()
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            with open(target, "rb") as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        with open(target, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)

    # ---- routing
    def do_GET(self):
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        path = unquote(u.path)
        try:
            if path == "/api/health":
                return self._json(health())
            if path == "/api/metrics":
                return self._json(metrics())
            if path == "/api/batch":
                return self._json(classify_batch(_threshold(qs)))
            if path == "/api/classify":
                name = Path(qs.get("sample", [""])[0]).name
                p = SAMPLES_DIR / name
                if not name or not p.is_file():
                    return self._err(HTTPStatus.BAD_REQUEST, "Unknown sample. Use one of: " + ", ".join(s.name for s in SAMPLES_DIR.glob("*.pcap*")))
                return self._json(classify_pcap(p, _threshold(qs), name))
            if path.startswith("/api/"):
                return self._err(HTTPStatus.NOT_FOUND, "Unknown endpoint.")
            if path.startswith("/reports/"):
                return self._file(REPORTS_DIR, path[len("/reports/"):])
            if path.startswith("/data/sample_pcaps/"):
                return self._file(SAMPLES_DIR, path[len("/data/sample_pcaps/"):])
            return self._file(WEB_DIR, path.lstrip("/") or "index.html")
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # report, don't crash the server
            self._err(HTTPStatus.INTERNAL_SERVER_ERROR, "%s: %s" % (type(e).__name__, e))

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/api/classify":
            return self._err(HTTPStatus.NOT_FOUND, "Unknown endpoint.")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return self._err(HTTPStatus.BAD_REQUEST, "Send the capture file as the request body.")
        if length > MAX_UPLOAD:
            return self._err(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Captures up to 50 MB are accepted.")
        name = Path(unquote(self.headers.get("X-Filename") or "upload.pcap")).name
        if not name.lower().endswith((".pcap", ".pcapng", ".cap")):
            return self._err(HTTPStatus.BAD_REQUEST, "Only .pcap, .pcapng or .cap files are accepted.")
        data = self.rfile.read(length)
        fd, tmp = tempfile.mkstemp(suffix=Path(name).suffix)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            res = classify_pcap(Path(tmp), _threshold(parse_qs(u.query)), name)
            self._json(res)
        except Exception as e:
            self._err(HTTPStatus.UNPROCESSABLE_ENTITY, "Could not read this capture (%s: %s)." % (type(e).__name__, e))
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass


def main():
    ap = argparse.ArgumentParser(description="Serve the MetaFlow site with a live classification API.")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8600)
    a = ap.parse_args()
    httpd = ThreadingHTTPServer((a.host, a.port), Handler)
    print("MetaFlow running at http://%s:%d  (Ctrl+C to stop)" % (a.host, a.port), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
