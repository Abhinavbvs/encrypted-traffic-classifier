"""MetaFlow local server: the landing site plus a live API over the repository's real model.

Run from the repository root:
    python web/server.py            # http://127.0.0.1:8600
    python web/server.py --port 9000

Routes
    GET  /api/health                         model status, classes, bundled sample captures
    GET  /api/studio-status                  status of the embedded Streamlit Studio sidecar
    GET  /api/metrics                        reports/metrics.json + reports/cv_results.csv
    GET  /api/classify?sample=<name>.pcap    classify a capture from data/sample_pcaps
    POST /api/classify                       classify an uploaded capture (raw body, X-Filename header)
    GET  /api/batch                          classify data/processed/sample_raw_flows.csv
    GET  /api/interfaces                     list local network interfaces for live sniffing
    GET  /api/sniff                          capture & classify live packets from an interface
    POST/GET /api/simulate                   real-time 23-feature parameter simulation
    All of them accept ?threshold=0.0-0.99 (default 0.5).
    GET  /studio/  (HTTP + WebSocket)        embedded Streamlit Studio reverse proxy (same port)
    GET  /reports/...  /data/sample_pcaps/...  repository files, read-only
    GET  /...                                the site in web/

Only the standard library is used for HTTP & WebSocket proxying; inference goes through
src.predict and src.llm_explainer exactly as the CLI and the Streamlit app do.
"""
from __future__ import annotations

import argparse
import atexit
import csv
import http.client
import json
import math
import mimetypes
import os
import select
import socket
import subprocess
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
from src.predict import load_artifacts, predict_flows, predict_pcap, predict_one  # noqa: E402
from src.live_sniffer import sniff_and_classify, list_interfaces  # noqa: E402

SAMPLES_DIR = REPO_DIR / "data" / "sample_pcaps"
REPORTS_DIR = REPO_DIR / "reports"
BATCH_CSV = REPO_DIR / "data" / "processed" / "sample_raw_flows.csv"
MAX_UPLOAD = 50 * 1024 * 1024
EXPLAINER = os.getenv("METAFLOW_EXPLAINER", "auto")  # auto | ollama | cloud | rule_fallback

STUDIO_PREFIX = "/studio"
STUDIO_MODE = os.getenv("METAFLOW_STUDIO_MODE", "eager").strip().lower()  # eager | lazy | off
_STUDIO_LOCK = threading.Lock()
_STUDIO_PROC: subprocess.Popen | None = None
_STUDIO_PORT: int = int(os.getenv("METAFLOW_STUDIO_PORT", "8501"))
_HOP_BY_HOP = frozenset({
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
})

_STUDIO_SPLASH_HTML = b"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="2">
  <title>Starting MetaFlow Streamlit Studio...</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0b0e;color:#f4f4f6;font:15px/1.5 system-ui,-apple-system,sans-serif}
    .card{max-width:440px;padding:28px 30px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);text-align:center}
    .spin{width:34px;height:34px;margin:0 auto 16px;border-radius:50%;border:3px solid rgba(255,255,255,.14);border-top-color:#ff2d95;animation:sp .8s linear infinite}
    @keyframes sp{to{transform:rotate(360deg)}}
    h1{margin:0 0 8px;font-size:19px}
    p{margin:0;color:rgba(244,244,246,.68);font-size:14px}
    a{color:#ff5cb0;text-decoration:none}
  </style>
</head>
<body>
  <div class="card">
    <div class="spin"></div>
    <h1>Starting Streamlit Studio...</h1>
    <p>Preparing the interactive 23-feature dashboard inside MetaFlow. This page refreshes automatically.</p>
    <p style="margin-top:14px"><a href="/">&larr; Back to MetaFlow</a></p>
  </div>
  <script>
    (function poll(){
      fetch('/api/studio-status', {cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
        if(d && d.running){ location.reload(); } else { setTimeout(poll, 700); }
      }).catch(function(){ setTimeout(poll, 1000); });
    })();
  </script>
</body>
</html>"""

mimetypes.add_type("text/plain; charset=utf-8", ".md")
mimetypes.add_type("text/csv; charset=utf-8", ".csv")
mimetypes.add_type("application/vnd.tcpdump.pcap", ".pcap")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("video/mp4", ".mp4")

print("Loading model artefacts...", flush=True)
MODEL, SCALER, FEATURES, LABELS = load_artifacts()
INFER_LOCK = threading.Lock()  # LightGBM and scapy are not guaranteed thread-safe
print("Model ready: %s, %d features, %d classes" % (type(MODEL).__name__, len(FEATURES), len(LABELS)), flush=True)


def _probe_studio(port: int, timeout: float = 0.4) -> bool:
    """Return True if an upstream Streamlit server mounted at /studio responds healthy."""
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
        conn.request("GET", "%s/_stcore/health" % STUDIO_PREFIX)
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        return resp.status == 200 and body.strip() == b"ok"
    except Exception:
        return False


def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _resolve_studio_port(preferred: int) -> int:
    """Reuse a compatible /studio instance or bind an unused local port."""
    if _probe_studio(preferred) or not _port_in_use(preferred):
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def ensure_studio() -> bool:
    """Ensure the internal Streamlit Studio sidecar process is started."""
    global _STUDIO_PROC, _STUDIO_PORT
    if STUDIO_MODE == "off":
        return False
    if _probe_studio(_STUDIO_PORT):
        return True
    with _STUDIO_LOCK:
        if _probe_studio(_STUDIO_PORT):
            return True
        if _STUDIO_PROC is not None and _STUDIO_PROC.poll() is None:
            return True
        _STUDIO_PORT = _resolve_studio_port(_STUDIO_PORT)
        if _probe_studio(_STUDIO_PORT):
            return True
        cmd = [
            sys.executable, "-m", "streamlit", "run", str(REPO_DIR / "app.py"),
            "--server.port", str(_STUDIO_PORT),
            "--server.address", "127.0.0.1",
            "--server.baseUrlPath", STUDIO_PREFIX,
            "--server.headless", "true",
            "--server.enableCORS", "false",
            "--server.enableXsrfProtection", "false",
            "--browser.gatherUsageStats", "false",
        ]
        _STUDIO_PROC = subprocess.Popen(cmd, cwd=str(REPO_DIR))
        print("Streamlit Studio sidecar starting on http://127.0.0.1:%d%s/ (proxied at %s/)"
              % (_STUDIO_PORT, STUDIO_PREFIX, STUDIO_PREFIX), flush=True)
        return True


def wait_for_studio(timeout: float = 15.0) -> bool:
    """Launch Streamlit Studio if needed and wait briefly until its health endpoint is ready."""
    if not ensure_studio():
        return False
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _probe_studio(_STUDIO_PORT, timeout=0.35):
            return True
        time.sleep(0.2)
    return False


def stop_studio():
    """Terminate the managed Streamlit sidecar cleanly on server shutdown."""
    global _STUDIO_PROC
    with _STUDIO_LOCK:
        proc = _STUDIO_PROC
        _STUDIO_PROC = None
    if proc is not None and proc.poll() is None:
        try:
            proc.terminate()
            proc.wait(timeout=4)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


def studio_status() -> dict:
    return {
        "enabled": STUDIO_MODE != "off",
        "mode": STUDIO_MODE,
        "url": STUDIO_PREFIX + "/",
        "running": _probe_studio(_STUDIO_PORT, timeout=0.3),
    }


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


DEFAULT_FLOW_FEATURES = {
    "duration": 9096924.0,
    "total_fiat": 4402841.0,
    "total_biat": 9070173.0,
    "min_fiat": 56.0,
    "min_biat": 14.0,
    "max_fiat": 91307.0,
    "max_biat": 78628.0,
    "mean_fiat": 18739.0,
    "mean_biat": 17361.0,
    "flowPktsPerSecond": 59.67,
    "flowBytesPerSecond": 10417.9,
    "min_flowiat": 19.5,
    "max_flowiat": 115094.0,
    "mean_flowiat": 28189.0,
    "std_flowiat": 26581.0,
    "min_active": 0.0,
    "mean_active": 0.0,
    "max_active": 0.0,
    "std_active": 0.0,
    "min_idle": 0.0,
    "mean_idle": 0.0,
    "max_idle": 0.0,
    "std_idle": 0.0,
}


def simulate_flow(user_params: dict, threshold: float = 0.5) -> dict:
    """Run real-time single flow simulation with partial or full timing features."""
    t0 = time.perf_counter()
    flow = DEFAULT_FLOW_FEATURES.copy()
    if user_params:
        for k in FEATURES:
            if k in user_params:
                try:
                    flow[k] = float(user_params[k])
                except (TypeError, ValueError):
                    pass
    with INFER_LOCK:
        res = predict_one(flow, MODEL, SCALER, FEATURES, LABELS, threshold)

    pred_payload = {
        "predicted_class": res["top3"][0]["class"],
        "confidence": res["confidence"],
        "top3": res["top3"],
    }
    exp = explain_flow(flow, pred_payload, preferred_provider=EXPLAINER)
    elapsed = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "predicted_class": res["predicted_class"],
        "top_class": res["top3"][0]["class"],
        "confidence": round(float(res["confidence"]), 6),
        "is_uncertain": bool(res["is_uncertain"]),
        "status": res["status"],
        "top3": res["top3"],
        "probabilities": {k: round(float(v), 6) for k, v in res["probabilities"].items()},
        "explanation": exp.get("explanation"),
        "explainer": exp.get("provider"),
        "latency_ms": round(float(res.get("latency_ms", elapsed)), 4),
        "elapsed_ms": elapsed,
        "features": {k: _num(flow[k]) for k in FEATURES},
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
            "features": {k: _num(df.iloc[i][k]) for k in FEATURES},
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
        "studio": studio_status(),
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

    def _tunnel_studio_ws(self):
        """Bidirectionally relay WebSocket frames between browser and internal Streamlit."""
        if not wait_for_studio(timeout=15.0):
            return self._err(HTTPStatus.SERVICE_UNAVAILABLE, "Streamlit Studio did not become ready in time.")
        upstream = None
        try:
            upstream = socket.create_connection(("127.0.0.1", _STUDIO_PORT), timeout=10)
            lines = ["%s %s HTTP/1.1" % (self.command, self.path)]
            for k, v in self.headers.items():
                kl = k.lower()
                if kl == "host":
                    continue
                if kl == "origin":
                    lines.append("Origin: http://127.0.0.1:%d" % _STUDIO_PORT)
                else:
                    lines.append("%s: %s" % (k, v))
            lines.append("Host: 127.0.0.1:%d" % _STUDIO_PORT)
            upstream.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))

            upstream.settimeout(None)
            client = self.connection
            client.settimeout(None)
            sockets = [client, upstream]
            while True:
                readable, _, exceptional = select.select(sockets, [], sockets, 300.0)
                if exceptional or not readable:
                    break
                for src in readable:
                    data = src.recv(65536)
                    if not data:
                        return
                    dst = upstream if src is client else client
                    dst.sendall(data)
        except OSError:
            pass
        finally:
            self.close_connection = True
            if upstream is not None:
                try:
                    upstream.close()
                except OSError:
                    pass

    def _proxy_studio(self, u):
        """Forward /studio HTTP/WebSocket traffic to the local Streamlit process."""
        path = unquote(u.path)
        if STUDIO_MODE == "off":
            return self._err(HTTPStatus.NOT_FOUND, "Embedded Streamlit Studio is disabled (METAFLOW_STUDIO_MODE=off).")

        if path == STUDIO_PREFIX:
            target = STUDIO_PREFIX + "/" + (("?" + u.query) if u.query else "")
            self.send_response(HTTPStatus.TEMPORARY_REDIRECT)
            self.send_header("Location", target)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if self.headers.get("Upgrade", "").lower() == "websocket":
            return self._tunnel_studio_ws()

        if not _probe_studio(_STUDIO_PORT, timeout=0.35):
            ensure_studio()
            accept = self.headers.get("Accept", "")
            if self.command == "GET" and "text/html" in accept:
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(_STUDIO_SPLASH_HTML)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(_STUDIO_SPLASH_HTML)
                return
            if not wait_for_studio(timeout=12.0):
                return self._err(HTTPStatus.SERVICE_UNAVAILABLE, "Streamlit Studio is starting; please retry.")

        req_len = int(self.headers.get("Content-Length") or 0)
        req_body = self.rfile.read(req_len) if req_len > 0 else None

        fwd_headers = {}
        for k, v in self.headers.items():
            kl = k.lower()
            if kl in _HOP_BY_HOP or kl == "host":
                continue
            if kl == "origin":
                fwd_headers[k] = "http://127.0.0.1:%d" % _STUDIO_PORT
            else:
                fwd_headers[k] = v
        fwd_headers["Host"] = "127.0.0.1:%d" % _STUDIO_PORT

        conn = http.client.HTTPConnection("127.0.0.1", _STUDIO_PORT, timeout=60)
        try:
            conn.request(self.command, self.path, body=req_body, headers=fwd_headers)
            resp = conn.getresponse()
            body = resp.read()
            self.send_response(resp.status, resp.reason)
            for k, v in resp.getheaders():
                kl = k.lower()
                if kl in _HOP_BY_HOP or kl == "content-length":
                    continue
                if kl == "location":
                    prefix = "http://127.0.0.1:%d" % _STUDIO_PORT
                    if v.startswith(prefix):
                        v = v[len(prefix):] or (STUDIO_PREFIX + "/")
                self.send_header(k, v)
            if self.command == "HEAD":
                cl = resp.getheader("Content-Length")
                if cl is not None:
                    self.send_header("Content-Length", cl)
                self.end_headers()
            else:
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if body:
                    self.wfile.write(body)
        finally:
            conn.close()

    def _maybe_studio(self) -> bool:
        u = urlparse(self.path)
        path = unquote(u.path)
        if path == STUDIO_PREFIX or path.startswith(STUDIO_PREFIX + "/"):
            self._proxy_studio(u)
            return True
        return False

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
        if self._maybe_studio():
            return
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        path = unquote(u.path)
        try:
            if path == "/api/health":
                return self._json(health())
            if path == "/api/studio-status":
                return self._json(studio_status())
            if path == "/api/metrics":
                return self._json(metrics())
            if path == "/api/batch":
                return self._json(classify_batch(_threshold(qs)))
            if path == "/api/simulate":
                params = {k: v[0] for k, v in qs.items()}
                return self._json(simulate_flow(params, _threshold(qs)))
            if path == "/api/interfaces":
                return self._json({"interfaces": list_interfaces()})
            if path == "/api/sniff":
                dur = min(max(float(qs.get("duration", ["5"])[0]), 1.0), 30.0)
                cnt = min(max(int(qs.get("count", ["100"])[0]), 10), 500)
                iface = qs.get("iface", [None])[0]
                with INFER_LOCK:
                    res = sniff_and_classify(iface=iface, duration=dur, count=cnt, confidence_threshold=_threshold(qs),
                                             model_artifacts=(MODEL, SCALER, FEATURES, LABELS))
                return self._json(res)
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
        if self._maybe_studio():
            return
        u = urlparse(self.path)
        if u.path == "/api/simulate":
            try:
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
            except Exception:
                body = {}
            features = body.get("features", body) if isinstance(body, dict) else {}
            thresh = float(body.get("threshold", 0.5)) if isinstance(body, dict) and "threshold" in body else _threshold(parse_qs(u.query))
            return self._json(simulate_flow(features, thresh))

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

    def do_PUT(self):
        if self._maybe_studio():
            return
        self._err(HTTPStatus.METHOD_NOT_ALLOWED, "PUT not supported for this route.")

    def do_DELETE(self):
        if self._maybe_studio():
            return
        self._err(HTTPStatus.METHOD_NOT_ALLOWED, "DELETE not supported for this route.")

    def do_OPTIONS(self):
        if self._maybe_studio():
            return
        self._err(HTTPStatus.METHOD_NOT_ALLOWED, "OPTIONS not supported for this route.")


def main():
    global STUDIO_MODE, _STUDIO_PORT
    ap = argparse.ArgumentParser(description="Serve the MetaFlow site with a live classification API and embedded Streamlit Studio.")
    ap.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.getenv("PORT", "8600")))
    ap.add_argument("--studio-mode", choices=("eager", "lazy", "off"), default=STUDIO_MODE)
    ap.add_argument("--studio-port", type=int, default=_STUDIO_PORT)
    a = ap.parse_args()
    STUDIO_MODE = a.studio_mode
    _STUDIO_PORT = a.studio_port

    atexit.register(stop_studio)
    if STUDIO_MODE == "eager":
        threading.Thread(target=ensure_studio, daemon=True).start()

    httpd = ThreadingHTTPServer((a.host, a.port), Handler)
    print("MetaFlow running at http://%s:%d  (Streamlit Studio at /studio/, mode=%s)"
          % (a.host, a.port, STUDIO_MODE), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop_studio()


if __name__ == "__main__":
    main()
