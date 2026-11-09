"""Builds the MetaFlow site into web/.
Run from the repository root with the project's environment:
    python web/build.py
It runs the real model (through web/server.py's functions) on the repository's sample
captures and flow CSV, and bakes those results into the pages as an offline snapshot.
When the site is served by web/server.py, the pages call the live API instead."""
import html as _html
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(ROOT)
sys.path.insert(0, ROOT)
import server as live  # noqa: E402  (loads the model once)

REPO = "https://github.com/Abhinavbvs/encrypted-traffic-classifier"
BLOB = "../"   # repository files, served locally (works from web/server.py and from file://)
TREE = "../"
REP = "../reports/"
PCAPS = "../data/sample_pcaps/"
SAMPLE_ORDER = ["voip_call.pcap", "browsing_https.pcap", "file_transfer.pcap", "streaming_video.pcap"]


def _snapshot():
    snap = {"samples": {}, "health": live.health(), "metrics": live.metrics()}
    for n in SAMPLE_ORDER:
        snap["samples"][n] = live.classify_pcap(live.SAMPLES_DIR / n, 0.0, n)  # raw confidences; threshold applied in the page
    snap["batch"] = live.classify_batch(0.0)
    return snap


SNAP = _snapshot()
os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
with open(os.path.join(ROOT, "data", "snapshot.json"), "w", encoding="utf-8") as _f:
    json.dump(SNAP, _f, indent=1)
MET = SNAP["metrics"]


def top(name):
    f = SNAP["samples"][name]["flows"][0]
    return f["top_class"], f["confidence"] * 100, f


def snap_script():
    return '<script type="application/json" id="mf-snapshot">%s</script>' % json.dumps(SNAP).replace("</", "<\\/")


NAV = [
    ("index.html", "Home"),
    ("benchmarks.html", "Benchmarks"),
    ("capabilities.html", "Capabilities"),
    ("analyze.html", "Analyze"),
    ("project.html", "Project"),
    ("demo.html", "Demo"),
    ("reports.html", "Reports"),
    ("get-started.html", "Get started"),
]

CAPS = [
    dict(slug="capability-pcap-ingestion.html", n="01", name="PCAP ingestion", obj="dish",
         line="Raw .pcap and .pcapng in, bidirectional flows out.",
         short="Native Scapy parser builds 5-tuple flows and throws payload bytes away on arrival."),
    dict(slug="capability-timing-features.html", n="02", name="Timing features", obj="rings",
         line="23 statistics about when packets move, nothing about what they carry.",
         short="Inter-arrival times, throughput, active bursts and idle gaps, computed per flow."),
    dict(slug="capability-lightgbm.html", n="03", name="LightGBM classifier", obj="cube",
         line="96.9% test accuracy at about 2.3 ms per flow on a CPU.",
         short="Selected over Random Forest and XGBoost by 5-fold stratified cross-validation."),
    dict(slug="capability-explainable-ai.html", n="04", name="Explainable AI", obj="sphere",
         line="Every verdict comes with a networking reason a person can read.",
         short="Local Ollama, cloud LLM, or an offline rule engine, routed automatically."),
    dict(slug="capability-unknown-detection.html", n="05", name="Unknown detection", obj="cone",
         line="Low-confidence flows are flagged, not forced into a class.",
         short="An adjustable confidence threshold turns novel traffic into a triage queue."),
]


def obj(kind):
    if kind == "cube":
        return '<div class="obj obj-cube" aria-hidden="true">' + "<i></i>" * 6 + "</div>"
    if kind == "rings":
        return '<div class="obj obj-rings" aria-hidden="true"><i></i><i></i><i></i></div>'
    return '<div class="obj obj-%s" aria-hidden="true"></div>' % kind


def logo_svg(uid):
    return (
        '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">'
        '<defs><linearGradient id="mf%s" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#ff8ac8"/><stop offset=".5" stop-color="#ff2d8a"/><stop offset="1" stop-color="#6c3bff"/>'
        '</linearGradient></defs>'
        '<rect width="32" height="32" rx="9" fill="url(#mf%s)"/>'
        '<path d="M7.5 22V13.2c0-2.3 1.3-3.7 3.1-3.7 1.5 0 2.5.9 3.2 2.6L16 17.4l2.2-5.3c.7-1.7 1.7-2.6 3.2-2.6 1.8 0 3.1 1.4 3.1 3.7V22" '
        'fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
        '<circle cx="7.5" cy="25.6" r="1.25" fill="#fff" opacity=".55"/><circle cx="12" cy="25.6" r="1.25" fill="#fff" opacity=".8"/>'
        '<circle cx="16.5" cy="25.6" r="1.25" fill="#fff"/>'
        '</svg>' % (uid, uid)
    )


def logo(uid):
    return ('<a class="logo" href="index.html" aria-label="MetaFlow home">%s'
            '<span class="logo-word">Meta<b>Flow</b></span><sup>v1.0</sup></a>') % logo_svg(uid)


def head(title, desc):
    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<meta name="theme-color" content="#0b0b0d">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/fx.bundle.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
""" % (title, desc)


def header(active):
    items = "".join(
        '<li><a href="%s"%s><span class="n">%02d</span>%s</a></li>'
        % (href, ' aria-current="page"' if href == active else "", i + 1, label)
        for i, (href, label) in enumerate(NAV)
    )
    caps = "".join('<a href="%s">%s</a>' % (c["slug"], c["name"]) for c in CAPS)
    return """<header class="hdr">
  %s
  <div class="hdr-mid"><span class="clock" data-clock></span></div>
  <div class="hdr-right">
    <span class="live-badge" data-live-badge hidden><span class="live-dot"></span>Live model</span>
    <a class="btn sm" href="analyze.html">Classify a capture <span class="arr">→</span></a>
    <button class="menu-btn" data-menu-open aria-expanded="false" aria-controls="menu" aria-label="Open menu"><span></span></button>
  </div>
</header>
<nav class="menu" id="menu" aria-hidden="true" aria-label="Main">
  <button class="menu-close" data-menu-close aria-label="Close menu">×</button>
  <ol class="menu-main">%s</ol>
  <div class="menu-side">
    <div class="grp"><h4>Capabilities</h4>%s</div>
    <div class="grp"><h4>More</h4>
      <a href="system.html">Design system</a>
      <a href="%s" target="_blank" rel="noopener">GitHub repository ↗</a>
      <a href="%sreports/encrypted_traffic_classifier_demo.mp4" target="_blank" rel="noopener">Demo video (mp4) ↗</a>
    </div>
  </div>
</nav>
""" % (logo("h"), items, caps, REPO, BLOB)


def footer():
    caps = "".join('<li><a href="%s">%s</a></li>' % (c["slug"], c["name"]) for c in CAPS)
    pages = "".join('<li><a href="%s">%s</a></li>' % (h, l) for h, l in NAV[1:]) + '<li><a href="system.html">Design system</a></li>'
    return """<footer class="ftr">
  <div class="ftr-fx" aria-hidden="true"><canvas data-horizon></canvas></div>
  <div class="wrap">
    <div class="ftr-grid">
      <div>
        %s
        <p class="addr mt-s">A privacy-preserving classifier for encrypted network traffic. It reads packet timing, never payload. Open source under the MIT licence.</p>
        <a class="btn light sm mt-s" href="%s" target="_blank" rel="noopener">Star on GitHub <span class="arr">↗</span></a>
      </div>
      <div><h4>Pages</h4><ul>%s</ul></div>
      <div><h4>Capabilities</h4><ul>%s</ul></div>
      <div><h4>Run it</h4><ul>
        <li><a href="get-started.html#install">Install</a></li>
        <li><a href="get-started.html#site">MetaFlow server</a></li>
        <li><a href="get-started.html#dashboard">Streamlit dashboard</a></li>
        <li><a href="get-started.html#cli">Command line</a></li>
        <li><a href="get-started.html#docker">Docker</a></li>
        <li><a href="get-started.html#tests">Test suite</a></li>
      </ul></div>
      <div><h4>Source</h4><ul>
        <li><a href="%s" target="_blank" rel="noopener">Repository ↗</a></li>
        <li><a href="%sactions" target="_blank" rel="noopener">CI pipeline ↗</a></li>
        <li><a href="%sissues" target="_blank" rel="noopener">Issues ↗</a></li>
        <li><a href="reports.html%s">Reports</a></li>
        <li><a href="%s#readme" target="_blank" rel="noopener">README ↗</a></li>
      </ul></div>
    </div>
    <div class="ftr-big" aria-hidden="true">MetaFlow</div>
    <div class="ftr-legal">
      <span>© 2026 MetaFlow · encrypted-traffic-classifier · MIT</span>
      <nav aria-label="Legal"><a href="license.html">Licence</a><a href="privacy.html">Privacy</a><a href="security.html">Security</a><a href="system.html">Design system</a></nav>
    </div>
  </div>
</footer>
<div class="notice" role="dialog" aria-label="Privacy notice">
  <p><b>No cookies, no tracking.</b> Like the classifier, this site keeps nothing about you. One flag in your browser remembers that you closed this. <a class="mag" href="privacy.html">Privacy</a></p>
  <div class="row"><button class="btn sm" data-notice-close>Got it</button><a class="btn sm ghost" href="privacy.html">Read more</a></div>
</div>
<script src="js/main.js"></script>
<script src="js/fx.bundle.js"></script>
</body>
</html>
""" % (logo("f"), REPO, pages, caps, REPO, REPO + "/", REPO + "/", "", REPO)


def write(name, title, desc, active, body, snapshot=False):
    html = head(title, desc) + header(active) + '<main id="main">' + body + "</main>\n" + (snap_script() + "\n" if snapshot else "") + footer()
    with open(os.path.join(ROOT, name), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("wrote", name)


def page_hero(crumb, eyebrow, title, lead, extra=""):
    return """<section class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="index.html">MetaFlow</a><span>/</span><span>%s</span></div>
  <div class="eyebrow rv">%s</div>
  <h1 class="h-xl rv rv-d1">%s</h1>
  <p class="lead rv rv-d2">%s</p>%s
</div></section>""" % (crumb, eyebrow, title, lead, extra)


def code(text):
    return '<div class="code"><button class="copy" data-copy>Copy</button><pre style="margin:0">%s</pre></div>' % text


# ------------------------------------------------------------------ data
CLASSES = [
    ("voip", "VoIP", "Fixed 20 ms frames in both directions. The steadiest heartbeat on the network.", "0.999", "424"),
    ("browsing", "Browsing", "A handshake, a burst of assets, then a person reading. Repeat.", "0.968", "375"),
    ("p2p", "P2P", "Many peers, both directions, irregular sizes and gaps.", "0.979", "141"),
    ("file", "File transfer", "Full-MTU packets one way, small ACKs the other, almost no idle time.", "0.941", "129"),
    ("chat", "Chat", "Small, sparse messages with long silences and keep-alives.", "0.943", "133"),
    ("mail", "Mail", "A short protocol exchange, then a bulk send, then quiet.", "0.944", "36"),
    ("streaming", "Streaming", "Large chunks every few seconds as the player buffers ahead.", "0.874", "67"),
]

F1 = [("VoIP", .961, 1.000, .998, .999, 424), ("P2P", .972, .972, .986, .979, 141), ("Browsing", .961, .961, .976, .968, 375),
      ("Mail", .944, .944, .944, .944, 36), ("Chat", .954, .954, .932, .943, 133), ("File transfer", .960, .960, .922, .941, 129),
      ("Streaming", .868, .868, .881, .874, 67)]

FEATURES = [
    ("duration", "Total flow duration (µs)", "flow"),
    ("total_fiat", "Total forward inter-arrival time", "fwd"), ("total_biat", "Total backward inter-arrival time", "bwd"),
    ("min_fiat", "Shortest forward gap", "fwd"), ("max_fiat", "Longest forward gap", "fwd"), ("mean_fiat", "Mean forward gap", "fwd"),
    ("min_biat", "Shortest backward gap", "bwd"), ("max_biat", "Longest backward gap", "bwd"), ("mean_biat", "Mean backward gap", "bwd"),
    ("flowPktsPerSecond", "Packet rate", "rate"), ("flowBytesPerSecond", "Byte rate", "rate"),
    ("min_flowiat", "Shortest gap, either direction", "flow"), ("max_flowiat", "Longest gap, either direction", "flow"),
    ("mean_flowiat", "Mean gap, either direction", "flow"), ("std_flowiat", "Gap variability", "flow"),
    ("min_active", "Shortest active burst", "burst"), ("mean_active", "Mean active burst", "burst"),
    ("max_active", "Longest active burst", "burst"), ("std_active", "Burst variability", "burst"),
    ("min_idle", "Shortest idle period", "idle"), ("mean_idle", "Mean idle period", "idle"),
    ("max_idle", "Longest idle period", "idle"), ("std_idle", "Idle variability", "idle"),
]

FAQ = [
    ("How can you classify traffic you cannot decrypt?",
     "<p>Encryption hides what a packet says, not when it moves. A voice call sends a small frame every 20 ms. A file transfer fills the pipe one way. A web page loads in bursts and then goes quiet while someone reads. MetaFlow measures 23 of these timing statistics per flow and lets a LightGBM model learn which rhythm belongs to which application.</p>"),
    ("Does it ever look at payload?",
     "<p>No. The PCAP extractor parses IP and transport headers to build flows and drops payload bytes as it reads them. The model only ever sees timing statistics, so there is nothing personal to leak and no decryption keys to manage.</p>"),
    ("How accurate is it, honestly?",
     "<p>96.9% accuracy and 0.950 macro F1 on 1,305 held-out flows that were never used for training or tuning. Five-fold cross-validation gives 95.61% ± 0.57%. The weakest class is Streaming (F1 0.874), because buffered video inside a 15 s window can look like page-load bursts. That trade-off is documented in the reports.</p>"),
    ("What happens with traffic it has never seen?",
     "<p>You set a confidence threshold. Any flow whose top probability falls below it is labelled <em>Uncertain (Unknown Traffic)</em> instead of being forced into the nearest class, so new protocols end up in a triage queue rather than in your statistics.</p>"),
    ("Does it need a GPU or the internet?",
     "<p>Neither. Inference is about 2.3 ms per flow on a CPU, more than 400 flows a second. Explanations fall back to a built-in rule engine when no local Ollama model or cloud key is available, so the whole thing runs offline.</p>"),
]

CHECK = '<span class="y">✓</span>'
CROSS = '<span class="x">✕</span>'
WARN = '<span class="p">!</span>'
CMP = [
    ("Encrypted traffic (TLS 1.3, QUIC)", CROSS + " Fails completely", CROSS + " Port 443 hides everything", CHECK + " Works", CHECK + " 96.9% test accuracy"),
    ("Privacy and compliance", CROSS + " Conflicts with GDPR / HIPAA", WARN + " Privacy concerns", CHECK + " Preserved", CHECK + " No payload inspected, ever"),
    ("Raw capture ingestion", CROSS + " Needs decryption keys", WARN + " Headers only", WARN + " Byte truncation", CHECK + " Native .pcap / .pcapng flows"),
    ("Port and IP evasion", CROSS + " Vulnerable", CROSS + " Easily bypassed", CHECK + " High", CHECK + " Rhythm is hard to spoof"),
    ("Inference latency", CROSS + " 100 to 500 ms", CHECK + " Under 1 ms", CROSS + " 15 to 40 ms on GPU", CHECK + " About 2.3 ms on CPU"),
    ("Explainability", WARN + " Plain logs", CROSS + " None", CROSS + " Black box", CHECK + " Plain-language reasons"),
    ("Deployment cost", CROSS + " Heavy hardware", WARN + " Cheap but inaccurate", CROSS + " GPU middleboxes", CHECK + " Lightweight CPU"),
]


def cmp_table():
    rows = "".join('<tr><th scope="row">%s</th><td>%s</td><td>%s</td><td>%s</td><td class="us">%s</td></tr>' % r for r in CMP)
    return """<div class="compare-wrap rv"><table class="cmp">
<thead><tr><th>What matters</th><th>Deep packet inspection</th><th>IP / port rules</th><th>Deep learning (CNN / LSTM)</th><th class="us">MetaFlow</th></tr></thead>
<tbody>%s</tbody></table></div>""" % rows


def faq_block():
    items = "".join('<details%s><summary>%s</summary><div class="ans">%s</div></details>' % (" open" if i == 0 else "", q, a) for i, (q, a) in enumerate(FAQ))
    return """<section class="sec"><div class="wrap faq-grid">
  <div><div class="eyebrow">FAQ</div><h2 class="h-l rv">Good to know.</h2></div>
  <div class="faq rv rv-d1">%s</div>
</div></section>""" % items


def closing(title="Read the rhythm.", lead="Clone the repo, point it at a capture, and get a labelled, explained flow in about a minute. Everything runs on your machine."):
    return """<section class="sec closing"><div class="wrap">
  <div class="eyebrow" style="justify-content:center">Get started</div>
  <h2 class="h-xl rv">%s</h2>
  <p class="lead rv rv-d1">%s</p>
  <div class="ctas rv rv-d2"><a class="btn" href="get-started.html">Run the quickstart <span class="arr">→</span></a><a class="btn ghost" href="%s" target="_blank" rel="noopener">View on GitHub ↗</a></div>
</div></section>""" % (title, lead, REPO)


def analyzer():
    chips = "".join('<button class="chip" data-sample="%s" aria-pressed="false">%s</button>' % (n, n) for n in SAMPLE_ORDER)
    return """<section class="sec" id="analyzer" style="background:var(--bg-2)"><div class="wrap chat-split">
  <div>
    <div class="eyebrow">Flow analyzer</div>
    <h2 class="h-l rv">A verdict in milliseconds.</h2>
    <p class="lead rv rv-d1">Pick one of the four captures in <code>data/sample_pcaps</code>. MetaFlow builds the flows, runs the trained LightGBM model, and explains the call. Raise the threshold to see unknown-traffic detection kick in.</p>
    <p class="mono mute rv rv-d2" data-mode-note>Served by web/server.py, this calls the real model. Opened as a file, it replays a snapshot the same model produced at build time.</p>
    <div class="hero-ctas mt-m rv rv-d3"><a class="btn" href="analyze.html">Open the full analyzer <span class="arr">→</span></a><a class="btn ghost" href="get-started.html#cli">Use the CLI</a></div>
  </div>
  <div class="chatbox rv rv-d1" data-chat>
    <div class="chat-top"><span class="dots"><i></i><i></i><i></i></span><span class="mono mute">metaflow · predict_pcap()</span><span class="pill ok" data-mode-pill>snapshot</span></div>
    <div class="chat-body" aria-live="polite">
      <div class="msg bot"><span class="who">MetaFlow</span>Hi. Choose a capture below and I will classify every flow in it using timing alone. Nothing is decrypted, and no payload bytes are read.</div>
    </div>
    <div class="chat-ctrl">
      <div class="chips">%s</div>
      <label class="thresh"><span>Confidence threshold</span><input type="range" min="0.3" max="0.95" step="0.05" value="0.5" data-threshold aria-label="Confidence threshold"><output data-threshold-out>0.50</output></label>
    </div>
  </div>
</div></section>""" % chips


# ------------------------------------------------------------------ home
def home():
    tiles = "".join("""<a class="tile rv rv-d%d" href="%s"><span class="n">%s</span><span class="go">→</span>
  <div class="obj-slot">%s</div><h3>%s</h3></a>""" % (i % 4 + 1, c["slug"], c["n"], obj(c["obj"]), c["name"]) for i, c in enumerate(CAPS))
    ways = "".join("""<a class="way rv" href="%s"><span class="n">%s</span><h3>%s</h3><p>%s</p><span class="go">→</span></a>""" % (c["slug"], c["n"], c["name"], c["line"]) for c in CAPS)
    words = "".join("<span>%s</span>" % w for w in ["Zero payload", "Zero decryption", "Zero leakage", "2.3 ms a flow", "Runs on CPU", "Explains itself"] * 2)
    cards = "".join("""<article class="card rv rv-d%d"><div class="card-vis"><canvas data-rhythm="%s" data-speed="%s" data-nogrid></canvas><span class="tag">%s</span></div>
  <div class="card-body"><h3>%s</h3><p>%s</p><div class="card-stats"><span>F1 <b>%s</b></span><span>test flows <b>%s</b></span></div></div></article>""" %
                    (i % 4 + 1, k, "0.6" if k in ("voip", "file") else "1", "Class %02d" % (i + 1), name, txt, f1, sup) for i, (k, name, txt, f1, sup) in enumerate(CLASSES))
    cards += """<article class="card rv rv-d4"><div class="card-vis" style="background:linear-gradient(135deg,#2a0418,#0b0b0d)"><canvas data-rhythm="p2p" data-speed="2.5" data-nogrid style="opacity:.35;filter:blur(1px)"></canvas><span class="tag">Fallback</span></div>
  <div class="card-body"><h3>Unknown</h3><p>Anything below your confidence threshold is flagged for a person to look at.</p><div class="card-stats"><span>threshold <b>adjustable</b></span></div></div></article>"""
    stats = [("96.9", "%", "Test accuracy on unseen flows", True), ("2.3", " ms", "Inference per flow, CPU only", False),
             ("23", "", "Timing features, no payload", False), ("7", "", "Application classes", False),
             ("8694", "", "Cleaned flows from ISCX VPN-NonVPN", False), ("32", "", "Tests passing in CI", False),
             ("0", "", "Payload bytes ever read", True)]
    stat_html = "".join('<div class="stat%s rv"><b data-count="%s" data-suf="%s">0</b><span>%s</span></div>' % (" hot" if hot else "", v, s, l) for v, s, l, hot in stats)
    stat_html += '<div class="stat cta rv"><a class="btn light" href="benchmarks.html">All benchmarks <span class="arr">→</span></a></div>'

    body = """
<section class="hero">
  <div class="hero-stage"><canvas id="heroCanvas" data-rhythm="voip" data-theme="light"></canvas></div>
  <div class="hero-orb" aria-hidden="true"></div>
  <div class="hero-slides" role="group" aria-label="Traffic rhythm">
    <button data-slide="voip" data-cap="<span>Fig. A · live rhythm</span><b>VoIP · 20 ms frames</b>">VoIP</button>
    <button data-slide="browsing" data-cap="<span>Fig. B · live rhythm</span><b>Browsing · bursts and think time</b>">Browsing</button>
    <button data-slide="file" data-cap="<span>Fig. C · live rhythm</span><b>File transfer · saturated uplink</b>">File transfer</button>
  </div>
  <div class="slide-cap" data-slide-cap></div>
  <div class="hero-content">
    <h1 class="rv">Read the<br><em>rhythm.</em></h1>
    <div class="hero-row rv rv-d1">
      <p class="hero-sub">Not the payload. Encrypted traffic, classified by timing alone.</p>
      <div class="hero-ctas"><a class="btn" href="#analyzer">Classify a capture <span class="arr">→</span></a><a class="btn ghost" href="benchmarks.html">See the benchmarks</a></div>
      <span class="hero-meta">MIT · Python 3.11 · Docker ready</span>
    </div>
  </div>
</section>

<section class="sec-tight"><div class="wrap">
  <div class="row-between" style="margin-bottom:26px"><div class="eyebrow" style="margin:0">Capabilities 01 to 05</div><a class="mono mute" href="capabilities.html">All capabilities →</a></div>
  <div class="tiles">%s</div>
</div></section>

<section class="sec"><div class="wrap statement">
  <div class="eyebrow rv">What it is</div>
  <div>
    <h2 class="h-l rv">The classifier takes the shape of your traffic.</h2>
    <p class="lead mt-s rv rv-d1">TLS 1.3 and QUIC made payload inspection useless and port numbers meaningless. MetaFlow takes raw packet captures, builds bidirectional flows, measures how packets move in time and names the application in seven classes, with a plain-language reason for every call.</p>
    <div class="trio rv rv-d2"><div><b>Zero payload</b><span>Headers in, payload discarded</span></div><div><b>23 features</b><span>Pure timing statistics</span></div><div><b>2.3 ms</b><span>Per flow, on a CPU</span></div></div>
  </div>
</div></section>

<section class="sec-tight"><div class="wrap">
  <div class="fig-head"><h2 class="h-xl rv">Built for speed.</h2><p class="lead rv rv-d1" style="margin:0">Inference latency per flow. Shorter bar is faster. Measured figures from the project's benchmarks.</p></div>
  <div class="fig rv" data-fill><div class="race">
    <div class="race-row"><span class="lbl">Deep packet inspection</span><span class="race-track"><span class="race-bar" data-w="100%%"></span></span><span class="val">100–500 ms</span></div>
    <div class="race-row"><span class="lbl">Deep learning (GPU)</span><span class="race-track"><span class="race-bar" data-w="34%%"></span></span><span class="val">15–40 ms</span></div>
    <div class="race-row"><span class="lbl">Random Forest</span><span class="race-track"><span class="race-bar" data-w="4.2%%"></span></span><span class="val">3.8 ms</span></div>
    <div class="race-row"><span class="lbl">XGBoost</span><span class="race-track"><span class="race-bar" data-w="3.6%%"></span></span><span class="val">3.2 ms</span></div>
    <div class="race-row us"><span class="lbl">MetaFlow · LightGBM</span><span class="race-track"><span class="race-bar" data-w="2.6%%"></span></span><span class="val">2.31 ms</span></div>
    <div class="race-note">Bars scaled to a 90 ms axis, so DPI runs off the chart. 2.31 ms per flow is more than 400 flows a second on one CPU.</div>
  </div></div>
  <div class="fig-cap"><span>Fig. 01 · Latency study</span><span>Source: reports/metrics.json</span></div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="row-between" style="margin-bottom:40px"><h2 class="h-l rv">Five things it does well.</h2><a class="btn ghost rv" href="capabilities.html">All capabilities <span class="arr">→</span></a></div>
  <div class="ways">%s</div>
</div></section>

<div class="marquee" aria-hidden="true"><div class="marquee-track">%s</div></div>

<section class="sec"><div class="wrap reel">
  <div><div class="eyebrow">Demo · selected moments</div><h2 class="h-m rv">From a raw capture to an explained verdict.</h2><p class="lead rv rv-d1" style="font-size:18px">Ingestion, batch inference, the live parameter simulator and the benchmark reports in one walk-through.</p><a class="btn ghost mt-s rv rv-d2" href="demo.html">Watch the full demo <span class="arr">→</span></a></div>
  <a class="reel-thumb rv rv-d1" href="demo.html" aria-label="Open the demo"><canvas data-rhythm="streaming" data-speed="1.4"></canvas><span class="play">▶</span><span class="reel-badge">1080p · reports/encrypted_traffic_classifier_demo.mp4</span></a>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="fig-head"><div><div class="eyebrow">From the dataset · 7 classes</div><h2 class="h-xl rv">Every app has a pulse.</h2></div>
  <p class="lead rv rv-d1" style="margin:0">Magenta rises are client to server, grey drops are server to client. These are the rhythms the model learns to tell apart.</p></div>
  <div class="archive">%s</div>
  <div class="fig-cap"><span>Fig. 02 · Rhythm studies, simulated from each class's timing profile</span><a href="benchmarks.html#per-class">Per-class results →</a></div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="fig-head"><div><div class="eyebrow">Compared</div><h2 class="h-l rv">In good company, ahead of it.</h2></div><p class="lead rv rv-d1" style="margin:0">How timing-based LightGBM stacks up against the approaches network teams use today.</p></div>
  %s
</div></section>

<section class="sec dark"><div class="wrap">
  <div class="eyebrow">How the pipeline works</div>
  <h2 class="h-l rv" style="margin-bottom:60px">Headers lead. Payload never follows.</h2>
  <div class="steps">
    <div class="step rv"><span class="n">01</span><h3>Capture</h3><div class="who">Scapy · .pcap / .pcapng</div><p>Parses IPv4 and IPv6 headers and TCP and UDP ports. Payload bytes are discarded as they are read.</p></div>
    <div class="step rv rv-d1"><span class="n">02</span><h3>Extract</h3><div class="who">5-tuple flows · 23 features</div><p>Builds bidirectional flows, tracks who started them, and computes inter-arrival, rate, burst and idle statistics.</p></div>
    <div class="step rv rv-d2"><span class="n">03</span><h3>Classify</h3><div class="who">Scaler · LightGBM</div><p>Scales with the train-only <code>scaler.pkl</code>, then predicts the top class and the full probability spread.</p></div>
    <div class="step rv rv-d3"><span class="n">04</span><h3>Explain</h3><div class="who">3-tier router · threshold</div><p>Turns the verdict into a networking reason and flags anything below your confidence threshold.</p></div>
  </div>
</div></section>

<section class="band"><h2><span class="rv">Private.</span><span class="rv rv-d1">Precise.</span><span class="rv rv-d2">Instant.</span></h2></section>

<section class="sec dark" style="padding-top:0"><div class="wrap">
  <div class="row-between" style="margin-bottom:50px"><h2 class="h-l rv">Twenty-three numbers.<br>One verdict.</h2><p class="lead rv rv-d1" style="margin:0">Trained on the ISCX VPN-NonVPN 2016 benchmark, with 70/15/15 stratified splits and zero leakage.</p></div>
  <div class="stats">%s</div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="fig-head"><div><div class="eyebrow">Why timing</div><h2 class="h-l rv">Measured, not decrypted.</h2></div><p class="ratio rv rv-d1">4<span>→</span>1</p></div>
  <div class="chains">
    <div class="chain rv"><h3>Deep packet inspection</h3><p class="mute">Four handoffs, and each one adds cost, latency and privacy risk.</p>
      <div class="links"><div>Encrypted packet</div><span class="arrow">↓</span><div>TLS keys and decryption <small>key escrow</small></div><span class="arrow">↓</span><div>Payload inspection <small>personal data</small></div><span class="arrow">↓</span><div>Signature rules <small>brittle</small></div><span class="arrow">↓</span><div>Verdict <small>100–500 ms</small></div></div></div>
    <div class="chain us rv rv-d1"><h3>MetaFlow</h3><p class="mute">One timing layer between the packet and the answer.</p>
      <div class="links"><div>Encrypted packet</div><span class="arrow">↓</span><div class="core">Timing layer <small>23 features · LightGBM</small></div><span class="arrow">↓</span><div>Verdict and reason <small>~2.3 ms</small></div></div></div>
  </div>
</div></section>

%s
%s
%s

<section class="final"><div class="wrap">
  <h2 class="rv">Read the<br>rhythm<span class="mag">.</span></h2>
  <div class="final-row rv rv-d1"><p class="hero-sub" style="max-width:none">Not the payload.</p><a class="btn" href="get-started.html">Run the quickstart <span class="arr">→</span></a></div>
</div></section>
""" % (tiles, ways, words, cards, cmp_table(), stat_html, analyzer(), faq_block(), closing("Classify without looking."))
    # The dozfx-style home is assembled from web/partials/home/*.html (sorted by file name).
    # Tokens let a partial embed sections that need live data.
    parts_dir = os.path.join(ROOT, "partials", "home")
    if os.path.isdir(parts_dir) and any(f.endswith(".html") for f in os.listdir(parts_dir)):
        tokens = {"{{analyzer}}": analyzer(), "{{faq}}": faq_block(), "{{cmp_table}}": cmp_table(),
                  "{{closing}}": closing("Classify without looking.")}
        chunks = []
        for f in sorted(os.listdir(parts_dir)):
            if f.endswith(".html"):
                with open(os.path.join(parts_dir, f), encoding="utf-8") as fh:
                    t = fh.read()
                for k, v in tokens.items():
                    t = t.replace(k, v)
                chunks.append("<!-- partials/home/%s -->\n%s" % (f, t))
        body = "\n".join(chunks)
    write("index.html", "MetaFlow · Encrypted traffic, classified by timing",
          "MetaFlow classifies encrypted network traffic into seven application types from 23 timing features, with zero payload inspection.",
          "index.html", body, snapshot=True)


# ------------------------------------------------------------------ benchmarks
def benchmarks():
    cv = [("Random Forest", "300 trees", "93.90% ± 0.88%", "0.9042 ± 0.0141", "1.08 s", "3.8 ms", False),
          ("XGBoost", "hist boosted", "95.18% ± 0.48%", "0.9217 ± 0.0103", "5.76 s", "3.2 ms", False),
          ("LightGBM", "selected", "95.61% ± 0.57%", "0.9268 ± 0.0128", "3.01 s", "2.31 ms", True)]
    cv_rows = "".join('<tr%s><td>%s <span class="mono mute">%s</span></td><td class="num">%s</td><td class="num">%s</td><td class="num">%s</td><td class="num">%s</td></tr>' % (' class="best"' if b else "", a, b2, c, d, e, f) for a, b2, c, d, e, f, b in cv)
    pc_rows = "".join('<tr><td>%s</td><td class="num">%.3f</td><td class="num">%.3f</td><td class="num">%.3f</td><td class="num">%d</td></tr>' % (n, p, r, f, s) for n, _, p, r, f, s in F1)
    bars = "".join('<div class="f1%s"><span>%s</span><span class="t"><i data-w="%.1f%%"></i></span><span class="v">%.3f</span></div>' % (" low" if f < .9 else "", n, f * 100, f) for n, _, _, _, f, _ in F1)
    expect = {"voip_call.pcap": "VoIP", "browsing_https.pcap": "Browsing", "file_transfer.pcap": "FileTransfer", "streaming_video.pcap": "Streaming"}
    readme = {"voip_call.pcap": "VoIP 99.87%", "browsing_https.pcap": "Browsing 89.24%", "file_transfer.pcap": "FileTransfer 91.40%", "streaming_video.pcap": "Browsing 52.3% / Streaming 41.8%"}
    pcap_rows = ""
    for n in SAMPLE_ORDER:
        f = SNAP["samples"][n]["flows"][0]
        ok = f["top_class"] == expect[n]
        runner = f["top3"][1]
        pcap_rows += ('<tr><td><code>%s</code></td><td>%s</td><td><b>%s</b> <span class="mute">· then %s %.1f%%</span></td><td class="num">%.2f%%</td><td class="mute">%s</td><td><span class="pill %s">%s</span></td></tr>'
                      % (n, expect[n], f["top_class"], runner["class"], runner["probability"] * 100, f["confidence"] * 100, readme[n], "ok" if ok else "unk", "matches" if ok else "misclassified"))

    body = page_hero("Benchmarks", "02 · Benchmarks", "Numbers that hold up.",
                     "Every figure on this page comes from the repository's reports. The test set was held out from the start and never touched during training or tuning.",
                     '<div class="kv rv rv-d3"><div><b>96.9%</b><span>Held-out accuracy</span></div><div><b>0.950</b><span>Macro F1, test</span></div><div><b>95.61%</b><span>5-fold CV mean</span></div><div><b>2.31 ms</b><span>CPU latency per flow</span></div><div><b>1,305</b><span>Unseen test flows</span></div></div>')
    body += """
<section class="sec"><div class="wrap split">
  <div><div class="eyebrow">Model selection</div><h2 class="h-m rv">Five-fold stratified cross-validation.</h2><p class="lead rv rv-d1" style="font-size:18px">7,389 flows (train plus validation), with the 15%% test split kept out. LightGBM won on accuracy, F1 and latency together.</p></div>
  <div class="table-wrap rv"><table class="data-table"><thead><tr><th>Classifier</th><th class="num">Accuracy</th><th class="num">Macro F1</th><th class="num">Fit time</th><th class="num">Latency</th></tr></thead><tbody>%s</tbody></table></div>
</div></section>

<section class="sec" id="per-class" style="padding-top:0"><div class="wrap split">
  <div><div class="eyebrow">Held-out test · 1,305 flows</div><h2 class="h-m rv">Per-class F1.</h2><p class="lead rv rv-d1" style="font-size:18px">VoIP is nearly perfect because its 20 ms cadence is unmistakable. Streaming is the honest weak spot, explained in its own report.</p></div>
  <div><div class="f1bars rv" data-fill>%s</div>
  <div class="table-wrap mt-m rv"><table class="data-table"><thead><tr><th>Class</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">F1</th><th class="num">Support</th></tr></thead><tbody>%s
  <tr class="best"><td>Accuracy</td><td class="num"></td><td class="num"></td><td class="num">0.969</td><td class="num">1305</td></tr></tbody></table></div></div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="fig-head"><div><div class="eyebrow">Sample captures · live model output</div><h2 class="h-m rv">The four PCAPs in the repo.</h2></div><a class="btn ghost" href="analyze.html">Run them yourself <span class="arr">→</span></a></div>
  <div class="table-wrap rv"><table class="data-table"><thead><tr><th>Capture</th><th>Generated as</th><th>Model says</th><th class="num">Confidence</th><th>README reports</th><th>Result</th></tr></thead><tbody>%s</tbody></table></div>
  <p class="mono mute mt-s">Produced by models/best_model.pkl on data/sample_pcaps at build time. These synthetic captures are short single flows, so they are a smoke test, not the benchmark; the README's figures for them could not be reproduced with the committed model. See <a class="mag" href="%sreal_world_pcap_evaluation.md" target="_blank" rel="noopener">real_world_pcap_evaluation.md</a>.</p>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="fig-head"><div><div class="eyebrow">Against the field</div><h2 class="h-m rv">Approach comparison.</h2></div></div>
  %s
</div></section>

<section class="sec" style="padding-top:0" id="charts"><div class="wrap">
  <div class="fig-head"><div><div class="eyebrow">reports/plots</div><h2 class="h-m rv">The charts, straight from the repo.</h2></div></div>
  <div class="gallery">%s</div>
</div></section>
""" % (cv_rows, bars, pc_rows, pcap_rows, REP, cmp_table(), "".join(
        '<figure class="shot rv"><a href="%splots/%s" target="_blank" rel="noopener"><img src="%splots/%s" alt="%s chart from the repository" loading="lazy"></a><figcaption><span>Fig. %02d · %s</span><span>%s</span></figcaption></figure>' % (REP, f, REP, f, t, i + 1, t, f)
        for i, (f, t) in enumerate([("results_dashboard.png", "Results dashboard"), ("confusion_matrix.png", "Confusion matrix"), ("cv_comparison.png", "Cross-validation comparison"),
                                    ("feature_importance.png", "Feature importance"), ("per_class_f1.png", "Per-class F1"), ("model_comparison.png", "Model comparison"),
                                    ("class_distribution.png", "Class distribution"), ("streaming_vs_browsing.png", "Streaming vs browsing"),
                                    ("top_features_by_class.png", "Top features by class"), ("correlation_heatmap.png", "Feature correlation"), ("data_overview.png", "Data overview")])))
    body += closing()
    write("benchmarks.html", "Benchmarks · MetaFlow", "Cross-validation, held-out test and real-world PCAP results for MetaFlow.", "benchmarks.html", body)


# ------------------------------------------------------------------ capabilities
CAP_BODY = {
    "capability-pcap-ingestion.html": """
<h2>From capture file to flows</h2>
<p><code>src/pcap_extractor.py</code> reads standard <code>.pcap</code> and <code>.pcapng</code> files with Scapy. It needs no proprietary tools and no decryption keys.</p>
<ul><li>Extracts IPv4 and IPv6 network headers and TCP and UDP transport ports.</li><li>Discards payload bytes as packets are read, so they never reach memory beyond the parser.</li><li>Builds bidirectional flows on a canonical key: <code>(IP_min, IP_max, Port_min, Port_max, Protocol)</code>.</li><li>Tracks the initiator so every packet is labelled forward (client to server) or backward (server to client).</li></ul>
<h2>Built to survive bad input</h2>
<p>The test suite covers empty and corrupt captures, so a truncated file returns a clean error instead of a crash.</p>
%s
<h2>Four captures included</h2>
<p><code>data/sample_pcaps/</code> ships ground-truth captures for browsing, VoIP, streaming and file transfer, generated by <code>src/generate_sample_pcaps.py</code>, so you can test without capturing anything yourself.</p>
""" % code('<span class="c"># classify a raw capture directly</span>\npython src/predict.py --pcap data/sample_pcaps/voip_call.pcap --threshold 0.5'),
    "capability-timing-features.html": """
<h2>Why timing works</h2>
<p>Encryption changes the bytes but not the cadence. A voice codec has to send a frame every 20 ms. A bulk upload has to saturate the link. A person reading a page leaves an idle gap. These rhythms survive TLS 1.3 and QUIC, and they are hard to fake without breaking the application.</p>
<h2>The 23 features</h2>
<p>Computed per flow over a 15 second window, with a 5.0 s threshold separating active bursts from idle periods.</p>
<div class="feat-grid mt-s">%s</div>
<h2>No leakage</h2>
<p>The <code>StandardScaler</code> was fitted on the training split only and saved as <code>models/scaler.pkl</code>. Validation, test and live flows are transformed with it but never fitted.</p>
""" % "".join('<div class="feat"><span class="grp">%s</span><code>%s</code><span>%s</span></div>' % (g, n, d) for n, d, g in FEATURES),
    "capability-lightgbm.html": """
<h2>Chosen on the evidence</h2>
<p>Random Forest, XGBoost and LightGBM were compared with five-fold stratified cross-validation on 7,389 flows. LightGBM gave the best accuracy (95.61%% ± 0.57%%), the best macro F1 (0.9268) and the lowest latency (2.31 ms per flow).</p>
<div class="kv"><div><b>96.9%%</b><span>Held-out accuracy</span></div><div><b>0.950</b><span>Macro F1</span></div><div><b>400+</b><span>Flows a second</span></div></div>
<h2>Tuned, then frozen</h2>
<p><code>src/tune.py</code> runs a randomized hyperparameter search. The winning settings are stored in <code>models/best_params.json</code> and the trained model in <code>models/best_model.pkl</code>.</p>
<h2>More than a label</h2>
<p>Every prediction returns the top class and the full probability distribution. The top three candidates feed the explanation layer and the unknown-traffic check.</p>
%s
""" % code('<span class="c"># batch-classify pre-extracted flows</span>\npython src/predict.py --input data/processed/sample_raw_flows.csv --output predictions.csv'),
    "capability-explainable-ai.html": """
<h2>A reason for every verdict</h2>
<p><code>src/llm_explainer.py</code> turns each prediction into networking evidence: the inter-arrival pattern, the burst structure and the direction balance that drove the call.</p>
<h2>Three tiers, always available</h2>
<ul><li><b>Tier 1, local Ollama.</b> Mistral 7B or Phi-3 served at <code>http://localhost:11434</code>, fully offline.</li><li><b>Tier 2, cloud LLM.</b> Groq or OpenAI when a key is set in <code>.env</code>.</li><li><b>Tier 3, rule engine.</b> A deterministic, dependency-free engine built on empirical transport profiles. It always answers, even without internet.</li></ul>
<p>The router picks the best tier available, so a demo or a production box with no network still gets explanations.</p>
<h2>What an explanation looks like</h2>
<p>This is the explainer's real output for <code>data/sample_pcaps/voip_call.pcap</code>, produced by the %s tier:</p>
<div class="code"><pre style="margin:0;white-space:pre-wrap"><span class="k">%s</span> · %.2f%%
%s</pre></div>
<p>Try any capture on the <a href="analyze.html">Analyze page</a> to see its explanation.</p>
""" % (_html.escape(top("voip_call.pcap")[2]["explainer"].replace("_", " ")), top("voip_call.pcap")[0], top("voip_call.pcap")[1], _html.escape(top("voip_call.pcap")[2]["explanation"])),
    "capability-unknown-detection.html": """
<h2>Saying "I am not sure"</h2>
<p>A classifier trained on seven classes will happily force an eighth protocol into one of them. MetaFlow does not. Set a confidence threshold, and any flow whose top probability falls below it is labelled <code>Uncertain (Unknown Traffic)</code>.</p>
<h2>Where to set it</h2>
<ul><li>On the command line with <code>--threshold</code>.</li><li>In the Streamlit dashboard with the threshold slider.</li></ul>
%s
<h2>Why it matters</h2>
<p>Novel protocols, tunnels and anomalies land in a triage queue instead of skewing your traffic statistics. Try it on the <a href="analyze.html">Analyze page</a>: the model's top guess for <code>file_transfer.pcap</code> is %s at only %.1f%%, so any threshold above %.2f flags it as unknown instead of forcing a label.</p>
""" % (code('python src/predict.py --pcap capture.pcapng --threshold 0.7'), top("file_transfer.pcap")[0], top("file_transfer.pcap")[1], top("file_transfer.pcap")[1] / 100),
}


def capabilities():
    rows = "".join("""<a class="way rv" href="%s"><span class="n">%s</span><h3>%s</h3><p>%s</p><span class="go">→</span></a>""" % (c["slug"], c["n"], c["name"], c["short"]) for c in CAPS)
    tiles = "".join("""<a class="tile rv rv-d%d" href="%s"><span class="n">%s</span><span class="go">→</span><div class="obj-slot">%s</div><h3>%s</h3></a>""" % (i % 4 + 1, c["slug"], c["n"], obj(c["obj"]), c["name"]) for i, c in enumerate(CAPS))
    body = page_hero("Capabilities", "03 · Capabilities", "Five parts. One pipeline.",
                     "MetaFlow is a chain of small, testable pieces, from raw capture to an explained verdict. Each one can be used on its own.")
    body += '<section class="sec-tight"><div class="wrap"><div class="tiles">%s</div></div></section>' % tiles
    body += '<section class="sec" style="padding-top:20px"><div class="wrap"><div class="ways">%s</div></div></section>' % rows
    body += closing()
    write("capabilities.html", "Capabilities · MetaFlow", "The five capabilities of MetaFlow: PCAP ingestion, timing features, LightGBM, explainable AI and unknown detection.", "capabilities.html", body)

    for i, c in enumerate(CAPS):
        nxt = CAPS[(i + 1) % len(CAPS)]
        hero = """<section class="page-hero"><div class="wrap cap-hero">
  <div><div class="crumbs"><a href="index.html">MetaFlow</a><span>/</span><a href="capabilities.html">Capabilities</a><span>/</span><span>%s</span></div>
  <div class="eyebrow rv">%s · Capability</div><h1 class="h-xl rv rv-d1">%s</h1><p class="lead rv rv-d2">%s</p></div>
  <div class="cap-obj rv rv-d2">%s</div>
</div></section>""" % (c["name"], c["n"], c["name"], c["line"], obj(c["obj"]))
        body = hero + """<section class="sec"><div class="wrap split">
  <div><div class="eyebrow">In short</div><p class="lead" style="font-size:20px">%s</p><a class="btn ghost mt-s" href="get-started.html">Run it <span class="arr">→</span></a></div>
  <div class="prose rv">%s</div>
</div></section>
<div class="wrap"><div class="next-cap"><span class="mono mute">Next · %s</span><a href="%s">%s →</a></div></div>""" % (c["short"], CAP_BODY[c["slug"]], nxt["n"], nxt["slug"], nxt["name"])
        write(c["slug"], "%s · MetaFlow" % c["name"], c["line"], "capabilities.html", body)


# ------------------------------------------------------------------ project
def project():
    tree = """<span class="d">encrypted-traffic-classifier/</span>
├── <span class="d">.github/workflows/</span>ci.yml        <span class="c"># GitHub Actions CI</span>
├── <span class="d">.streamlit/</span>config.toml         <span class="c"># dashboard theme</span>
├── <span class="d">data/</span>
│   ├── <span class="d">processed/</span>                   <span class="c"># scaled train / val / test splits, label map</span>
│   └── <span class="d">sample_pcaps/</span>                <span class="c"># browsing, voip, streaming, file transfer</span>
├── <span class="d">models/</span>                         <span class="c"># best_model.pkl, scaler.pkl, best_params.json</span>
├── <span class="d">reports/</span>                        <span class="c"># metrics, plots, evaluations, demo video</span>
├── <span class="d">src/</span>
│   ├── pcap_extractor.py           <span class="c"># 5-tuple flows + 23 features</span>
│   ├── prepare_data.py             <span class="c"># ARFF cleaning, dedupe, scaling</span>
│   ├── train.py · tune.py          <span class="c"># training and hyperparameter search</span>
│   ├── cross_validate.py           <span class="c"># 5-fold stratified CV</span>
│   ├── predict.py                  <span class="c"># CLI inference: PCAP or CSV</span>
│   └── llm_explainer.py            <span class="c"># 3-tier explanation layer</span>
├── <span class="d">tests/</span>                          <span class="c"># 32 tests: e2e, pcap, predict, explainer, UI</span>
├── app.py                          <span class="c"># Streamlit dashboard</span>
├── Dockerfile · docker-compose.yml
└── requirements.txt"""
    stack = [("Python 3.11", "Language"), ("Scapy", "Packet parsing"), ("LightGBM", "Classifier"), ("scikit-learn", "Scaling and CV"),
             ("XGBoost", "Baseline"), ("Streamlit", "Dashboard"), ("Ollama · Groq · OpenAI", "Explanations"), ("pytest", "32 tests"),
             ("Docker", "Deployment"), ("GitHub Actions", "CI")]
    body = page_hero("Project", "05 · Project", "Privacy is the architecture.",
                     "MetaFlow is the landing name for encrypted-traffic-classifier, an open-source framework that classifies encrypted network flows from timing statistics alone, and explains why.")
    body += """
<section class="sec"><div class="wrap split">
  <div><div class="eyebrow">The problem</div><h2 class="h-m rv">Encryption won. Visibility didn't have to lose.</h2></div>
  <div class="prose rv rv-d1">
    <p>Most traffic now travels over TLS 1.3 or QUIC. Deep packet inspection needs decryption keys, breaks privacy law and costs heavy hardware. Port-based rules fail because nearly everything shares port 443. Deep learning works but needs GPUs and explains nothing.</p>
    <p>MetaFlow takes a different route. It treats each flow as a rhythm of packets moving in two directions and learns which rhythm belongs to which application, using 23 timing features, a LightGBM model and an explanation layer that speaks networking.</p>
  </div>
</div></section>

<section class="sec dark"><div class="wrap">
  <div class="eyebrow">Dataset</div>
  <h2 class="h-l rv" style="margin-bottom:50px">ISCX VPN-NonVPN 2016.</h2>
  <div class="stats">
    <div class="stat rv"><b data-count="8965">0</b><span>Raw flows loaded (Scenario A2, 15 s, non-VPN)</span></div>
    <div class="stat rv"><b data-count="271">0</b><span>Exact duplicates and invalid rows removed</span></div>
    <div class="stat hot rv"><b data-count="8694">0</b><span>Clean flows used</span></div>
    <div class="stat rv"><b>70/15/15</b><span>Stratified train, validation, test</span></div>
    <div class="stat rv"><b data-count="6085">0</b><span>Training flows</span></div>
    <div class="stat rv"><b data-count="1304">0</b><span>Validation flows</span></div>
    <div class="stat rv"><b data-count="1305">0</b><span>Test flows, never seen in training</span></div>
    <div class="stat rv"><b data-count="7">0</b><span>Application classes</span></div>
  </div>
</div></section>

<section class="sec"><div class="wrap split">
  <div><div class="eyebrow">Repository</div><h2 class="h-m rv">Everything in one place.</h2><p class="lead rv rv-d1" style="font-size:18px">Data, trained models, reports and a 1080p demo all ship with the code, so the results can be reproduced.</p><a class="btn ghost mt-s" href="%s" target="_blank" rel="noopener">Browse the code ↗</a></div>
  <div class="tree rv">%s</div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="eyebrow">Stack</div>
  <div class="kv">%s</div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap split">
  <div><div class="eyebrow">Principles</div><h2 class="h-m rv">What we would not compromise.</h2></div>
  <div class="ways">
    <div class="way"><span class="n">i</span><h3>No payload</h3><p>If a feature needs payload, it does not ship.</p><span></span></div>
    <div class="way"><span class="n">ii</span><h3>No leakage</h3><p>Scaler fitted on train only. Test set held out from the start.</p><span></span></div>
    <div class="way"><span class="n">iii</span><h3>No black box</h3><p>Every verdict carries a reason a network engineer can check.</p><span></span></div>
    <div class="way"><span class="n">iv</span><h3>No forced guesses</h3><p>Low confidence becomes "unknown", not a wrong label.</p><span></span></div>
  </div>
</div></section>
""" % (REPO, tree, "".join('<div><b style="font-size:22px;letter-spacing:-.03em">%s</b><span>%s</span></div>' % s for s in stack))
    body += closing()
    write("project.html", "Project · MetaFlow", "About MetaFlow: the problem, the ISCX dataset, the repository and the principles behind it.", "project.html", body)


# ------------------------------------------------------------------ demo
def demo():
    def verdict(n):
        c, p, f = top(n)
        return "%s · %.2f%% · %d packets · model output" % (c, p, f.get("packet_count", 0))
    chs = [("voip", "01", "voip_call.pcap", "VoIP call", "A strict 20 ms cadence in both directions. The clearest rhythm in the dataset.", verdict("voip_call.pcap")),
           ("browsing", "02", "browsing_https.pcap", "HTTPS browsing", "A handshake, asset bursts and reading pauses. The model leans to Chat on this short synthetic capture.", verdict("browsing_https.pcap")),
           ("file", "03", "file_transfer.pcap", "File transfer", "Bulk packets one way, ACKs the other. Confidence is low, which is exactly what the threshold is for.", verdict("file_transfer.pcap")),
           ("streaming", "04", "streaming_video.pcap", "Video streaming", "Buffered chunks every few seconds. Inside a 15 s window these resemble page loads, the documented weak spot.", verdict("streaming_video.pcap"))]
    chapters = "".join('<button class="chapter" data-chapter="%s" data-title="%s" data-text="%s" data-conf="%s" aria-pressed="false"><span class="mono">Chapter %s</span><b>%s</b></button>' % (k, t, _html.escape(x), _html.escape(c), n, h) for k, n, h, t, x, c in chs)
    walk = os.path.isfile(os.path.join(ROOT, "media", "metaflow_walkthrough.mp4"))
    body = page_hero("Demo", "06 · Demo", "Watch it listen.",
                     "A walk-through of the Streamlit dashboard: ingestion, batch inference, the live parameter simulator and the benchmark reports.")
    body += """
<section class="sec"><div class="wrap">
  <div class="video-frame rv"><canvas id="demoCanvas" data-rhythm="voip" data-labels></canvas>
    <div class="overlay">
      <div class="row-between"><span class="pill ok">live rhythm</span><span class="mono" style="color:rgba(255,255,255,.6)">Streamlit · localhost:8501</span></div>
      <div><p class="mono" style="color:rgba(255,255,255,.55);margin:0 0 6px">Now classifying</p><h2 class="h-m" data-demo-title></h2><p style="max-width:56ch;color:rgba(255,255,255,.72);margin:10px 0 0" data-demo-text></p><p class="mono" style="color:#ff7ac0;margin:12px 0 0" data-demo-conf></p></div>
    </div>
  </div>
  <div class="chapters">%s</div>
  <div class="fig-cap"><span>Rhythm preview per class · verdicts are the model's output on data/sample_pcaps</span><a href="analyze.html">Run them live →</a></div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="fig-head"><div><div class="eyebrow">Videos</div><h2 class="h-m rv">Watch the real thing.</h2></div></div>
  <div class="videos">
    %s
    <figure class="shot rv rv-d1"><video controls preload="metadata" src="%sencrypted_traffic_classifier_demo.mp4"></video><figcaption><span>Project demo · Streamlit dashboard</span><span>reports/encrypted_traffic_classifier_demo.mp4</span></figcaption></figure>
  </div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap split">
  <div><div class="eyebrow">Run it yourself</div><h2 class="h-m rv">The same dashboard, on your machine.</h2><p class="lead rv rv-d1" style="font-size:18px">One command starts it locally. Docker exposes it on port 8501.</p></div>
  <div class="rv">%s<div class="mt-s"></div>%s</div>
</div></section>
""" % (chapters,
       ('<figure class="shot rv"><video controls preload="metadata" src="media/metaflow_walkthrough.mp4"></video><figcaption><span>MetaFlow walkthrough · every page and the live model</span><span>web/media/metaflow_walkthrough.mp4</span></figcaption></figure>' if walk else ""),
       REP, code("streamlit run app.py"), code("docker run -p 8501:8501 encrypted-traffic-classifier"))
    body += analyzer()
    write("demo.html", "Demo · MetaFlow", "Watch MetaFlow classify VoIP, browsing, file transfer and streaming captures.", "demo.html", body, snapshot=True)


# ------------------------------------------------------------------ reports
def reports():
    items = [
        ("analysis", "Evaluation", "Real-world PCAP evaluation", "Four standalone captures, confidences and the reasoning behind each call.", "reports/real_world_pcap_evaluation.md", "MD"),
        ("analysis", "Validation", "Session validation analysis", "Session-based splits and a check for leakage between train and test.", "reports/session_validation_analysis.md", "MD"),
        ("analysis", "Diagnostics", "Streaming vs browsing", "Why buffered video and page loads look alike in a 15 s window, and what helps.", "reports/streaming_vs_browsing_analysis.md", "MD"),
        ("data", "Metrics", "metrics.json", "Machine-readable accuracy, F1 and latency figures.", "reports/metrics.json", "JSON"),
        ("data", "Cross-validation", "cv_results.csv", "Five-fold summary across Random Forest, XGBoost and LightGBM.", "reports/cv_results.csv", "CSV"),
        ("data", "Cross-validation", "cv_fold_details.csv", "Per-fold scores for every candidate model.", "reports/cv_fold_details.csv", "CSV"),
        ("data", "Tuning", "tuning_results.csv", "Randomized hyperparameter search results.", "reports/tuning_results.csv", "CSV"),
        ("data", "Test", "test_classification_report.txt", "Precision, recall and F1 per class on 1,305 held-out flows.", "reports/test_classification_report.txt", "TXT"),
        ("docs", "Report", "Project report", "The full technical write-up of the project.", "reports/Encrypted_Traffic_Classifier_Project_Report.docx", "DOCX"),
        ("docs", "Guide", "Comprehensive guide for non-tech and dev readers", "One document with a plain-language track and an engineering track.", "reports/Encrypted_Traffic_Classifier_Comprehensive_Guide_NonTech_and_Dev.docx", "DOCX"),
        ("docs", "Guide", "Simple explanation and demo guide", "A short explainer and a step-by-step demo script.", "reports/Simple_Project_Explanation_and_College_Demo_Guide.docx", "DOCX"),
        ("docs", "Video", "1080p demo video", "The full dashboard walk-through.", "reports/encrypted_traffic_classifier_demo.mp4", "MP4"),
    ]
    rows = "".join('<a class="report" data-kind="%s" href="%s%s" target="_blank" rel="noopener"><span class="d">%s</span><div><h3>%s</h3><p>%s</p></div><span class="k">%s</span><span>↗</span></a>' % (k, BLOB, p, d, t, x, f) for k, d, t, x, p, f in items)
    rows += ('<a class="report" data-kind="docs" href="media/metaflow_walkthrough.mp4" target="_blank" rel="noopener"><span class="d">Video</span><div><h3>MetaFlow site walkthrough</h3>'
             '<p>Every page of this site, the live analyzer on the repo\'s captures, and the Streamlit app.</p></div><span class="k">MP4</span><span>↗</span></a>')
    rows += ('<a class="report" data-kind="data" href="data/snapshot.json" target="_blank" rel="noopener"><span class="d">Snapshot</span><div><h3>snapshot.json</h3>'
             '<p>The model\'s output on every sample capture and the bundled flow CSV, captured when this site was built.</p></div><span class="k">JSON</span><span>↗</span></a>')
    body = page_hero("Reports", "07 · Reports", "Show your work.",
                     "Evaluations, raw metrics and long-form documents, straight from the repository's reports folder.")
    body += """<section class="sec"><div class="wrap">
  <div class="filters" role="group" aria-label="Filter reports">
    <button class="chip" data-filter="all" aria-pressed="true">All</button><button class="chip" data-filter="analysis" aria-pressed="false">Analyses</button>
    <button class="chip" data-filter="data" aria-pressed="false">Data</button><button class="chip" data-filter="docs" aria-pressed="false">Documents</button>
  </div>
  <div class="reports">%s</div>
</div></section>""" % rows
    body += closing()
    write("reports.html", "Reports · MetaFlow", "Evaluations, metrics and documents for MetaFlow.", "reports.html", body)


# ------------------------------------------------------------------ get started
def get_started():
    body = page_hero("Get started", "08 · Get started", "Up in a minute.",
                     "Python 3.11 and pip are all you need. Docker is optional.")
    body += """<section class="sec"><div class="wrap split">
  <div><div class="eyebrow">Quickstart</div><h2 class="h-m">Five steps.</h2><p class="lead" style="font-size:18px">Every command below comes from the README and runs exactly as written.</p></div>
  <div class="prose">
    <h2 id="install" style="margin-top:0">1. Install</h2>%s
    <h2 id="dashboard">2. Open the dashboard</h2><p>PCAP upload, batch inference, the live parameter simulator and the benchmark reports.</p>%s
    <h2 id="cli">3. Use the command line</h2><p>Classify a raw capture directly:</p>%s<p>Or classify flows you have already extracted:</p>%s
    <h2 id="tests">4. Run the tests</h2><p>32 tests cover PCAP extraction, empty and corrupt captures, the Streamlit UI, predictions and explainer fallbacks.</p>%s
    <h2 id="docker">5. Deploy with Docker</h2>%s
    <h2 id="site">6. Run this site with the live model</h2><p>The MetaFlow site lives in <code>web/</code>. Its server serves the pages and an API backed by the same <code>predict_pcap</code>, <code>predict_flows</code> and <code>explain_flow</code> functions the CLI uses.</p>%s
    <p>Then open <code>http://127.0.0.1:8600</code>. API routes: <code>/api/health</code>, <code>/api/metrics</code>, <code>/api/classify?sample=voip_call.pcap&amp;threshold=0.5</code>, <code>POST /api/classify</code> with a capture as the body, and <code>/api/batch</code>. After changing copy, rebuild with <code>python web/build.py</code>.</p>
    <h3>Optional: better explanations</h3><p>Run Ollama locally with Mistral or Phi-3, or add a Groq or OpenAI key to <code>.env</code> (copy <code>.env.example</code>). Without either, the built-in rule engine still explains every verdict.</p>
  </div>
</div></section>

<section class="sec" id="contact" style="background:var(--bg-2)"><div class="wrap split">
  <div><div class="eyebrow">Say hello</div><h2 class="h-l">Questions, ideas, bugs.</h2><p class="lead" style="font-size:18px">The fastest route is a GitHub issue. This form is a local preview and sends nothing.</p>
    <div class="hero-ctas mt-s"><a class="btn" href="%sissues/new" target="_blank" rel="noopener">Open an issue ↗</a><a class="btn ghost" href="%s" target="_blank" rel="noopener">Repository ↗</a></div></div>
  <form class="form" data-form>
    <label>Name<input name="name" autocomplete="name" required></label>
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <label>Topic<select name="topic"><option>Using MetaFlow</option><option>Bug report</option><option>Dataset or model</option><option>Something else</option></select></label>
    <label>Message<textarea name="msg" rows="5" required></textarea></label>
    <button class="btn" type="submit">Send <span class="arr">→</span></button>
    <div class="form-ok" role="status"></div>
  </form>
</div></section>
""" % (code("git clone %s.git\ncd encrypted-traffic-classifier\npip install -r requirements.txt" % REPO),
       code("streamlit run app.py"),
       code("python src/predict.py --pcap data/sample_pcaps/voip_call.pcap --threshold 0.5"),
       code("python src/predict.py --input data/processed/sample_raw_flows.csv --output predictions.csv"),
       code("pytest -v"),
       code('<span class="c"># build and run</span>\ndocker build -t encrypted-traffic-classifier .\ndocker run -p 8501:8501 encrypted-traffic-classifier\n\n<span class="c"># or</span>\ndocker-compose up -d'),
       code("python web/server.py"),
       REPO + "/", REPO)
    body += faq_block()
    write("get-started.html", "Get started · MetaFlow", "Install MetaFlow, run the dashboard and CLI, test it and deploy it with Docker.", "get-started.html", body)


# ------------------------------------------------------------------ design system
def system():
    sw = [("Ink", "#0c0c0e"), ("Paper", "#fbfaf7"), ("Bone", "#f3f2ee"), ("Ash", "#e9e7e1"), ("Magenta", "#ff2d8a"), ("Blush", "#ff7ac0"), ("Violet", "#6c3bff"), ("Signal green", "#19b77a")]
    swh = "".join('<div class="sw"><i style="background:%s"></i><div>%s<code>%s</code></div></div>' % (c, n, c) for n, c in sw)
    objs = "".join('<div class="tile" style="min-height:220px"><span class="n">%s</span><div class="obj-slot">%s</div><h3>%s</h3></div>' % (c["n"], obj(c["obj"]), c["obj"].title()) for c in CAPS)
    body = page_hero("Design system", "Design system", "The parts list.",
                     "Colour, type, objects and components used across this site.")
    body += """<section class="sec"><div class="wrap">
  <div class="eyebrow">Logo</div>
  <div class="kv"><div style="display:grid;place-items:center;padding:40px">%s</div><div class="dark" style="display:grid;place-items:center;padding:40px;border-radius:18px"><span class="logo">%s<span class="logo-word" style="color:#fff">Meta<b>Flow</b></span></span></div>
  <div style="padding:26px"><b style="font-size:22px">The mark</b><span>An M drawn as one continuous flow line over three packets. The gradient runs from blush through magenta to violet.</span></div></div>

  <div class="eyebrow mt-l">Colour</div><div class="swatches">%s</div>

  <div class="eyebrow mt-l">Type · Inter Tight and JetBrains Mono</div>
  <div class="type-row"><span class="mono">Display</span><span class="h-xl" style="font-size:clamp(48px,8vw,120px)">Read the rhythm.</span></div>
  <div class="type-row"><span class="mono">Heading L</span><span class="h-l">Built for speed.</span></div>
  <div class="type-row"><span class="mono">Heading M</span><span class="h-m">Five parts. One pipeline.</span></div>
  <div class="type-row"><span class="mono">Lead</span><span class="lead" style="margin:0">Encrypted traffic, classified by timing alone.</span></div>
  <div class="type-row"><span class="mono">Mono label</span><span class="mono">Fig. 01 · Latency study</span></div>

  <div class="eyebrow mt-l">Objects</div><div class="tiles">%s</div>

  <div class="eyebrow mt-l">Buttons and pills</div>
  <div class="hero-ctas"><a class="btn" href="#">Primary <span class="arr">→</span></a><a class="btn ghost" href="#">Ghost</a><span class="pill ok">VoIP</span><span class="pill unk">Uncertain</span><button class="chip" aria-pressed="true">Chip on</button><button class="chip">Chip off</button></div>

  <div class="eyebrow mt-l">Rhythm canvas</div>
  <div class="reel-thumb" style="max-width:720px"><canvas data-rhythm="browsing" data-labels></canvas></div>
</div></section>""" % (logo_svg("s1").replace('class="logo-mark"', 'class="logo-mark" style="width:96px;height:96px"'), logo_svg("s2"), swh, objs)
    write("system.html", "Design system · MetaFlow", "Colour, type, objects and components of the MetaFlow site.", "", body)


# ------------------------------------------------------------------ legal
def legal():
    pages = [
        ("license.html", "Licence", "MIT licence.", """<p>The encrypted-traffic-classifier project, presented here as MetaFlow, is released under the MIT licence.</p>
<p>You may use, copy, modify, merge, publish, distribute, sublicense and sell copies of the software, provided the copyright notice and permission notice are included in all copies or substantial portions of it.</p>
<p>The software is provided "as is", without warranty of any kind, express or implied. See the <a href="%sLICENSE" target="_blank" rel="noopener">LICENSE file</a> in the repository for the full text.</p>
<h2>Dataset</h2><p>Training data comes from the ISCX VPN-NonVPN 2016 dataset published by the Canadian Institute for Cybersecurity, University of New Brunswick. Check its terms before redistributing it.</p>""" % BLOB),
        ("privacy.html", "Privacy", "Nothing about you is collected.", """<h2>This website</h2><p>This site sets no cookies, loads no analytics and sends no forms anywhere. The contact form is a local preview. One value in your browser's local storage remembers that you closed the privacy notice. Fonts load from Google Fonts.</p>
<h2>The classifier</h2><p>MetaFlow is built so that privacy does not depend on policy. It reads packet headers to build flows, discards payload bytes as they are parsed, and computes timing statistics only. No content, credentials or personal data reach the model.</p>
<p>When the optional cloud explanation tier is enabled, only the predicted class, its probabilities and the timing features are sent to the provider you configure. Leave the key unset to keep everything local.</p>"""),
        ("security.html", "Security", "Reporting a problem.", """<p>If you find a vulnerability in the code, please open a private security advisory on the <a href="%s/security" target="_blank" rel="noopener">repository's security page</a> rather than a public issue.</p>
<h2>Design notes</h2><ul><li>No decryption keys are required or stored.</li><li>Capture files are parsed defensively. Empty and corrupt captures are covered by tests.</li><li>Model artefacts are pickles. Only load <code>.pkl</code> files you trust.</li></ul>""" % REPO),
    ]
    for slug, crumb, title, content in pages:
        body = page_hero(crumb, "Legal", title, "") + '<section class="sec" style="padding-top:50px"><div class="wrap"><div class="prose">%s</div></div></section>' % content
        write(slug, "%s · MetaFlow" % crumb, title, "", body)


# ------------------------------------------------------------------ analyze (live)
KIND = {"voip_call.pcap": "voip", "browsing_https.pcap": "browsing", "file_transfer.pcap": "file", "streaming_video.pcap": "streaming"}
BLURB = {"voip_call.pcap": "A UDP voice call with RTP-style 20 ms framing.",
         "browsing_https.pcap": "An HTTPS page load: handshake, asset bursts, reading pauses.",
         "file_transfer.pcap": "A bulk TCP download saturating the link.",
         "streaming_video.pcap": "Video playback fetching buffered chunks."}


def analyze():
    sizes = {s["name"]: s["bytes"] for s in SNAP["health"]["samples"]}
    cards = "".join("""<article class="scard rv rv-d%d"><div class="card-vis"><canvas data-rhythm="%s" data-speed="%s" data-nogrid></canvas><span class="tag">%s KB</span></div>
  <div class="card-body"><h3>%s</h3><p>%s</p>
  <div class="scard-row"><button class="btn sm" data-run="%s">Classify <span class="arr">→</span></button><a class="btn sm ghost" href="%s%s" download>Download</a></div></div></article>"""
                    % (i + 1, KIND[n], "0.6" if KIND[n] in ("voip", "file") else "1", round(sizes.get(n, 0) / 1024), n, BLURB[n], n, PCAPS, n) for i, n in enumerate(SAMPLE_ORDER))
    body = page_hero("Analyze", "04 · Analyze", "Run the real model.",
                     "Classify the captures that ship in data/sample_pcaps, drop in your own .pcap, or batch-score the bundled flow CSV. Every number on this page comes from models/best_model.pkl.",
                     '<div class="an-status rv rv-d3"><span class="pill ok" data-mode-pill>snapshot</span><span class="mono mute" data-mode-text>Checking for the local MetaFlow server…</span></div>')
    body += """
<section class="sec-tight an-bar-wrap"><div class="wrap">
  <div class="an-bar">
    <label class="thresh"><span><b>Confidence threshold</b> <span class="mute">· flows below it become "Unknown"</span></span><input type="range" min="0" max="0.95" step="0.05" value="0.5" data-an-threshold aria-label="Confidence threshold"><output data-an-threshold-out>0.50</output></label>
  </div>
</div></section>

<section class="sec-tight" style="padding-top:10px"><div class="wrap">
  <div class="row-between" style="margin-bottom:22px"><div><div class="eyebrow" style="margin-bottom:8px">data/sample_pcaps</div><h2 class="h-m">Sample captures</h2></div><button class="btn ghost sm" data-run-all>Classify all four <span class="arr">→</span></button></div>
  <div class="samples">%s</div>

  <label class="drop mt-m" data-drop>
    <input type="file" accept=".pcap,.pcapng,.cap" data-upload>
    <span class="drop-ico" aria-hidden="true">⇪</span>
    <span><b>Drop your own capture here</b> or click to choose a file</span>
    <span class="mono mute" data-drop-note>.pcap, .pcapng or .cap · up to 50 MB · parsed locally, payload discarded</span>
  </label>
</div></section>

<section class="sec-tight" id="results"><div class="wrap">
  <div class="eyebrow">Results</div>
  <div class="results" data-results aria-live="polite"><p class="mute empty">Pick a capture above. Each flow shows its 5-tuple, the verdict, all seven class probabilities, the explanation and the 23 timing features it was judged on.</p></div>
</div></section>

<section class="sec" id="batch" style="background:var(--bg-2)"><div class="wrap">
  <div class="row-between" style="margin-bottom:24px"><div><div class="eyebrow" style="margin-bottom:8px">data/processed/sample_raw_flows.csv</div><h2 class="h-m">Batch inference</h2><p class="lead" style="font-size:18px;margin-top:10px">Ten pre-extracted flows, scored in one call to <code>predict_flows()</code>.</p></div>
  <button class="btn" data-batch>Classify the CSV <span class="arr">→</span></button></div>
  <div data-batch-out></div>
</div></section>
""" % cards
    write("analyze.html", "Analyze · MetaFlow", "Run MetaFlow's real model on the repository's sample captures, your own PCAP, or the bundled flow CSV.", "analyze.html", body, snapshot=True)


def not_found():
    body = page_hero("404", "404", "Lost packet.", "That page isn't here. It may have been dropped somewhere between client and server.",
                     '<div class="hero-ctas mt-m"><a class="btn" href="index.html">Back home <span class="arr">→</span></a><a class="btn ghost" href="analyze.html">Analyze a capture</a></div>')
    write("404.html", "Not found · MetaFlow", "Page not found.", "", body)


def bundle():
    """Concatenate web/css/fx/*.css and web/js/fx/*.js (sorted) into fx.bundle.css / fx.bundle.js.
    Each JS module is isolated so one failing effect never breaks the others."""
    for kind in ("css", "js"):
        d = os.path.join(ROOT, kind, "fx")
        files = sorted(f for f in os.listdir(d) if f.endswith("." + kind)) if os.path.isdir(d) else []
        out = []
        for f in files:
            with open(os.path.join(d, f), encoding="utf-8") as fh:
                src = fh.read()
            if kind == "js" and f != "00-core.js":
                src = ";(function(){try{\n%s\n}catch(e){console.error('fx/%s', e)}})();" % (src, f)
            out.append("/* ---- fx/%s ---- */\n%s" % (f, src))
        with open(os.path.join(ROOT, kind, "fx.bundle." + kind), "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(out) + "\n")
    print("wrote fx bundles")


def thumbs():
    """Card-sized copies of reports/plots/*.png in web/media/plots/ (720 px JPEG). The animated sections show
    charts at ~300 px; uploading the 1200-2400 px originals to the GPU all at once froze integrated graphics."""
    from PIL import Image
    src = os.path.join(REPO_DIR, "reports", "plots")
    dst = os.path.join(ROOT, "media", "plots")
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith(".png"):
            continue
        out = os.path.join(dst, f[:-4] + ".jpg")
        if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(os.path.join(src, f)):
            continue
        im = Image.open(os.path.join(src, f)).convert("RGB")
        im.thumbnail((720, 720))
        im.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    print("wrote chart thumbnails")


def favicon():
    svg = logo_svg("fav").replace('class="logo-mark" ', 'xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true"', "")
    with open(os.path.join(ROOT, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    print("wrote favicon.svg")


if __name__ == "__main__":
    thumbs(); bundle(); favicon(); home(); benchmarks(); capabilities(); analyze(); project(); demo(); reports(); get_started(); system(); legal(); not_found()
