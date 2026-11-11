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

echo "[*] Starting unified MetaFlow server on http://127.0.0.1:8600 ..."
echo " [+] MetaFlow Web UI:  http://127.0.0.1:8600/"
echo " [+] Live Analyzer:    http://127.0.0.1:8600/analyze.html"
echo " [+] Streamlit Studio: http://127.0.0.1:8600/studio/ (auto-managed)"
echo ""

(
  sleep 3
  if command -v xdg-open &>/dev/null; then
      xdg-open "http://127.0.0.1:8600" &>/dev/null || true
  elif command -v open &>/dev/null; then
      open "http://127.0.0.1:8600" &>/dev/null || true
  fi
) &

exec "$PY_BIN" web/server.py --port 8600
