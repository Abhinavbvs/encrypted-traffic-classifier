#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================================"
echo "               MetaFlow - Encrypted Traffic Classifier                "
echo "======================================================================"
echo ""

# Find Python
if [ -f ".venv/bin/python" ]; then
    PY_BIN=".venv/bin/python"
    echo "[*] Using virtual environment: .venv/bin/python"
elif command -v python3 &>/dev/null; then
    PY_BIN="python3"
    echo "[*] Using system python3"
else
    echo "[!] Python 3.11+ is required but not found."
    exit 1
fi

echo "[*] Starting MetaFlow Web Server on http://127.0.0.1:8600 ..."
$PY_BIN web/server.py --port 8600 &
PID_WEB=$!

echo "[*] Starting Streamlit Dashboard on http://127.0.0.1:8501 ..."
$PY_BIN -m streamlit run app.py --server.port 8501 --server.headless true &
PID_ST=$!

cleanup() {
    echo ""
    echo "[*] Shutting down background servers..."
    kill $PID_WEB 2>/dev/null || true
    kill $PID_ST 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

sleep 3

echo ""
echo "======================================================================"
echo " [+] MetaFlow Web UI:    http://127.0.0.1:8600"
echo " [+] Streamlit App:      http://127.0.0.1:8501"
echo " [+] Live Analyzer:      http://127.0.0.1:8600/analyze.html"
echo "======================================================================"
echo ""

# Try opening in browser
if command -v xdg-open &>/dev/null; then
    xdg-open "http://127.0.0.1:8600" &>/dev/null || true
elif command -v open &>/dev/null; then
    open "http://127.0.0.1:8600" &>/dev/null || true
fi

echo "Servers running. Press Ctrl+C to stop both."
wait
