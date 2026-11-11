# Production-ready monorepo Docker image for MetaFlow (Web UI + REST API + Embedded Streamlit Studio)
FROM python:3.11-slim

# Environment variables (writable HOME/MPLCONFIGDIR supports non-root Hugging Face Spaces & PaaS)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8600 \
    HOME=/tmp \
    MPLCONFIGDIR=/tmp/matplotlib

WORKDIR /app

# Install system dependencies including libpcap for Scapy
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpcap-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy application source code, models, bundled datasets, and web assets
COPY src/ ./src/
COPY models/ ./models/
COPY data/processed/ ./data/processed/
COPY data/sample_pcaps/ ./data/sample_pcaps/
COPY reports/ ./reports/
COPY web/ ./web/
COPY .streamlit/ ./.streamlit/
COPY app.py .
COPY README.md .

# Ensure /tmp cache dirs and /app work smoothly for non-root UIDs (e.g. HF Spaces UID 1000)
RUN chmod -R a+rX /app && mkdir -p /tmp/matplotlib && chmod -R 777 /tmp

# Healthcheck against the unified MetaFlow server (serves / and /studio/)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8600}/api/health || exit 1

EXPOSE 8600

CMD ["sh", "-c", "python web/server.py --host 0.0.0.0 --port ${PORT:-8600}"]
