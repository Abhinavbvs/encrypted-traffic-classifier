"""Tests for MetaFlow monorepo single-port server and embedded Streamlit Studio reverse proxy."""

from __future__ import annotations

import http.client
import json
import socket
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import urllib.request

from web import server as mf_server


class _MockStudioHandler(BaseHTTPRequestHandler):
    """Lightweight mock upstream imitating Streamlit /studio routes and WebSocket upgrade."""

    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        if self.headers.get("Upgrade", "").lower() == "websocket":
            self.connection.sendall(
                b"HTTP/1.1 101 Switching Protocols\r\n"
                b"Upgrade: websocket\r\n"
                b"Connection: Upgrade\r\n\r\n"
                b"PING_FROM_STUDIO"
            )
            echoed = self.connection.recv(64)
            if echoed:
                self.connection.sendall(b"ECHO:" + echoed)
            self.close_connection = True
            return

        if self.path == "/studio/_stcore/health":
            body = b"ok"
            ctype = "text/plain"
        else:
            body = b"<html><title>Mock Streamlit</title></html>"
            ctype = "text/html"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Set-Cookie", "a=1; Path=/studio")
        self.send_header("Set-Cookie", "b=2; Path=/studio")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_PUT(self):
        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else b""
        resp = json.dumps({"method": "PUT", "path": self.path, "size": len(payload)}).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)


def _start_server(handler_cls):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler_cls)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, srv.server_address[1]


def test_built_pages_use_relative_studio_bridge():
    """Generated web UI links to the same-origin /studio/ route and fixes license/slider/sniffer wiring."""
    repo_root = Path(__file__).resolve().parent.parent
    for page in ("index.html", "analyze.html", "benchmarks.html"):
        html = (repo_root / "web" / page).read_text(encoding="utf-8")
        assert 'href="/studio/"' in html

    license_html = (repo_root / "web" / "license.html").read_text(encoding="utf-8")
    assert 'href="../LICENSE"' not in license_html
    assert "blob/main/LICENSE" in license_html

    analyze_html = (repo_root / "web" / "analyze.html").read_text(encoding="utf-8")
    feat_cols = json.loads((repo_root / "data" / "processed" / "feature_columns.json").read_text(encoding="utf-8"))
    for feat in feat_cols:
        assert f'data-feat="{feat}"' in analyze_html
    assert "data-sniff-iface" in analyze_html
    assert "data-sniff-btn" in analyze_html
    assert "data-sim-drivers" in analyze_html

    app_py = (repo_root / "app.py").read_text(encoding="utf-8")
    assert "[← Back to MetaFlow Web UI](/)" in app_py


def test_monorepo_proxy_http_put_and_websocket():
    """Verify /studio redirect, HTTP GET/PUT forwarding, Set-Cookie preservation, and WS tunnel."""
    mock_studio, mock_port = _start_server(_MockStudioHandler)
    mf_httpd, mf_port = _start_server(mf_server.Handler)

    orig_port = mf_server._STUDIO_PORT
    orig_mode = mf_server.STUDIO_MODE
    try:
        mf_server._STUDIO_PORT = mock_port
        mf_server.STUDIO_MODE = "eager"

        # 1. /api/studio-status reports healthy upstream
        with urllib.request.urlopen(f"http://127.0.0.1:{mf_port}/api/studio-status") as r:
            st = json.loads(r.read())
            assert st["enabled"] is True
            assert st["running"] is True
            assert st["url"] == "/studio/"

        # 2. /studio redirects cleanly to /studio/
        conn = http.client.HTTPConnection("127.0.0.1", mf_port, timeout=5)
        conn.request("GET", "/studio")
        resp = conn.getresponse()
        resp.read()
        assert resp.status == 307
        assert resp.getheader("Location") == "/studio/"
        conn.close()

        # 3. GET /studio/ forwards body and multi-value Set-Cookie headers
        conn = http.client.HTTPConnection("127.0.0.1", mf_port, timeout=5)
        conn.request("GET", "/studio/")
        resp = conn.getresponse()
        html = resp.read()
        cookies = resp.headers.get_all("Set-Cookie")
        assert resp.status == 200
        assert b"Mock Streamlit" in html
        assert cookies is not None and len(cookies) == 2
        conn.close()

        # 4. PUT /studio/_stcore/upload_file/123 forwards upload payload
        conn = http.client.HTTPConnection("127.0.0.1", mf_port, timeout=5)
        conn.request("PUT", "/studio/_stcore/upload_file/123", body=b"pcap-bytes", headers={"Content-Type": "application/octet-stream"})
        resp = conn.getresponse()
        put_data = json.loads(resp.read())
        assert resp.status == 200
        assert put_data == {"method": "PUT", "path": "/studio/_stcore/upload_file/123", "size": 10}
        conn.close()

        # 5. Bidirectional WebSocket tunnel via /studio/_stcore/stream
        sock = socket.create_connection(("127.0.0.1", mf_port), timeout=5)
        try:
            sock.sendall(
                b"GET /studio/_stcore/stream HTTP/1.1\r\n"
                b"Host: 127.0.0.1\r\n"
                b"Upgrade: websocket\r\n"
                b"Connection: Upgrade\r\n"
                b"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                b"Sec-WebSocket-Version: 13\r\n\r\n"
            )
            banner = sock.recv(4096)
            assert b"101 Switching Protocols" in banner
            assert b"PING_FROM_STUDIO" in banner
            sock.sendall(b"CLIENT_MSG")
            echo = sock.recv(4096)
            assert b"ECHO:CLIENT_MSG" in echo
        finally:
            sock.close()
    finally:
        mf_server._STUDIO_PORT = orig_port
        mf_server.STUDIO_MODE = orig_mode
        mf_httpd.shutdown()
        mf_httpd.server_close()
        mock_studio.shutdown()
        mock_studio.server_close()
