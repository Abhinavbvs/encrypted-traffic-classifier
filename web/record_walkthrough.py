"""Records the MetaFlow walkthrough video: every page, scrolled slowly, with the live model.

Needs:  pip install playwright imageio-ffmpeg  &&  python -m playwright install chromium
Run (with web/server.py on :8600 and the Streamlit app on :8502):
    python web/record_walkthrough.py
    python web/record_walkthrough.py --site http://127.0.0.1:8600 --app http://127.0.0.1:8502
Output: web/media/metaflow_walkthrough.mp4
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

WEB = Path(__file__).resolve().parent
REPO = WEB.parent
OUT = WEB / "media" / "metaflow_walkthrough.mp4"
W, H = 1920, 1080
SPEED = 260  # px per second: a slow, readable scroll

# Injected into every document: a visible cursor, a chapter caption and a smooth scroller
# that works for normal pages and for Streamlit's inner scroll container.
INIT = r"""
(() => {
  try { localStorage.setItem('mf-notice', '1'); } catch (e) {}
  const css = `
    #mf-cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(255,45,138,.25);border:2px solid #ff2d8a;z-index:2147483647;pointer-events:none;
      transition:transform .75s cubic-bezier(.2,.7,.1,1), background .2s;transform:translate(960px,560px)}
    #mf-cursor.down{background:rgba(255,45,138,.7)}
    html.has-cursor #mf-cursor{display:none!important}
    #mf-cap{position:fixed;left:24px;bottom:24px;z-index:2147483646;pointer-events:none;display:flex;gap:10px;align-items:center;
      font:500 14px/1 "JetBrains Mono",Consolas,monospace;letter-spacing:.04em;text-transform:uppercase;color:#fff;
      background:rgba(11,11,13,.86);padding:12px 16px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25);
      opacity:0;transform:translateY(10px);transition:opacity .5s, transform .5s}
    #mf-cap.on{opacity:1;transform:none}
    #mf-cap i{width:8px;height:8px;border-radius:50%;background:#ff2d8a;display:inline-block}
    #mf-title{position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;text-align:center;
      background:#0b0b0d;color:#fff;font-family:"Inter Tight",system-ui,sans-serif;transition:opacity .9s}
    #mf-title h1{font-size:112px;letter-spacing:-.06em;margin:0;font-weight:650}
    #mf-title h1 b{color:#ff2d8a;font-weight:650}
    #mf-title p{font:500 18px/1.5 "JetBrains Mono",Consolas,monospace;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.06em;margin:18px 0 0}`;
  const mount = () => {
    if (document.getElementById('mf-cursor')) return;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'mf-cursor'; document.body.appendChild(c);
    const p = document.createElement('div'); p.id = 'mf-cap'; document.body.appendChild(p);
    if (window.__mfLastXY) c.style.transform = `translate(${window.__mfLastXY[0]}px,${window.__mfLastXY[1]}px)`;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  window.__mfCaption = (t) => { mount(); const p = document.getElementById('mf-cap'); p.innerHTML = '<i></i>' + t; p.classList.add('on'); };
  window.__mfTitle = (html) => { const d = document.createElement('div'); d.id = 'mf-title'; d.innerHTML = html; document.body.appendChild(d); };
  window.__mfTitleOff = () => { const d = document.getElementById('mf-title'); if (d) { d.style.opacity = 0; setTimeout(() => d.remove(), 1000); } };
  window.__mfMove = (x, y) => { mount(); window.__mfLastXY = [x, y]; document.getElementById('mf-cursor').style.transform = `translate(${x}px,${y}px)`; };
  window.__mfPress = (on) => { const c = document.getElementById('mf-cursor'); if (c) c.classList.toggle('down', on); };

  const scroller = () => {
    const se = document.scrollingElement;
    if (se && se.scrollHeight > innerHeight + 8) return se;
    let best = null;
    for (const e of document.querySelectorAll('*')) {
      const o = getComputedStyle(e).overflowY;
      if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 40 && e.clientHeight > innerHeight * .5) {
        if (!best || e.clientHeight * e.scrollHeight > best.clientHeight * best.scrollHeight) best = e;
      }
    }
    return best || se;
  };
  // target: number (px), 'bottom', or a CSS selector; offset keeps a margin above an element
  window.__mfScroll = (target, speed, offset) => new Promise((res) => {
    document.documentElement.style.scrollBehavior = 'auto';
    const el = scroller();
    const goal = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (target === 'bottom') return max;
      if (typeof target === 'number') return Math.min(target, max);
      const t = document.querySelector(target); if (!t) return el.scrollTop;
      const base = el === document.scrollingElement ? 0 : el.getBoundingClientRect().top;
      return Math.max(0, Math.min(max, t.getBoundingClientRect().top - base + el.scrollTop - (offset || 90)));
    };
    const t0 = performance.now();
    const limit = 1000 * (Math.abs(goal() - el.scrollTop) / speed * 2.5 + 8);  // hard stop, never hang
    let last = t0, pos = el.scrollTop, stuckSince = null;
    const step = (now) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const g = goal(), dir = Math.sign(g - pos), dist = Math.abs(g - pos);
      if (dist < 1 || now - t0 > limit) { return res(); }
      const v = speed * Math.min(1, .35 + dist / 400);  // ease into the stop
      const before = el.scrollTop;
      pos += dir * Math.min(dist, v * dt); el.scrollTop = pos;
      if (Math.abs(el.scrollTop - pos) > 4) pos = el.scrollTop;  // scroller clamped us
      if (Math.abs(el.scrollTop - before) < .5) { stuckSince = stuckSince || now; if (now - stuckSince > 1200) return res(); }
      else stuckSince = null;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
})();
"""


class Tour:
    def __init__(self, page, site):
        self.p, self.site = page, site.rstrip("/")

    def wait(self, ms):
        self.p.wait_for_timeout(ms)

    def caption(self, text):
        for _ in range(5):  # survive a navigation that is still settling
            try:
                self.p.wait_for_load_state("load")
                self.p.evaluate("t => window.__mfCaption(t)", text)
                return
            except Exception:
                self.wait(700)

    def go(self, path, caption):
        self.p.goto(self.site + "/" + path if not path.startswith("http") else path, wait_until="load")
        self.wait(400)
        self.caption(caption)
        self.wait(1600)

    def scroll(self, target="bottom", speed=SPEED, offset=90, pause=1200):
        self.p.evaluate("([t, s, o]) => window.__mfScroll(t, s, o)", [target, speed, offset])
        self.wait(pause)

    def click(self, locator, pause=900):
        loc = self.p.locator(locator) if isinstance(locator, str) else locator
        loc = loc.first
        loc.scroll_into_view_if_needed()
        box = loc.bounding_box()
        if box:
            cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            self.p.evaluate("([x, y]) => window.__mfMove(x, y)", [cx, cy])
            self.p.mouse.move(cx, cy, steps=24)   # drives the site's own cursor + magnetic buttons
            self.wait(500)
            self.p.evaluate("() => window.__mfPress(true)")
        loc.click()
        self.p.evaluate("() => window.__mfPress(false)")
        self.wait(pause)

    def slider(self, selector, value, pause=800):
        loc = self.p.locator(selector).first
        box = loc.bounding_box()
        lo = float(loc.get_attribute("min") or 0)
        hi = float(loc.get_attribute("max") or 1)
        if box:
            sx, sy = box["x"] + box["width"] * (value - lo) / (hi - lo), box["y"] + box["height"] / 2
            self.p.evaluate("([x, y]) => window.__mfMove(x, y)", [sx, sy])
            self.p.mouse.move(sx, sy, steps=20)
            self.wait(600)
        self.p.evaluate("""([s, v]) => { const r = document.querySelector(s); r.value = v;
            r.dispatchEvent(new Event('input', {bubbles: true})); r.dispatchEvent(new Event('change', {bubbles: true})); }""", [selector, str(value)])
        self.wait(pause)


def metaflow(t: Tour):
    p = t.p
    # ---- 01 Home
    p.goto(t.site + "/index.html", wait_until="load")
    # the site's own loader plays first (once per session)
    try:
        p.wait_for_function("() => document.documentElement.classList.contains('mf-ld-done')", timeout=12000)
    except Exception:
        pass
    t.wait(2600)
    t.caption("01 · Home")
    # sweep the pointer across the hero so the glow and the liquid-metal object react
    for x, y in [(380, 420), (900, 300), (1300, 520), (1100, 760), (700, 560)]:
        p.mouse.move(x, y, steps=30)
        t.wait(350)
    t.wait(1500)
    # slow pass down the page: statement, flying shapes, pinned sections, services, marquee, reel, pulse, spiral...
    t.scroll("#analyzer", offset=60, speed=SPEED)
    for name in ["voip_call.pcap", "browsing_https.pcap", "streaming_video.pcap", "file_transfer.pcap"]:
        t.click('[data-chat] [data-sample="%s"]' % name, 300)
        p.wait_for_function("() => !document.querySelector('[data-chat] [data-sample]').disabled && !document.querySelector('[data-chat] .typing')", timeout=30000)
        t.wait(2600)
    t.slider("[data-chat] [data-threshold]", 0.6, 300)
    p.wait_for_function("() => !document.querySelector('[data-chat] .typing')", timeout=30000)
    t.wait(3200)
    # FAQ: open a couple of questions (counter changes)
    try:
        t.scroll(".faq", offset=160, pause=800)
        sums = p.locator(".faq summary")
        for i in (1, 2):
            t.click(sums.nth(i), 1800)
    except Exception:
        pass
    t.scroll("bottom", pause=2500)
    # menu overlay
    t.scroll(0, speed=2600, pause=600)
    t.click("[data-menu-open]", 2600)
    # the site fades out before navigating, so wait for the real navigation
    with p.expect_navigation(wait_until="load", timeout=30000):
        t.click('.menu-main a[href="benchmarks.html"]', 0)
    t.wait(600)

    # ---- 02 Benchmarks
    t.caption("02 · Benchmarks")
    t.wait(1800)
    t.scroll("bottom")

    # ---- 03 Capabilities + the five detail pages
    t.go("capabilities.html", "03 · Capabilities")
    t.scroll("bottom")
    for slug, name in [("capability-pcap-ingestion.html", "PCAP ingestion"), ("capability-timing-features.html", "Timing features"),
                       ("capability-lightgbm.html", "LightGBM classifier"), ("capability-explainable-ai.html", "Explainable AI"),
                       ("capability-unknown-detection.html", "Unknown detection")]:
        t.go(slug, "03 · Capabilities · " + name)
        t.scroll("bottom")

    # ---- 04 Analyze (live model)
    t.go("analyze.html", "04 · Analyze · live model")
    t.scroll(".an-bar-wrap", offset=120, pause=1500)
    t.click("[data-run-all]", 300)
    p.wait_for_function("() => document.querySelectorAll('[data-results] .flow').length >= 4 && !document.querySelector('[data-results] .typing')", timeout=60000)
    t.wait(1500)
    t.scroll("[data-results]", offset=100, pause=1500)
    t.click(p.locator("[data-results] .flow details summary").first, 1800)
    t.scroll("#batch", offset=140, pause=1200)
    t.scroll(".an-bar-wrap", speed=1800, offset=120, pause=800)
    t.slider("[data-an-threshold]", 0.6, 300)
    p.wait_for_function("() => document.querySelectorAll('[data-results] .flow').length >= 4 && !document.querySelector('[data-results] .typing')", timeout=60000)
    t.wait(1200)
    t.scroll("[data-results]", offset=100, pause=800)
    t.scroll("#batch", offset=140, pause=1500)
    # upload: the same path a user takes when dropping a capture
    t.scroll(".drop", offset=300, speed=1800, pause=600)
    loc = p.locator("[data-drop]")
    box = loc.bounding_box()
    p.evaluate("([x, y]) => window.__mfMove(x, y)", [box["x"] + box["width"] / 2, box["y"] + box["height"] / 2])
    t.wait(900)
    p.set_input_files("[data-upload]", str(REPO / "data" / "sample_pcaps" / "voip_call.pcap"))
    p.wait_for_function("() => document.querySelector('[data-results] .flow') && !document.querySelector('[data-results] .typing')", timeout=60000)
    t.wait(1800)
    t.scroll("[data-results]", offset=100, pause=2200)
    t.scroll("#batch", offset=60, pause=600)
    t.click("[data-batch]", 300)
    p.wait_for_function("() => document.querySelector('[data-batch-out] table')", timeout=60000)
    t.wait(1500)
    t.scroll("bottom", pause=2000)

    # ---- 05 Project
    t.go("project.html", "05 · Project")
    t.scroll("bottom")

    # ---- 06 Demo
    t.go("demo.html", "06 · Demo")
    t.scroll(".video-frame", offset=110, pause=1200)
    for k in ["browsing", "file", "streaming", "voip"]:
        t.click('[data-chapter="%s"]' % k, 2400)
    t.scroll("bottom")

    # ---- 07 Reports
    t.go("reports.html", "07 · Reports")
    for f in ["analysis", "data", "docs", "all"]:
        t.click('[data-filter="%s"]' % f, 1600)
    t.scroll("bottom")

    # ---- 08 Get started
    t.go("get-started.html", "08 · Get started")
    t.scroll("bottom")

    # ---- Design system + legal
    for slug, cap in [("system.html", "Design system"), ("license.html", "Licence"), ("privacy.html", "Privacy"), ("security.html", "Security")]:
        t.go(slug, cap)
        t.scroll("bottom")


def streamlit(t: Tour, app):
    p = t.p
    p.goto(app, wait_until="load")
    p.wait_for_selector('[data-testid="stSidebar"]', timeout=90000)
    p.wait_for_selector("text=Raw PCAP / PCAPNG Network Traffic Analyzer", timeout=90000)
    t.wait(2500)
    t.caption("Streamlit app · Home · PCAP Traffic Analyzer")
    t.wait(2500)
    # pick a bundled sample capture in the app's own selectbox
    try:
        t.click(p.locator('[data-testid="stSelectbox"]').first, 1200)
        t.click(p.get_by_role("option", name="📞 VoIP Call (UDP/RTP)"), 400)
        p.wait_for_selector("text=Extracted 5-Tuple Flows", timeout=20000)
    except Exception:
        pass
    t.wait(3000)
    try:
        t.scroll("text=Explain Flow Prediction", speed=220, offset=120, pause=800)
    except Exception:
        pass
    try:
        t.click(p.get_by_role("button", name="Generate Technical Explanation"), 300)
        p.wait_for_selector("text=Explanation", timeout=20000)
        t.wait(2500)
    except Exception:
        pass
    t.scroll("bottom", speed=220, pause=2500)
    pages = [("📊 Batch CSV Flow Inference", "Streamlit app · Batch CSV Flow Inference"),
             ("⚙️ Interactive Flow Simulator", "Streamlit app · Interactive Flow Simulator"),
             ("📈 Model Benchmark & Reports", "Streamlit app · Model Benchmark & Reports")]
    for label, cap in pages:
        t.click(p.locator('[data-testid="stSidebar"]').get_by_text(label, exact=True), 3500)
        t.caption(cap)
        if "Batch" in label:
            try:
                t.click(p.get_by_role("button", name="Load Bundled Sample Flows"), 4000)
            except Exception:
                pass
        t.wait(1500)
        t.scroll("bottom", speed=220, pause=2500)
        t.scroll(0, speed=2600, pause=600)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="http://127.0.0.1:8600")
    ap.add_argument("--app", default="http://127.0.0.1:8502")
    ap.add_argument("--no-app", action="store_true", help="skip the Streamlit part")
    a = ap.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="mf-rec-"))
    with sync_playwright() as pw:
        # GPU-backed WebGL: default headless Chrome renders WebGL in software (~2 fps on this site)
        browser = pw.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        # warm-up pass (not recorded): the GPU compiles and caches every WebGL scene once, so the recorded
        # pass doesn't show the one-time 1-2 s driver hitch when the tunnel, pulse and terrain first appear
        warm = browser.new_context(viewport={"width": W, "height": H})
        wp = warm.new_page()
        wp.add_init_script("try{sessionStorage.setItem('mf-ld','1');localStorage.setItem('mf-notice','1')}catch(e){}")
        wp.goto(a.site + "/index.html", wait_until="load")
        wp.wait_for_timeout(4000)
        hh = wp.evaluate("document.documentElement.scrollHeight")
        for y in range(0, hh, 250):   # fine steps: every 3D scene and every pulse class renders once
            wp.evaluate("y => window.scrollTo(0, y)", y)
            wp.wait_for_timeout(220)
        wp.wait_for_timeout(1500)
        warm.close()
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1,
                                  record_video_dir=str(tmp), record_video_size={"width": W, "height": H})
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        page.set_default_timeout(60000)
        t = Tour(page, a.site)
        metaflow(t)
        if not a.no_app:
            streamlit(t, a.app)
        # closing card back on the MetaFlow home
        page.goto(a.site + "/index.html", wait_until="load")
        page.evaluate("""() => window.__mfTitle('<div><h1>Meta<b>Flow</b></h1><p>python web/server.py · http://127.0.0.1:8600</p></div>')""")
        page.wait_for_timeout(3500)
        video = page.video
        ctx.close()
        browser.close()
        webm = Path(video.path())

    import imageio_ffmpeg

    OUT.parent.mkdir(parents=True, exist_ok=True)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    part = OUT.with_suffix(".new.mp4")
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(webm), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", str(part)], check=True)
    import os, time
    for _ in range(20):  # the old file may be briefly open by a browser streaming it
        try:
            os.replace(part, OUT)
            break
        except PermissionError:
            time.sleep(1.5)
    else:
        print("Could not replace the old video (in use); new one saved as", part)
    shutil.rmtree(tmp, ignore_errors=True)
    print("Saved", OUT)


if __name__ == "__main__":
    main()
