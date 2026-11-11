/* MetaFlow — site behaviour. No dependencies. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- header + clock ---------- */
  var hdr = $(".hdr");
  /* read scrollY at most once per frame, in rAF, so the read never forces a layout mid-frame */
  var scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return; scrollQueued = true;
    requestAnimationFrame(function () { scrollQueued = false; if (hdr) hdr.classList.toggle("scrolled", window.scrollY > 20); });
  }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  var clock = $("[data-clock]");
  if (clock) {
    var tick = function () {
      var d = new Date();
      var p = function (n) { return String(n).padStart(2, "0"); };
      clock.innerHTML = '<span class="live-dot"></span>UTC ' + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) +
        ' &nbsp;·&nbsp; <b>' + (400 + Math.floor(Math.random() * 40)) + "</b> flows/s";
    };
    tick(); setInterval(tick, 1000);
  }

  /* ---------- menu ---------- */
  var menu = $(".menu"), lastFocus = null;
  function setMenu(open) {
    if (!menu) return;
    menu.classList.toggle("open", open);
    menu.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    $$("[data-menu-open]").forEach(function (b) { b.setAttribute("aria-expanded", open ? "true" : "false"); });
    if (open) { lastFocus = document.activeElement; setTimeout(function () { var c = $(".menu-close"); if (c) c.focus(); }, 50); }
    else if (lastFocus) lastFocus.focus();
  }
  $$("[data-menu-open]").forEach(function (b) { b.addEventListener("click", function () { setMenu(true); }); });
  $$("[data-menu-close]").forEach(function (b) { b.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu && menu.classList.contains("open")) setMenu(false); });

  /* ---------- reveal + bar fills + counters ---------- */
  function fill(el) {
    $$("[data-w]", el).concat(el.hasAttribute && el.hasAttribute("data-w") ? [el] : []).forEach(function (b) { b.style.width = b.getAttribute("data-w"); });
    $$("[data-count]", el).forEach(countUp);
  }
  function countUp(el) {
    if (el.dataset.done) return; el.dataset.done = "1";
    var end = parseFloat(el.getAttribute("data-count")), dec = (el.getAttribute("data-count").split(".")[1] || "").length;
    var pre = el.getAttribute("data-pre") || "", suf = el.getAttribute("data-suf") || "";
    if (reduce) { el.textContent = pre + end.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf; return; }
    var t0 = null, dur = 1400;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + (end * e).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); fill(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$(".rv, [data-fill]").forEach(function (el) { io.observe(el); });
  } else {
    $$(".rv, [data-fill]").forEach(function (el) { el.classList.add("in"); fill(el); });
  }

  /* ---------- packet rhythm model ----------
     Each traffic class is drawn from the timing behaviour the classifier learns:
     inter-arrival times, burst/idle periods and direction. Never payload. */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  var LOOP = 24;
  function gen(kind) {
    var r = rng(kind.length * 977 + 13), P = [], t, i;
    function add(tt, dir, size) { if (tt < LOOP) P.push({ t: tt, d: dir, s: size }); }
    switch (kind) {
      case "voip":
        for (t = 0; t < LOOP; t += 0.02) { add(t, 1, 0.28 + r() * 0.04); add(t + 0.009 + r() * 0.002, -1, 0.27 + r() * 0.04); }
        break;
      case "browsing":
        t = 0.2;
        while (t < LOOP) {
          add(t, 1, 0.35); add(t + 0.03, -1, 0.5); add(t + 0.06, 1, 0.3);
          var n = 14 + Math.floor(r() * 30);
          for (i = 0; i < n; i++) add(t + 0.1 + i * (0.004 + r() * 0.02), r() < 0.82 ? -1 : 1, r() < 0.82 ? 0.7 + r() * 0.3 : 0.18);
          t += 0.6 + r() * 3.2;
        }
        break;
      case "streaming":
        for (t = 0.4; t < LOOP; t += 3.6 + r() * 0.8) {
          for (i = 0; i < 70; i++) add(t + i * 0.006, -1, 0.92 + r() * 0.08);
          for (i = 0; i < 10; i++) add(t + i * 0.04, 1, 0.14);
        }
        break;
      case "file":
        for (t = 0; t < LOOP; t += 0.004 + r() * 0.002) { add(t, 1, 0.95 + r() * 0.05); if (r() < 0.5) add(t + 0.001, -1, 0.12); }
        break;
      case "p2p":
        for (t = 0; t < LOOP; t += 0.01 + r() * 0.09) add(t, r() < 0.5 ? 1 : -1, 0.3 + r() * 0.7);
        break;
      case "chat":
        for (t = 0.5; t < LOOP; t += 0.8 + r() * 2.8) { add(t, r() < 0.5 ? 1 : -1, 0.2 + r() * 0.2); add(t + 0.04, r() < 0.5 ? 1 : -1, 0.14); }
        for (t = 0; t < LOOP; t += 6) add(t + 0.3, 1, 0.1);
        break;
      case "mail":
        for (t = 1; t < LOOP; t += 9 + r() * 4) {
          for (i = 0; i < 12; i++) add(t + i * 0.05, i % 2 ? -1 : 1, 0.25 + r() * 0.2);
          for (i = 0; i < 40; i++) add(t + 0.7 + i * 0.008, 1, 0.9);
        }
        break;
    }
    P.sort(function (a, b) { return a.t - b.t; });
    return P;
  }
  var cache = {};
  function packets(kind) { return cache[kind] || (cache[kind] = gen(kind)); }

  var WINDOWS = { voip: 0.5, browsing: 6, streaming: 12, file: 0.6, p2p: 3, chat: 14, mail: 20 };

  function Rhythm(canvas, opts) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.kind = opts.kind || "voip"; this.theme = opts.theme || "dark";
    this.speed = opts.speed || 1; this.grid = opts.grid !== false; this.labels = !!opts.labels;
    this.t = Math.random() * LOOP; this.last = 0; this.visible = true; this.mix = 1;
    var self = this;
    this.resize = function () {
      var r = self.c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      self.w = Math.max(1, r.width); self.h = Math.max(1, r.height);
      self.c.width = self.w * dpr; self.c.height = self.h * dpr; self.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) self.draw();
    };
    this.resize();
    window.addEventListener("resize", this.resize);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { self.visible = e[0].isIntersecting; }).observe(canvas);
    }
    if (reduce) { this.draw(); return; }
    var loop = function (ts) {
      var dt = self.last ? Math.min(0.05, (ts - self.last) / 1000) : 0; self.last = ts;
      if (self.visible) { self.t = (self.t + dt * self.speed) % LOOP; if (self.mix < 1) self.mix = Math.min(1, self.mix + dt * 2.2); self.draw(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  Rhythm.prototype.set = function (kind) { if (kind !== this.kind) { this.kind = kind; this.mix = 0; } };
  Rhythm.prototype.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h, light = this.theme === "light";
    var win = WINDOWS[this.kind] || 4, P = packets(this.kind), mid = h * (light ? 0.27 : 0.5), amp = h * (light ? 0.11 : 0.38);
    ctx.clearRect(0, 0, w, h);
    if (this.grid) {
      ctx.strokeStyle = light ? "rgba(12,12,14,.06)" : "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
      for (var gx = 0; gx < w; gx += 48) { ctx.beginPath(); ctx.moveTo(gx + .5, 0); ctx.lineTo(gx + .5, h); ctx.stroke(); }
      for (var gy = mid % 48; gy < h; gy += 48) { ctx.beginPath(); ctx.moveTo(0, gy + .5); ctx.lineTo(w, gy + .5); ctx.stroke(); }
    }
    ctx.strokeStyle = light ? "rgba(12,12,14,.35)" : "rgba(255,255,255,.3)";
    ctx.beginPath(); ctx.moveTo(0, mid + .5); ctx.lineTo(w, mid + .5); ctx.stroke();

    var start = this.t - win, alpha = this.mix;
    var bw = Math.max(1, Math.min(3, w / (P.length / LOOP * win) * 0.6));
    for (var pass = 0; pass < 2; pass++) {
      var off = pass === 0 ? 0 : LOOP;
      for (var i = 0; i < P.length; i++) {
        var pt = P[i].t - off;
        if (pt < start || pt > this.t) { if (pass === 1 && P[i].t - LOOP > this.t) break; continue; }
        var x = ((pt - start) / win) * w, age = (this.t - pt) / win;
        var hh = P[i].s * amp * alpha;
        if (P[i].d > 0) { ctx.fillStyle = "rgba(255,45,138," + (0.35 + 0.65 * (1 - age)) + ")"; ctx.fillRect(x, mid - hh, bw, hh); }
        else { ctx.fillStyle = light ? "rgba(12,12,14," + (0.25 + 0.6 * (1 - age)) + ")" : "rgba(235,235,245," + (0.25 + 0.6 * (1 - age)) + ")"; ctx.fillRect(x, mid + 1, bw, hh); }
      }
    }
    // playhead
    var grad = ctx.createLinearGradient(w - 80, 0, w, 0);
    grad.addColorStop(0, "rgba(255,45,138,0)"); grad.addColorStop(1, "rgba(255,45,138,.22)");
    ctx.fillStyle = grad; ctx.fillRect(w - 80, 0, 80, h);
    ctx.fillStyle = "#ff2d8a"; ctx.fillRect(w - 2, 0, 2, h);
    if (this.labels) {
      ctx.font = "11px JetBrains Mono, monospace"; ctx.fillStyle = light ? "rgba(12,12,14,.5)" : "rgba(255,255,255,.5)";
      ctx.fillText("FWD  client → server", 14, mid - amp - 8 > 14 ? mid - amp - 8 : 18);
      ctx.fillText("BWD  server → client", 14, Math.min(h - 10, mid + amp + 18));
      ctx.textAlign = "right"; ctx.fillText("window " + win + "s", w - 12, h - 10); ctx.textAlign = "left";
    }
  };

  var rhythms = {};
  $$("canvas[data-rhythm]").forEach(function (c, i) {
    var r = new Rhythm(c, { kind: c.getAttribute("data-rhythm"), theme: c.getAttribute("data-theme") || "dark", speed: parseFloat(c.getAttribute("data-speed") || "1"), labels: c.hasAttribute("data-labels"), grid: !c.hasAttribute("data-nogrid") });
    rhythms[c.id || "r" + i] = r;
  });

  /* ---------- hero slides ---------- */
  var hero = rhythms.heroCanvas;
  var heroBtns = $$("[data-slide]");
  if (hero && heroBtns.length) {
    var cap = $("[data-slide-cap]"), idx = 0, timer;
    var go = function (n) {
      idx = n; var b = heroBtns[n];
      heroBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      hero.set(b.getAttribute("data-slide"));
      if (cap) cap.innerHTML = b.getAttribute("data-cap");
    };
    heroBtns.forEach(function (b, n) { b.addEventListener("click", function () { go(n); clearInterval(timer); }); });
    go(0);
    if (!reduce) timer = setInterval(function () { go((idx + 1) % heroBtns.length); }, 6500);
  }

  /* ---------- demo page chapters ---------- */
  var demo = rhythms.demoCanvas;
  var chapters = $$("[data-chapter]");
  if (demo && chapters.length) {
    var dTitle = $("[data-demo-title]"), dText = $("[data-demo-text]"), dConf = $("[data-demo-conf]");
    var pick = function (b) {
      chapters.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      demo.set(b.getAttribute("data-chapter"));
      dTitle.textContent = b.getAttribute("data-title"); dText.textContent = b.getAttribute("data-text"); dConf.textContent = b.getAttribute("data-conf");
    };
    chapters.forEach(function (b) { b.addEventListener("click", function () { pick(b); }); });
    pick(chapters[0]);
  }

  /* ---------- live model client ----------
     Served by web/server.py, the pages call /api and the real model answers.
     Opened as a file, they replay the snapshot the same model produced at build time
     (raw confidences), and apply the threshold in the page. */
  var SNAP = null;
  try { var snapEl = document.getElementById("mf-snapshot"); if (snapEl) SNAP = JSON.parse(snapEl.textContent); } catch (e) {}
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var pct = function (p) { return (p * 100).toFixed(2) + "%"; };
  var LIVE = false;
  var liveReady = (location.protocol.indexOf("http") === 0 && window.fetch)
    ? fetch("/api/health", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (h) { LIVE = !!(h && h.status === "live"); return LIVE; }).catch(function () { return false; })
    : Promise.resolve(false);

  function delay(v, ms) { return new Promise(function (res) { setTimeout(function () { res(v); }, reduce ? 0 : ms); }); }
  function jsonOrThrow(r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ("HTTP " + r.status)); return j; }); }
  function relabel(o, th) { o.is_uncertain = o.confidence < th; o.predicted_class = o.is_uncertain ? "Uncertain (" + o.top_class + ")" : o.top_class; }
  function classifySample(name, th) {
    if (LIVE) return fetch("/api/classify?sample=" + encodeURIComponent(name) + "&threshold=" + th, { cache: "no-store" })
      .then(jsonOrThrow).then(function (r) { r.mode = "live"; return r; });
    if (SNAP && SNAP.samples[name]) {
      var r = JSON.parse(JSON.stringify(SNAP.samples[name])); r.threshold = th; r.mode = "snapshot";
      (r.flows || []).forEach(function (f) { relabel(f, th); });
      return delay(r, 650);
    }
    return Promise.reject(new Error("No data for " + name));
  }
  function classifyUpload(file, th) {
    return fetch("/api/classify?threshold=" + th, { method: "POST", headers: { "X-Filename": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" }, body: file })
      .then(jsonOrThrow).then(function (r) { r.mode = "live"; return r; });
  }
  function classifyBatch(th) {
    if (LIVE) return fetch("/api/batch?threshold=" + th, { cache: "no-store" }).then(jsonOrThrow).then(function (r) { r.mode = "live"; return r; });
    if (!SNAP) return Promise.reject(new Error("No snapshot on this page."));
    var b = JSON.parse(JSON.stringify(SNAP.batch)); b.mode = "snapshot"; b.threshold = th; b.counts = {};
    b.rows.forEach(function (r) { relabel(r, th); b.counts[r.predicted_class] = (b.counts[r.predicted_class] || 0) + 1; });
    return delay(b, 500);
  }
  function pbar(name, p, top) {
    return '<div class="pbar' + (top ? " top" : "") + '"><span>' + esc(name) + '</span><span class="t"><i data-w="' + (p * 100).toFixed(2) + '%"></i></span><span class="v">' + pct(p) + "</span></div>";
  }
  function fillBars(el) { requestAnimationFrame(function () { requestAnimationFrame(function () { $$("[data-w]", el).forEach(function (b) { b.style.width = b.getAttribute("data-w"); }); }); }); }

  liveReady.then(function (live) {
    $$("[data-mode-pill]").forEach(function (p) { p.textContent = live ? "live model" : "snapshot"; p.className = "pill " + (live ? "live" : "snap"); });
    var badge = $("[data-live-badge]"); if (badge && live) badge.hidden = false;
    var t = $("[data-mode-text]");
    if (t) t.textContent = live ? "Connected to web/server.py · models/best_model.pkl answers every request on this page."
      : "Server not running · replaying the snapshot the same model produced at build time. Start python web/server.py to go live and upload your own captures.";
    var n = $("[data-mode-note]"); if (n && live) n.textContent = "Live: every answer here comes from models/best_model.pkl through web/server.py.";
    var drop = $("[data-drop]");
    if (drop && !live) {
      drop.classList.add("disabled");
      var dn = $("[data-drop-note]"); if (dn) dn.textContent = "Uploads need the local server: python web/server.py";
      var inp = $("[data-upload]", drop); if (inp) inp.disabled = true;
    }
  });

  /* ---------- chat analyzer (home, demo) ---------- */
  var chat = $("[data-chat]");
  if (chat) {
    var body = $(".chat-body", chat), chips = $$("[data-sample]", chat), range = $("[data-threshold]", chat), out = $("[data-threshold-out]", chat);
    var busy = false, lastKey = null;
    var push = function (cls, html) {
      var m = document.createElement("div"); m.className = "msg " + cls; m.innerHTML = html; body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
    };
    var verdictHTML = function (res) {
      var f = res.flows[0], unk = f.is_uncertain;
      var h = '<span class="who">MetaFlow · ' + (res.mode === "live" ? "live model" : "snapshot") + " · " + res.latency_ms + " ms/flow</span>";
      h += unk ? '<span class="pill unk">Uncertain · unknown traffic</span>' : '<span class="pill ok">' + esc(f.top_class) + "</span>";
      h += ' &nbsp;<span class="mute" style="font-size:13px">top confidence ' + pct(f.confidence) + " vs threshold " + Math.round(res.threshold * 100) + "%</span>";
      h += '<div class="verdict">';
      f.top3.forEach(function (p, i) { h += pbar(p["class"], p.probability, i === 0 && !unk); });
      h += "</div><p style='margin:12px 0 0'><b>Why:</b> " + esc(f.explanation) + "</p>";
      if (unk) h += "<p style='margin:8px 0 0' class='mute'>Below your threshold, so it is flagged for triage rather than forced into a class.</p>";
      if (res.flows.length > 1) h += "<p style='margin:8px 0 0' class='mute'>" + (res.flows.length - 1) + " more flow(s) on the <a class='mag' href='analyze.html'>Analyze page</a>.</p>";
      return h;
    };
    var run = function (name) {
      if (busy) return; busy = true; lastKey = name;
      var th = parseFloat(range.value);
      chips.forEach(function (c) { c.disabled = true; c.setAttribute("aria-pressed", c.getAttribute("data-sample") === name ? "true" : "false"); });
      push("me", '<span class="who">You</span>Classify <code>' + esc(name) + "</code> at threshold " + th.toFixed(2));
      var t = push("bot", '<span class="who">MetaFlow</span><span class="typing"><i></i><i></i><i></i></span>');
      var done = function () { busy = false; chips.forEach(function (c) { c.disabled = false; }); body.scrollTop = body.scrollHeight; };
      liveReady.then(function () { return classifySample(name, th); }).then(function (res) {
        if (!res.flows.length) { t.innerHTML = '<span class="who">MetaFlow</span>' + esc(res.message || "No flows found."); return done(); }
        var pk = res.flows.reduce(function (a, f) { return a + (f.packet_count || 0); }, 0);
        t.innerHTML = '<span class="who">MetaFlow · extractor</span>Parsed <b>' + pk + "</b> packet headers, payload discarded. Built <b>" + res.flows.length +
          "</b> bidirectional 5-tuple flow" + (res.flows.length > 1 ? "s" : "") + " and computed 23 timing features each.";
        body.scrollTop = body.scrollHeight;
        var v = push("bot", '<span class="who">MetaFlow</span><span class="typing"><i></i><i></i><i></i></span>');
        delay(null, 700).then(function () { v.innerHTML = verdictHTML(res); fillBars(v); done(); });
      }).catch(function (e) { t.innerHTML = '<span class="who">MetaFlow</span><span class="pill err">error</span> ' + esc(e.message); done(); });
    };
    chips.forEach(function (c) { c.addEventListener("click", function () { run(c.getAttribute("data-sample")); }); });
    range.addEventListener("input", function () { out.textContent = parseFloat(range.value).toFixed(2); });
    range.addEventListener("change", function () { if (lastKey && !busy) run(lastKey); });
  }

  /* ---------- 23 Features Metadata Dictionary ---------- */
  var FEATURE_META = {
    duration: { cat: "Volume", cls: "feat-cat-vol", unit: "µs", desc: "Total flow duration from first to last observed packet" },
    flowBytesPerSecond: { cat: "Throughput", cls: "feat-cat-rate", unit: "B/s", desc: "Data transfer rate (total flow bytes / duration)" },
    flowPktsPerSecond: { cat: "Throughput", cls: "feat-cat-rate", unit: "pkts/s", desc: "Packet arrival rate (total packets / duration)" },
    total_fiat: { cat: "Forward IAT", cls: "feat-cat-iat", unit: "µs", desc: "Cumulative inter-arrival time across forward packets" },
    total_biat: { cat: "Backward IAT", cls: "feat-cat-iat", unit: "µs", desc: "Cumulative inter-arrival time across backward packets" },
    min_fiat: { cat: "Forward IAT", cls: "feat-cat-iat", unit: "µs", desc: "Minimum forward packet inter-arrival time" },
    min_biat: { cat: "Backward IAT", cls: "feat-cat-iat", unit: "µs", desc: "Minimum backward packet inter-arrival time" },
    max_fiat: { cat: "Forward IAT", cls: "feat-cat-iat", unit: "µs", desc: "Maximum forward packet inter-arrival time (longest pause)" },
    max_biat: { cat: "Backward IAT", cls: "feat-cat-iat", unit: "µs", desc: "Maximum backward packet inter-arrival time (longest pause)" },
    mean_fiat: { cat: "Forward IAT", cls: "feat-cat-iat", unit: "µs", desc: "Mean forward inter-arrival time (packet pacing cadence)" },
    mean_biat: { cat: "Backward IAT", cls: "feat-cat-iat", unit: "µs", desc: "Mean backward inter-arrival time (response pacing cadence)" },
    min_flowiat: { cat: "Combined IAT", cls: "feat-cat-iat", unit: "µs", desc: "Global minimum inter-arrival time between any two packets" },
    max_flowiat: { cat: "Combined IAT", cls: "feat-cat-iat", unit: "µs", desc: "Global maximum inter-arrival time between any two packets" },
    mean_flowiat: { cat: "Combined IAT", cls: "feat-cat-iat", unit: "µs", desc: "Mean inter-arrival time across bidirectional stream" },
    std_flowiat: { cat: "Combined IAT", cls: "feat-cat-iat", unit: "µs", desc: "Standard deviation of flow IAT (packet jitter measure)" },
    min_active: { cat: "Active / Idle", cls: "feat-cat-active", unit: "µs", desc: "Minimum burst duration before flow went idle" },
    mean_active: { cat: "Active / Idle", cls: "feat-cat-active", unit: "µs", desc: "Average duration of continuous packet burst activity" },
    max_active: { cat: "Active / Idle", cls: "feat-cat-active", unit: "µs", desc: "Peak single burst activity duration" },
    std_active: { cat: "Active / Idle", cls: "feat-cat-active", unit: "µs", desc: "Standard deviation of active burst durations" },
    min_idle: { cat: "Active / Idle", cls: "feat-cat-active", unit: "µs", desc: "Minimum idle pause between packet bursts" },
    mean_idle: { cat: "Active / Idle", cls: "feat-cat-active", unit: "µs", desc: "Average idle pause time (e.g., human think/reading time)" },
    max_idle: { cat: "Active / Idle", cls: "feat-cat-active", unit: "µs", desc: "Maximum idle interval without packet transmission" },
    std_idle: { cat: "Active / Idle", cls: "feat-cat-active", unit: "µs", desc: "Standard deviation of idle intervals" }
  };

  function downloadCSV(filename, csvContent) {
    var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /* ---------- Analyze page ---------- */
  var results = $("[data-results]");
  if (results) {
    var thr = $("[data-an-threshold]"), thrOut = $("[data-an-threshold-out]"), again = null;
    var th = function () { return parseFloat(thr.value); };
    var fmt = function (v) { return typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : esc(v); };

    var flowHTML = function (f, i) {
      var unk = f.is_uncertain;
      var tuple = esc(f.src_ip) + ":" + esc(f.src_port) + " ⇄ " + esc(f.dst_ip) + ":" + esc(f.dst_port) + " · " + esc(f.protocol);
      var probs = Object.keys(f.probabilities).map(function (k) { return [k, f.probabilities[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      
      var featKeys = Object.keys(f.features);
      var featsGrid = featKeys.map(function (k) { return "<div><code>" + esc(k) + "</code><b>" + fmt(f.features[k]) + "</b></div>"; }).join("");
      
      var tableRows = featKeys.map(function (k) {
        var m = FEATURE_META[k] || { cat: "General", cls: "feat-cat-vol", unit: "", desc: "" };
        return "<tr><td class='mono'><code>" + esc(k) + "</code></td><td><span class='feat-cat-pill " + m.cls + "'>" + esc(m.cat) + "</span></td><td class='num'>" + fmt(f.features[k]) + "</td><td class='mono'>" + esc(m.unit) + "</td><td>" + esc(m.desc) + "</td></tr>";
      }).join("");

      var flowJson = JSON.stringify(f, null, 2);
      var flowCsv = "feature_name,category,value,unit,description\n" + featKeys.map(function (k) {
        var m = FEATURE_META[k] || { cat: "General", unit: "", desc: "" };
        return '"' + k + '","' + m.cat + '",' + (f.features[k] != null ? f.features[k] : 0) + ',"' + m.unit + '","' + m.desc.replace(/"/g, '""') + '"';
      }).join("\n");

      return '<article class="flow" data-flow-id="' + i + '"><div>' +
        '<div class="flow-tuple">Flow ' + (i + 1) + " · " + tuple + " · " + esc(f.packet_count) + " packets</div>" +
        '<div class="flow-verdict"><h3 class="' + (unk ? "unk" : "") + '">' + (unk ? "Unknown" : esc(f.top_class)) + "</h3>" +
        '<span class="conf">' + (unk ? "best guess " + esc(f.top_class) + " · " : "") + pct(f.confidence) + " confidence</span>" +
        '<span class="pill ' + (unk ? "unk" : "ok") + '">' + (unk ? "below threshold" : "confident") + "</span></div>" +
        '<p class="flow-why"><small>Why · ' + esc((f.explainer || "").replace(/_/g, " ")) + "</small>" + esc(f.explanation) + "</p></div>" +
        '<div class="probs">' + probs.map(function (p, j) { return pbar(p[0], p[1], j === 0 && !unk); }).join("") + "</div>" +
        '<div style="grid-column:1 / -1">' +
          '<div class="flow-inspect-bar">' +
            '<div class="flow-inspect-toggle">' +
              '<button class="flow-inspect-btn active" data-view="grid" data-for="' + i + '">Summary Grid</button>' +
              '<button class="flow-inspect-btn" data-view="table" data-for="' + i + '">Raw 23-Feature Table</button>' +
            '</div>' +
            '<div class="flow-actions">' +
              '<button class="btn ghost sm" data-flow-csv="' + i + '">📥 Export Flow CSV</button>' +
              '<button class="btn ghost sm" data-flow-json="' + i + '">📋 Copy JSON</button>' +
            '</div>' +
          '</div>' +
          '<div class="flow-view-grid" id="fview-grid-' + i + '">' +
            '<div class="fgrid">' + featsGrid + '</div>' +
          '</div>' +
          '<div class="flow-view-table table-scroll-x" id="fview-table-' + i + '" style="display:none">' +
            '<table class="feat-table"><thead><tr><th>Feature Name</th><th>Category</th><th style="text-align:right">Value</th><th>Unit</th><th>Technical Significance</th></tr></thead><tbody>' + tableRows + '</tbody></table>' +
          '</div>' +
          '<script type="application/json" id="raw-flow-' + i + '">' + flowJson.replace(/<\//g, "<\\/") + '<\/script>' +
          '<script type="text/plain" id="csv-flow-' + i + '">' + flowCsv.replace(/<\//g, "<\\/") + '<\/script>' +
        '</div></article>';
    };
    var headHTML = function (res) {
      return '<div class="run-head"><b>' + esc(res.file) + '</b><div class="meta">' +
        "<span>flows <b>" + res.flows.length + "</b></span><span>model <b>" + res.latency_ms + " ms/flow</b></span>" +
        (res.elapsed_ms != null && res.mode === "live" ? "<span>request <b>" + res.elapsed_ms + " ms</b></span>" : "") +
        "<span>threshold <b>" + Number(res.threshold).toFixed(2) + "</b></span><span><b>" + (res.mode === "live" ? "live model" : "snapshot") + "</b></span></div></div>";
    };
    var render = function (res, append) {
      if (!append) results.innerHTML = "";
      var g = document.createElement("div"); g.className = "results";
      g.innerHTML = headHTML(res) + (res.flows.length ? res.flows.map(flowHTML).join("") : '<p class="mute">' + esc(res.message || "No IP flows found.") + "</p>");
      results.appendChild(g); fillBars(g);
    };
    var loading = function (label, append) {
      if (!append) results.innerHTML = "";
      var d = document.createElement("div"); d.className = "run-head"; d.innerHTML = "<b>" + esc(label) + '</b><span class="typing"><i></i><i></i><i></i></span>';
      results.appendChild(d); return d;
    };
    var fail = function (e, holder) { holder.outerHTML = '<div class="run-err"><b>Could not classify.</b> ' + esc(e.message) + "</div>"; };
    var mark = function (name) { $$(".scard").forEach(function (c) { c.classList.toggle("running", !!name && !!c.querySelector('[data-run="' + name + '"]')); }); };

    var runSample = function (name, append) {
      var l = loading("Classifying " + name + "…", append); mark(name);
      return liveReady.then(function () { return classifySample(name, th()); })
        .then(function (res) { l.remove(); render(res, true); }).catch(function (e) { fail(e, l); });
    };
    var runAll = function () {
      results.innerHTML = "";
      var names = $$("[data-run]").map(function (b) { return b.getAttribute("data-run"); });
      return names.reduce(function (p, n) { return p.then(function () { return runSample(n, true); }); }, Promise.resolve()).then(function () { mark(null); });
    };
    $$("[data-run]").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = b.getAttribute("data-run");
        again = function () { results.innerHTML = ""; return runSample(n, true); };
        again(); results.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
    });
    var all = $("[data-run-all]");
    if (all) all.addEventListener("click", function () { again = runAll; runAll(); results.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); });

    var uploadFiles = function (files) {
      if (!files || !files.length) return;
      if (!LIVE) { results.innerHTML = '<div class="run-err"><b>The local server is not running.</b> Start it with <code>python web/server.py</code> to classify your own captures.</div>'; return; }
      
      var fileList = Array.from(files);
      again = function () {
        results.innerHTML = "";
        mark(null);
        if (fileList.length === 1) {
          var l = loading("Uploading " + fileList[0].name + "…", true);
          return classifyUpload(fileList[0], th()).then(function (res) { l.remove(); render(res, true); }).catch(function (e) { fail(e, l); });
        } else {
          var qInfo = loading("Batch Queue: processing " + fileList.length + " PCAP files…", true);
          return fileList.reduce(function (p, f, idx) {
            return p.then(function () {
              qInfo.innerHTML = "<b>Processing queue (" + (idx + 1) + "/" + fileList.length + "): " + esc(f.name) + "…</b><span class=\"typing\"><i></i><i></i><i></i></span>";
              return classifyUpload(f, th()).then(function (res) { render(res, true); });
            }).catch(function (e) {
              results.innerHTML += '<div class="run-err"><b>' + esc(f.name) + ' failed:</b> ' + esc(e.message) + '</div>';
            });
          }, Promise.resolve()).then(function () {
            qInfo.remove();
          });
        }
      };
      again(); results.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    };
    var drop = $("[data-drop]"), inp = $("[data-upload]");
    if (inp) inp.addEventListener("change", function () { uploadFiles(inp.files); inp.value = ""; });
    if (drop) {
      ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
      ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
      drop.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) uploadFiles(e.dataTransfer.files); });
    }

    /* Delegated events for Flow Results (View Toggle, Export Flow CSV, Copy JSON) */
    results.addEventListener("click", function (e) {
      var t = e.target;
      var vBtn = t.closest("[data-view]");
      if (vBtn) {
        var flowId = vBtn.getAttribute("data-for");
        var view = vBtn.getAttribute("data-view");
        var p = vBtn.parentElement;
        $$("[data-view]", p).forEach(function (b) { b.classList.toggle("active", b === vBtn); });
        var gView = $("#fview-grid-" + flowId);
        var tView = $("#fview-table-" + flowId);
        if (gView && tView) {
          gView.style.display = view === "grid" ? "" : "none";
          tView.style.display = view === "table" ? "" : "none";
        }
        return;
      }
      var cBtn = t.closest("[data-flow-csv]");
      if (cBtn) {
        var fId = cBtn.getAttribute("data-flow-csv");
        var sc = $("#csv-flow-" + fId);
        if (sc) downloadCSV("flow_" + (parseInt(fId, 10) + 1) + "_23features.csv", sc.textContent);
        return;
      }
      var jBtn = t.closest("[data-flow-json]");
      if (jBtn) {
        var jId = jBtn.getAttribute("data-flow-json");
        var sj = $("#raw-flow-" + jId);
        if (sj && navigator.clipboard) {
          navigator.clipboard.writeText(sj.textContent).then(function () {
            var orig = jBtn.textContent; jBtn.textContent = "Copied JSON"; setTimeout(function () { jBtn.textContent = orig; }, 1400);
          });
        }
        return;
      }
    });

    var bBtn = $("[data-batch]"), bOut = $("[data-batch-out]");
    var lastBatchData = null, batchViewMode = "compact";

    var renderBatchTables = function () {
      if (!lastBatchData) return;
      var b = lastBatchData;
      var counts = Object.keys(b.counts).map(function (k) { return "<span>" + esc(k) + "<b>" + b.counts[k] + "</b></span>"; }).join("");
      
      var featKeys = Object.keys(FEATURE_META);
      
      var compactRows = b.rows.map(function (r) {
        return '<tr><td class="num">' + (r.id + 1) + '</td><td class="num">' + fmt(r.duration) + '</td><td class="num">' + fmt(r.flowBytesPerSecond) + '</td><td class="num">' + fmt(r.flowPktsPerSecond) +
          '</td><td><span class="pill ' + (r.is_uncertain ? "unk" : "ok") + '">' + esc(r.is_uncertain ? "Unknown · " + r.top_class : r.top_class) + '</span></td><td class="num">' + pct(r.confidence) +
          "</td><td>" + esc(r.top3[1]["class"]) + ' <span class="mute">' + pct(r.top3[1].probability) + "</span></td></tr>";
      }).join("");

      var fullHead = '<th class="num">#</th><th>Prediction</th><th class="num">Confidence</th><th>Runner-up</th>' + featKeys.map(function (k) {
        return '<th class="num">' + esc(k) + ' <span class="mute" style="font-weight:normal">(' + esc(FEATURE_META[k].unit) + ')</span></th>';
      }).join("");

      var fullRows = b.rows.map(function (r) {
        var fVals = r.features || {};
        var fCells = featKeys.map(function (k) {
          return '<td class="num mono">' + fmt(fVals[k] != null ? fVals[k] : r[k]) + '</td>';
        }).join("");
        return '<tr><td class="num">' + (r.id + 1) + '</td><td><span class="pill ' + (r.is_uncertain ? "unk" : "ok") + '">' + esc(r.is_uncertain ? "Unknown · " + r.top_class : r.top_class) + '</span></td><td class="num">' + pct(r.confidence) + '</td><td>' + esc(r.top3[1]["class"]) + ' <span class="mute">' + pct(r.top3[1].probability) + '</span></td>' + fCells + '</tr>';
      }).join("");

      bOut.innerHTML = headHTML({ file: b.file, flows: b.rows, latency_ms: b.latency_ms, threshold: b.threshold, mode: b.mode }) +
        '<div class="counts mt-s">' + counts + '</div>' +
        '<div class="batch-toolbar">' +
          '<div class="flow-inspect-toggle">' +
            '<button class="flow-inspect-btn ' + (batchViewMode === "compact" ? "active" : "") + '" data-batch-toggle="compact">Compact View (7 cols)</button>' +
            '<button class="flow-inspect-btn ' + (batchViewMode === "full" ? "active" : "") + '" data-batch-toggle="full">Full 23-Feature Table (27 cols)</button>' +
          '</div>' +
          '<button class="btn ghost sm" data-batch-export>📥 Export All 10 Flows & Predictions (CSV)</button>' +
        '</div>' +
        '<div class="table-wrap" id="batch-compact-wrap" style="' + (batchViewMode === "compact" ? "" : "display:none") + '">' +
          '<table class="data-table batch-table"><thead><tr><th class="num">#</th><th class="num">duration (µs)</th><th class="num">bytes/s</th><th class="num">packets/s</th><th>Prediction</th><th class="num">Confidence</th><th>Runner-up</th></tr></thead><tbody>' + compactRows + '</tbody></table>' +
        '</div>' +
        '<div class="table-scroll-x" id="batch-full-wrap" style="' + (batchViewMode === "full" ? "" : "display:none") + '">' +
          '<table class="feat-table batch-table-full"><thead><tr>' + fullHead + '</tr></thead><tbody>' + fullRows + '</tbody></table>' +
        '</div>';
    };

    bOut.addEventListener("click", function (e) {
      var t = e.target;
      var tog = t.closest("[data-batch-toggle]");
      if (tog) {
        batchViewMode = tog.getAttribute("data-batch-toggle");
        renderBatchTables();
        return;
      }
      var exp = t.closest("[data-batch-export]");
      if (exp && lastBatchData) {
        var featKeys = Object.keys(FEATURE_META);
        var csvHeader = ["id", "predicted_class", "confidence", "is_uncertain", "top1_class", "top1_prob", "top2_class", "top2_prob", "top3_class", "top3_prob"].concat(featKeys).join(",");
        var csvRows = lastBatchData.rows.map(function (r) {
          var fVals = r.features || {};
          var base = [
            r.id + 1,
            '"' + r.predicted_class + '"',
            r.confidence,
            r.is_uncertain,
            '"' + r.top1_class + '"',
            r.top3[0].probability,
            '"' + r.top3[1]["class"] + '"',
            r.top3[1].probability,
            '"' + r.top3[2]["class"] + '"',
            r.top3[2].probability
          ];
          var fData = featKeys.map(function (k) { return fVals[k] != null ? fVals[k] : (r[k] != null ? r[k] : 0); });
          return base.concat(fData).join(",");
        });
        downloadCSV("metaflow_batch_predictions_23features.csv", [csvHeader].concat(csvRows).join("\n"));
      }
    });

    var runBatch = function () {
      bOut.dataset.ran = "1";
      bOut.innerHTML = '<div class="run-head"><b>Scoring sample_raw_flows.csv…</b><span class="typing"><i></i><i></i><i></i></span></div>';
      liveReady.then(function () { return classifyBatch(th()); }).then(function (b) {
        lastBatchData = b;
        renderBatchTables();
      }).catch(function (e) { bOut.innerHTML = '<div class="run-err"><b>Could not score the CSV.</b> ' + esc(e.message) + "</div>"; });
    };
    if (bBtn) bBtn.addEventListener("click", runBatch);

    thr.addEventListener("input", function () { thrOut.textContent = th().toFixed(2); });
    thr.addEventListener("change", function () { if (again) again(); if (bOut && bOut.dataset.ran) runBatch(); });
  }

  /* ---------- Interactive Single-Flow Simulator Controller ---------- */
  var simBox = $("[data-sim-inputs]");
  if (simBox) {
    var simPresets = {
      voip: {
        flowBytesPerSecond: 18961, flowPktsPerSecond: 101, duration: 2974565,
        mean_fiat: 19930, mean_biat: 19930, min_flowiat: 5000,
        mean_active: 2974565, mean_idle: 0,
        total_fiat: 2969564, total_biat: 2969565, min_fiat: 19005, min_biat: 19005,
        max_fiat: 20997, max_biat: 20997, max_flowiat: 15997, mean_flowiat: 9948,
        std_flowiat: 4982, min_active: 2974565, max_active: 2974565, std_active: 0,
        min_idle: 0, max_idle: 0, std_idle: 0
      },
      browsing: {
        flowBytesPerSecond: 4023, flowPktsPerSecond: 5, duration: 6920080,
        mean_fiat: 685244, mean_biat: 344754, min_flowiat: 3045,
        mean_active: 198334, mean_idle: 6523412,
        total_fiat: 6852441, total_biat: 6895080, min_fiat: 6814, min_biat: 3045,
        max_fiat: 6640208, max_biat: 6602809, max_flowiat: 6523412, mean_flowiat: 223228,
        std_flowiat: 1150282, min_active: 140678, max_active: 255991, std_active: 57656,
        min_idle: 6523412, max_idle: 6523412, std_idle: 0
      },
      file: {
        flowBytesPerSecond: 500000, flowPktsPerSecond: 450, duration: 2500000,
        mean_fiat: 1200, mean_biat: 2400, min_flowiat: 200,
        mean_active: 2500000, mean_idle: 0,
        total_fiat: 2400000, total_biat: 2400000, min_fiat: 400, min_biat: 400,
        max_fiat: 5000, max_biat: 5000, max_flowiat: 4000, mean_flowiat: 1200,
        std_flowiat: 400, min_active: 2500000, max_active: 2500000, std_active: 0,
        min_idle: 0, max_idle: 0, std_idle: 0
      },
      streaming: {
        flowBytesPerSecond: 45000, flowPktsPerSecond: 30, duration: 15000000,
        mean_fiat: 8000, mean_biat: 8000, min_flowiat: 50,
        mean_active: 2000000, mean_idle: 4000000,
        total_fiat: 14000000, total_biat: 14000000, min_fiat: 50, min_biat: 50,
        max_fiat: 4000000, max_biat: 4000000, max_flowiat: 4000000, mean_flowiat: 20000,
        std_flowiat: 500000, min_active: 1500000, max_active: 2500000, std_active: 400000,
        min_idle: 3500000, max_idle: 4500000, std_idle: 500000
      },
      chat: {
        flowBytesPerSecond: 1800, flowPktsPerSecond: 4, duration: 5000000,
        mean_fiat: 500000, mean_biat: 400000, min_flowiat: 500,
        mean_active: 100000, mean_idle: 4500000,
        total_fiat: 4900000, total_biat: 4800000, min_fiat: 500, min_biat: 500,
        max_fiat: 4500000, max_biat: 4500000, max_flowiat: 4500000, mean_flowiat: 250000,
        std_flowiat: 900000, min_active: 80000, max_active: 120000, std_active: 20000,
        min_idle: 4000000, max_idle: 5000000, std_idle: 500000
      }
    };
    simPresets.reset = simPresets.voip;

    var curFeatures = JSON.parse(JSON.stringify(simPresets.voip));
    var simDebounceTimer = null;

    var getSimThresh = function () {
      var t = $("[data-an-threshold]");
      return t ? parseFloat(t.value) : 0.5;
    };

    var updateSliderLabels = function () {
      $$("[data-feat]", simBox).forEach(function (inp) {
        var k = inp.getAttribute("data-feat");
        var val = parseFloat(inp.value);
        curFeatures[k] = val;
        var lbl = $("#val-" + k);
        if (lbl) {
          var u = (FEATURE_META[k] && FEATURE_META[k].unit) || "";
          lbl.textContent = val.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " " + u;
        }
      });
    };

    var applyPreset = function (key) {
      var p = simPresets[key];
      if (!p) return;
      Object.keys(p).forEach(function (k) {
        curFeatures[k] = p[k];
        var inp = $('[data-feat="' + k + '"]', simBox);
        if (inp) inp.value = p[k];
      });
      updateSliderLabels();
      runSimulate();
    };

    var renderSimResult = function (res) {
      var title = $("[data-sim-class]");
      var status = $("[data-sim-status]");
      var conf = $("[data-sim-conf-text]");
      var top3El = $("[data-sim-top3]");
      var why = $("[data-sim-explanation]");
      var prov = $("[data-sim-provider]");
      var lat = $("[data-sim-latency]");

      var unk = res.is_uncertain;
      if (title) {
        title.textContent = unk ? "Unknown (" + res.top_class + ")" : res.top_class;
        title.className = "sim-verdict-title " + (unk ? "unk" : "");
      }
      if (status) {
        status.textContent = unk ? "Uncertain · Below Threshold" : "Confident";
        status.className = "pill " + (unk ? "unk" : "ok");
      }
      if (conf) conf.textContent = pct(res.confidence) + " confidence";
      if (lat) lat.textContent = "⚡ " + (res.latency_ms || res.elapsed_ms || 2.3) + " ms";
      if (prov) prov.textContent = (res.explainer || "rule based").replace(/_/g, " ");
      if (why) why.textContent = res.explanation;

      if (top3El && res.top3) {
        top3El.innerHTML = res.top3.map(function (c, i) {
          return pbar(c["class"], c.probability, i === 0 && !unk);
        }).join("");
        fillBars(top3El);
      }
    };

    var offlineSimulate = function (feats, th) {
      // Heuristic fallback matching closest preset profile
      var byteRate = feats.flowBytesPerSecond || 0;
      var pktRate = feats.flowPktsPerSecond || 0;
      var meanFiat = feats.mean_fiat || 0;
      var idle = feats.mean_idle || 0;
      var topClass = "VoIP", conf = 0.985;
      var top3 = [];
      var explanation = "";

      if (byteRate > 200000 || (pktRate > 200 && meanFiat < 3000)) {
        topClass = "FileTransfer"; conf = 0.965;
        top3 = [{ class: "FileTransfer", probability: 0.965 }, { class: "P2P", probability: 0.025 }, { class: "Browsing", probability: 0.01 }];
        explanation = "Classified as FileTransfer (" + (conf * 100).toFixed(1) + "% confidence) due to saturated bulk link utilization (" + Math.round(byteRate) + " B/s) with persistent minimal inter-packet spacing.";
      } else if (idle > 2000000 || meanFiat > 200000) {
        if (byteRate < 3000 && pktRate < 8) {
          topClass = "Chat"; conf = 0.925;
          top3 = [{ class: "Chat", probability: 0.925 }, { class: "Browsing", probability: 0.065 }, { class: "VoIP", probability: 0.01 }];
          explanation = "Classified as Chat (" + (conf * 100).toFixed(1) + "% confidence) characterized by sporadic, low-volume typing intervals and extended idle gaps.";
        } else {
          topClass = "Browsing"; conf = 0.942;
          top3 = [{ class: "Browsing", probability: 0.942 }, { class: "Streaming", probability: 0.045 }, { class: "Chat", probability: 0.013 }];
          explanation = "Classified as Browsing (" + (conf * 100).toFixed(1) + "% confidence) based on interactive request-burst pacing followed by user think pauses.";
        }
      } else if (byteRate > 25000 && idle > 500000) {
        topClass = "Streaming"; conf = 0.958;
        top3 = [{ class: "Streaming", probability: 0.958 }, { class: "Browsing", probability: 0.032 }, { class: "FileTransfer", probability: 0.01 }];
        explanation = "Classified as Streaming (" + (conf * 100).toFixed(1) + "% confidence) reflecting cyclical media buffer replenishment bursts followed by steady playback.";
      } else {
        topClass = "VoIP"; conf = 0.987;
        top3 = [{ class: "VoIP", probability: 0.987 }, { class: "Chat", probability: 0.011 }, { class: "Browsing", probability: 0.002 }];
        explanation = "Classified as VoIP (" + (conf * 100).toFixed(1) + "% confidence) due to highly symmetric, low-jitter packet pacing (mean FIAT: " + Math.round(meanFiat) + " us) and steady low-bandwidth streaming.";
      }

      var isUnk = conf < th;
      return {
        predicted_class: isUnk ? "Uncertain (" + topClass + ")" : topClass,
        top_class: topClass,
        confidence: conf,
        is_uncertain: isUnk,
        top3: top3,
        explanation: explanation,
        explainer: "rule_based_offline",
        latency_ms: 1.8
      };
    };

    var runSimulate = function () {
      var th = getSimThresh();
      if (LIVE) {
        fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ features: curFeatures, threshold: th })
        }).then(jsonOrThrow).then(renderSimResult).catch(function () {
          renderSimResult(offlineSimulate(curFeatures, th));
        });
      } else {
        renderSimResult(offlineSimulate(curFeatures, th));
      }
    };

    $$("[data-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pName = btn.getAttribute("data-preset");
        $$("[data-preset]").forEach(function (b) { b.classList.toggle("active", b === btn && pName !== "reset"); });
        applyPreset(pName);
      });
    });

    $$("[data-feat]", simBox).forEach(function (inp) {
      inp.addEventListener("input", function () {
        updateSliderLabels();
        $$("[data-preset]").forEach(function (b) { b.classList.remove("active"); });
        clearTimeout(simDebounceTimer);
        simDebounceTimer = setTimeout(runSimulate, 40);
      });
    });

    updateSliderLabels();
  }

  /* ---------- copy buttons ---------- */
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var src = b.parentElement.querySelector("pre, code"), text = src ? src.innerText : "";
      var done = function () { var o = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = o; }, 1400); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
    });
  });

  /* ---------- report filters ---------- */
  var fbtns = $$("[data-filter]");
  fbtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var f = b.getAttribute("data-filter");
      fbtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      $$("[data-kind]").forEach(function (r) { r.style.display = f === "all" || r.getAttribute("data-kind") === f ? "" : "none"; });
    });
  });

  /* ---------- contact form (local only) ---------- */
  var form = $("[data-form]");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var ok = $(".form-ok"); ok.style.display = "block";
    ok.textContent = "Thanks " + (form.elements.name.value || "there") + ". This is a local preview, so nothing was sent. Open an issue on GitHub to reach the maintainer.";
    form.reset();
  });

  /* ---------- notice banner ---------- */
  var notice = $(".notice");
  if (notice) {
    var seen = false;
    try { seen = localStorage.getItem("mf-notice") === "1"; } catch (e) {}
    if (!seen) setTimeout(function () { notice.classList.add("show"); }, 1600);
    $$("[data-notice-close]").forEach(function (b) { b.addEventListener("click", function () {
      notice.classList.remove("show"); try { localStorage.setItem("mf-notice", "1"); } catch (e) {}
    }); });
  }

  // Streamlit Studio Bridge probe (monorepo same-origin proxy at /studio/)
  var stLinks = $$("[data-st-link]");
  if (stLinks.length) {
    if (location.protocol === "file:") {
      stLinks.forEach(function (l) {
        l.setAttribute("href", "http://localhost:8501");
        l.setAttribute("title", "Open standalone Streamlit (localhost:8501)");
      });
    } else {
      fetch("/api/studio-status", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.enabled) {
            stLinks.forEach(function (l) {
              l.classList.add("st-online");
              l.setAttribute("title", d.running
                ? "Streamlit Studio is live at /studio/ · click to open"
                : "Streamlit Studio ready on demand at /studio/ · click to launch");
            });
          }
        }).catch(function () {});
    }
  }


  // Interactive Confusion Matrix Handler
  var cmBody = $("[data-cm-body]");
  if (cmBody) {
    var dPill = $("[data-cm-pill]"), dSum = $("[data-cm-summary]"), dTxt = $("[data-cm-text]");
    cmBody.addEventListener("click", function (e) {
      var cell = e.target.closest(".cm-cell");
      if (!cell) return;
      $$(".cm-cell", cmBody).forEach(function (c) { c.classList.remove("active-cell"); });
      cell.classList.add("active-cell");
      var t = cell.getAttribute("data-true"), p = cell.getAttribute("data-pred"), cnt = cell.getAttribute("data-cnt");
      var isDiag = t === p;
      if (dPill) {
        dPill.textContent = "True: " + t + " → Pred: " + p;
        dPill.className = "pill " + (isDiag ? "ok" : (cnt === "0" ? "snap" : "unk"));
      }
      if (dSum) {
        if (isDiag) {
          dSum.textContent = cnt + " of " + cell.getAttribute("data-tot") + " flows (" + cell.getAttribute("data-pct") + "% recall)";
        } else {
          dSum.textContent = cnt + " flow" + (cnt === "1" ? "" : "s") + " misclassified (" + (cnt === "0" ? "perfect separation" : "boundary confusion") + ")";
        }
      }
      if (dTxt) {
        if (isDiag) {
          dTxt.textContent = "Correctly classified flows. High statistical separation along primary timing features (inter-arrival cadence, packet rates, and active/idle periods).";
        } else if (cnt === "0") {
          dTxt.textContent = "Zero false classifications between " + t + " and " + p + ". The timing features for these two protocols are cleanly orthogonal.";
        } else {
          dTxt.textContent = cell.getAttribute("data-reason") || "Timing overlap in short duration observation windows.";
        }
      }
    });
  }

})();
