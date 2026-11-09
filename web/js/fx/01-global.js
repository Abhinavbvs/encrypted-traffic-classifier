/* MetaFlow fx 01 — global chrome on every page (ported from dozfx.com):
   loader veil + counter, highway starfield, custom cursor + pointer glow, magnetic buttons,
   glyph scramble, header hide/show + scroll progress, menu panel, [data-rv] reveals,
   right-edge GitHub tab, soft page transitions. Uses the shared MF core (00-core.js). */
"use strict";
var html = document.documentElement, body = document.body, S = MF.state;
var REPO = "https://github.com/Abhinavbvs/encrypted-traffic-classifier";
var FINE = !MF.coarse && !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
var GLY = "!<>-_\\/[]{}=+*^?#01";
function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return undefined; } return null; }
function el(tag, cls, htmlStr) { var e = document.createElement(tag); if (cls) e.className = cls; if (htmlStr) e.innerHTML = htmlStr; return e; }
html.classList.add("mf-js");

/* =====================================================================
   1. STARFIELD — "highway": horizontal streaks rushing right→left, depth tiers,
      ~14% magenta, magenta bias + longer trails as speed rises (scroll / warp).
   ===================================================================== */
var SF = { boost: store("mf-warp") === "1" ? 0.07 : 0, hold: 0, holdT: 0 };
store("mf-warp", null);
MF.sf = { boost: function (v) { SF.boost += v || 0.05; }, hold: function (v) { SF.holdT = v || 0; } };
(function starfield() {
  var cv = MF.$("canvas[data-starfield]");
  if (!cv) {
    cv = el("canvas"); cv.setAttribute("data-starfield", ""); cv.setAttribute("data-sf", "highway"); cv.setAttribute("aria-hidden", "true");
    body.insertBefore(cv, body.firstChild);
  }
  cv.classList.add("mf-sf");
  var ctx = cv.getContext("2d"); if (!ctx) return;
  var R = { idle: 0.0016, max: 0.046, decay: 0.93, power: 6e-5, trail: 5.2 };
  var W = 0, H = 0, dpr = 1, P = [], STARS = [], travel = Math.random() * 10, lastTravel = null;
  var speed = R.idle, mag = 0, vpx = 0, vpy = 0, fade = 1;
  var ALPHA = [0.2, 0.42, 0.78], WIDTH = [0.6, 1, 1.6], MAGW = [0.25, 0.6, 1];
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    var small = W < 560;
    dpr = 1;   /* streaks are 1px lines in motion: 1x canvas is visually identical, far cheaper */
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = small ? 170 : Math.round(MF.clamp(W * H / 4200, 220, 380));
    while (P.length < n) P.push({ u: Math.random(), v: Math.random(), k: 0.1 + Math.random() * 0.9, m: Math.random() > 0.86 });
    P.length = n;
    var ns = small ? 50 : 140;
    while (STARS.length < ns) STARS.push({ x: Math.random(), y: Math.random(), r: Math.random() < 0.15 ? 1.4 : 0.8, a: 0.12 + Math.random() * 0.4, f: 0.6 + Math.random() * 2.4, p: Math.random() * 6.28 });
    STARS.length = ns;
    if (MF.reduce) draw(0);
  }
  function draw(t) {
    var dT = lastTravel === null ? 0 : travel - lastTravel; lastTravel = travel;
    ctx.clearRect(0, 0, W, H);
    /* faint stars, drifting very slowly with the highway */
    ctx.fillStyle = "#fff";
    for (var s = 0; s < STARS.length; s++) {
      var st = STARS[s];
      st.x = (st.x - dT * 0.02 + 1) % 1;
      ctx.globalAlpha = st.a * fade * (0.55 + 0.45 * Math.sin(t * st.f + st.p));
      ctx.fillRect(st.x * W + vpx * 0.2, st.y * H + vpy * 0.2, st.r, st.r);
    }
    /* highway streaks */
    var L = Math.hypot(W, H) * 1.08, cx = W / 2, groups = [[], [], [], [], [], []];
    for (var i = 0; i < P.length; i++) {
      var q = P[i], k3 = 0.3 / q.k;
      q.u = (q.u + dT * k3) % 1;
      var x = cx - (q.u - 0.5) * L + vpx * k3,
          y = q.v * H * 1.1 - H * 0.05 + vpy * k3,
          T = Math.min(340, speed * R.trail * k3 * L);
      if (x < -T - 4 || x > W + 4) continue;
      var depth = 1 - q.k, tier = depth < 0.4 ? 0 : depth < 0.75 ? 1 : 2;
      groups[tier + (q.m ? 3 : 0)].push(x + T, y, x, y);
    }
    ctx.lineCap = "round";
    for (var g = 0; g < 6; g++) {
      var arr = groups[g], tierI = g % 3; if (!arr.length) continue;
      if (g > 2) ctx.strokeStyle = "#ff2bd6";
      else { var m = mag * MAGW[tierI]; ctx.strokeStyle = "rgb(255," + Math.round(255 - 212 * m) + "," + Math.round(255 - 41 * m) + ")"; }
      ctx.globalAlpha = ALPHA[tierI] * fade;
      ctx.lineWidth = WIDTH[tierI];
      ctx.beginPath();
      for (var j = 0; j < arr.length; j += 4) { ctx.moveTo(arr[j], arr[j + 1]); ctx.lineTo(arr[j + 2] + 0.01, arr[j + 3]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });
  MF.$$("[data-boost]").forEach(function (b) {
    b.addEventListener("pointerenter", function () { SF.holdT = 0.012; });
    b.addEventListener("pointerleave", function () { SF.holdT = 0; });
  });
  requestAnimationFrame(function () { cv.classList.add("is-live"); });
  if (MF.reduce) { speed = 0.0022; draw(0); return; }
  MF.tick(function (dt, st) {
    if (document.hidden) return;
    var f = dt * 60;
    SF.boost += Math.abs(st.vy) * dt * R.power;
    SF.boost *= Math.pow(R.decay, f); if (SF.boost < 1e-5) SF.boost = 0;
    SF.hold += (SF.holdT - SF.hold) * 0.06;
    speed = Math.min(R.max, R.idle + SF.boost) + SF.hold;
    mag = MF.clamp((speed - R.idle) / (R.max * 0.45), 0, 1);
    travel += speed * f;
    /* past the first screen the streaks sit behind body copy: keep them faint (dozfx lower sections) */
    var fT = st.y < st.vh * 0.6 ? 0.9 : 0.34;
    if (html.classList.contains("menu-open")) fT = 0.5;
    fade += (fT - fade) * 0.04;
    if (FINE) {
      vpx += (MF.clamp((st.mx - W / 2) * -0.06, -48, 48) - vpx) * 0.04;
      vpy += (MF.clamp((st.my - H / 2) * -0.06, -40, 40) - vpy) * 0.04;
    }
    draw(st.t);
  });
})();

/* =====================================================================
   2. LOADER — first visit per session: black veil, logo + wordmark, big tabular
      counter 0→100, magenta bloom, exits with a mask sliding up. ≤ ~1.6 s.
   ===================================================================== */
var ldDone = false;
function finishLoader() {
  if (ldDone) return; ldDone = true;
  html.classList.remove("mf-ld");
  html.classList.add("ld-done", "mf-ld-done");
  try { document.dispatchEvent(new CustomEvent("mf:ld-done")); } catch (e) {}
}
(function loader() {
  var seen = store("mf-ld");
  if (seen !== null || MF.reduce) { finishLoader(); return; } /* seen, or storage blocked, or reduced motion */
  store("mf-ld", "1");
  html.classList.add("mf-ld");
  var mark = MF.$(".hdr .logo-mark");
  var v = el("div", "mf-ld");
  v.setAttribute("aria-hidden", "true");
  v.innerHTML =
    '<div class="mf-ld__in">' +
      '<div class="mf-ld__top"><span class="mf-ld__brand"><i class="mf-ld__mark"></i><b>Meta<em>Flow</em></b></span>' +
        '<span class="mf-ld__k">Encrypted traffic classifier<br>Timing only · zero payload</span></div>' +
      '<div class="mf-ld__bot"><span class="mf-ld__lab"><span>Reading the rhythm</span><span>7 classes · 23 features</span></span>' +
        '<b class="mf-ld__n" data-ld>0<i>%</i></b></div>' +
    '</div><i class="mf-ld__bar"><i></i></i>';
  if (mark) v.querySelector(".mf-ld__mark").appendChild(mark.cloneNode(true));
  body.appendChild(v);
  var n = v.querySelector("[data-ld]"), bar = v.querySelector(".mf-ld__bar i"), prev = performance.now(), acc = 0, DUR = 900, last = -1;
  function step(now) {
    /* progress advances by frame time capped at 40 ms, so a main-thread stall (GPU/WebGL start-up) pauses the count
       instead of making it jump from 0 to 100; and a rAF timestamp older than `prev` never counts backwards */
    acc += MF.clamp(now - prev, 0, 40); prev = Math.max(prev, now);
    var k = MF.clamp(acc / DUR, 0, 1), e = 1 - Math.pow(1 - k, 2.4), val = Math.round(e * 100);
    if (val !== last) { last = val; n.firstChild.nodeValue = String(val); bar.style.transform = "scaleX(" + e.toFixed(3) + ")"; }
    if (k < 1) return requestAnimationFrame(step);
    setTimeout(function () {
      v.classList.add("is-out");
      finishLoader();
      MF.sf.boost(0.05);
      setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 760);
    }, 90);
  }
  requestAnimationFrame(step);
  setTimeout(function () { if (!ldDone) { finishLoader(); if (v.parentNode) v.parentNode.removeChild(v); } }, 3000); /* failsafe */
})();

/* =====================================================================
   3. GLYPH SCRAMBLE — resolves left→right (dozfx: 18 steps × 34 ms)
   ===================================================================== */
function textNodesOf(root) {
  var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
  while ((n = w.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    var p = n.parentNode, skip = false;
    while (p && p !== root) { if (p.nodeType === 1 && (p.matches(".n, .arr, svg, .live-dot") || p.tagName === "svg")) { skip = true; break; } p = p.parentNode; }
    if (!skip) out.push(n);
  }
  return out;
}
function scramble(target, steps, ms) {
  if (MF.reduce || !target || target._mfScr) return;
  var nodes = textNodesOf(target); if (!nodes.length) return;
  var orig = nodes.map(function (x) { return x.nodeValue; }), total = orig.join("").length, a = 0;
  steps = steps || 18; ms = ms || 34; target._mfScr = 1;
  (function frame() {
    a++;
    var d = Math.floor(total * a / steps), off = 0;
    for (var i = 0; i < nodes.length; i++) {
      var s = orig[i], k = MF.clamp(d - off, 0, s.length);
      nodes[i].nodeValue = s.slice(0, k) + s.slice(k).replace(/\S/g, function () { return GLY[Math.random() * GLY.length | 0]; });
      off += s.length;
    }
    if (a < steps) setTimeout(frame, ms);
    else { for (var j = 0; j < nodes.length; j++) nodes[j].nodeValue = orig[j]; target._mfScr = 0; }
  })();
}
MF.scramble = scramble;
if (!MF.reduce) {
  /* [data-scramble] resolves once as it scrolls into view (only those below the fold, like dozfx) */
  MF.ready(function () {
    MF.$$("[data-scramble]").forEach(function (s) {
      if (s.getBoundingClientRect().top > S.vh * 0.9) MF.inView(s, function () { scramble(s); });
    });
  });
  /* …and on hover: menu links, side/legal links, .mono labels inside links, [data-scramble] */
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    var t = e.target; if (!t.closest) return;
    var ds = t.closest("[data-scramble]");
    if (ds && !(e.relatedTarget && ds.contains(e.relatedTarget))) scramble(ds);
    var a = t.closest("a, button"); if (!a || (e.relatedTarget && a.contains(e.relatedTarget))) return;
    if (a.matches(".menu-main a")) scramble(a.querySelector(".ml") || a, 14, 30);
    else if (a.matches(".menu-side a, .ftr-legal a, .crumbs a")) scramble(a, 12, 30);
    MF.$$(".mono", a).forEach(function (m) { scramble(m, 12, 32); });
  }, { passive: true });
}

/* =====================================================================
   4. CUSTOM CURSOR + POINTER GLOW (fine pointers only, not reduced motion)
   ===================================================================== */
if (FINE && !MF.reduce) (function cursor() {
  html.classList.add("has-cursor");
  var c = el("div", "mf-cursor", '<span class="mf-cursor__ring"></span><span class="mf-cursor__dot"></span><span class="mf-cursor__label"></span>');
  c.setAttribute("aria-hidden", "true"); body.appendChild(c);
  var glow = el("div", "mf-glow"); glow.setAttribute("aria-hidden", "true");
  var sf = MF.$(".mf-sf"); body.insertBefore(glow, sf ? sf.nextSibling : body.firstChild);
  var ring = c.children[0], dot = c.children[1], label = c.children[2];
  var rx = S.mx, ry = S.my, gx = S.mx, gy = S.my, started = false;
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    if (!started) { started = true; rx = gx = e.clientX; ry = gy = e.clientY; c.style.opacity = 1; }
    dot.style.translate = e.clientX + "px " + e.clientY + "px";
    var t = e.target.closest ? e.target.closest("a, button, summary, select, input, textarea, label, [role=button], [data-cursor]") : null;
    var v = t && t.closest("[data-cursor]");
    c.classList.toggle("is-view", !!v);
    c.classList.toggle("is-link", !!t && !v);
    if (v && label.textContent !== v.getAttribute("data-cursor")) label.textContent = v.getAttribute("data-cursor");
    glow.classList.toggle("is-on", !(e.target.closest && e.target.closest("footer, .ftr, .menu")));
  }, { passive: true });
  window.addEventListener("pointerdown", function () { c.classList.add("is-down"); });
  window.addEventListener("pointerup", function () { c.classList.remove("is-down"); });
  document.addEventListener("mouseleave", function () { c.style.opacity = 0; glow.classList.remove("is-on"); });
  document.addEventListener("mouseenter", function () { c.style.opacity = 1; });
  MF.tick(function () {
    if (!started) return;
    rx += (S.mx - rx) * 0.2; ry += (S.my - ry) * 0.2;
    gx += (S.mx - gx) * 0.07; gy += (S.my - gy) * 0.07;
    var r = rx.toFixed(1) + "px " + ry.toFixed(1) + "px";
    ring.style.translate = r; label.style.translate = r;
    glow.style.transform = "translate3d(" + gx.toFixed(1) + "px," + gy.toFixed(1) + "px,0)";
  });
})();

/* =====================================================================
   5. MAGNETIC — .btn, .menu-btn, .menu-close, [data-magnetic]: the element and its inner
      content follow the pointer on a spring. Uses the CSS `translate` property so it
      composes with any transform the element already has.
   ===================================================================== */
var MAG_SEL = ".btn, .menu-btn, .menu-close, [data-magnetic]";
function fillVars(b, e) { if (!b.classList.contains("btn")) return; var r = b.getBoundingClientRect(); b.style.setProperty("--fx", (e.clientX - r.left) + "px"); b.style.setProperty("--fy", (e.clientY - r.top) + "px"); b.style.setProperty("--fs", (2.2 * Math.hypot(r.width, r.height)) + "px"); }
if (FINE && !MF.reduce) (function magnetic() {
  var active = [], cur = null;
  function rec(b) {
    for (var i = 0; i < active.length; i++) if (active[i].el === b) return active[i];
    var inner = null;
    for (var k = 0; k < b.children.length; k++) if (b.children[k].classList.contains("mf-mg")) inner = b.children[k];
    if (!inner && !b.hasAttribute("data-no-wrap") && b.childNodes.length) {
      inner = el("span", "mf-mg");
      while (b.firstChild) inner.appendChild(b.firstChild);
      b.appendChild(inner);
    }
    var o = { el: b, inner: inner, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, ix: 0, iy: 0, ivx: 0, ivy: 0 };
    active.push(o); return o;
  }
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse" || !e.target.closest) return;
    var b = e.target.closest(MAG_SEL);
    if (b !== cur) {
      if (cur) { var oc = rec(cur); oc.tx = oc.ty = 0; fillVars(cur, e); }
      cur = b; if (b) fillVars(b, e);
    }
    if (!b) return;
    var o = rec(b), r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    var big = r.width > 260 || r.height > 120 ? 0.5 : 1;
    o.tx = MF.clamp(dx * 0.3, -10, 10) * big; o.ty = MF.clamp(dy * 0.4, -8, 8) * big;
  }, { passive: true });
  document.addEventListener("mouseleave", function () { active.forEach(function (o) { o.tx = o.ty = 0; }); cur = null; });
  MF.tick(function (dt) {
    for (var i = active.length - 1; i >= 0; i--) {
      var o = active[i], h = Math.min(dt, 0.032);
      /* spring: stiffness 260, damping 20 (element); inner leads by 50% with a softer spring */
      o.vx += ((o.tx - o.x) * 260 - o.vx * 20) * h; o.vy += ((o.ty - o.y) * 260 - o.vy * 20) * h;
      o.x += o.vx * h; o.y += o.vy * h;
      o.ivx += ((o.tx * 0.5 - o.ix) * 180 - o.ivx * 16) * h; o.ivy += ((o.ty * 0.5 - o.iy) * 180 - o.ivy * 16) * h;
      o.ix += o.ivx * h; o.iy += o.ivy * h;
      var rest = !o.tx && !o.ty && Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.ix) + Math.abs(o.iy) < 0.05 && Math.abs(o.vx) + Math.abs(o.vy) < 0.05;
      if (rest) {
        o.el.style.translate = "";
        if (o.inner) o.inner.style.translate = "";
        active.splice(i, 1); continue;
      }
      o.el.style.translate = o.x.toFixed(2) + "px " + o.y.toFixed(2) + "px";
      if (o.inner && o.inner.parentNode === o.el) o.inner.style.translate = o.ix.toFixed(2) + "px " + o.iy.toFixed(2) + "px";
    }
  });
})();

/* =====================================================================
   6. HEADER — hides on scroll down, returns on scroll up; 1px magenta scroll progress
   ===================================================================== */
var hdr = MF.$(".hdr");
(function header() {
  var prog = el("div", "mf-progress"); prog.setAttribute("aria-hidden", "true"); body.appendChild(prog);
  var mb = MF.$(".hdr .menu-btn");
  if (mb && !mb.querySelector(".mf-mb-t")) {
    var icon = mb.querySelector("span"); if (icon) icon.classList.add("mf-mb-i");
    var t = el("span", "mf-mb-t"); t.textContent = "Menu"; t.setAttribute("aria-hidden", "true");
    mb.insertBefore(t, mb.firstChild);
  }
  var lastY = S.y, hidden = false, docH = 0, cnt = 0;
  function measure() { docH = Math.max(document.documentElement.scrollHeight, body.scrollHeight); }
  measure(); window.addEventListener("resize", measure, { passive: true }); window.addEventListener("load", measure);
  MF.tick(function (dt, st) {
    if (++cnt % 60 === 0) measure();
    var y = st.y;
    if (hdr) {
      var down = y > lastY + 3, up = y < lastY - 3;
      var lock = html.classList.contains("menu-open") || hdr.contains(document.activeElement);
      if (down && y > 220 && !lock) { if (!hidden) { hdr.classList.add("is-hidden"); hidden = true; } }
      else if ((up || y < 220 || lock) && hidden) { hdr.classList.remove("is-hidden"); hidden = false; }
    }
    if (Math.abs(y - lastY) > 0.5 || cnt < 3) {
      var span = docH - st.vh;
      prog.style.transform = "scaleX(" + (span > 0 ? MF.clamp(y / span, 0, 1) : 0).toFixed(4) + ")";
    }
    lastY = y;
  });
})();

/* =====================================================================
   7. MENU — side panel + scrim, staggered line reveal, scramble per line on open.
      main.js still owns open/close ([data-menu-open]/[data-menu-close], Escape).
   ===================================================================== */
(function menu() {
  var m = MF.$(".menu"); if (!m) return;
  MF.$$(".menu-main li", m).forEach(function (li, i) {
    li.style.setProperty("--i", i);
    var a = li.querySelector("a"); if (!a || a.querySelector(".ml")) return;
    Array.prototype.slice.call(a.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && n.nodeValue.trim()) { var s = el("span", "ml"); s.textContent = n.nodeValue; a.replaceChild(s, n); }
    });
  });
  MF.$$(".menu-side .grp", m).forEach(function (g, i) { g.style.setProperty("--i", i); });
  var scrim = el("div", "mf-scrim"); scrim.setAttribute("aria-hidden", "true"); body.appendChild(scrim);
  scrim.addEventListener("click", function () { var c = MF.$("[data-menu-close]"); if (c) c.click(); });
  function sync() {
    var open = m.classList.contains("open");
    if (open === html.classList.contains("menu-open")) return;
    html.classList.toggle("menu-open", open);
    if (open) {
      if (hdr) hdr.classList.remove("is-hidden");
      MF.$$(".menu-main .ml", m).forEach(function (s, i) { setTimeout(function () { scramble(s, 14, 30); }, 160 + i * 45); });
    }
  }
  if ("MutationObserver" in window) new MutationObserver(sync).observe(m, { attributes: true, attributeFilter: ["class"] });
})();

/* =====================================================================
   8. REVEAL — [data-rv] (main.js already handles .rv). Elements that enter together
      stagger by 90 ms; data-rv="200" sets an explicit delay in ms.
   ===================================================================== */
(function reveal() {
  var io = null;
  if (!MF.reduce && "IntersectionObserver" in window) {
    io = new IntersectionObserver(function (es) {
      var n = 0;
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var t = en.target, d = t.getAttribute("data-rv");
        if (!t.style.getPropertyValue("--rv-delay")) t.style.setProperty("--rv-delay", (d && !isNaN(+d) ? +d : n * 90) + "ms");
        n++; t.classList.add("in"); io.unobserve(t);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
  }
  function scan() {
    MF.$$("[data-rv]").forEach(function (t) {
      if (t._mfRv) return; t._mfRv = 1;
      if (io) io.observe(t); else t.classList.add("in");
    });
  }
  MF.ready(scan); window.addEventListener("load", scan);
  MF.rvScan = scan;
})();

/* =====================================================================
   9. RIGHT-EDGE TAB — dozfx's award tab, as a GitHub link
   ===================================================================== */
(function tab() {
  if (MF.$(".mf-tab")) return;
  var a = el("a", "mf-tab", '<span class="mf-tab__s" aria-hidden="true">★</span><span class="mf-tab__t">GitHub</span>');
  a.href = REPO; a.target = "_blank"; a.rel = "noopener";
  a.setAttribute("aria-label", "MetaFlow on GitHub (opens in a new tab)");
  a.setAttribute("data-cursor", "Star");
  body.appendChild(a);
})();

/* =====================================================================
   10. PAGE TRANSITIONS — soft fade out + starfield warp on internal links;
       the next page fades in under the CSS entry veil (body::after).
   ===================================================================== */
(function transitions() {
  var veil = el("div", "mf-pt"); veil.setAttribute("aria-hidden", "true"); body.appendChild(veil);
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || /^(mailto|tel|javascript):/i.test(href)) return;
    var url; try { url = new URL(a.href, location.href); } catch (er) { return; }
    if (url.protocol !== location.protocol || url.host !== location.host) return;
    if (!/(\.html?|\/)$/i.test(url.pathname)) return;                       /* pages only, not media/files */
    if (url.pathname === location.pathname && url.search === location.search) return; /* same page / in-page anchor */
    store("mf-warp", "1");
    if (MF.reduce) return;
    e.preventDefault();
    MF.sf.boost(0.08);
    html.classList.add("is-leaving");
    var go = function () { if (!go.d) { go.d = 1; location.href = a.href; } };
    setTimeout(go, html.classList.contains("menu-open") ? 380 : 300);
  });
  window.addEventListener("pageshow", function (e) { if (e.persisted) html.classList.remove("is-leaving"); });
})();
