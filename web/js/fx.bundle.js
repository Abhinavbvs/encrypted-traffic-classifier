/* ---- fx/00-core.js ---- */
/* MetaFlow fx core: tiny shared helpers every fx module uses. Loaded first in js/fx.bundle.js. */
window.MF = window.MF || (function () {
  "use strict";
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  var ticks = [];
  var state = { y: window.scrollY, vy: 0, vh: window.innerHeight, vw: window.innerWidth, mx: window.innerWidth / 2, my: window.innerHeight / 2, t: 0 };
  var lastY = state.y, lastT = performance.now();

  function loop(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000) || 0.016; lastT = now; state.t += dt;
    var y = window.scrollY;
    var v = (y - lastY) / dt; lastY = y;
    state.vy += (v - state.vy) * 0.15;   // smoothed scroll velocity, px/s
    state.y = y;
    for (var i = 0; i < ticks.length; i++) { try { ticks[i](dt, state); } catch (e) { console.error(e); ticks.splice(i--, 1); } }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.addEventListener("resize", function () { state.vh = window.innerHeight; state.vw = window.innerWidth; }, { passive: true });
  window.addEventListener("pointermove", function (e) { state.mx = e.clientX; state.my = e.clientY; }, { passive: true });

  var api = {
    reduce: reduce,          // prefers-reduced-motion
    coarse: coarse,          // touch device
    state: state,            // { y, vy (smoothed px/s), vh, vw, mx, my, t }
    $: function (s, r) { return (r || document).querySelector(s); },
    $$: function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); },
    clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    ease: function (t) { return 1 - Math.pow(1 - t, 3); },
    /* run fn(dt, state) every animation frame; returns an unsubscribe function */
    tick: function (fn) { ticks.push(fn); return function () { var i = ticks.indexOf(fn); if (i > -1) ticks.splice(i, 1); }; },
    /* 0 when el's top hits the bottom of the viewport, 1 when its bottom leaves the top */
    progress: function (el) { var r = el.getBoundingClientRect(); return api.clamp((state.vh - r.top) / (state.vh + r.height), 0, 1); },
    /* for a tall "pinned" wrapper (height > 100vh, with a sticky child): 0 at pin start, 1 at pin end */
    pin: function (el) { var r = el.getBoundingClientRect(), span = r.height - state.vh; return span <= 0 ? 0 : api.clamp(-r.top / span, 0, 1); },
    /* is any part of el on screen */
    onScreen: function (el, margin) { var r = el.getBoundingClientRect(), m = margin || 0; return r.bottom > -m && r.top < state.vh + m; },
    /* call cb(el) once when el first enters the viewport */
    inView: function (el, cb, opts) {
      if (!("IntersectionObserver" in window)) return cb(el);
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); cb(e.target); } }); }, opts || { threshold: 0.15 });
      io.observe(el);
    },
    /* run fn once the DOM is ready */
    ready: function (fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  };
  return api;
})();

/* ---- fx/01-global.js ---- */
;(function(){try{
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

}catch(e){console.error('fx/01-global.js', e)}})();
/* ---- fx/05-shapes.js ---- */
;(function(){try{
/* MetaFlow fx 05: the 3D shape engine (port of dozfx's [data-ico] chrome objects).
   Every <canvas class="mf-shape" data-shape="..."> becomes a glossy chrome + magenta object: raymarched signed-distance
   shapes in ONE shared offscreen WebGL context, copied into each canvas with drawImage (as dozfx does), so a page can
   carry a dozen of them without a dozen GL contexts.
   Attributes: data-shape (kind) data-size (px, used when CSS gives no size) data-spin (rad/s, default .35)
   data-drag (drag to rotate with inertia, cursor label "Drag") data-float (sine bob) data-par (scroll parallax factor)
   data-tint (chrome | mag | violet).  API: MF.shapes.mount(canvas), MF.shapes.kinds. */
var MF = window.MF;

var SH_KINDS = ["cube", "cone", "rings", "capsule", "torus", "sphere", "bowl", "arch", "dish", "gem", "hex", "tube", "prism", "spring", "link", "pyramid"];
var SH_ID = {}; SH_KINDS.forEach(function (k, i) { SH_ID[k] = i; });
SH_ID.saucer = SH_ID.dish; SH_ID.ring = SH_ID.torus; SH_ID.puck = SH_ID.dish;
/* each kind's resting pose (x, y, z Euler, radians), straight from the reference */
var SH_POSE = { cube: [.5, .6, 0], cone: [-.3, 0, 0], rings: [.35, .45, .15], capsule: [0, 0, .8], torus: [1.1, 0, .1], sphere: [0, 0, 0],
  bowl: [.45, 0, 0], arch: [.15, 0, 0], dish: [.95, .45, .2], gem: [.25, .5, 0], hex: [.35, .4, 0], tube: [.5, 0, .3], prism: [.3, .5, 0],
  spring: [.35, 0, .15], link: [.3, .6, .2], pyramid: [.18, .5, 0] };
var SH_TINT = { chrome: 0, mag: 1, magenta: 1, violet: 2 };

/* ---------------- GLSL (ES 1.00 so it runs on WebGL1 and WebGL2) ---------------- */
var SH_SDF = [
  "float sdBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }",
  "float sdTor(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }",
  "float sdCone(vec3 p, float h, float r1, float r2){",
  "  vec2 q = vec2(length(p.xz), p.y), k1 = vec2(r2, h), k2 = vec2(r2 - r1, 2. * h);",
  "  vec2 ca = vec2(q.x - min(q.x, q.y < 0. ? r1 : r2), abs(q.y) - h);",
  "  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0., 1.);",
  "  float s = (cb.x < 0. && ca.y < 0.) ? -1. : 1.;",
  "  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));",
  "}",
  "float sdOct(vec3 p, float s){ p = abs(p); float m = p.x + p.y + p.z - s; vec3 q;",
  "  if (3. * p.x < m) q = p; else if (3. * p.y < m) q = p.yzx; else if (3. * p.z < m) q = p.zxy; else return m * .57735027;",
  "  float k = clamp(.5 * (q.z - q.y + s), 0., s); return length(vec3(q.x, q.y - s + k, q.z - k)); }",
  "float sdHex(vec3 p, vec2 h){ vec3 k = vec3(-.8660254, .5, .57735); p = abs(p); p.xy -= 2. * min(dot(k.xy, p.xy), 0.) * k.xy;",
  "  vec2 d = vec2(length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x), p.z - h.y);",
  "  return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }",
  "float sdLink(vec3 p, float le, float r1, float r2){ vec3 q = vec3(p.x, max(abs(p.y) - le, 0.), p.z); return length(vec2(length(q.xy) - r1, q.z)) - r2; }",
  "float sdB2(vec2 d){ return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }",
  "float sdRc(vec3 p, float ra, float h, float rr){ vec2 d = vec2(length(p.xy) - ra + rr, abs(p.z) - h + rr); return min(max(d.x, d.y), 0.) + length(max(d, 0.)) - rr; }",
  /* square pyramid (Inigo Quilez), base a unit square on y = 0, apex at y = h */
  "float sdPyr(vec3 p, float h){ float m2 = h * h + .25; p.xz = abs(p.xz); if (p.z > p.x) p.xz = p.zx; p.xz -= .5;",
  "  vec3 q = vec3(p.z, h * p.y - .5 * p.x, h * p.x + .5 * p.y); float s = max(-q.x, 0.);",
  "  float t = clamp((q.y - .5 * p.z) / (m2 + .25), 0., 1.);",
  "  float a = m2 * (q.x + s) * (q.x + s) + q.y * q.y; float b = m2 * (q.x + .5 * t) * (q.x + .5 * t) + (q.y - m2 * t) * (q.y - m2 * t);",
  "  float d2 = min(q.y, -q.x * m2 - q.y * .5) > 0. ? 0. : min(a, b);",
  "  return sqrt((d2 + q.z * q.z) / m2) * sign(max(q.z, -p.y)); }",
].join("\n");
/* soft forms: generous radii everywhere, every shape centred on its own mass and inside r = 1.
   One program per kind (only that kind's SDF is compiled): one shader holding all 16 SDFs inside an unrolled 110-step
   march took 8–14 s to link on D3D11 (Intel Iris Xe) and froze the page. */
var SH_BODY = [
  "return sdBox(p, vec3(.53), .19);",
  "return sdCone(p - vec3(0., .24, 0.), .47, .66, .0) - .055;",
  "float R = .4, r = .125; vec3 q = p - vec3(-.2, 0., 0.); float c = .93, s = .37; q.xy = mat2(c, -s, s, c) * q.xy;" +
  " float d = sdTor(q, vec2(R, r)); q = p - vec3(.2, 0., 0.); s = -.37; q.yz = mat2(c, -s, s, c) * q.yz; return min(d, sdTor(q.xzy, vec2(R, r)));",
  "vec3 q = p; q.y -= clamp(q.y, -.4, .4); return length(q) - .34;",
  "return sdTor(p, vec2(.52, .27));",
  "return length(p) - .78;",
  "vec3 q = p - vec3(0., .3, 0.); return max(length(q) - .74, q.y + .03) - .07;",
  "vec3 q = p + vec3(0., .34, 0.); return max(sdTor(q.xzy, vec2(.55, .17)), .06 - q.y) - .06;",
  "return sdRc(p, .74, .17, .14);",
  "return sdOct(vec3(p.x, p.y * .8, p.z), .6) * .8 - .1;",
  "return max(sdHex(p, vec2(.62, .15)) - .07, .28 - length(p.xy));",
  "return sdB2(vec2(abs(length(p.xz) - .36) - .05, abs(p.y) - .54)) - .06;",
  "vec3 q = abs(p); return max(q.z - .3, max(q.x * .866025 + p.y * .5, -p.y) - .32) - .09;",
  "float R = .42, P = .34, a = atan(p.z, p.x), y = p.y - P * a / 6.2831853;" +
  " y = mod(y + .5 * P, P) - .5 * P; return max(length(vec2(length(p.xz) - R, y)) - .1, abs(p.y) - .54) * .85;",
  "vec3 qa = p - vec3(0., .27, 0.), qb = (p + vec3(0., .27, 0.)).zyx; return min(sdLink(qa, .15, .27, .11), sdLink(qb, .15, .27, .11));",
  "return sdPyr((p + vec3(0., .36, 0.)) / 1.12, .82) * 1.12 - .06;"
];

var SH_FRAG = [
  "uniform vec2 uRes;",
  "uniform mat3 uR;",
  "uniform int uTint;",
  SH_SDF,
  "float shp(vec3 p){ $BODY }",
  /* a studio for the chrome: dark floor, grey horizon, bright sky, two softboxes, a strip light, a magenta band low in the room */
  "vec3 envI(vec3 r, vec3 neon){",
  "  float y = r.y;",
  "  vec3 c = mix(vec3(.015, .012, .02), vec3(.13, .13, .15), smoothstep(-.7, .02, y));",
  "  c += vec3(.5, .52, .58) * smoothstep(-.04, .1, y) * (1. - smoothstep(.1, .42, y)) * .55;",
  "  c += vec3(.85, .88, 1.) * smoothstep(.25, .95, y) * .4;",
  "  c += vec3(1.) * smoothstep(.74, .93, dot(r, normalize(vec3(-.45, .75, .5)))) * 1.9;",
  "  c += vec3(1.) * smoothstep(.9, .975, dot(r, normalize(vec3(.75, .25, .6)))) * 1.6;",
  "  c += vec3(1.) * smoothstep(.07, .0, abs(r.x + .62)) * smoothstep(-.3, .25, y) * 1.1;",
  "  c += vec3(.9, .92, 1.) * smoothstep(.05, .0, abs(r.x - .55 + r.y * .2)) * smoothstep(-.1, .4, y) * .7;",
  "  c *= .8 + .2 * smoothstep(-.4, .4, sin(r.y * 9. + r.x * 2.));",
  "  c += neon * smoothstep(-.06, -.24, y) * (1. - smoothstep(-.32, -.66, y)) * 1.15;",
  "  c += vec3(.05, .045, .06) * smoothstep(-.2, -.9, y);",
  "  return c;",
  "}",
  "float map(vec3 w){ return shp(uR * w); }",
  "$NRM",
  "void main(){",
  "  vec2 uv = (gl_FragCoord.xy * 2. - uRes) / uRes.y;",
  "  vec3 ro = vec3(0., 0., 5.2), rd = normalize(vec3(uv * .198, -1.));",
  "  float b = dot(ro, rd), c = dot(ro, ro) - 1., h = b * b - c;",
  "  if (h < 0.) { gl_FragColor = vec4(0.); return; }",
  "  h = sqrt(h);",
  "  float t = -b - h, t1 = -b + h, dm = 1e9, tm = t; bool hit = false;",
  "  for (int i = 0; i < $STEPS; i++) {",
  "    float d = map(ro + rd * t);",
  "    if (d < dm) { dm = d; tm = t; }",
  "    if (d < .0005) { hit = true; break; }",
  "    t += d * .9;",
  "    if (t > t1) break;",
  "  }",
  "  float px = 2.2 / uRes.y * .198;",
  "  float a = hit ? 1. : 1. - smoothstep(0., px * tm, dm);",
  "  if (a <= 0.) { gl_FragColor = vec4(0.); return; }",
  "  vec3 p = ro + rd * (hit ? t : tm), n = nrm(p), v = -rd;",
  "  vec3 neon = uTint == 2 ? vec3(.62, .22, 1.) : vec3(1., .05, .85);",
  "  vec3 L1 = normalize(vec3(-.55, .7, .65)), L2 = normalize(vec3(.85, -.15, .35));",
  "  float dif = max(dot(n, L1), 0.), dif2 = max(dot(n, L2), 0.);",
  "  float ao = clamp(map(p + n * .1) / .1, 0., 1.); ao = .45 + .55 * ao;",
  "  vec3 r = reflect(rd, n);",
  "  float nv = 1. - max(dot(n, v), 0.);",
  "  float fr = .62 + .38 * pow(nv, 4.);",
  /* chrome: almost no colour of its own, it is the room it reflects; the room is close, so flat faces carry gradients */
  "  vec3 col = envI(normalize(r + p * .38), neon) * fr * (.45 + .55 * ao) + vec3(.03) * dif;",
  "  col += pow(max(dot(reflect(-L1, n), v), 0.), 90.) * 1.4;",
  "  col += neon * smoothstep(-.35, -.95, n.y) * .28 * ao * fr;",
  "  if (uTint > 0) {",
  /* the hero's liquid: chrome washed in the tint (lavender faces, neon underside), with a lit coloured body mixed in */
  "    vec3 base = uTint == 2 ? vec3(.55, .2, 1.) : vec3(1., .08, 1.);",
  "    vec3 wash = uTint == 2 ? vec3(.78, .7, 1.) : vec3(1., .82, 1.);",
  "    float box = smoothstep(.72, .93, dot(r, normalize(vec3(-.45, .75, .5))));",
  "    float fre = pow(nv, 3.);",
  "    vec3 lit = base * (.1 + .55 * dif + .25 * dif2) * ao + vec3(1., .85, 1.) * box * .6 * (.35 + .65 * ao);",
  "    lit += base * fre * .5 + base * smoothstep(-.2, -.9, n.y) * .9 * ao;",
  "    col = mix(col * wash, lit, .28);",
  "  }",
  "  col = 1. - exp(-col * 1.9);",
  "  gl_FragColor = vec4(col * a, a);",
  "}"
].join("\n");

var SH_VERT = "attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0., 1.); }";
var SH_VERT3 = "#version 300 es\nin vec2 aP; void main(){ gl_Position = vec4(aP, 0., 1.); }";
/* WebGL2: uniform loop bounds (uN = 110, uZ = 0) keep the D3D compiler from unrolling the march and inlining the SDF
   hundreds of times; the normal is iq's 4-tap tetrahedron in a loop for the same reason. WebGL1 needs constant bounds. */
function shFragSrc(gl2, id) {
  var s = SH_FRAG.replace("$BODY", SH_BODY[id] || SH_BODY[0]);
  if (gl2) {
    s = s.replace("$STEPS", "uN").replace("$NRM",
      "vec3 nrm(vec3 p){ vec3 n = vec3(0.); for (int i = uZ; i < 4; i++) { vec3 e = .5773 * (2. * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.); n += e * map(p + e * .0015); } return normalize(n); }")
      .replace(/gl_FragColor/g, "fragOut");
    return "#version 300 es\nprecision highp float;\nprecision highp int;\nout vec4 fragOut;\nuniform int uN;\nuniform int uZ;\n" + s;
  }
  return "precision highp float;\n" + s.replace("$STEPS", "110").replace("$NRM",
    "vec3 nrm(vec3 p){ vec2 e = vec2(.0015, 0.); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }");
}

/* ---------------- 3x3 rotation helpers (column-major, as the reference) ---------------- */
function shMul(x, w) { var T = new Array(9); for (var q = 0; q < 3; q++) for (var j = 0; j < 3; j++) T[q * 3 + j] = x[j] * w[q * 3] + x[3 + j] * w[q * 3 + 1] + x[6 + j] * w[q * 3 + 2]; return T; }
function shRx(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; }
function shRy(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; }
function shRz(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; }
function shLen(x) { return Math.hypot(x[0], x[1], x[2]); }
function shNorm(x) { var l = shLen(x) || 1; return [x[0] / l, x[1] / l, x[2] / l]; }
function shAxis(x, a) { var c = Math.cos(a), s = Math.sin(a), t = 1 - c, X = x[0], Y = x[1], Z = x[2];
  return [t * X * X + c, t * X * Y + s * Z, t * X * Z - s * Y, t * X * Y - s * Z, t * Y * Y + c, t * Y * Z + s * X, t * X * Z + s * Y, t * Y * Z - s * X, t * Z * Z + c]; }
function shApply(m, x) { return [m[0] * x[0] + m[3] * x[1] + m[6] * x[2], m[1] * x[0] + m[4] * x[1] + m[7] * x[2], m[2] * x[0] + m[5] * x[1] + m[8] * x[2]]; }
function shOrtho(m) { var a = shNorm([m[0], m[1], m[2]]), b0 = [m[3], m[4], m[5]], d = a[0] * b0[0] + a[1] * b0[1] + a[2] * b0[2];
  var b = shNorm([b0[0] - a[0] * d, b0[1] - a[1] * d, b0[2] - a[2] * d]);
  return [a[0], a[1], a[2], b[0], b[1], b[2], a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function shTurn(it, w, dt) { var a = shLen(w) * dt; if (a > 1e-6) it.R = shMul(shAxis(shNorm(w), a), it.R); }

/* ---------------- the shared GL context ---------------- */
var SH_MAX = 768;          // largest square the shared buffer renders (device px)
var shGL = null, shCv = null, shSoft = false, shQ = 1, shDead = false;
var shMat = new Float32Array(9);
var shGL2 = false, shPar = null, shVS = null, shProgs = {}, shCur = null, shBusy = 0;

/* per-kind programs, linked lazily. With KHR_parallel_shader_compile the link runs off the main thread and is polled;
   without it, at most one program is linked per frame so the page never stalls on a pile of compiles. */
function shProg(id) {
  var gl = shGL, P = shProgs[id];
  if (P) {
    if (P.st === 0 && shPar && gl.getProgramParameter(P.pr, shPar.COMPLETION_STATUS_KHR)) shFinish(P);
    return P;
  }
  if (!shPar && shBusy > 0) return null;   // one synchronous link per frame
  shBusy++;
  var fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, shFragSrc(shGL2, id)); gl.compileShader(fs);
  var pr = gl.createProgram(); gl.attachShader(pr, shVS); gl.attachShader(pr, fs);
  gl.bindAttribLocation(pr, 0, "aP"); gl.linkProgram(pr);
  P = shProgs[id] = { pr: pr, fs: fs, st: 0, u: {} };
  if (!shPar) shFinish(P);
  return P;
}
function shFinish(P) {
  var gl = shGL;
  if (!gl.getProgramParameter(P.pr, gl.LINK_STATUS)) {
    console.warn("mf-shape link:", gl.getShaderInfoLog(P.fs) || gl.getProgramInfoLog(P.pr)); P.st = -1; return;
  }
  ["uRes", "uR", "uTint", "uN", "uZ"].forEach(function (n) { P.u[n] = gl.getUniformLocation(P.pr, n); });
  gl.useProgram(P.pr); shCur = P.pr;
  if (P.u.uN) gl.uniform1i(P.u.uN, 110);
  if (P.u.uZ) gl.uniform1i(P.u.uZ, 0);
  P.st = 1;
}

function shInitGL() {
  if (shGL || shDead) return shGL;
  try {
    shCv = document.createElement("canvas"); shCv.width = shCv.height = SH_MAX;
    var opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" };
    var gl = shCv.getContext("webgl2", opts);
    shGL2 = !!gl;
    if (!gl) gl = shCv.getContext("webgl", opts) || shCv.getContext("experimental-webgl", opts);
    if (!gl) { shDead = true; return null; }
    shPar = gl.getExtension("KHR_parallel_shader_compile");
    shVS = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(shVS, shGL2 ? SH_VERT3 : SH_VERT); gl.compileShader(shVS);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    /* software rasterisers (SwiftShader, llvmpipe) get a lighter budget, not a blank page */
    try {
      var name = String(gl.getParameter(gl.RENDERER)), dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      shSoft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    } catch (e) {}
    if (shSoft) shQ = .6;
    shCv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); shDead = true; shGL = null; shProgs = {}; shCur = null; shItems.forEach(function (it) { it.gl = false; it.res = 0; }); }, false);
    shGL = gl;
  } catch (e) { shDead = true; shGL = null; }
  return shGL;
}

/* ---------------- items ---------------- */
var shRO = "ResizeObserver" in window ? new ResizeObserver(function (es) { es.forEach(function (e) { var it = e.target._mfShape; if (it) shMeasure(it); }); }) : null;
var shItems = [], shCount = 0, shIO = null, shDPR = Math.min(2, window.devicePixelRatio || 1);

function shKind(cv) { var k = (cv.getAttribute("data-shape") || "cube").toLowerCase(); return SH_ID[k] !== undefined ? k : "cube"; }
function shTintOf(cv) { var t = (cv.getAttribute("data-tint") || "chrome").toLowerCase(); return SH_TINT[t] !== undefined ? SH_TINT[t] : 0; }
function shNum(cv, name, def) { var v = parseFloat(cv.getAttribute(name)); return isFinite(v) ? v : def; }

function shPose(kind) { var e = SH_POSE[kind] || [0, 0, 0]; return shMul(shRz(e[2]), shMul(shRy(e[1]), shRx(e[0]))); }

function shMount(cv) {
  if (!cv || cv._mfShape || cv.tagName !== "CANVAS") return cv && cv._mfShape;
  var i = shCount++, kind = shKind(cv);
  var size = shNum(cv, "data-size", 160);
  cv.style.setProperty("--mf-size", size + "px");
  var j = i * 2.399963;                                   // golden angle: neighbours never spin alike
  var ax = shNorm([Math.sin(j) * .55, 1, Math.cos(j) * .45]);
  var spin = shNum(cv, "data-spin", .35);
  var sp = (spin * (.85 + (i % 5) * .08)) * (i % 2 ? -1 : 1);
  var it = {
    cv: cv, cx: cv.getContext("2d"), kind: kind, s: SH_ID[kind], tint: shTintOf(cv),
    R: shPose(kind), ax: ax, sp: sp, pa: shNorm([Math.cos(j * 1.7), Math.sin(j * .9), .6]), w: [ax[0] * sp, ax[1] * sp, ax[2] * sp],
    vis: false, res: 0, cw: 0, ch: 0, on: false, drag: false, hov: 0, dirty: true,
    drg: cv.hasAttribute("data-drag"), flt: cv.hasAttribute("data-float"), par: shNum(cv, "data-par", 0),
    ph: (i * 1.9) % 9, ty: 0, ang: 0, frame: 0
  };
  if (!it.cx) return null;
  cv._mfShape = it;
  shItems.push(it);
  if (it.drg) {
    if (!cv.hasAttribute("data-cursor")) cv.setAttribute("data-cursor", "Drag");
    shBindDrag(it);
  }
  cv.addEventListener("pointerenter", function () { it.hov = 1; });
  cv.addEventListener("pointerleave", function () { it.hov = 0; });
  shMeasure(it);
  if (shRO) shRO.observe(cv);
  if (shIO) shIO.observe(cv); else { it.vis = true; }
  return it;
}

function shMeasure(it) { it.cw = it.cv.clientWidth; it.ch = it.cv.clientHeight; it.dirty = true; }

function shBindDrag(it) {
  var cv = it.cv, lx = 0, ly = 0, lt = 0;
  cv.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button > 0) return;
    it.drag = true; lx = e.clientX; ly = e.clientY; lt = performance.now();
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    cv.classList.add("is-grab");
  });
  cv.addEventListener("pointermove", function (e) {
    if (!it.drag) return;
    var now = performance.now(), dx = e.clientX - lx, dy = e.clientY - ly, sec = Math.max(8, now - lt) / 1000;
    lx = e.clientX; ly = e.clientY; lt = now;
    var k = 2.4 / Math.max(60, it.cw), G = [dy * k, dx * k, 0];
    shTurn(it, G, 1); it.ang += dx * k;
    var spd = Math.min(14, shLen(G) / sec), u = shNorm(G);
    for (var q = 0; q < 3; q++) it.w[q] = MF.lerp(it.w[q], u[q] * spd, .5);
    it.dirty = true;
  });
  var up = function () { if (!it.drag) return; it.drag = false; cv.classList.remove("is-grab"); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up); cv.addEventListener("lostpointercapture", up);
}

/* ---------------- drawing ---------------- */
function shBox(it) {
  /* canvas pixel size follows its CSS box; the shape is rendered square at the smaller side and centred */
  var cw = it.cw, ch = it.ch; if (!cw || !ch) return null;
  var q = shQ * shDPR, W = Math.max(16, Math.round(cw * q)), H = Math.max(16, Math.round(ch * q));
  if (it.cv.width !== W || it.cv.height !== H) { it.cv.width = W; it.cv.height = H; }
  return { W: W, H: H, S: Math.min(W, H) };
}

/* returns false while this kind's program is still linking (the item stays dirty and is drawn once it is ready) */
function shDrawGL(it) {
  var gl = shGL, P = shProg(it.s);
  if (!P || P.st === 0) return false;
  if (P.st < 0) { shDrawFlat(it); return true; }
  var b = shBox(it); if (!b) return true;
  /* raymarch at ~70% of the display size and let drawImage upscale: chrome blobs stay crisp, cost halves */
  var side = Math.min(SH_MAX, Math.max(48, Math.round(b.S * shRS / 16) * 16));
  var T = it.R, U = P.u;
  shMat[0] = T[0]; shMat[1] = T[3]; shMat[2] = T[6]; shMat[3] = T[1]; shMat[4] = T[4]; shMat[5] = T[7]; shMat[6] = T[2]; shMat[7] = T[5]; shMat[8] = T[8];
  if (shCur !== P.pr) { gl.useProgram(P.pr); shCur = P.pr; }
  gl.viewport(0, 0, side, side);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(U.uRes, side, side);
  gl.uniform1i(U.uTint, it.tint);
  gl.uniformMatrix3fv(U.uR, false, shMat);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  var cx = it.cx; cx.clearRect(0, 0, b.W, b.H);
  cx.drawImage(shCv, 0, SH_MAX - side, side, side, (b.W - b.S) / 2, (b.H - b.S) / 2, b.S, b.S);
  if (!it.on) { it.on = true; it.cv.classList.add("is-on", "mf-shape--gl"); }
  return true;
}

/* Canvas2D fallback: a shaded chrome silhouette with the magenta floor band and a neon rim */
function shDrawFlat(it) {
  var b = shBox(it); if (!b) return;
  var cx = it.cx, S = b.S, r = S * .36;
  var neon = it.tint === 2 ? "138,61,255" : "255,43,214";
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, b.W, b.H);
  cx.save(); cx.translate(b.W / 2, b.H / 2); cx.rotate(it.ang);
  var g = cx.createLinearGradient(-r, -r, r * .4, r);
  g.addColorStop(0, it.tint ? "rgb(" + neon + ")" : "#3a3a42"); g.addColorStop(.28, "#f4f2f8"); g.addColorStop(.42, "#8d8b96");
  g.addColorStop(.62, "#18171c"); g.addColorStop(.82, "rgb(" + neon + ")"); g.addColorStop(1, "#0b0a0e");
  cx.fillStyle = g; cx.strokeStyle = "rgba(" + neon + ",.85)"; cx.lineWidth = Math.max(1, S * .012);
  cx.shadowColor = "rgba(" + neon + ",.55)"; cx.shadowBlur = S * .06;
  var k = it.kind; cx.beginPath();
  var rr = function (x, y, w, h, q) { cx.moveTo(x + q, y); cx.arcTo(x + w, y, x + w, y + h, q); cx.arcTo(x + w, y + h, x, y + h, q); cx.arcTo(x, y + h, x, y, q); cx.arcTo(x, y, x + w, y, q); cx.closePath(); };
  if (k === "cube" || k === "hex" || k === "gem") rr(-r * .85, -r * .85, r * 1.7, r * 1.7, r * .32);
  else if (k === "sphere") cx.arc(0, 0, r, 0, 6.2832);
  else if (k === "capsule" || k === "tube") rr(-r * .42, -r, r * .84, r * 2, r * .42);
  else if (k === "cone" || k === "pyramid" || k === "prism") { cx.moveTo(0, -r); cx.lineTo(r * .9, r * .75); cx.quadraticCurveTo(0, r * 1.05, -r * .9, r * .75); cx.closePath(); }
  else if (k === "dish" || k === "bowl") cx.ellipse(0, 0, r, r * .42, 0, 0, 6.2832);
  else if (k === "arch") { cx.arc(0, r * .35, r * .95, Math.PI, 0); cx.arc(0, r * .35, r * .45, 0, Math.PI, true); cx.closePath(); }
  else { cx.arc(0, 0, r, 0, 6.2832); cx.moveTo(r * .45, 0); cx.arc(0, 0, r * .45, 0, 6.2832, true); }  // torus, rings, spring, link
  cx.fill("evenodd"); cx.shadowBlur = 0; cx.stroke();
  cx.restore();
  if (!it.on) { it.on = true; it.cv.classList.add("is-on", "mf-shape--flat"); }
}

/* ---------------- frame loop ---------------- */
var shAvg = 16, shFrames = 0, shRS = .72;
function shFrame(dt, st) {
  var ms = dt * 1000;
  shAvg = MF.lerp(shAvg, ms, .05);
  /* adaptive quality: drop raymarch resolution when frames run long, recover slowly when there is headroom */
  if (++shFrames > 60 && shAvg > 22 && shRS > .45) { shRS *= .88; shFrames = 0; shItems.forEach(function (it) { it.dirty = true; }); }
  else if (shFrames > 240 && shAvg < 14 && shRS < .72) { shRS = Math.min(.72, shRS * 1.08); shFrames = 0; }
  /* how many shapes are live: with several on screen each one redraws every 2nd/3rd frame (they spin slowly) */
  var live = 0;
  for (var v = 0; v < shItems.length; v++) if (shItems[v].vis) live++;
  var every = live > 6 ? 3 : live > 3 ? 2 : 1;
  /* read all parallax rects first, then write: no layout thrash between shapes */
  if (!MF.reduce) for (var r0 = 0; r0 < shItems.length; r0++) {
    var ip = shItems[r0];
    if (ip.vis && ip.par) { var rr = ip.cv.getBoundingClientRect(); ip.mid = rr.top + rr.height / 2 - ip.ty; }
  }
  var ease = 1 - Math.exp(-ms / 900);
  var sv = MF.clamp(st.vy * .0006, -1.4, 1.4);             // scrolling throws the shapes about their x axis
  var gl = shDead ? null : shInitGL();
  var vh = st.vh, t = st.t;
  shBusy = 0;
  for (var n = shItems.length - 1; n >= 0; n--) {
    var it = shItems[n];
    if (!it.cv.isConnected) { if (shIO) shIO.unobserve(it.cv); if (shRO) shRO.unobserve(it.cv); it.cv._mfShape = null; shItems.splice(n, 1); continue; }
    if (shPar && gl && !shDead && !shProgs[it.s]) shProg(it.s);   // parallel compile: warm every mounted kind early
    if (!it.vis) continue;
    it.frame++;
    /* motion: float bob + scroll parallax, written to `translate` so other modules keep `transform` */
    if (!MF.reduce && (it.flt || it.par)) {
      var x = 0, y = 0, base = it.cw || 160;
      if (it.flt) { var ph = (t + it.ph) * 6.2832; x = Math.sin(ph / 13) * base * .012; y = Math.sin(ph / 9) * base * .035; }
      if (it.par && it.mid !== undefined) {
        it.ty = -it.par * (it.mid - vh / 2); y += it.ty;
      }
      it.cv.style.translate = x.toFixed(2) + "px " + y.toFixed(2) + "px";
    }
    /* rotation: idle spin about a slowly precessing axis, faster on hover, eased back after a drag throw */
    var moving = !MF.reduce || it.drag;
    if (!MF.reduce && !it.drag) {
      it.ax = shNorm(shApply(shAxis(it.pa, .07 * dt), it.ax));
      var sp = it.sp * (1 + it.hov * 1.4), tg = [it.ax[0] * sp + sv, it.ax[1] * sp, it.ax[2] * sp];
      for (var q = 0; q < 3; q++) it.w[q] += (tg[q] - it.w[q]) * ease;
      shTurn(it, it.w, dt);
      it.ang += it.sp * dt * .4;
    } else if (MF.reduce && !it.drag && shLen(it.w) > .02) {
      for (var q2 = 0; q2 < 3; q2++) it.w[q2] *= Math.exp(-dt * 3);   // reduced motion: a throw still settles, nothing idles
      shTurn(it, it.w, dt); moving = true;
    }
    if (it.frame % 30 === 0) it.R = shOrtho(it.R);
    if (!moving && !it.dirty) continue;
    /* software GL with many shapes: alternate frames */
    if (shSoft && !it.drag && !it.dirty && ((it.frame + n) & 1)) continue;
    /* many shapes on screen: stagger redraws across frames (rotation state still advances every frame) */
    if (every > 1 && !it.drag && !it.dirty && it.hov === 0 && (it.frame + n) % every) continue;
    it.dirty = false;
    if (gl && !shDead) { if (!shDrawGL(it)) it.dirty = true; } else shDrawFlat(it);
  }
}

/* ---------------- boot ---------------- */
function shScan(root) {
  if (!root || !root.querySelectorAll) return;
  if (root.matches && root.matches("canvas.mf-shape[data-shape]")) shMount(root);
  var l = root.querySelectorAll("canvas.mf-shape[data-shape]");
  for (var i = 0; i < l.length; i++) shMount(l[i]);
}

if ("IntersectionObserver" in window) {
  shIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) { var it = e.target._mfShape; if (!it) return; it.vis = e.isIntersecting; if (it.vis) shMeasure(it); });
  }, { rootMargin: "15% 0px" });
}

if (!shRO) window.addEventListener("resize", function () { shItems.forEach(shMeasure); }, { passive: true });

MF.ready(function () {
  shScan(document);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { shItems.forEach(shMeasure); });
  if ("MutationObserver" in window) {
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === "attributes") {
          var it = m.target._mfShape;
          if (it) { it.kind = shKind(m.target); it.s = SH_ID[it.kind]; it.tint = shTintOf(m.target); it.dirty = true; }
          else shScan(m.target);
          return;
        }
        for (var i = 0; i < m.addedNodes.length; i++) if (m.addedNodes[i].nodeType === 1) shScan(m.addedNodes[i]);
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-shape", "data-tint"] });
  }
  MF.tick(shFrame);
});

MF.shapes = { mount: function (cv) { return shMount(cv); }, kinds: SH_KINDS.slice(), items: shItems };

}catch(e){console.error('fx/05-shapes.js', e)}})();
/* ---- fx/10-hero.js ---- */
;(function(){try{
/* 10-hero — dozfx hero for MetaFlow: loader-gated letter intro, pointer glow, CTA magnet,
   scroll parallax and a raymarched liquid-metal morph (rounded cube -> sphere -> torus -> capsule).
   Bundled by build.py inside its own try/catch IIFE. Uses the shared MF core. */
var hero = document.querySelector(".fx-hero");
if (hero && window.MF) {
  var MF = window.MF;
  var reduce = MF.reduce;
  var phone = function () { return MF.state.vw < 768; };

  /* ---------------- 1. intro gate: hide now, play after the loader (or 1.8 s) ---------------- */
  if (reduce) {
    hero.classList.add("is-go");
  } else {
    hero.classList.add("is-pre");
    var root = document.documentElement, started = false, mo = null;
    var go = function () {
      if (started) return; started = true;
      if (mo) mo.disconnect();
      // next frame so the hidden state is painted once and the animations start from it
      requestAnimationFrame(function () { hero.classList.add("is-go"); hero.dispatchEvent(new CustomEvent("mf:hero-go")); });
    };
    if (root.classList.contains("mf-ld-done")) go();
    else {
      if ("MutationObserver" in window) {
        mo = new MutationObserver(function () { if (root.classList.contains("mf-ld-done")) go(); });
        mo.observe(root, { attributes: true, attributeFilter: ["class"] });
      }
      setTimeout(go, 1800);
    }
  }

  MF.ready(function () {
    var title = hero.querySelector(".fx-hero__title");
    var claim = hero.querySelector(".fx-hero__claim");
    var cta = hero.querySelector(".fx-hero__cta");
    var foot = hero.querySelector(".fx-hero__foot");
    var stage = hero.querySelector(".fx-hero__stage");
    var orb = hero.querySelector(".fx-hero__orb");
    var glow = hero.querySelector(".fx-hero__glow");
    var cvs = hero.querySelector("[data-morph]");
    var lite = hero.querySelector(".fx-hero__lite");

    /* ---------------- 2. pointer glow (data-glow) ---------------- */
    var gl0 = { x: 0, y: 0, tx: 0, ty: 0, on: false, init: false };
    var fine = !MF.coarse && window.matchMedia && window.matchMedia("(hover: hover)").matches;
    if (glow && fine && !reduce) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        gl0.tx = e.clientX - r.left; gl0.ty = e.clientY - r.top;
        if (!gl0.init) { gl0.x = gl0.tx; gl0.y = gl0.ty; gl0.init = true; }
        if (!gl0.on) { gl0.on = true; hero.classList.add("glow-on"); }
      }, { passive: true });
      hero.addEventListener("pointerleave", function () { gl0.on = false; hero.classList.remove("glow-on"); }, { passive: true });
      hero.addEventListener("pointerdown", function () { hero.classList.add("glow-hot"); }, { passive: true });
      window.addEventListener("pointerup", function () { hero.classList.remove("glow-hot"); }, { passive: true });
    }

    /* ---------------- 3. magnetic CTAs ---------------- */
    if (fine && !reduce) {
      Array.prototype.forEach.call(hero.querySelectorAll(".fx-hero__btn, .fx-hero__link"), function (a) {
        a.addEventListener("pointermove", function (e) {
          var r = a.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) * 0.22, dy = (e.clientY - (r.top + r.height / 2)) * 0.32;
          a.style.setProperty("--gx", dx.toFixed(1) + "px"); a.style.setProperty("--gy", dy.toFixed(1) + "px");
        });
        a.addEventListener("pointerleave", function () { a.style.setProperty("--gx", "0px"); a.style.setProperty("--gy", "0px"); });
      });
    }

    /* ---------------- 4. parallax (dozfx .par: title .5, claim .32, cta .18, foot .08, morph -.42) ---------------- */
    var par = [[title, 0.5, "--pz"], [claim, 0.32, "--pz"], [cta, 0.18, "--pz"], [foot, 0.08, "--pz"], [orb, -0.12, "--oz"]];
    var lastP = -1;
    function parallax() {
      var vh = MF.state.vh, p = MF.clamp(MF.state.y / vh, 0, 1.3);
      if (Math.abs(p - lastP) < 0.0005) return;
      lastP = p;
      var base = Math.min(vh, 1000) * 0.5;
      for (var i = 0; i < par.length; i++) {
        var el = par[i][0]; if (!el) continue;
        var v = (-p * par[i][1] * base).toFixed(1) + "px";
        if (el._pz !== v) { el._pz = v; el.style.setProperty(par[i][2], v); }
      }
      if (stage) {
        stage.style.setProperty("--mz", (p * 0.3 * base).toFixed(1) + "px");
        stage.style.setProperty("--ms", (1 - 0.18 * Math.min(p, 1)).toFixed(4));
        stage.style.setProperty("--mo", MF.clamp(1 - p * 1.5, 0, 1).toFixed(3));
      }
    }

    /* ---------------- 5. per-frame: glow + parallax ---------------- */
    if (!reduce) {
      MF.tick(function (dt) {
        if (MF.state.y > MF.state.vh * 1.6 && lastP >= 1.3) return;
        parallax();
        if (gl0.on && glow) {
          var k = 1 - Math.exp(-dt * 7);
          gl0.x += (gl0.tx - gl0.x) * k; gl0.y += (gl0.ty - gl0.y) * k;
          glow.style.transform = "translate3d(" + gl0.x.toFixed(1) + "px," + gl0.y.toFixed(1) + "px,0)";
        }
      });
    }

    /* ---------------- 6. liquid-metal morph (WebGL2 raymarched SDF) ---------------- */
    function fail() {
      hero.classList.add("morph-fail");
      if (lite) {
        lite.classList.add("mf-shape");
        if (MF.shapes && typeof MF.shapes.mount === "function" && !lite._mfHero) { lite._mfHero = 1; MF.shapes.mount(lite); }
      }
    }
    if (!cvs) return;
    var gl = null;
    try { gl = cvs.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" }); } catch (e) { gl = null; }
    if (!gl) { fail(); return; }

    var FS = [
      "#version 300 es",
      "precision highp float;",
      "uniform vec2 uRes; uniform mat3 uR; uniform int uA, uB;",
      "uniform float uK, uT, uWob, uZ, uFlick;",
      "uniform int uN, uI0;",                                                                 /* runtime loop bounds: stops D3D unrolling the march */
      "out vec4 o;",
      "float sdRBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }",
      "float shp(int s, vec3 p){",
      "  if (s == 0) return sdRBox(p, vec3(.55), .15);",                                   /* rounded cube */
      "  if (s == 1) return length(p) - .86;",                                             /* sphere */
      "  if (s == 2) { vec2 q = vec2(length(p.xy) - .64, p.z); return length(q) - .29; }", /* torus, facing the camera */
      "  vec3 a = p; a.y -= clamp(a.y, -.46, .46); return length(a) - .43;",               /* capsule */
      "}",
      /* a studio for the chrome: dark floor, grey horizon, bright sky, two softboxes, strip lights, magenta bounce from below */
      "vec3 env(vec3 r){",
      "  float y = r.y;",
      "  vec3 c = mix(vec3(.05, .035, .07), vec3(.26, .22, .3), smoothstep(-.9, .12, y));",
      "  c += vec3(.56, .5, .64) * smoothstep(-.25, .12, y) * (1. - smoothstep(.12, .5, y)) * .5;",
      "  c += vec3(.85, .88, 1.) * smoothstep(.25, .95, y) * .4;",
      "  c += vec3(1.) * smoothstep(.74, .93, dot(r, normalize(vec3(-.45, .75, .5)))) * 1.9;",
      "  c += vec3(1.) * smoothstep(.9, .975, dot(r, normalize(vec3(.75, .25, .6)))) * 1.6;",
      "  c += vec3(1.) * smoothstep(.07, .0, abs(r.x + .62)) * smoothstep(-.3, .25, y) * 1.1;",
      "  c += vec3(1., .55, .95) * smoothstep(.05, .0, abs(r.x - .55 + r.y * .2)) * smoothstep(-.1, .4, y) * .8;",
      "  c *= .8 + .2 * smoothstep(-.4, .4, sin(r.y * 9. + r.x * 2.));",
      "  c += vec3(1., .17, .84) * smoothstep(-.84, -1., y) * .6;",                           /* magenta only in steep downward reflections: the underside, as dozfx */
      "  return c;",
      "}",
      "float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }",
      "float map(vec3 w){",
      "  vec3 p = uR * w;",
      "  float k = smoothstep(0., 1., uK), m = sin(3.14159265 * clamp(uK, 0., 1.));",
      "  float d = mix(shp(uA, p), shp(uB, p), k);",
      /* half way it gathers into a drop, so the change reads as liquid, not a cross-fade of geometry */
      "  d = mix(d, smin(d, length(p) - .62, .34), m * .6);",
      "  float wv = sin(p.x * 4.6 + uT * 1.6) * sin(p.y * 3.9 - uT * 1.25) * sin(p.z * 4.3 + uT * 1.05);",
      "  return d + wv * (.008 + .045 * m + uWob);",
      "}",
      "vec3 nrm(vec3 p){ vec3 n = vec3(0.); for (int i = uI0; i < 4; i++) { vec3 e = .5773 * (2. * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.); n += e * map(p + e * .002); } return normalize(n); }",
      "void main(){",
      "  vec2 uv = (gl_FragCoord.xy * 2. - uRes) / uRes.y;",
      "  vec3 ro = vec3(0., 0., uZ), rd = normalize(vec3(uv * .215, -1.));",
      "  float b = dot(ro, rd), c = dot(ro, ro) - 1.32, h = b * b - c;",
      "  if (h < 0.) { o = vec4(0.); return; }",
      "  h = sqrt(h);",
      "  float t = -b - h, t1 = -b + h, dm = 1e9, tm = t; bool hit = false;",
      "  for (int i = 0; i < uN; i++) {",
      "    float d = map(ro + rd * t);",
      "    if (d < dm) { dm = d; tm = t; }",
      "    if (d < .0008) { hit = true; break; }",
      "    t += d * .72;",
      "    if (t > t1) break;",
      "  }",
      "  float px = 2.2 / uRes.y * .215;",
      "  float a = hit ? 1. : 1. - smoothstep(0., px * tm, dm);",
      "  if (a <= 0.) { o = vec4(0.); return; }",
      "  vec3 p = ro + rd * (hit ? t : tm), n = nrm(p), v = -rd;",
      "  vec3 base = vec3(1., .17, .84);",
      "  vec3 L1 = normalize(vec3(-.55, .7, .65)), L2 = normalize(vec3(.85, -.15, .35));",
      "  float dif = max(dot(n, L1), 0.), dif2 = max(dot(n, L2), 0.);",
      "  float ao = clamp(map(p + n * .1) / .1, 0., 1.); ao = .45 + .55 * ao;",
      "  float fre = pow(1. - max(dot(n, v), 0.), 3.);",
      "  vec3 r = reflect(rd, n);",
      "  vec3 col = base * (.12 + .9 * dif + .3 * dif2) * ao;",
      "  col += vec3(1., .3, .95) * fre * .4;",
      /* chrome: almost no colour of its own, it is the room it reflects; Fresnel pushes the edges to full mirror */
      "  float fr = .62 + .38 * pow(1. - max(dot(n, v), 0.), 4.);",
      "  vec3 ch = env(normalize(r + p * .38)) * fr * (.45 + .55 * ao) + vec3(.03) * dif;",
      "  ch += pow(max(dot(reflect(-L1, n), v), 0.), 90.) * 1.4;",
      "  ch += vec3(1., .17, .84) * (fre * .55 + smoothstep(-.4, -.95, n.y) * .3 * ao);",                                            /* magenta rim */
      /* the neon fault: for a moment it burns magenta from inside */
      "  vec3 ne = col * 1.15 + vec3(1., .17, .9) * (.25 + 1.1 * fre);",
      "  col = mix(ch, ne, uFlick);",
      "  col = 1. - exp(-col * 1.9);",
      "  o = vec4(col * a, a);",
      "}"
    ].join("\n");
    var VS = "#version 300 es\nvoid main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }";

    var pcx = gl.getExtension("KHR_parallel_shader_compile");
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!pcx && !gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("[hero morph]", gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { fail(); return; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    /* the link takes ~0.6 s on D3D11: with KHR_parallel_shader_compile it runs off the main thread while the loader counts */
    if (pcx && !gl.getProgramParameter(prog, pcx.COMPLETION_STATUS_KHR)) {
      (function wait() {
        if (gl.isContextLost()) return;
        if (gl.getProgramParameter(prog, pcx.COMPLETION_STATUS_KHR)) setup(); else setTimeout(wait, 50);
      })();
      return;
    }
    setup();
    function setup() {
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn("[hero morph]", gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog)); fail(); return; }
    gl.useProgram(prog);
    gl.bindVertexArray(gl.createVertexArray());
    gl.clearColor(0, 0, 0, 0);
    var U = {};
    ["uRes", "uR", "uA", "uB", "uK", "uT", "uWob", "uZ", "uFlick", "uN", "uI0"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(U.uN, 110); gl.uniform1i(U.uI0, 0);

    var lost = false;
    cvs.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lost = true; hero.classList.remove("morph-on"); fail(); });

    /* shape order: rounded cube -> sphere -> torus -> capsule (loops) */
    var SEQ = [0, 1, 2, 3];
    var S = { a: 0, b: 0, k: 1, t: Math.random() * 20, wob: 0, spin: [0.13, reduce ? 0.21 : 2.6, 0.05], q: [0.42, 0.7, 0],
      tx: 0, ty: 0, fl: 0, fseq: null, fs: 0, fhold: 0, nextF: 0, idx: 0, nextS: 0 };
    S.nextF = S.t + 5.5; S.nextS = S.t + 3.4;
    function morphTo(i) {
      var x = SEQ[i % SEQ.length];
      if (x === S.b) return;
      S.a = S.k > 0.5 ? S.b : S.a; S.b = x; S.k = 0; S.wob = 0.02;
    }
    function flicker() {
      var seq = [], x = 0, n = 3 + (Math.random() * 4 | 0);
      for (var i = 0; i < n; i++) { seq.push([x, i % 2 ? Math.random() * 0.15 : 0.75 + Math.random() * 0.25]); x += 0.035 + Math.random() * 0.075; }
      seq.push([x, 1]); S.fseq = seq; S.fs = S.t; S.fhold = x + 0.12 + Math.random() * 0.5;
    }
    hero.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("a,button")) return;
      S.wob = 0.06; S.spin[1] += 1.6;
    }, { passive: true });

    /* canvas size with a pixel budget and adaptive quality (drops resolution if frames run long) */
    var W = 0, H = 0, Q = 1, ups = 0, fN = -60, fAcc = 0;
    function size() {
      var w0 = cvs.clientWidth, h0 = cvs.clientHeight;
      if (!w0 || !h0) return;
      var d = Math.min(window.devicePixelRatio || 1, 1.5);
      var budget = (phone() ? 4e5 : 7.5e5) * Q * Q, px = w0 * h0 * d * d;
      if (px > budget) d *= Math.sqrt(budget / px);
      var w = Math.max(2, Math.round(w0 * d)), h = Math.max(2, Math.round(h0 * d));
      if (w !== W || h !== H) { W = w; H = h; cvs.width = W; cvs.height = H; }
    }
    function perf(ms) {
      if (ms > 200) return;
      if (fN < 0) { fN++; return; }
      fN++; fAcc += ms;
      if (fN < 45) return;
      var avg = fAcc / fN; fN = 0; fAcc = 0;
      if (avg > 22 && Q > 0.4) { Q = Math.max(0.4, Q * 0.8); size(); }
      else if (avg < 18 && Q < 1 && ups < 2) { ups++; Q = Math.min(1, Q * 1.15); size(); }
    }
    size();
    window.addEventListener("resize", size, { passive: true });

    function rot(x, y, z) {
      var cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
      return [cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz,
              -cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz,
              sy, -sx * cy, cx * cy];
    }
    var shown = false, lastFl = -1, mat = new Float32Array(9);
    function draw(dt) {
      if (lost) return;
      S.t += dt;
      if (S.k < 1) S.k = Math.min(1, S.k + dt / 1.15);
      S.wob *= Math.exp(-dt * 2.2);
      if (S.t > S.nextS) { S.idx = (S.idx + 1) % SEQ.length; morphTo(S.idx); S.nextS = S.t + 3.4; }
      if (S.t > S.nextF) { flicker(); S.nextF = S.t + 3 + Math.random() * 4.5; }
      var w = 0;
      if (S.fseq) {
        var e = S.t - S.fs;
        if (e < S.fhold) { for (var i = 0; i < S.fseq.length; i++) if (e >= S.fseq[i][0]) w = S.fseq[i][1]; }
        else { w = Math.exp(-(e - S.fhold) * 5); if (w < 0.01) { w = 0; S.fseq = null; } }
      }
      if (Math.abs(w - lastFl) > 0.004 || (w === 0 && lastFl !== 0)) { cvs.style.setProperty("--fl", w.toFixed(3)); lastFl = w; }
      S.fl = w;
      /* faster spin while the page is being scrolled; settles back to a slow turn */
      var boost = 1 + Math.min(4, Math.abs(MF.state.vy) / 500);
      S.spin[1] += (0.21 - S.spin[1]) * (1 - Math.exp(-dt * 0.8));
      S.q[0] += S.spin[0] * dt * boost; S.q[1] += S.spin[1] * dt * boost; S.q[2] += S.spin[2] * dt;
      /* lean toward the pointer */
      var kk = 1 - Math.exp(-dt * 2);
      S.tx += ((fine ? (MF.state.my / MF.state.vh - 0.5) * 0.6 : 0) - S.tx) * kk;
      S.ty += ((fine ? (MF.state.mx / MF.state.vw - 0.5) * 0.9 : 0) - S.ty) * kk;
      mat.set(rot(S.q[0] + S.tx, S.q[1] + S.ty, S.q[2]));
      gl.viewport(0, 0, W, H);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.uRes, W, H);
      gl.uniformMatrix3fv(U.uR, false, mat);
      gl.uniform1i(U.uA, S.a); gl.uniform1i(U.uB, S.b);
      gl.uniform1f(U.uK, S.k); gl.uniform1f(U.uT, S.t); gl.uniform1f(U.uWob, S.wob);
      gl.uniform1f(U.uZ, W / H < 0.9 ? 8.4 : 7.9);
      gl.uniform1f(U.uFlick, w);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!shown) { shown = true; reveal(); }
    }
    function reveal() {
      // the object surfaces with the title, never before the loader lifts
      if (hero.classList.contains("is-go")) hero.classList.add("morph-on");
      else hero.addEventListener("mf:hero-go", function () { hero.classList.add("morph-on"); }, { once: true });
    }

    if (reduce) { size(); draw(0.016); return; }
    var last = 0, acc = 0;
    MF.tick(function (dt) {
      if (lost || document.hidden) return;
      if (!MF.onScreen(stage || cvs, 40)) return;
      if (stage && +stage.style.getPropertyValue("--mo") === 0 && stage.style.getPropertyValue("--mo") !== "") return;
      /* the liquid metal moves slowly: 30 renders a second look identical and free half the GPU for the page */
      acc += dt; if (acc < 1 / 31) return;
      var step = acc; acc = 0;
      var now = performance.now();
      if (last) perf((now - last) / 2);
      last = now;
      draw(step);
    });
    document.addEventListener("visibilitychange", function () { last = 0; });
    }
  });
}

}catch(e){console.error('fx/10-hero.js', e)}})();
/* ---- fx/20-services.js ---- */
;(function(){try{
/* MetaFlow fx 20: statement word scrub + rotating word + five flying objects, the sticky services viewer
   (objects fly in from the statement positions and land in the card), and the draggable velocity marquee.
   Ported from the dozfx [data-statement] / [data-rot] / [data-fv] / [data-marquee] behaviour. */
var MF = window.MF;   // 00-core.js is always bundled first
var R = MF.reduce, FINE = !MF.coarse;
var clamp = MF.clamp, lerp = MF.lerp;
function K(a, b, x) { var o = clamp((x - a) / (b - a), 0, 1); return o * o * (3 - 2 * o); }   // smoothstep
function damp(k, dt) { return 1 - Math.pow(1 - k, dt * 60); }                                     // frame-rate independent lerp factor
function setv(el, k, v) { if (el["_" + k] !== v) { el["_" + k] = v; el.style.setProperty(k, v); } }

/* the five statement positions (fraction of the stage): shared with the services fly-in */
var SV_POS = [[0.10, 0.22], [0.89, 0.15], [0.22, 0.84], [0.79, 0.86], [0.54, 0.10]];
var SV_POS_SM = [[0.12, 0.12], [0.88, 0.09], [0.5, 0.95], [0.84, 0.90], [0.20, 0.92]];

/* ---------------- rotating word ---------------- */
MF.$$("[data-rot]").forEach(function (el) {
  var items = MF.$$(".fx-rot__i", el);
  if (items.length < 2 || R) return;
  var n = 0, acc = -600;
  MF.tick(function (dt) {
    if (!MF.onScreen(el, 100)) return;
    acc += dt * 1000;
    if (acc < 2400) return;
    acc = 0;
    var a = items[n]; n = (n + 1) % items.length; var b = items[n];
    a.classList.remove("is-on"); a.classList.add("is-out");
    b.classList.remove("is-out"); b.classList.add("is-on");
    setTimeout(function () { a.classList.remove("is-out"); }, 900);
  });
});

/* ---------------- statement ---------------- */
MF.$$("[data-statement]").forEach(function (sec) {
  var words = MF.$$(".fx-sw", sec), grid = MF.$(".fx-st__grid", sec);
  sec.classList.add("is-js");
  if (R) { words.forEach(function (w) { w.classList.add("on"); }); return; }
  var lastOn = -1;
  var svs = MF.$$(".fx-sv", sec).map(function (el, i) {
    return { el: el, i: i, z: +el.dataset.sv || 0.6, ax: 0, ay: 0, x: 0, y: 0, vis: true };
  });
  function measure() {
    svs.forEach(function (m) {
      var p = m.el.offsetParent || sec;
      m.vis = m.el.offsetWidth > 0;
      m.ax = m.el.offsetLeft + m.el.offsetWidth / 2 - p.clientWidth / 2;
      m.ay = m.el.offsetTop + m.el.offsetHeight / 2 - p.clientHeight / 2;
    });
  }
  measure();
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("load", measure);
  var clock = Math.random() * 10;
  MF.tick(function (dt, s) {
    var r = sec.getBoundingClientRect(), vh = s.vh, vw = s.vw;
    if (r.bottom < -vh * 0.2 || r.top > vh * 1.2) return;
    clock += dt;
    var f = (vh - r.top) / vh, span = r.height / vh;
    /* word-by-word colour scrub */
    var on = Math.round(K(0.6, 1.35, f) * words.length);
    if (on !== lastOn) { lastOn = on; words.forEach(function (w, i) { w.classList.toggle("on", i < on); }); }
    /* copy lifts, shrinks and blurs away at the end of the pin */
    if (grid) setv(grid, "--so", (1 - K(span - 0.55, span - 0.08, f)).toFixed(3));
    /* objects: gather in from the centre, float, then burst outward past the camera */
    var px = FINE ? s.mx / vw - 0.5 : 0, py = FINE ? s.my / vh - 0.5 : 0;
    svs.forEach(function (m) {
      if (!m.vis) return;
      var y = m.i * 0.07,
        g = K(0.35 + y, 1.05 + y, f),
        u = Math.pow(K(span - 0.8 + m.i * 0.03, span - 0.22 + m.i * 0.02, f), 1.4),
        len = Math.hypot(m.ax, m.ay) || 1, nx = m.ax / len, ny = m.ay / len,
        sc = (0.3 + 0.7 * g) * (1 + u * (1.4 + m.z * 1.6)),
        pull = (1 - g) * 0.85,
        tx = -m.ax * pull - px * 46 * m.z + Math.sin(clock * 0.45 + m.i * 1.7) * 9 * m.z + nx * u * vw * 0.75,
        ty = -m.ay * pull + (1.3 - f) * 120 * m.z + Math.cos(clock * 0.55 + m.i) * 11 * m.z - py * 30 * m.z + ny * u * vh * 0.8,
        k = damp(u > 0.01 ? 0.3 : 0.1, dt);
      m.x = lerp(m.x, tx, k); m.y = lerp(m.y, ty, k);
      setv(m.el, "--tx", m.x.toFixed(1) + "px");
      setv(m.el, "--ty", m.y.toFixed(1) + "px");
      setv(m.el, "--sc", sc.toFixed(4));
      setv(m.el, "--rz", (u * (m.i % 2 ? 1 : -1) * 70).toFixed(1) + "deg");
      setv(m.el, "--o", (K(0.3 + y, 0.55 + y, f) * (1 - K(span - 0.2, span - 0.02, f))).toFixed(3));
      setv(m.el, "--lo", (K(0.95 + y, 1.1 + y, f) * (1 - K(span - 0.85, span - 0.65, f))).toFixed(3));
    });
  });
});

/* ---------------- services: sticky five-row viewer ---------------- */
MF.$$("[data-fv]").forEach(function (sec) {
  var rows = MF.$$("[data-fv-i]", sec), panels = MF.$$(".fx-fv__p", sec), dots = MF.$$(".fx-fv__dots i", sec);
  var icos = MF.$$(".fx-fv__ico", sec), card = MF.$(".fx-fv__show", sec);
  var n = rows.length;
  if (!n) return;
  var cur = -1, hover = -1;
  function setActive(l) {
    if (l === cur) return;
    cur = l;
    rows.forEach(function (el, i) { el.classList.toggle("is-on", i === l); });
    panels.forEach(function (el, i) { el.classList.toggle("on", i === l); });
    icos.forEach(function (el, i) { el.classList.toggle("is-on", i === l); });
    dots.forEach(function (el, i) {
      el.classList.toggle("on", i === l); el.classList.toggle("done", i < l);
      if (i !== l) el.style.setProperty("--fp", i < l ? "1" : "0");
    });
  }
  if (R) { setActive(0); rows.forEach(function (el) { el.classList.add("is-on"); }); return; }
  setActive(0);
  sec.classList.add("is-js");

  if (FINE) rows.forEach(function (el, i) {
    el.addEventListener("pointerenter", function () { if (MF.state.vw < 768) return; hover = i; setActive(i); if (dots[i]) dots[i].style.setProperty("--fp", "1"); });
    el.addEventListener("pointerleave", function () { hover = -1; });
  });
  dots.forEach(function (el, i) {
    el.addEventListener("click", function () {
      var r = sec.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + (i + 0.5) / n * Math.max(1, r.height - MF.state.vh), behavior: "smooth" });
    });
  });

  /* fly-in: each card object starts where its twin floated in the statement and lands in the card */
  var homes = icos.map(function () { return { x: 0, y: 0, w: 1 }; });
  var onv = icos.map(function (el, i) { return i === 0 ? 1 : 0; });
  var svEls = MF.$$("[data-statement] .fx-sv");
  function measure() {
    icos.forEach(function (el, i) { homes[i] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth || 1 }; });
  }
  measure();
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("load", measure);

  MF.tick(function (dt, s) {
    var r = sec.getBoundingClientRect(), vh = s.vh, vw = s.vw;
    if (r.bottom < -vh * 0.2 || r.top > vh * 1.1) return;
    if (vw < 768) { if (cur !== 0 && hover < 0) setActive(0); return; }
    var f = clamp(-r.top / Math.max(1, r.height - vh), 0, 0.9999);
    var idx = Math.min(n - 1, Math.floor(f * n)), frac = f * n - idx;
    if (hover < 0) { setActive(idx); if (dots[idx]) setv(dots[idx], "--fp", frac.toFixed(3)); }
    if (!card || !icos.length || card.offsetWidth === 0) return;
    var c = card.getBoundingClientRect();
    var g = clamp((vh * 0.85 - r.top) / (vh * 0.85), 0, 1), e = g * g * (3 - 2 * g), fade = K(0, 0.18, g), settle = K(0.45, 0.95, g);
    var pos = vw < 1024 ? SV_POS_SM : SV_POS;
    icos.forEach(function (el, i) {
      onv[i] = lerp(onv[i], i === cur ? 1 : 0, damp(0.12, dt));
      var h = homes[i], hx = c.left + h.x, hy = c.top + h.y, p = pos[i] || [0.5, 0.5];
      var tw = svEls[i] && svEls[i].offsetWidth ? svEls[i].offsetWidth : h.w * 0.4;
      var s0 = clamp(tw / h.w, 0.2, 1);
      var dx = (p[0] * vw - hx) * (1 - e), dy = (p[1] * vh - hy) * (1 - e) - Math.sin(e * Math.PI) * vh * 0.06;
      /* the four inactive objects shrink into the active one as they land, so the card never clumps */
      var sc = lerp(s0, 1, e) * lerp(0.86, 1, onv[i]) * lerp(1, lerp(0.45, 1, onv[i]), settle);
      var rz = (i % 2 ? 1 : -1) * 70 * (1 - e);
      var op = fade * lerp(1, onv[i], settle);
      var tf = "translate(-50%,-50%) translate3d(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px,0) scale(" + sc.toFixed(4) + ") rotate(" + rz.toFixed(1) + "deg)";
      if (el._tf !== tf) { el._tf = tf; el.style.transform = tf; }
      var o = op.toFixed(3);
      if (el._op !== o) { el._op = o; el.style.opacity = o; el.style.visibility = op < 0.005 ? "hidden" : "visible"; }
    });
  });
});

/* ---------------- marquee: drag, inertia, scroll-velocity speed and skew ---------------- */
MF.$$("[data-marquee]").forEach(function (el) {
  var track = MF.$(".fx-mq__track", el);
  if (!track) return;
  var lx, ly;
  /* orb highlight follows the pointer (or the scroll position on touch) */
  MF.tick(function (dt, s) {
    if (!MF.onScreen(el, s.vh * 0.1)) return;
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, tx, ty;
    if (FINE && !R) { tx = 50 + clamp((s.mx - cx) / (s.vw * 0.45), -1, 1) * 34; ty = 50 + clamp((s.my - cy) / (s.vh * 0.45), -1, 1) * 34; }
    else { tx = 34; ty = 50 - clamp((cy - s.vh * 0.2) / s.vh, -1, 1) * 28; }
    lx = lx === undefined ? tx : lerp(lx, tx, damp(0.08, dt)); ly = ly === undefined ? ty : lerp(ly, ty, damp(0.08, dt));
    setv(el, "--lx", lx.toFixed(1) + "%"); setv(el, "--ly", ly.toFixed(1) + "%");
  });
  if (R) return;
  var x = 0, half = 0, dir = 1, grab = null, fling = 0, vel = 0, lastX = 0, lastT = 0, skew = 0;
  function measure() { half = track.scrollWidth / 2; }
  measure();
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  el.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    grab = { id: ev.pointerId, px: ev.clientX, x0: x }; fling = 0; vel = 0; lastX = ev.clientX; lastT = performance.now();
    try { el.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
    el.classList.add("is-grab");
  });
  el.addEventListener("pointermove", function (ev) {
    if (!grab || ev.pointerId !== grab.id) return;
    var now = performance.now(), d = Math.max(1, now - lastT);
    vel = lerp(vel, (ev.clientX - lastX) / d, 0.35); lastX = ev.clientX; lastT = now;
    x = grab.x0 + (ev.clientX - grab.px);
  });
  function release() {
    if (!grab) return;
    grab = null; el.classList.remove("is-grab");
    if (performance.now() - lastT > 90) vel = 0;
    fling = clamp(vel, -4, 4);
    if (Math.abs(fling) > 0.05) dir = fling > 0 ? -1 : 1;
  }
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", release);
  el.addEventListener("dragstart", function (ev) { ev.preventDefault(); });
  MF.tick(function (dt, s) {
    if (!MF.onScreen(el, s.vh * 0.1)) return;
    if (!half) measure();
    if (!half) return;
    var ms = dt * 1000, sv = s.vy / 60;   // scroll velocity in px per frame, like dozfx
    if (!grab) {
      if (sv > 0.5) dir = 1; else if (sv < -0.5) dir = -1;
      x += fling * ms;
      fling *= Math.exp(-ms / 420);
      if (Math.abs(fling) < 0.01) fling = 0;
      x -= dir * (ms * 0.05 * (1 - Math.min(1, Math.abs(fling) * 2)) + Math.min(40, Math.abs(sv)) * 0.6 * dt * 60);
    }
    var wrap = 0;
    while (x <= -half) { x += half; wrap += half; }
    while (x > 0) { x -= half; wrap -= half; }
    if (grab && wrap) grab.x0 += wrap;
    var u = grab ? vel : fling;
    skew = lerp(skew, clamp(-sv * 0.25 - u * 4, -10, 10), damp(0.2, dt));
    track.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0) skewX(" + skew.toFixed(2) + "deg)";
  });
});

}catch(e){console.error('fx/20-services.js', e)}})();
/* ---- fx/30-depth.js ---- */
;(function(){try{
/* 30-depth — the two pinned "depth" showcases, ported from dozfx section.depth.depth--seq.depth--fade.
   dozfx scrubs a 60-frame photo sequence; MetaFlow has no photos, so each visual is a WebGL fragment shader
   (speed: neon light tunnel, pulse: packet-rhythm landscape) scrubbed by the same scroll timeline.
   Timeline in dozfx units: i = (vh - section.top) / vh, p = pin span in viewport heights.
     build  b = i<1 ? i : 1+(i-1)*1.45 ; e = smooth(.22,1.55,b)  inset card → full bleed, title settles
     strips s_k = smooth(.2+k*.065, .85+k*.065, b)  ten horizontal slices slide in, alternating sides
     scan   sc = smooth(.2,1.5,b), so = smooth(.2,.4,b)*(1-smooth(1.35,1.55,b))
     seq    P = (i - 1.42) / (p - .64 - 1.42)  (the scrubbed "frame")
     title  lifts and fades from i = 1.72 ; fade fo = smooth(p-.62, p-.12, i) */
(function () {
  var MF = window.MF;
  if (!MF) return;
  var secs = MF.$$("[data-fx-depth]");
  if (!secs.length) return;

  function sm(a, b, x) { var t = MF.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function pad3(n) { n = String(n); while (n.length < 3) n = "0" + n; return n; }

  var CLASSES = ["VoIP", "Browsing", "Streaming", "FileTransfer", "P2P", "Chat", "Mail"];
  var F1 = ["0.999", "0.968", "0.874", "0.941", "0.979", "0.943", "0.944"];
  var RHYTHM = ["Strict 20 ms frames", "Bursts, then think time", "Periodic big chunks", "Saturated, end to end",
    "Irregular, many peers", "Sparse and short", "One burst, then quiet"];

  /* ------------------------------------------------------------------ shaders */
  var VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  var HEAD = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif",
    "uniform vec2 uR;uniform float uT;uniform float uS[10];uniform float uZoom;uniform float uFy;",
    "float hash(float n){return fract(sin(n*127.1+.31)*43758.5453);}",
    "mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}",
    "float band(float v,float c,float hw,float aa){return 1.-smoothstep(hw,hw+aa,abs(v-c));}",
    ""
  ].join("\n");
  /* slices: ten horizontal strips offset sideways (alternating), dimmed and glitched until s = 1 */
  var MAIN = [
    "void main(){",
    " vec2 f=gl_FragCoord.xy/uR; float kf=clamp(floor((1.-f.y)*10.),0.,9.); float s=1.;",
    " for(int k=0;k<10;k++){ if(float(k)==kf) s=uS[k]; }",
    " float dir=mod(kf,2.)<.5?1.:-1.; float g=1.-s;",
    " vec2 uv=f; uv.x-=g*dir*.64;",
    " float sl=floor(gl_FragCoord.y/(uR.y*.011));",
    " uv.x+=(hash(sl+floor(uT*24.))-.5)*.06*g*step(.6,hash(sl*3.1+floor(uT*12.)));",
    " vec2 fc=vec2(.5,1.-uFy); uv=(uv-fc)/uZoom+fc;",
    " if(uv.x<0.||uv.x>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}",
    " vec3 c=scene(uv);",
    " c=mix(c,c*vec3(1.3,.5,1.35),g);",
    " c*=.2+.8*s;",
    " c=1.-exp(-c*1.15);",
    " gl_FragColor=vec4(c,1.);",
    "}"
  ].join("\n");

  /* A — neon tunnel / data highway: box tunnel, dashed light rails on walls and ceiling, wet reflective floor */
  var TUNNEL = [
    "uniform float uZ;uniform float uSpd;uniform float uYaw;uniform float uRoll;uniform vec3 uCam;",
    "const float W=2.6; const float HC=1.7; const float HF=-1.0;",
    "float hitT(vec3 ro,vec3 rd,out float typ){",
    " float tx=abs(rd.x)<1e-4?1e4:((rd.x>0.?W:-W)-ro.x)/rd.x;",
    " float ty=abs(rd.y)<1e-4?1e4:((rd.y>0.?HC:HF)-ro.y)/rd.y;",
    " if(tx<ty){typ=0.;return tx;} typ=rd.y>0.?1.:2.; return ty;}",
    "float dash(float z,float rate,float ph,float duty,float t){",
    " float s=fract(z*rate+ph); float soft=.02+uSpd*.22;",
    " float d=smoothstep(0.,soft,s)*(1.-smoothstep(duty,min(duty+soft,1.),s));",
    " return mix(d,duty,smoothstep(12.,38.,t));}",
    "vec3 lights(vec3 hp,float typ,float t){",
    " float z=hp.z+uZ; float aa=t*1.6/uR.y+.002; vec3 col;",
    " vec3 MG=vec3(1.,.17,.84); vec3 WH=vec3(1.,.95,1.); float duty=mix(.42,.93,uSpd);",
    " if(typ<.5){",
    "  float side=sign(hp.x); float v=hp.y;",
    "  col=vec3(.034,.031,.04)*(1.+.35*smoothstep(-1.,1.7,v));",
    "  col*=.8+.2*step(.035,fract(z*.22+side*.3));",
    "  col+=WH*band(v,1.28,.035,aa)*dash(z,.09,side*.3,duty,t)*1.8;",
    "  col+=WH*band(v,.52,.028,aa)*dash(z,.13,.5+side*.2,duty,t)*1.4;",
    "  float m1=dash(z,.07,.2+side*.6,duty*.92,t);",
    "  col+=MG*(band(v,.9,.032,aa)*2.4+exp(-abs(v-.9)/.11)*.22)*m1;",
    "  float m2=dash(z,.11,.7+side*.15,duty,t);",
    "  col+=MG*(band(v,.06,.024,aa)*2.+exp(-abs(v-.06)/.09)*.16)*m2;",
    "  float cell=floor(v*9.); float hh=hash(cell*1.7+side*11.);",
    "  if(hh>.6){ float sd=dash(z,.04+.1*hh,hh*7.,.15+.75*uSpd,t);",
    "   col+=mix(WH,MG,step(.8,hh))*band(v,(cell+.5)/9.,.007,aa)*sd*(.35+1.8*uSpd); }",
    " } else {",
    "  float x=hp.x; col=vec3(.022,.02,.027);",
    "  float bm=fract(z*.16+x*.05); col*=.55+.45*smoothstep(.0,.05,bm)*(1.-smoothstep(.8,.86,bm));",
    "  col+=WH*band(x,-1.35,.05,aa)*dash(z,.08,.1,duty,t)*1.9;",
    "  col+=WH*band(x,1.35,.05,aa)*dash(z,.08,.55,duty,t)*1.9;",
    "  col+=MG*(band(x,0.,.03,aa)*2.+exp(-abs(x)/.1)*.12)*dash(z,.05,.3,.5+.45*uSpd,t);",
    " }",
    " return col;}",
    "vec3 floorC(vec3 hp,vec3 rd,float t){",
    " float z=hp.z+uZ; float aa=t*1.6/uR.y+.002; vec3 col=vec3(.012,.011,.015);",
    " col+=vec3(.85)*band(hp.x,-1.,.022,aa)*dash(z,.22,0.,.38+.5*uSpd,t)*.55;",
    " col+=vec3(.85)*band(hp.x,1.,.022,aa)*dash(z,.22,.5,.38+.5*uSpd,t)*.55;",
    " col+=vec3(1.,.17,.84)*band(hp.x,0.,.015,aa)*.5;",
    " vec3 rd2=normalize(vec3(rd.x+(hash(floor(z*2.5)+floor(hp.x*30.))-.5)*.02,-rd.y,rd.z));",
    " float ty2; float t2=hitT(hp,rd2,ty2); vec3 h2=hp+rd2*t2;",
    " float fr=.22+.5*pow(1.-abs(rd.y),5.);",
    " col+=lights(h2,ty2,t+t2)*fr*exp(-t2*.04);",
    " return col;}",
    "vec3 scene(vec2 uv){",
    " vec2 p=(uv-.5)*vec2(uR.x/uR.y,1.);",
    " vec3 rd=normalize(vec3(p,1.05)); rd.xy=rot(uRoll)*rd.xy; rd.xz=rot(uYaw)*rd.xz;",
    " vec3 ro=uCam; float typ; float t=hitT(ro,rd,typ); vec3 hp=ro+rd*t;",
    " vec3 col=typ>1.5?floorC(hp,rd,t):lights(hp,typ,t);",
    " float fog=exp(-t*.05); col=col*fog+vec3(.18,.03,.15)*(1.-fog)*.55;",
    " vec2 vp=vec2(-tan(uYaw)*1.05,-uCam.y*.0);",
    " col+=vec3(1.,.45,.9)*exp(-length(p-vp)*5.)*(.18+.25*uSpd);",
    " return col;}"
  ].join("\n");

  /* B — packet-rhythm landscape: rows of timing traces marching toward the camera, near-to-far with occlusion */
  var PULSE = [
    "uniform float uFlow;uniform float uMarch;uniform float uA;uniform float uB;uniform float uM;uniform float uRows;",
    "float spike(float x,float w){return exp(-x*x/(w*w));}",
    "float sig(float c,float u,float sd){",
    " if(c<.5){ return .85*spike(fract(u)-.5,.045)+.03; }",                                     // VoIP: strict 20 ms frames
    " if(c<1.5){ float cy=u/5.; float cl=floor(cy); float ph=fract(cy)*5.; float q=ph*5.; float k=floor(q);",
    "  float on=1.-step(1.6+hash(cl+sd)*.9,ph); return on*(.35+.65*hash(cl*13.+k+sd))*spike(fract(q)-.5,.16)+.02; }", // Browsing
    " if(c<2.5){ float ph=fract(u/3.)*3.; return smoothstep(0.,.1,ph)*(1.-smoothstep(.85,1.,ph))*(.82+.08*sin(u*37.))+.03; }", // Streaming
    " if(c<3.5){ float k=floor(u*9.); float a=hash(k+sd),b=hash(k+1.+sd); float f=fract(u*9.); return .7+.2*mix(a,b,f*f*(3.-2.*f)); }", // FileTransfer
    " if(c<4.5){ float k=floor(u*1.4); float ph=fract(u*1.4)-(.15+.7*hash(k+sd*3.1));",
    "  return (.25+.75*hash(k*7.+sd))*spike(ph,.025+.09*hash(k*3.+sd))+.02; }",                 // P2P
    " if(c<5.5){ float k=floor(u/3.); float ph=fract(u/3.)*3.-.6-hash(k*5.+sd)*1.8;",
    "  return step(.5,hash(k+sd*1.3))*.5*spike(ph,.06)+.015; }",                                // Chat
    " float ph=fract(u/9.)*9.; float q=ph*6.; float k=floor(q);",
    " return (1.-smoothstep(1.4,1.9,ph))*(.45+.55*hash(k+floor(u/9.)*7.+sd))*spike(fract(q)-.5,.2)+.015;}", // Mail
    "vec3 scene(vec2 uv){",
    " vec2 p=(uv-.5)*vec2(uR.x/uR.y,1.);",
    " const float F=1.25; const float CH=1.25; const float Z0=1.7; const float DZ=.3; float hy=.2;",
    " float fr=fract(uMarch),fl=floor(uMarch),px=1./uR.y; vec3 col=vec3(0.); float T=1.;",
    " for(int i=0;i<44;i++){",
    "  float fi=float(i); if(fi>=uRows||T<.01) break;",
    "  float z=Z0+(fi-fr)*DZ; float sc=F/z; float x=p.x/sc; float id=fi+fl;",
    "  float u=x*2.1+uFlow+hash(id)*13.;",
    "  float h=uM>.5?sig(uB,u,id):sig(uA,u,id);",
    "  h*=smoothstep(7.5,3.2,abs(x));",
    "  float ly=hy-CH*sc+(h*.55+.025*sin(x*1.3+id))*sc; float d=p.y-ly;",
    "  float a=fi<.5?1.-fr:1.;",
    "  float fade=exp(-z*.11)*a*clamp(uRows-fi,0.,1.);",
    "  float w=px*(1.+sc*.6);",
    "  float core=1.-smoothstep(w*.5,w*1.7,abs(d)); float glow=exp(-abs(d)/(px*5.+.006*sc));",
    "  vec3 lc=mix(vec3(.55,.14,1.),vec3(1.,.17,.84),smoothstep(12.,4.,z)); lc=mix(lc,vec3(1.,.9,1.),smoothstep(.5,1.,h)*.75);",
    "  col+=lc*(core*1.35+glow*.45)*fade*T;",
    "  if(d<0.){ col+=vec3(.016,.005,.02)*fade*T; T*=1.-a; }",
    " }",
    " col+=(vec3(.6,.06,.45)*exp(-abs(p.y-hy)*9.)*.2+vec3(.015,0.,.025))*T;",
    " return col;}"
  ].join("\n");

  /* WebGL2 port of a GLSL ES 1.00 fragment: loop bounds become runtime values (N + uZero, uZero is an unset
     uniform = 0) so ANGLE/Direct3D cannot unroll them. Unrolled, the pulse loop (44 rows x 7 rhythm branches)
     took seconds to compile on the first draw and froze the page on integrated GPUs. */
  function toES3(src, frag) {
    src = src.replace(/for\s*\(\s*int\s+(\w+)\s*=\s*0\s*;\s*\1\s*<\s*(\d+)\s*;/g, "for(int $1=0;$1<$2+uZero;");
    if (!frag) return "#version 300 es\n" + src.replace(/\battribute\b/g, "in");
    src = src.replace(/for\(int k=0;k<10\+uZero;k\+\+\)\{ if\(float\(k\)==kf\) s=uS\[k\]; \}/, "s=uS[int(kf)];");
    return "#version 300 es\n" + src.replace(/\bgl_FragColor\b/g, "mfOut").replace(/(precision \w+ float;\n#endif\n)/, "$1out vec4 mfOut;\nuniform int uZero;\n");
  }

  function makeGL(cv, kind) {
    var gl = null, es3 = false, opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" };
    try { gl = cv.getContext("webgl2", opts); es3 = !!gl; } catch (e) { gl = null; }
    if (!gl) { try { gl = cv.getContext("webgl", opts); } catch (e) { gl = null; } }
    if (!gl) return null;
    /* compile + link on the driver's worker thread (KHR_parallel_shader_compile) and poll for completion,
       instead of blocking the page on COMPILE/LINK_STATUS (that wait was the multi-second freeze) */
    var par = gl.getExtension("KHR_parallel_shader_compile");
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!par && !gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("fx/30-depth shader", gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    /* The pulse gets one program per traffic class with the class baked in (#define CLS): the rhythm branch folds
       away at compile time. Switching the class through a uniform made the Direct3D driver stall for 1.5-2.5 s. */
    var srcs = kind === "pulse"
      ? [0, 1, 2, 3, 4, 5, 6].map(function (c) {
          return HEAD + "#define CLS " + c + ".0\n" + PULSE.replace("float h=uM>.5?sig(uB,u,id):sig(uA,u,id);", "float h=sig(CLS,u,id);") + "\n" + MAIN;
        })
      : [HEAD + TUNNEL + "\n" + MAIN];
    var vs = sh(gl.VERTEX_SHADER, es3 ? toES3(VS, false) : VS);
    if (!vs) return null;
    var progs = srcs.map(function (src) {
      var fs = sh(gl.FRAGMENT_SHADER, es3 ? toES3(src, true) : src);
      if (!fs) return null;
      var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.bindAttribLocation(pr, 0, "a"); gl.linkProgram(pr);
      return { pr: pr, fs: fs, locs: {}, ok: 0 };
    });
    if (progs.some(function (p) { return !p; })) return null;
    var state = 0;   // 0 compiling, 1 ready, -1 failed
    function U(P, n) { if (!(n in P.locs)) P.locs[n] = gl.getUniformLocation(P.pr, n); return P.locs[n]; }
    function poll() {
      if (state) return state;
      for (var i = 0; i < progs.length; i++) {
        var P = progs[i];
        if (P.ok) continue;
        if (par && !gl.getProgramParameter(P.pr, par.COMPLETION_STATUS_KHR)) return 0;
        if (!gl.getProgramParameter(P.pr, gl.LINK_STATUS)) {
          console.warn("fx/30-depth link", gl.getProgramInfoLog(P.pr), gl.getShaderInfoLog(P.fs));
          state = -1; cv.style.display = "none"; return state;
        }
        P.ok = 1;
      }
      var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.viewport(0, 0, 1, 1);
      progs.forEach(function (P) { gl.useProgram(P.pr); gl.drawArrays(gl.TRIANGLES, 0, 3); });   // warm-up draws, off screen
      state = 1; return state;
    }
    return {
      gl: gl,
      poll: poll,
      draw: function (u) {
        if (gl.isContextLost() || poll() !== 1) return;
        var P = progs[0];
        if (progs.length > 1) P = progs[MF.clamp(Math.round(u.uM > .5 ? u.uB : u.uA) || 0, 0, progs.length - 1)];
        gl.useProgram(P.pr);
        gl.viewport(0, 0, cv.width, cv.height);
        gl.uniform2f(U(P, "uR"), cv.width, cv.height);
        for (var k in u) {
          var v = u[k], l = U(P, k === "uS" ? "uS[0]" : k);
          if (l === null) continue;
          if (k === "uS") gl.uniform1fv(l, v);
          else if (k === "uCam") gl.uniform3f(l, v[0], v[1], v[2]);
          else gl.uniform1f(l, v);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  }

  /* ------------------------------------------------------------------ one section */
  function setup(sec) {
    var kind = sec.getAttribute("data-fx-depth");
    var stage = MF.$(".fx-depth__stage", sec), cv = MF.$(".fx-depth__gl", sec), title = MF.$(".fx-depth__title", sec);
    var num = MF.$("[data-depth-n]", sec);
    var lanes = MF.$$(".fx-depth__lane", sec);
    var rail = MF.$$(".fx-depth__rail li", sec);
    var rdI = MF.$("[data-pulse-i]", sec), rdC = MF.$("[data-pulse-c]", sec), rdF = MF.$("[data-pulse-f]", sec), rdR = MF.$("[data-pulse-rh]", sec);
    var fy = (parseFloat(getComputedStyle(sec).getPropertyValue("--fy")) || 50) / 100;
    var small = Math.min(window.innerWidth, window.innerHeight * 1.2) < 768;
    function setv(el, k, v) { var c = el.__fxd || (el.__fxd = {}); if (c[k] !== v) { c[k] = v; el.style.setProperty(k, v); } }
    function text(el, v) { if (el && el.textContent !== v) el.textContent = v; }

    /* full-bleed motion visuals render at 1 canvas px per CSS px: streaks in motion hide the softness, and
       integrated GPUs keep 60 fps (1.5x on high-DPI screens cost ~2.2x the pixels for no visible gain) */
    var R = null, glTried = false, scale = .8;
    if (small) scale = 1;
    /* the pulse landscape is ~40 glowing traces per pixel: render it at 60% and let the browser upscale (soft glow hides it) */
    if (kind === "pulse") scale = small ? .7 : .6;
    var strips = new Float32Array(10);
    var st = { cur: 0, q: 0, lastST: 0, travel: 0, spd: 0, march: 0, flow: 0, t: Math.random() * 20, slow: 0, n: 0, active: -1, dirty: true };

    function size() {
      var w = Math.max(2, Math.round(cv.clientWidth * scale)), h = Math.max(2, Math.round(cv.clientHeight * scale));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; st.dirty = true; }
    }
    function initGL() {
      if (glTried) return; glTried = true;
      R = makeGL(cv, kind);
      if (!R) { cv.style.display = "none"; return; }
      size();
      /* keep polling the background compile (and do the warm-up draw) while the section is still far away */
      var stop = MF.tick(function () { if (!R || R.poll() !== 0) stop(); });
    }

    function setActive(a) {
      if (a === st.active) return; st.active = a;
      rail.forEach(function (li, k) { li.classList.toggle("is-on", k === a); });
      text(rdI, "0" + (a + 1)); text(rdF, F1[a]); text(rdR, RHYTHM[a]);
      if (rdC) { rdC.textContent = CLASSES[a]; rdC.classList.remove("is-swap"); void rdC.offsetWidth; rdC.classList.add("is-swap"); }
    }

    /* ---- reduced motion: no pin, final state, one still frame ---- */
    if (MF.reduce) {
      sec.classList.add("is-static");
      title && title.classList.add("in");
      setv(stage, "--e", "1"); setv(stage, "--hud", "1");
      for (var k = 0; k < 10; k++) strips[k] = 1;
      text(num, kind === "pulse" ? "07 classes" : "2.31 ms");
      var still = function () {
        initGL(); if (!R) return; size();
        R.draw(kind === "pulse"
          ? { uT: 0, uS: strips, uZoom: 1, uFy: fy, uFlow: 3.0, uMarch: 0, uA: 0, uB: 0, uM: 0, uRows: small ? 20 : 28 }
          : { uT: 0, uS: strips, uZoom: 1, uFy: fy, uZ: 12, uSpd: .35, uYaw: .14, uRoll: .025, uCam: [.5, -.3, 0] });
      };
      MF.inView(sec, still, { rootMargin: "50% 0px" });
      window.addEventListener("resize", function () { if (glTried && R) still(); }, { passive: true });
      return;
    }

    sec.classList.add("is-armed");
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es, o) { es.forEach(function (en) { if (en.isIntersecting) { o.disconnect(); initGL(); } }); }, { rootMargin: "150% 0px" }).observe(sec);
    } else initGL();

    MF.tick(function (dt, S) {
      var r = sec.getBoundingClientRect(), vh = S.vh || window.innerHeight;
      if (r.bottom < -vh * .2 || r.top > vh * 1.2) return;
      var i = (vh - r.top) / vh, p = Math.max(1, (r.height - vh) / vh);
      var b = i < 1 ? i : 1 + (i - 1) * 1.45;
      var e = sm(.22, 1.55, b);
      var t0 = 1.42, M = p - .64, P = MF.clamp((i - t0) / (M - t0), 0, 1);
      var I = 1.72, z = sm(I, I + .42, i);
      var fo = sm(p - .62, p - .12, i);

      setv(stage, "--e", e.toFixed(4));
      setv(stage, "--tt", (-z * z * .98 * vh).toFixed(1) + "px");
      setv(stage, "--tto", (1 - sm(I + .24, I + .42, i)).toFixed(3));
      setv(stage, "--fo", fo.toFixed(4));
      setv(stage, "--sc", sm(.2, 1.5, b).toFixed(4));
      setv(stage, "--so", (sm(.2, .4, b) * (1 - sm(1.35, 1.55, b))).toFixed(3));
      var gone = fo > .999;
      if (gone !== st.gone) { st.gone = gone; stage.classList.toggle("is-gone", gone); }
      if (i > .8 && title && !title.classList.contains("in")) title.classList.add("in");
      for (var k = 0; k < 10; k++) strips[k] = sm(.2 + k * .065, .85 + k * .065, b);

      /* scrub with the same exponential catch-up dozfx uses for its frame index (~70 ms) */
      var a = 1 - Math.exp(-dt * 1000 / 70);
      st.cur += (P - st.cur) * a; if (Math.abs(P - st.cur) < 1e-4) st.cur = P;
      st.t += dt;
      var cur = st.cur, ec = MF.ease(cur);

      if (kind === "speed") {
        var rv = sm(I + .28, I + .5, i);
        setv(stage, "--rv", rv.toFixed(3));
        lanes.forEach(function (ln, k) { setv(ln, "--r", sm(I + .3 + k * .05, I + .52 + k * .05, i).toFixed(3)); });
        text(num, i > t0 ? (cur * 2.31).toFixed(2) + " ms" : pad3(Math.round(e * 100)));
      } else {
        var cs = 1.85, ce = p - .7;
        var qT = MF.clamp((i - cs) / (ce - cs), 0, 1) * 7;
        st.q += (qT - st.q) * a;
        var q = Math.min(st.q, 6.999), A = Math.floor(q), fq = q - A, mix = A < 6 ? sm(.72, 1, fq) : 0;
        st.A = A; st.B = Math.min(6, A + 1); st.M = mix;
        setActive(mix > .5 ? st.B : A);
        setv(stage, "--rv", sm(I + .28, I + .53, i).toFixed(3));
        setv(stage, "--hud", sm(1.3, 1.6, i).toFixed(3));
        text(num, i > t0 ? "0" + (st.active + 1) + " / 07" : pad3(Math.round(e * 100)));
      }

      if (!R || gone || !MF.onScreen(stage)) return;
      size();

      /* adaptive resolution: drop render scale if frames run long */
      st.slow = st.slow * .95 + (dt > 1 / 40 ? 1 : 0) * .05;
      if (++st.n > 60 && st.slow > .5 && scale > .4) { scale *= .8; st.slow = 0; st.n = 0; size(); }

      var u = { uT: st.t, uS: strips, uZoom: 1.1 - e * .1, uFy: fy };
      if (kind === "speed") {
        var sT = cur * 70, dS = (sT - st.lastST) / Math.max(dt, 1e-3); st.lastST = sT;
        var base = 2.4 + cur * 7;
        st.travel += dt * base;
        var v = Math.abs(dS) + base;
        var tgt = Math.max(MF.clamp((v - 2.4) / 40, 0, 1), cur * .8);
        st.spd += (tgt - st.spd) * (1 - Math.exp(-dt * 5));
        u.uZ = st.travel + sT; u.uSpd = st.spd;
        u.uYaw = MF.lerp(.3, 0, ec); u.uRoll = MF.lerp(.06, 0, ec) + Math.sin(st.t * .7) * .006;
        u.uCam = [MF.lerp(1.15, 0, ec), MF.lerp(-.5, -.15, ec) + Math.sin(st.t * 1.3) * .01, 0];
      } else {
        st.march = (st.t * .35 + cur * 26);
        st.flow = (st.t * .5 + cur * 9) % 630;
        u.uMarch = st.march; u.uFlow = st.flow; u.uA = st.A || 0; u.uB = st.B || 0; u.uM = st.M || 0;
        u.uRows = small ? 20 : 28;
      }
      R.draw(u);
    });
  }

  MF.ready(function () { secs.forEach(function (s) { try { setup(s); } catch (err) { console.warn("fx/30-depth", err); } }); });
})();

}catch(e){console.error('fx/30-depth.js', e)}})();
/* ---- fx/50-reel.js ---- */
;(function(){try{
/* 50-reel: (A) demo teaser — devices unfold from rotateX(66deg) as they scroll in (dozfx [data-reel-frame] --u),
   float, and tilt toward the pointer; the laptop video plays only while on screen.
   (B) "Charts take shape." — port of dozfx [data-spiral]: pinned 3D vortex of the 11 repo charts. */
MF.ready(function () {
  var S = MF.state;
  function K(a, b, x) { var t = MF.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); } // smoothstep

  /* a dropped request must not leave a blank card or screen: retry failed images a few times */
  MF.$$(".fx-reel img, .fx-spiral img").forEach(function (im) {
    var tries = 0, base = im.getAttribute("src");
    function retry() {
      if (tries >= 4 || !base) return; tries++;
      setTimeout(function () { im.src = base + (base.indexOf("?") < 0 ? "?" : "&") + "r=" + tries; }, 700 * tries);
    }
    im.addEventListener("error", retry);
    if (im.complete && im.naturalWidth === 0 && im.getAttribute("src")) retry();
  });

  /* ---------------- (A) reel ---------------- */
  MF.$$("[data-fx-reel]").forEach(function (sec) {
    var stage = MF.$("[data-fx-reel-stage]", sec), rig = MF.$("[data-fx-reel-rig]", sec), video = MF.$("[data-fx-reel-video]", sec);

    if (video) {
      video.muted = true; video.playsInline = true;
      if (MF.reduce) { video.removeAttribute("autoplay"); video.loop = false; try { video.pause(); } catch (e) {} }
      else if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
            else video.pause();
          });
        }, { threshold: 0.1 }).observe(video);
      }
    }
    if (!stage || !rig || MF.reduce) { if (rig) rig.style.setProperty("--u", "1"); return; }

    var u = -1, rx = 0, ry = 0, last = "";
    MF.tick(function (dt) {
      if (!MF.onScreen(stage, S.vh * 0.2)) return;
      var r = stage.getBoundingClientRect();
      var tu = MF.clamp((S.vh - r.top) / (0.46 * (S.vh + r.height)), 0, 1);
      u = u < 0 ? tu : u + (tu - u) * (1 - Math.exp(-dt * 10));
      var tx = 0, ty = 0;
      if (!MF.coarse && S.vw > 560) {
        var nx = MF.clamp((S.mx - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
        var ny = MF.clamp((S.my - (r.top + r.height / 2)) / (S.vh / 2), -1, 1);
        ty = nx * 7; tx = -ny * 4.5;
      }
      var k = 1 - Math.exp(-dt * 4);
      ry += (ty - ry) * k; rx += (tx - rx) * k;
      var key = u.toFixed(4) + "|" + rx.toFixed(2) + "|" + ry.toFixed(2);
      if (key === last) return;
      last = key;
      rig.style.setProperty("--u", u.toFixed(4));
      rig.style.setProperty("--rx", rx.toFixed(2) + "deg");
      rig.style.setProperty("--ry", ry.toFixed(2) + "deg");
    });
  });

  /* ---------------- (B) spiral ---------------- */
  var sp = MF.$("[data-fx-spiral]");
  if (!sp) return;
  if (MF.reduce) { sp.classList.add("is-static"); return; }

  var cards = MF.$$(".fx-spiral__card", sp), n = cards.length;
  var title = MF.$("[data-fx-spiral-title]", sp), stage = MF.$(".fx-spiral__stage", sp);
  var back = MF.$(".fx-spiral__space:not(.fx-spiral__space--front)", sp), front = MF.$(".fx-spiral__space--front", sp);

  /* warm the images up well before the section arrives (dozfx: eager + decode after load / 600% margin) */
  var warmed = false;
  function warm() {
    if (warmed) return; warmed = true;
    MF.$$("img", sp).forEach(function (im) { im.loading = "eager"; try { im.fetchPriority = "high"; } catch (e) {} if (im.decode) im.decode().catch(function () {}); });
  }
  if (document.readyState === "complete") setTimeout(warm, 400); else window.addEventListener("load", function () { setTimeout(warm, 400); }, { once: true });
  if ("IntersectionObserver" in window) new IntersectionObserver(function (es, o) { es.forEach(function (e) { if (e.isIntersecting) { warm(); o.disconnect(); } }); }, { rootMargin: "600% 0px" }).observe(sp);

  var GAP = 560, LEAD = 700;           // z spacing between cards, lead-in depth (dozfx v, p)
  var r = 0, h = 0, m = 0, spin = 0, early = null, near = null, live = false;
  cards.forEach(function (c) { c._f = false; c._h = 0; });

  function frame(dt) {
    m += dt;
    var vw = S.vw, vh = S.vh, mob = vw < 768;
    var RX = mob ? vw * 0.34 : Math.min(vw * 0.31, 560), RY = mob ? vh * 0.28 : RX * 0.7;
    var travel = n * GAP + LEAD;
    var W = K(0, 1, h), D = K(0.05, 0.5, h);
    var cam = r * travel + m * 22 - (1 - W) * 3200;                       // camera depth: scroll + slow drift
    spin += Math.abs(S.vy) / 60 * 1e-4 * Math.min(4, dt * 60);           // fast scrolling whips the vortex
    var ang = r * Math.PI * 2.6 + m * 0.1 + spin - (1 - W) * 1.8;
    var rx = RX * (0.18 + 0.82 * W), ry = RY * (0.18 + 0.82 * W);
    var best = null, bestZ = -1e9;

    for (var i = 0; i < n; i++) {
      var c = cards[i], z = cam - i * GAP - LEAD;
      var q = K(-5600, -2400, z) * (1 - K(240, 620, z)) * D;
      if (q < 0.004) { if (!c._h) { c._h = 1; c.style.visibility = "hidden"; } continue; }
      if (c._h) { c._h = 0; c.style.visibility = ""; }
      var f = z > -20;                                                   // passed the title plane: draw above it
      if (front && c._f !== f) { c._f = f; (f ? front : back).appendChild(c); }
      var a = i * 0.74 + ang, X = Math.cos(a), Y = Math.sin(a);
      c.style.transform = "translate3d(" + (X * rx).toFixed(1) + "px," + (Y * ry).toFixed(1) + "px," + z.toFixed(1) + "px) rotateY(" +
        (-X * 32).toFixed(2) + "deg) rotateX(" + (Y * 22).toFixed(2) + "deg) rotateZ(" + (X * Y * 10).toFixed(2) + "deg)";
      c.style.opacity = q.toFixed(3);
      if (q > 0.35 && z < 240 && z > bestZ) { bestZ = z; best = c; }
    }
    if (best !== near) { if (near) near.classList.remove("is-near"); if (best) best.classList.add("is-near"); near = best; }

    if (title) {
      title.style.setProperty("--ts", (0.04 + K(0.1, 0.92, h) * 0.78 + K(0, 1, r) * 0.5).toFixed(4));
      title.style.opacity = (K(0.08, 0.6, h) * (1 - K(0.86, 0.97, r))).toFixed(3);
    }
    stage.style.setProperty("--sbg", (K(0.2, 0.95, h) * (1 - K(0.74, 0.95, r))).toFixed(3));
    stage.style.setProperty("--sx", (1 - K(0.74, 0.95, r)).toFixed(3));
    if (!live) { live = true; sp.classList.add("is-live"); }
  }

  MF.tick(function (dt) {
    var b = sp.getBoundingClientRect(), vh = S.vh;
    r = MF.clamp(-b.top / Math.max(1, b.height - vh), 0, 1);
    h = MF.clamp(1 - b.top / vh, 0, 1);
    var e = b.top > 0 && b.top < vh;                                     // fix the stage while the section approaches
    if (e !== early) { early = e; stage.classList.toggle("is-early", e); }
    if (b.top < vh && b.bottom > 0) frame(dt);
    else if (!live) frame(0);                                            // set the hidden start state once
  });
});

}catch(e){console.error('fx/50-reel.js', e)}})();
/* ---- fx/70-warp.js ---- */
;(function(){try{
/* MetaFlow fx 70: stack grid, comparison, warp and tagline band. Ports of dozfx's
   [data-settle] (heading settles from stretched + blurred to sharp), .logos (diagonal 3D reveal, per-cell tilt)
   + [data-spot] (cursor spotlight), .warp[data-warp] (pinned stage, shapes orbiting in depth then flying past
   the camera, steps lighting up, content blurring out) and .warp__final (words flying in, then the camera
   flying through them with a magenta flash). Bundled inside its own try/catch IIFE by build.py. */
var MF = window.MF;
var F7_HOVER = !!(window.matchMedia && window.matchMedia("(hover: hover)").matches) && !MF.coarse;

function f7K(a, b, x) { var t = MF.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function f7Set(el, k, v) { if (!el) return; var c = el._f7 || (el._f7 = {}); if (c[k] !== v) { c[k] = v; el.style.setProperty(k, v); } }

/* ---------------- [data-fx-settle] ---------------- */
MF.$$("[data-fx-settle]").forEach(function (el) {
  if (MF.reduce) return;
  var box = el.parentNode || el, last = -1;
  MF.tick(function (dt, s) {
    var r = box.getBoundingClientRect();
    if (r.top > s.vh * 1.1 || r.bottom < -s.vh * .2) return;
    var a = MF.clamp((s.vh - r.top) / (s.vh * .62), 0, 1), st = 1 + Math.pow(1 - a, 2.2) * .3;
    if (Math.abs(st - last) < 5e-4) return;
    last = st; el.style.setProperty("--st", st.toFixed(4));
  });
});

/* ---------------- stack grid: reveal + spotlight + tilt ---------------- */
MF.$$("[data-fx-logos]").forEach(function (g) {
  var cells = MF.$$(".fx-cl__cell", g);
  if (!cells.length) return;
  if (MF.reduce) { cells.forEach(function (c) { c.classList.add("in"); }); }
  else {
    g.classList.add("is-js");
    var cols = function () { return getComputedStyle(g).gridTemplateColumns.split(" ").length || 6; };
    var order = null, shown = 0, lastCols = 0;
    var sortCells = function () {
      var d = cols(); lastCols = d;
      order = cells.map(function (c, l) { return { c: c, k: l % d + Math.floor(l / d) * 1.6 + (l % 2) * .3 }; })
        .sort(function (a, b) { return a.k - b.k; }).map(function (o) { return o.c; });
    };
    var off = MF.tick(function (dt, s) {
      if (shown >= cells.length) { off(); return; }
      var r = g.getBoundingClientRect();
      if (r.top > s.vh) return;
      if (!order) sortCells();
      var c = MF.clamp((s.vh * .95 - r.top) / (s.vh * .45 + r.height * .55), 0, 1), want = Math.ceil(c * cells.length);
      while (shown < want) {
        var cell = order[shown];
        cell.style.transitionDelay = (shown % 3) * 40 + "ms";
        cell.classList.add("in");
        (function (x) { setTimeout(function () { x.style.transitionDelay = ""; }, 1400); })(cell);
        shown++;
      }
    });
  }

  /* spotlight: --mx/--my on the grid, --b (0..1 proximity) on each cell */
  if (!F7_HOVER) return;
  var centres = [];
  var measure = function () {
    centres = cells.map(function (c) { return [c.offsetLeft + c.offsetWidth / 2, c.offsetTop + c.offsetHeight / 2]; });
  };
  g.addEventListener("pointerenter", function () { measure(); f7Set(g, "--sp", "1"); });
  g.addEventListener("pointermove", function (e) {
    var r = g.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!centres.length) measure();
    g.style.setProperty("--mx", x.toFixed(0) + "px");
    g.style.setProperty("--my", y.toFixed(0) + "px");
    for (var i = 0; i < cells.length; i++) {
      var dx = centres[i][0] - x, dy = centres[i][1] - y, b = 1 - MF.clamp(Math.sqrt(dx * dx + dy * dy) / 340, 0, 1);
      f7Set(cells[i], "--b", (b * b).toFixed(3));
    }
  }, { passive: true });
  g.addEventListener("pointerleave", function () {
    f7Set(g, "--sp", "0");
    cells.forEach(function (c) { f7Set(c, "--b", "0"); });
  });
  window.addEventListener("resize", function () { centres = []; }, { passive: true });
  if (MF.reduce) return;
  cells.forEach(function (d) {
    d.addEventListener("pointermove", function (e) {
      var l = d.getBoundingClientRect();
      d.style.setProperty("--ty", (((e.clientX - l.left) / l.width - .5) * 16).toFixed(2) + "deg");
      d.style.setProperty("--tx", (((e.clientY - l.top) / l.height - .5) * -16).toFixed(2) + "deg");
    }, { passive: true });
    d.addEventListener("pointerleave", function () { d.style.setProperty("--ty", "0deg"); d.style.setProperty("--tx", "0deg"); });
  });
});

/* ---------------- comparison: heading words rise, rows reveal one by one ---------------- */
MF.$$("[data-fx-cmp]").forEach(function (sec) {
  var h = MF.$("[data-fx-words]", sec), head = MF.$$(".cmp thead tr", sec), rows = MF.$$(".cmp tbody tr", sec);
  if (MF.reduce) { if (h) h.classList.add("in"); head.concat(rows).forEach(function (r) { r.classList.add("in"); }); return; }
  sec.classList.add("is-js");
  if (h) MF.inView(h, function () { h.classList.add("in"); }, { threshold: .4 });
  var table = MF.$(".cmp", sec);
  if (!table) return;
  MF.inView(table, function () {
    head.forEach(function (r) { r.classList.add("in"); });
    rows.forEach(function (r, i) { setTimeout(function () { r.classList.add("in"); }, 220 + i * 130); });
  }, { threshold: .18 });
});

/* ---------------- warp ---------------- */
(function () {
  var W = MF.$("[data-fx-warp]");
  if (!W) return;
  var steps = MF.$$(".fx-warp__step", W), content = MF.$(".fx-warp__content", W), objs = MF.$$(".fx-warp__obj", W);
  if (MF.reduce) { steps.forEach(function (s) { s.classList.add("on"); }); return; }
  var TAU = Math.PI * 2, l = 0, BASE = 7 / 11;   // shape boxes are 11vw; dozfx's are 7vw, so scale down to match
  objs.forEach(function (o) { o._c = {}; });
  MF.tick(function (dt, s) {
    var r = W.getBoundingClientRect(), vh = s.vh, vw = s.vw;
    if (r.bottom < -vh || r.top > vh * 1.5) return;
    var P = MF.clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    for (var i = 0; i < steps.length; i++) {
      var on = P > .03 + i * .08;
      if (steps[i]._on !== on) { steps[i]._on = on; steps[i].classList.toggle("on", on); }
    }
    f7Set(content, "--co", (1 - f7K(.42, .55, P)).toFixed(3));
    f7Set(content, "--ci", f7K(.4, 1, MF.clamp((vh - r.top) / vh, 0, 1)).toFixed(3));
    if (!objs.length) return;
    l += dt;
    var mob = vw < 768, desk = vw >= 1024, Z = 800, n = objs.length;
    var cx = desk ? .255 * vw : 0, cy = desk ? -.15 * vh : mob ? -.29 * vh : -.27 * vh;
    var rad = desk ? Math.min(.18 * vw, 340) : mob ? .34 * vw : .3 * vw;
    var tilt = desk ? .42 : .36, ct = Math.sqrt(1 - tilt * tilt), base = l * .2 + P * 2.6;
    for (var m = 0; m < n; m++) {
      var o = objs[m], a = base + m * TAU / n;
      var V = Math.cos(a) * rad, I = Math.sin(a) * rad, z = I * ct, yy = I * tilt + Math.sin(l * .7 + m * 2) * 6;
      var C = Z / (Z - z);
      var O = f7K(.4 + m * .03, .82 + m * .02, P);                        // fly toward the camera
      var et = O * 690 - (1 - f7K(0, .1, P)) * 600, ot = Z / (Z - et);   // arrive out of depth, then pass the lens
      var X = (cx + V * C) * ot, Y = (cy + yy * C) * ot, sc = C * ot * BASE;
      var rot = Math.sin(l * .4 + m) * 14 + O * 120 * (m % 2 ? 1 : -1);
      var tf = "translate3d(-50%,-50%,0) translate3d(" + X.toFixed(1) + "px," + Y.toFixed(1) + "px,0) scale(" + sc.toFixed(3) + ") rotate(" + rot.toFixed(1) + "deg)";
      if (o._c.tf !== tf) { o._c.tf = tf; o.style.transform = tf; }
      var T = (I / rad + 1) / 2, zi = String(10 + Math.round(T * 20 + O * 40));
      if (o._c.zi !== zi) { o._c.zi = zi; o.style.zIndex = zi; }
      var op = f7K(0, .08, P) * (1 - f7K(.72, .88, P + m * .01)) * (.42 + .58 * Math.max(T, O)), os = op.toFixed(3);
      if (o._c.op !== os) { o._c.op = os; o.style.opacity = os; }
      var vis = op < .005 ? "hidden" : "visible";
      if (o._c.v !== vis) { o._c.v = vis; o.style.visibility = vis; }
    }
  });
})();

/* ---------------- tagline band ---------------- */
(function () {
  var B = MF.$("[data-fx-band]");
  if (!B) return;
  if (MF.reduce) return;
  var words = MF.$$(".fx-band__w", B), stack = MF.$(".fx-band__words", B), flash = MF.$(".fx-band__flash", B);
  var torus = MF.$(".fx-band__obj--torus", B), cube = MF.$(".fx-band__obj--cube", B);
  words.forEach(function (w) { f7Set(w, "--f", "0"); });
  var c = {}, l = 0;
  MF.tick(function (dt, s) {
    var r = B.getBoundingClientRect(), vh = s.vh, vw = s.vw;
    if (r.bottom < -vh * .2 || r.top > vh * 1.2) return;
    l += dt;
    var P = MF.clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    for (var i = 0; i < words.length; i++) f7Set(words[i], "--f", f7K(.02 + i * .08, .2 + i * .08, P).toFixed(3));
    /* camera flies through the words */
    var rr = f7K(.55, .95, P), y = Math.pow(rr, 1.7) * (F7_HOVER ? 772 : 600);
    var tf = y < .05 ? "none" : "scale(" + (800 / (800 - y)).toFixed(3) + ")";
    var op = (1 - f7K(F7_HOVER ? .88 : .84, F7_HOVER ? .98 : .94, P)).toFixed(3);
    if (c.tf !== tf) { c.tf = tf; stack.style.transform = tf; }
    if (c.op !== op) { c.op = op; stack.style.opacity = op; }
    f7Set(flash, "--fl", (f7K(.82, .9, P) * (1 - f7K(.9, .99, P)) * .55).toFixed(3));
    /* the big shapes behind: come forward with the words, then rush past the lens with them */
    var app = f7K(0, .28, P), gone = 1 - f7K(.7, .9, P), mob = vw < 768;
    var ks = 800 / (800 - Math.pow(rr, 1.4) * 560);
    if (torus) {
      var tx = (mob ? .3 : .37) * vw * ks, ty = ((mob ? .27 : .06) * vh + Math.sin(l * .5) * 10) * ks, ts = (.7 + .3 * app) * ks;
      var ttf = "translate3d(-50%,-50%,0) translate3d(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px,0) scale(" + ts.toFixed(3) + ") rotate(" + (P * -38).toFixed(1) + "deg)";
      if (c.tt !== ttf) { c.tt = ttf; torus.style.transform = ttf; }
      var to = (app * gone).toFixed(3);
      if (c.to !== to) { c.to = to; torus.style.opacity = to; }
    }
    if (cube) {
      var app2 = f7K(.06, .34, P);
      var qx = (mob ? .18 : .24) * vw * ks, qy = (-.36 * vh - (1 - app2) * .2 * vh + Math.cos(l * .45) * 8) * ks, qs = (.75 + .25 * app2) * ks;
      var qtf = "translate3d(-50%,-50%,0) translate3d(" + qx.toFixed(1) + "px," + qy.toFixed(1) + "px,0) scale(" + qs.toFixed(3) + ") rotate(" + (18 + P * 30).toFixed(1) + "deg)";
      if (c.qt !== qtf) { c.qt = qtf; cube.style.transform = qtf; }
      var qo = (app2 * gone * .9).toFixed(3);
      if (c.qo !== qo) { c.qo = qo; cube.style.opacity = qo; }
    }
  });
})();

}catch(e){console.error('fx/70-warp.js', e)}})();
/* ---- fx/85-studio.js ---- */
;(function(){try{
/* MetaFlow fx 85: ports of dozfx's [data-h] word reveal, span.od[data-count] odometers, figure.viz[data-viz],
   the .platform browser window (flame canvas + idle auto-demo cursor) and the .faq / .sticky-col .sk counter.
   Scoped to .fx-ks, .fx-vz, .fx-pl and .fx-faq. Bundled inside its own try/catch IIFE by build.py. */
var MF = window.MF;
var F8_IO = "IntersectionObserver" in window;

/* ---------------- [data-fx8-h]: split a heading into words that rise in ---------------- */
function f8Split(h) {
  if (h._f8) return; h._f8 = 1;
  var i = 0, frag = document.createDocumentFragment();
  function word(node) {
    var wd = document.createElement("span"), wi = document.createElement("span");
    wd.className = "wd"; wi.className = "wi"; wi.style.setProperty("--i", i++);
    wi.appendChild(node); wd.appendChild(wi); return wd;
  }
  Array.prototype.slice.call(h.childNodes).forEach(function (n) {
    if (n.nodeType === 3) {
      n.nodeValue.split(/(\s+)/).forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) frag.appendChild(document.createTextNode(" "));
        else frag.appendChild(word(document.createTextNode(p)));
      });
    } else if (n.nodeType === 1 && n.tagName === "BR") frag.appendChild(n);
    else if (n.nodeType === 1) frag.appendChild(word(n));
  });
  h.textContent = ""; h.appendChild(frag);
}
function f8Heading(h) {
  f8Split(h);
  if (MF.reduce || !F8_IO) { h.classList.add("in"); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { h.classList.add("in"); io.unobserve(h); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
  io.observe(h);
}
MF.$$("[data-fx8-h]").forEach(f8Heading);

/* ---------------- odometers (dozfx span.od[data-count]) ---------------- */
MF.$$(".fx-ks .od[data-count], .fx-vz .od[data-count]").forEach(function (od) {
  var raw = od.getAttribute("data-count") || "";
  if (MF.reduce || !/^[\d.,]+$/.test(raw)) return;          // reduced motion: the final figure stays as plain text
  var host = od.closest(".fx-kf") || od.closest(".fx-viz__foot") || od.parentElement;
  var dl = (+od.getAttribute("data-count-delay") || 0) + "ms";
  od.style.setProperty("--dl", dl); host.style.setProperty("--ud", dl);
  var j = 0;
  od.innerHTML = raw.split("").map(function (ch) {
    if (!/\d/.test(ch)) return '<span class="od__p">' + ch + "</span>";
    var d = +ch, seq = [], c, l;
    for (c = 0; c < j + 2; c++) for (l = 0; l < 10; l++) seq.push(l);   // later digits spin longer, like a real odometer
    for (c = 0; c <= d; c++) seq.push(c);
    var html = '<span class="od__d" style="--k:' + (seq.length - 1) + ";--j:" + j + '"><span class="od__g">' + ch + '</span><span class="od__s">' +
      seq.map(function (x) { return "<i>" + x + "</i>"; }).join("") + "</span></span>";
    j++; return html;
  }).join("");
  if (!F8_IO) { od.classList.add("is-on"); host.classList.add("is-count"); return; }
  /* rolls each time it scrolls back into view (dozfx toggles .is-on both ways) */
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { od.classList.toggle("is-on", e.isIntersecting); host.classList.toggle("is-count", e.isIntersecting); });
  }, { threshold: 0.6 }).observe(od);
});
if (MF.reduce) MF.$$(".fx-ks .fx-kf").forEach(function (k) { k.classList.add("is-count"); });

/* ---------------- figure.viz[data-viz]: draw lines, start packets, pause off-screen ---------------- */
MF.$$(".fx-vz [data-viz]").forEach(function (v) {
  if (MF.reduce || !F8_IO) { v.classList.add("in"); return; }
  new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting && e.intersectionRatio >= 0.3) v.classList.add("in");
      v.classList.toggle("is-off", !e.isIntersecting);
    });
  }, { threshold: [0, 0.3] }).observe(v);
});

/* ---------------- platform: browser window around the live analyzer ---------------- */
MF.$$("[data-fx-pl]").forEach(function (sec) {
  var view = MF.$(".fx-bw__view", sec), chat = MF.$("[data-chat]", sec);
  if (!view) return;

  /* hero / nav links point at #analyzer: give the id to the whole section, not the inner chat */
  var inner = MF.$("#analyzer", sec);
  if (inner && !document.querySelectorAll("#analyzer")[1] && !sec.id) { inner.removeAttribute("id"); sec.id = "analyzer"; }

  /* magenta flame behind the chat (dozfx .bw__flame, here Canvas2D at 0.5x) */
  var cv = MF.$(".fx-bw__flame", view), ctx = cv && cv.getContext && cv.getContext("2d");
  if (ctx) {
    var W = 0, H = 0, t = Math.random() * 20, cnt = 0;
    var size = function () {
      var r = view.getBoundingClientRect(), s = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      var w = Math.max(1, Math.round(r.width * s)), h = Math.max(1, Math.round(r.height * s));
      if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; }
    };
    var blobs = [[0.18, 0.92, 0.55, 0.0, 1.0], [0.52, 1.02, 0.7, 1.7, 0.8], [0.84, 0.95, 0.5, 3.1, 1.2], [0.36, 0.86, 0.38, 4.4, 1.4]];
    var draw = function (dt) {
      t += dt;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (var b = 0; b < blobs.length; b++) {
        var o = blobs[b], x = (o[0] + Math.sin(t * 0.23 * o[4] + o[3]) * 0.08) * W;
        var y = (o[1] + Math.sin(t * 0.31 * o[4] + o[3] * 1.3) * 0.05) * H;
        var r = o[2] * Math.max(W, H) * (0.9 + Math.sin(t * 0.5 + o[3]) * 0.1);
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        var a = 0.16 + Math.sin(t * 0.7 + o[3]) * 0.04;
        g.addColorStop(0, "rgba(255,43,214," + a.toFixed(3) + ")");
        g.addColorStop(0.45, "rgba(200,20,170," + (a * 0.45).toFixed(3) + ")");
        g.addColorStop(1, "rgba(120,0,110,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = "source-over";
    };
    size(); window.addEventListener("resize", size, { passive: true });
    if (MF.reduce) { draw(0); cv.classList.add("is-live"); }
    else MF.tick(function (dt) {
      if (!MF.onScreen(view, 80)) return;
      if (++cnt % 30 === 0) size();
      draw(dt);
      if (cnt === 1) cv.classList.add("is-live");
    });
  }

  /* idle auto-demo: no interaction within 4 s of the window entering view → the cursor glides to
     the first sample chip and clicks it, once (dozfx's Brief Assistant plays itself the same way) */
  if (!chat) return;
  var chip = MF.$("[data-sample]", chat), done = false, timer = 0;
  if (!chip) return;
  var stop = function () { done = true; clearTimeout(timer); };
  ["pointerdown", "keydown", "focusin", "input", "wheel"].forEach(function (ev) {
    view.addEventListener(ev, function (e) { if (e.isTrusted && (ev !== "wheel" || MF.$(".chat-body", chat).contains(e.target))) stop(); }, { passive: true });
  });
  var used = function () { return MF.$$(".chat-body .msg", chat).length > 1 || chip.disabled; };
  var play = function () {
    if (done || used()) { done = true; return; }
    done = true;
    if (MF.reduce) { chip.click(); return; }
    var vr = view.getBoundingClientRect(), cr = chip.getBoundingClientRect();
    view.style.setProperty("--cx", "82%"); view.style.setProperty("--cy", "96%");
    view.classList.add("is-cursor");
    setTimeout(function () {
      view.style.setProperty("--cx", ((cr.left + cr.width * 0.45 - vr.left) / vr.width * 100).toFixed(1) + "%");
      view.style.setProperty("--cy", ((cr.top + cr.height * 0.5 - vr.top) / vr.height * 100).toFixed(1) + "%");
    }, 60);
    setTimeout(function () { view.classList.add("is-click"); chip.classList.add("is-press"); }, 1150);
    setTimeout(function () {
      view.classList.remove("is-click"); chip.classList.remove("is-press");
      if (!used()) chip.click();
    }, 1350);
    setTimeout(function () { view.classList.remove("is-cursor"); }, 2100);
  };
  if (!F8_IO) { timer = setTimeout(play, 4000); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (done) { io.disconnect(); return; }
      clearTimeout(timer);
      if (e.isIntersecting) timer = setTimeout(play, 4000);   // re-armed each time it comes back into view until it has run
    });
  }, { threshold: 0.45 });
  io.observe(view);
});

/* ---------------- FAQ: dozfx "Good to know." + sticky counter of the open question ---------------- */
MF.$$("[data-fx-faq]").forEach(function (root) {
  var faq = MF.$(".faq", root), side = MF.$(".faq-grid > :first-child", root);
  if (!faq || !side) return;
  var items = MF.$$("details", faq), n = items.length;
  if (!n) return;
  var pad = function (x) { return String(x).padStart(2, "0"); };

  var eb = MF.$(".eyebrow", side);
  if (eb) {
    eb.innerHTML = '<span data-scramble>Questions</span>';
    if (!MF.reduce && MF.scramble) MF.inView(eb, function () { MF.scramble(eb.firstChild); });
  }
  var h = MF.$("h2", side);
  if (h) { h.classList.remove("rv"); h.setAttribute("data-fx8-h", ""); f8Heading(h); }

  side.insertAdjacentHTML("beforeend", '<div class="sk" aria-hidden="true"><span class="sk__n"><b>01</b></span><span class="sk__of">/ ' + pad(n) +
    '</span><span class="sk__t"></span><i class="sk__bar"><i></i></i></div>');
  var sk = side.lastElementChild, num = MF.$(".sk__n", sk), txt = MF.$(".sk__t", sk), bar = MF.$(".sk__bar i", sk), cur = -1;
  var q = function (d) { var s = MF.$("summary", d); return s ? s.textContent.trim() : ""; };
  var show = function (k) {
    if (k === cur) return; cur = k;
    num.innerHTML = "<b" + (MF.reduce ? "" : ' class="sk-in"') + ">" + pad(k + 1) + "</b>";
    txt.textContent = q(items[k]);
    bar.style.transform = "scaleX(" + ((k + 1) / n).toFixed(3) + ")";
  };
  var openIdx = function () { for (var k = 0; k < n; k++) if (items[k].open) return k; return -1; };
  var scrollIdx = function () {
    var m = MF.state.vh * 0.5, k = 0;
    items.forEach(function (d, i) { if (d.getBoundingClientRect().top < m) k = i; });
    return k;
  };
  var sync = function () { var o = openIdx(); show(o >= 0 ? o : scrollIdx()); };
  sync();

  /* smooth height: one question open at a time, answers glide open and shut */
  var anim = function (d, open) {
    var a = MF.$(".ans", d);
    if (d._f8a) { d._f8a.cancel(); d._f8a = null; }
    if (!a || MF.reduce || !a.animate) { d.open = open; sync(); return; }
    if (open) d.open = true;
    var cs = getComputedStyle(a), pb = cs.paddingBottom, pt = cs.paddingTop;
    var ch = Math.max(0, (open ? a.scrollHeight : a.getBoundingClientRect().height) - parseFloat(pb) - parseFloat(pt));
    a.classList.add("is-anim");
    var shut = { height: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 }, full = { height: ch + "px", paddingTop: pt, paddingBottom: pb, opacity: 1 };
    var an = a.animate(open
      ? [{ height: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0, transform: "translate3d(0,-8px,0)" }, { height: ch + "px", paddingTop: pt, paddingBottom: pb, opacity: 1, transform: "none" }]
      : [full, shut],
      { duration: open ? 640 : 460, easing: open ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.65,0,.35,1)" });
    d._f8a = an;
    an.onfinish = function () { d._f8a = null; a.classList.remove("is-anim"); if (!open) { d.open = false; sync(); } };
    sync();
  };
  items.forEach(function (d) {
    var s = MF.$("summary", d); if (!s) return;
    s.addEventListener("click", function (e) {
      e.preventDefault();
      var opening = !d.open || !!(d._f8a && d._f8closing);
      items.forEach(function (o) { if (o !== d && o.open) { o._f8closing = true; anim(o, false); } });
      d._f8closing = !opening;
      anim(d, opening);
      if (opening) show(items.indexOf(d));
    });
  });

  /* nothing open → the counter follows the question in the middle of the screen (dozfx .sk) */
  if (!MF.reduce) MF.tick(function () {
    if (!MF.onScreen(faq, 40)) return;
    if (openIdx() < 0) show(scrollIdx());
  });
});

}catch(e){console.error('fx/85-studio.js', e)}})();
/* ---- fx/95-closing.js ---- */
;(function(){try{
/* MetaFlow fx 95 — closing CTA, final tagline, global footer horizon (dozfx port).
   1. layout   the final tagline joins the top of the footer; on the home page the footer
               slides over the pinned closing stage (dozfx .foot--over).
   2. closing  word-rise title, layered scroll parallax, and the synthwave terrain:
               WebGL2 noise landscape carved by a curving road, banded by a neon palette,
               under a magenta dusk sky with a horizon sun and shooting stars. Scroll speeds
               the flight up and lifts the camera and the sun; the pointer steers road width
               and height. Canvas2D fallback when WebGL2 is missing.
   3. footer   canvas[data-horizon]: stars, pulsing glow, a huge planet with a lit rim,
               a glossy moon, haze, a glowing horizon and a perspective floor that drifts toward you.
   Uses the shared MF core. */
"use strict";
var S = MF.state, REDUCE = MF.reduce;
var FINE = !MF.coarse && !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);

/* =====================================================================
   1. LAYOUT
   ===================================================================== */
var SEC = MF.$("[data-closing]"), FIN = MF.$(".fx-final"), FTR = MF.$("footer.ftr");
if (FIN && FTR) {
  var fwrap = null;
  for (var ci = 0; ci < FTR.children.length; ci++) if (FTR.children[ci].classList.contains("wrap")) { fwrap = FTR.children[ci]; break; }
  FTR.insertBefore(FIN, fwrap);
  FTR.classList.add("ftr--final");
}
if (SEC && FTR && !REDUCE) {
  var last = SEC.parentElement ? SEC.parentElement.lastElementChild : null;
  while (last && last !== SEC && /^(SCRIPT|TEMPLATE|STYLE|NOSCRIPT)$/.test(last.tagName)) last = last.previousElementSibling;
  if (last === SEC) { SEC.classList.add("is-over"); FTR.classList.add("ftr--over"); }
}

/* =====================================================================
   2. CLOSING
   ===================================================================== */
(function closing() {
  if (!SEC) return;
  var head = MF.$(".fx-closing__head", SEC), stage = MF.$(".fx-closing__stage", SEC), cv = MF.$("canvas[data-terrain]", SEC);
  if (head) { if (REDUCE) head.classList.add("in"); else MF.inView(head, function () { head.classList.add("in"); }, { threshold: 0.2 }); }

  /* layered parallax (dozfx .par --pz): label leads, title follows, body trails */
  var pars = MF.$$("[data-cl-k]", SEC).map(function (e) { return { el: e, k: parseFloat(e.getAttribute("data-cl-k")) || 0 }; });
  var covered = function () { return FTR && FTR.classList.contains("ftr--over") && FTR.getBoundingClientRect().top <= 0; };
  if (!REDUCE) MF.tick(function () {
    if (!MF.onScreen(SEC) || covered()) return;
    var q = MF.progress(SEC);
    for (var i = 0; i < pars.length; i++) pars[i].el.style.setProperty("--pz", (pars[i].k * (q - 0.36) * 1.5).toFixed(1) + "px");
    if (cv) cv.style.translate = "0 " + ((q - 0.4) * 28).toFixed(1) + "px";
  });

  if (!cv) return;
  MF.inView(SEC, function () {
    var draw = null;
    try { draw = terrainGL(cv); } catch (e) { console.warn(e); draw = null; }
    if (draw) SEC.classList.add("is-gl");
    else { try { draw = terrain2D(cv); } catch (e2) { console.warn(e2); draw = null; } }
    if (!draw) return;
    var cam = { xd: 0.5, yd: 0.45 }, T = REDUCE ? 3.2 : Math.random() * 20, travel = 0;
    function frame(dt) {
      var r = SEC.getBoundingClientRect();
      var ot = MF.clamp((S.vh - r.top) / (S.vh + r.height), 0, 1);
      if (!REDUCE) { T += dt; travel += dt * (1 + Math.min(6, Math.abs(S.vy) * 0.0014)); }
      var sy = 0.35 + ot * 0.3, tx, ty;
      if (FINE && !REDUCE) { tx = MF.clamp(S.mx / S.vw, 0, 1); ty = MF.clamp(S.my / S.vh, 0, 1) * 0.55 + sy * 0.45; }
      else { tx = 0.5 + Math.sin(T * 0.21) * 0.3; ty = sy; }
      var f = REDUCE ? 1 : 1 - Math.pow(0.94, dt * 60);
      cam.xd += (tx - cam.xd) * f; cam.yd += (ty - cam.yd) * f;
      draw(T, travel, ot, cam.xd, cam.yd);
    }
    frame(0.016);
    requestAnimationFrame(function () { cv.classList.add("is-live"); });
    window.addEventListener("resize", function () { if (REDUCE) frame(0); }, { passive: true });
    if (REDUCE) return;
    MF.tick(function (dt) {
      if (document.hidden || cv.__dead || !MF.onScreen(stage) || covered()) return;
      frame(dt);
    });
  }, { rootMargin: "60% 0px", threshold: 0 });
})();

/* ---------- terrain: WebGL2 ---------- */
var NOISE = [
  "vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}",
  "vec4 perm(vec4 x){return m289(((x*34.)+1.)*x);}vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}",
  "float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);",
  "vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;",
  "vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=m289(i);",
  "vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));",
  "float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);",
  "vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);",
  "vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;",
  "vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);",
  "vec4 nm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;",
  "vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;",
  "return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}"
].join("\n");

var GROUND_VS = "#version 300 es\nprecision highp float;\nin vec2 uv;\n" +
  "uniform mat4 uPV;uniform float uT,uScroll,uMaxH,uDist,uRoad,uXs;\nout float vD;out float vFog;\n" + NOISE + "\n" +
  "void main(){\n" +
  "  float ac=uv.y*12.566+uT*2.7;\n" +
  "  float bend=(sin(ac)+sin(ac*.5))*uDist;\n" +                      /* the road snakes left and right */
  "  float h=snoise(vec3(uv.x*10.,uv.y*10.+uScroll,10.))+1.;\n" +     /* ridges, flowing toward the camera */
  "  h+=.18*snoise(vec3(uv.x*31.,uv.y*31.+uScroll*3.1,4.));\n" +
  "  h=max(h,0.)*pow(abs(cos((uv.x-bend)*3.1416)),1.5+uRoad);\n" +   /* carve the valley */
  "  vD=h;\n" +
  "  vec3 p=vec3((-50.+100.*uv.x)*uXs,h*uMaxH*mix(1.,uXs,.5),20.-400.*uv.y);\n" +
  "  vFog=clamp(-(p.z-4.)/400.,0.,1.);\n" +
  "  gl_Position=uPV*vec4(p,1.);\n}";

var GROUND_FS = "#version 300 es\nprecision highp float;\n" +
  "uniform sampler2D uPal;uniform float uT;uniform vec3 uFog;\nin float vD;in float vFog;out vec4 o;\n" +
  "void main(){\n" +
  "  vec3 c=texture(uPal,vec2(vD*(sin(uT*.7)*.22+.78),.5)).rgb*(1.-vD*.8)*1.12;\n" +   /* height → neon contour bands */
  "  c=max(c,0.);\n" +
  "  c=mix(c,uFog,smoothstep(0.,1.,vFog));\n" +
  "  o=vec4(c,1.);\n}";

var SKY_VS = "#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

var SKY_FS = "#version 300 es\nprecision highp float;\n" +
  "uniform vec2 uR;uniform mat3 uCam;uniform float uTan,uSun,uT;\nout vec4 o;\n" +
  "float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n" +
  "void main(){\n" +
  "  vec2 q=(gl_FragCoord.xy*2.-uR)/uR.y;\n" +
  "  vec3 d=normalize(uCam*vec3(q*uTan,-1.));\n" +
  "  float e=d.y;\n" +
  /* dusk: a hot magenta band on the horizon, plum above, near black at the top */
  "  vec3 c=mix(vec3(.74,.15,.64),vec3(.44,.06,.4),smoothstep(0.,.05,e));\n" +
  "  c=mix(c,vec3(.19,.02,.19),smoothstep(.03,.16,e));\n" +
  "  c=mix(c,vec3(.05,.006,.055),smoothstep(.12,.36,e));\n" +
  "  c=mix(c,vec3(.01,.003,.012),smoothstep(.3,.62,e));\n" +
  "  c=mix(c,vec3(.3,.04,.28),1.-smoothstep(-.03,0.,e));\n" +
  /* the sun sitting on the horizon, white-hot core */
  "  vec3 sd=normalize(vec3(0.,uSun,-1.));float a=acos(clamp(dot(d,sd),-1.,1.));\n" +
  "  c+=vec3(1.,.1,.88)*exp(-a*a*55.)*.5+vec3(1.,.35,1.)*exp(-a*a*700.)*.55;\n" +
  "  c=mix(c,mix(vec3(1.,.2,.92),vec3(1.,.86,1.),exp(-a*a*9000.)),1.-smoothstep(.0145,.0165,a));\n" +
  /* shooting stars: one radiant, top right toward the middle of the horizon */
  "  float asp=uR.x/uR.y,hz=smoothstep(.03,.2,e);\n" +
  "  vec2 dir=normalize(vec2(-1.,-.56)),nr=vec2(-dir.y,dir.x);\n" +
  "  for(int i=0;i<3;i++){\n" +
  "    float fi=float(i),P=3.6+fi*1.7,tt=uT+fi*1.9,k=floor(tt/P),life=tt-k*P;\n" +
  "    float big=pow(hs(vec2(fi+4.,k+9.)),1.6),D=.9+big*.8;\n" +
  "    if(life>D)continue;\n" +
  "    float u=life/D,en=sin(u*3.1416);\n" +
  "    vec2 st=vec2(asp*.58,.86)+nr*(hs(vec2(k,fi))-.5)*1.25-dir*(.25+big*.3);\n" +
  "    vec2 rel=q-(st+dir*(u*u*.3+u*.8)*(1.05+big*.7));\n" +
  "    float al=dot(rel,-dir),ac=length(rel+dir*al),tl=(.28+big*1.2)*(.3+.7*en);\n" +
  "    float ahead=step(0.,al),fall=1.-smoothstep(0.,tl,al);\n" +
  "    float sg=.0018+al*.012,core=exp(-ac*ac/(sg*sg))*fall*ahead;\n" +
  "    float r2=dot(rel,rel),head=exp(-r2/(.00003+big*.00003))*1.6+exp(-r2/.0016)*.3;\n" +
  "    vec3 tc=mix(vec3(1.,.95,1.),vec3(1.,.12,.88),smoothstep(0.,.35,al/max(tl,.01)));\n" +
  "    tc=mix(tc,vec3(.55,.08,.75),smoothstep(.45,1.,al/max(tl,.01)));\n" +
  "    c+=(tc*core*1.5+mix(vec3(1.,.3,.95),vec3(1.),exp(-r2/.00004))*head)*pow(en,.7)*(.75+big*.5)*hz;\n" +
  "  }\n" +
  "  o=vec4(c,1.);\n}";

/* neon palette strip: wide dark plum bands broken by magenta lines with white-pink cores */
function paletteStrip() {
  var C = { K: [40, 2, 44], k: [52, 3, 56], D: [196, 4, 192], M: [250, 24, 236], L: [255, 194, 252] };
  var seed = 1337, out = new Uint8Array(1024 * 4), n = 0;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function run(c, w) { for (var i = 0; i < w && n < 1024; i++, n++) { out[n * 4] = c[0]; out[n * 4 + 1] = c[1]; out[n * 4 + 2] = c[2]; out[n * 4 + 3] = 255; } }
  run(C.k, 22);                                                    /* the road floor stays dark */
  while (n < 1024) {
    var bands = 2 + Math.floor(rnd() * 4);
    for (var b = 0; b < bands; b++) { run(b % 2 ? C.k : C.K, 8 + Math.floor(rnd() * 14)); run(b % 2 ? C.K : C.k, 1); }
    var r = rnd();
    if (r < 0.45) { run(C.D, 6 + Math.floor(rnd() * 6)); run(C.M, 1); run(C.L, 6 + Math.floor(rnd() * 8)); run(C.M, 1); run(C.D, 4 + Math.floor(rnd() * 6)); }
    else if (r < 0.8) { run(C.D, 1); run(C.M, 8 + Math.floor(rnd() * 8)); run(C.D, 6 + Math.floor(rnd() * 8)); }
    else { run(C.M, 1); run(C.L, 8 + Math.floor(rnd() * 10)); run(C.M, 1); }
  }
  return out;
}

function terrainGL(cv) {
  var gl = null;
  try { gl = cv.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" }); } catch (e) { gl = null; }
  if (!gl) return null;
  function shader(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  function program(vs, fs, attr) {
    var a = shader(gl.VERTEX_SHADER, vs), b = shader(gl.FRAGMENT_SHADER, fs); if (!a || !b) return null;
    var p = gl.createProgram(); gl.attachShader(p, a); gl.attachShader(p, b); gl.bindAttribLocation(p, 0, attr); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
    var U = {};
    return { p: p, u: function (n) { return n in U ? U[n] : (U[n] = gl.getUniformLocation(p, n)); } };
  }
  var ground = program(GROUND_VS, GROUND_FS, "uv"), sky = program(SKY_VS, SKY_FS, "p");
  if (!ground || !sky) return null;

  var small = S.vw < 768, NX = small ? 110 : 180, NZ = small ? 220 : 340, x, z, k = 0;
  var verts = new Float32Array((NX + 1) * (NZ + 1) * 2);
  for (z = 0; z <= NZ; z++) for (x = 0; x <= NX; x++) { verts[k++] = x / NX; verts[k++] = z / NZ; }
  var idx = new Uint16Array(NX * NZ * 6); k = 0;
  for (z = 0; z < NZ; z++) for (x = 0; x < NX; x++) {
    var a = z * (NX + 1) + x, b = a + 1, c = a + NX + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  var vaoG = gl.createVertexArray(); gl.bindVertexArray(vaoG);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  var vaoS = gl.createVertexArray(); gl.bindVertexArray(vaoS);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteStrip());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); cv.__dead = true; cv.classList.remove("is-live"); var s = cv.closest(".fx-closing"); if (s) s.classList.remove("is-gl"); });

  var W = 2, H = 2;
  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, S.vw < 768 ? 1.25 : 1);
    W = Math.max(2, Math.round(cv.clientWidth * dpr)); H = Math.max(2, Math.round(cv.clientHeight * dpr));
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
  }
  size();
  window.addEventListener("resize", size, { passive: true });

  var PV = new Float32Array(16);
  return function draw(T, travel, ot, xd, yd) {
    if (cv.__dead) return;
    var mob = S.vw < 768, w = 4.5 + yd * 5.5, tilt = mob ? 0.16 : 0.11, fov = mob ? 66 : 58;
    var tn = Math.tan(fov * Math.PI / 360), asp = W / H, Hc = Math.cos(tilt), Qs = Math.sin(tilt), f = 1 / tn, N = 0.1, F = 2000;
    var V = [1, 0, 0, 0, 0, Hc, -Qs, 0, 0, Qs, Hc, 0, 0, -(Hc * w + Qs * 4), Qs * w - Hc * 4, 1];
    var P = [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (F + N) / (N - F), -1, 0, 0, 2 * F * N / (N - F), 0];
    for (var col = 0; col < 4; col++) for (var row = 0; row < 4; row++) {
      var sum = 0; for (var i = 0; i < 4; i++) sum += P[i * 4 + row] * V[col * 4 + i];
      PV[col * 4 + row] = sum;
    }
    var xs = MF.clamp(asp / 1.6, 0.32, 1);
    gl.viewport(0, 0, W, H);
    /* sky */
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(sky.p); gl.bindVertexArray(vaoS);
    gl.uniform2f(sky.u("uR"), W, H); gl.uniform1f(sky.u("uTan"), tn); gl.uniform1f(sky.u("uT"), T);
    gl.uniform1f(sky.u("uSun"), 0.006 + ot * 0.03);
    gl.uniformMatrix3fv(sky.u("uCam"), false, new Float32Array([1, 0, 0, 0, Hc, Qs, 0, -Qs, Hc]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    /* terrain */
    gl.enable(gl.DEPTH_TEST); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(ground.p); gl.bindVertexArray(vaoG);
    gl.uniformMatrix4fv(ground.u("uPV"), false, PV);
    gl.uniform1f(ground.u("uT"), T); gl.uniform1f(ground.u("uScroll"), travel + yd * 4);
    gl.uniform1f(ground.u("uMaxH"), 10); gl.uniform1f(ground.u("uDist"), Math.sin(T) * 0.1);
    gl.uniform1f(ground.u("uRoad"), 0.6 + xd * 2.8); gl.uniform1f(ground.u("uXs"), xs);
    gl.uniform3f(ground.u("uFog"), 0.3, 0.05, 0.28);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(ground.u("uPal"), 0);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  };
}

/* ---------- terrain: Canvas2D fallback (stacked neon ridges either side of a dark road) ---------- */
function terrain2D(cv) {
  var ctx = cv.getContext("2d"); if (!ctx) return null;
  var W = 0, H = 0;
  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.max(2, Math.round(W * dpr)); cv.height = Math.max(2, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener("resize", size, { passive: true });
  var ROWS = 30;
  return function draw(T, travel, ot, xd, yd) {
    var hy = H * (0.62 - (yd - 0.45) * 0.08), g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#020103"); g.addColorStop(0.42 * hy / H, "#14021a"); g.addColorStop(hy / H - 0.02, "#7a1470");
    g.addColorStop(hy / H, "#c22aa8"); g.addColorStop(Math.min(1, hy / H + 0.02), "#3a0636"); g.addColorStop(1, "#0b010a");
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var sy = hy - ot * H * 0.06, sg = ctx.createRadialGradient(W / 2, sy, 0, W / 2, sy, H * 0.4);
    sg.addColorStop(0, "rgba(255,230,255,.95)"); sg.addColorStop(0.04, "rgba(255,90,235,.75)"); sg.addColorStop(0.3, "rgba(255,43,214,.2)"); sg.addColorStop(1, "rgba(255,43,214,0)");
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    var fr = travel * 0.6 % 1, road = 0.6 + xd * 2.8;
    for (var r = ROWS; r >= 0; r--) {
      var p = (r + 1 - fr) / ROWS; if (p <= 0) continue;
      var y0 = hy + (H - hy) * p * p, amp = (14 + 220 * p) * (0.6 + yd * 0.6), bend = Math.sin(r * 0.42 - travel * 2.4 + T * 0.3) * 0.06 * (1 - p);
      ctx.beginPath();
      for (var s = 0; s <= 64; s++) {
        var u = s / 64, cx = Math.abs(Math.cos((u - 0.5 - bend) * Math.PI + Math.PI / 2));
        var n = 0.5 + 0.3 * Math.sin(u * 13 + r * 1.7 + travel * 0.8) + 0.2 * Math.sin(u * 31 - r * 2.3);
        var y = y0 - amp * n * Math.pow(cx, 1.5 + road);
        if (s) ctx.lineTo(u * W, y); else ctx.moveTo(u * W, y);
      }
      ctx.strokeStyle = "rgba(255," + (40 + Math.round(150 * (1 - p))) + ",236," + (0.15 + 0.6 * p).toFixed(3) + ")";
      ctx.lineWidth = 0.6 + 2.4 * p;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  };
}

/* =====================================================================
   3. FOOTER HORIZON (every page)
   ===================================================================== */
(function horizon() {
  var cv = MF.$("footer.ftr canvas[data-horizon]"); if (!cv) return;
  var ftr = cv.closest("footer"), ctx = cv.getContext("2d"); if (!ctx) return;
  var W = 0, H = 0, dpr = 1, L = {}, G = {}, built = false, t0 = 0;

  function layer(w, h, fn) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    var x = c.getContext("2d"); x.scale(dpr, dpr); fn(x, w, h); return c;
  }
  function rgba(a) { return "rgba(255,43,214," + a + ")"; }

  function build() {
    var vw = S.vw, small = vw < 768;
    W = ftr.clientWidth; H = ftr.clientHeight;
    if (!W || !H) return;
    dpr = 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);

    /* geometry follows dozfx .foot__glow / __planet / __moon / __haze / __ground (vw based) */
    var gs = small ? vw * 1.4 : Math.min(vw * 0.96, 1360);
    G.glow = { s: gs, x: W + (small ? 0.4 : 0.12) * vw - gs / 2, y: -(small ? 0.5 : 0.3) * vw + gs / 2 };
    var ps = small ? vw * 1.2 : Math.min(vw * 0.78, 1100);
    G.planet = { s: ps, x: W + (small ? 0.4 : 0.18) * vw - ps / 2, y: -(small ? 0.5 : 0.34) * vw + ps / 2, pad: small ? 120 : 240 };
    var ms = small ? 48 : MF.clamp(vw * 0.07, 56, 120);
    /* with the tagline on top the moon hangs above it (dozfx); without it, it stays in the top padding clear of the columns */
    var padTop = parseFloat(getComputedStyle(ftr).paddingTop) || 96, hasClaim = !!ftr.querySelector(".fx-final");
    if (!hasClaim) ms = Math.max(32, Math.min(ms, padTop - 40)); /* fits fully inside the top padding, never on the logo */
    var my = hasClaim ? (small ? 0.09 : 0.14) * H + ms / 2 : Math.max(ms / 2 + 10, padTop * 0.5);
    G.moon = { s: ms, x: small ? W * 0.9 - ms / 2 : W * 0.08 + ms / 2, y: my, pad: 50, k: hasClaim ? 0.46 : 0.06 };
    /* the parallax drop must never carry the moon onto the tagline / logo below it */
    var claim = ftr.querySelector(".fx-final"), fr = ftr.getBoundingClientRect();
    var floorY = claim ? claim.getBoundingClientRect().top - fr.top : padTop;
    /* rest position also stays above the tagline (phones: 0.09·H landed on "rhythm.") */
    my = G.moon.y = Math.max(ms / 2 + 8, Math.min(my, floorY - ms / 2 - 14));
    G.moon.max = Math.max(0, floorY - my - ms / 2 - 14);
    G.ground = { h: H * (small ? 0.4 : 0.48), cell: small ? 60 : 72 };
    G.haze = { y: H * (small ? 0.4 : 0.3), h: H * (small ? 0.4 : 0.48) };

    L.glow = layer(gs, gs, function (x, w) {
      var g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, "rgba(255,0,255,.22)"); g.addColorStop(0.6, "rgba(255,0,255,.08)"); g.addColorStop(1, "rgba(255,0,255,0)");
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });

    var pp = G.planet.pad, pw = ps + pp * 2;
    L.planet = layer(pw, pw, function (x) {
      var c = pw / 2, R = ps / 2;
      /* atmosphere: soft magenta bloom around the disc */
      var o = x.createRadialGradient(c, c, R * 0.9, c, c, R + pp);
      o.addColorStop(0, rgba(0.34)); o.addColorStop(0.18, rgba(0.16)); o.addColorStop(0.5, rgba(0.05)); o.addColorStop(1, rgba(0));
      x.fillStyle = o; x.fillRect(0, 0, pw, pw);
      /* the disc: lit low-left, falling to near black */
      x.save(); x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2); x.clip();
      x.fillStyle = "#050407"; x.fillRect(0, 0, pw, pw);
      var lx = c - ps * 0.12, ly = c + ps * 0.12, fr = ps * 0.877, b = x.createRadialGradient(lx, ly, 0, lx, ly, fr);
      b.addColorStop(0, "rgba(255,0,255,.2)"); b.addColorStop(0.46, "rgba(52,0,52,.7)"); b.addColorStop(0.68, "rgba(8,0,10,.95)"); b.addColorStop(0.7, "#050407"); b.addColorStop(1, "#050407");
      x.fillStyle = b; x.fillRect(0, 0, pw, pw);
      /* inner rim light, strongest on the lower left */
      var rim = x.createRadialGradient(c, c, R * 0.86, c, c, R);
      rim.addColorStop(0, rgba(0)); rim.addColorStop(1, rgba(0.32));
      x.globalCompositeOperation = "lighter";
      x.fillStyle = rim; x.fillRect(0, 0, pw, pw);
      x.restore();
      /* hairline rim + a glowing lit arc */
      x.lineWidth = 1; x.strokeStyle = "rgba(255,120,255,.3)";
      x.beginPath(); x.arc(c, c, R - 0.5, 0, Math.PI * 2); x.stroke();
      x.save(); x.shadowColor = "rgba(255,43,214,.9)"; x.shadowBlur = 28; x.lineCap = "round";
      var ag = x.createLinearGradient(c - R, c + R, c + R * 0.2, c - R * 0.2);
      ag.addColorStop(0, "rgba(255,150,245,.85)"); ag.addColorStop(0.55, "rgba(255,60,225,.45)"); ag.addColorStop(1, "rgba(255,43,214,0)");
      x.strokeStyle = ag; x.lineWidth = 2;
      x.beginPath(); x.arc(c, c, R - 1, Math.PI * 0.32, Math.PI * 1.22); x.stroke();
      x.restore();
    });

    var mp = G.moon.pad, mw = ms + mp * 2;
    L.moon = layer(mw, mw, function (x) {
      var c = mw / 2, R = ms / 2;
      var gl = x.createRadialGradient(c, c, R * 0.6, c, c, R + mp);
      gl.addColorStop(0, rgba(0.35)); gl.addColorStop(0.4, rgba(0.1)); gl.addColorStop(1, rgba(0));
      x.fillStyle = gl; x.fillRect(0, 0, mw, mw);
      x.save(); x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2); x.clip();
      var g = x.createRadialGradient(c - R + ms * 0.7, c - R + ms * 0.32, 0, c - R + ms * 0.7, c - R + ms * 0.32, ms * 0.95);
      g.addColorStop(0, "rgba(255,220,255,.95)"); g.addColorStop(0.18, "rgba(255,80,255,.8)"); g.addColorStop(0.46, "rgba(120,0,130,.9)"); g.addColorStop(0.72, "#120016"); g.addColorStop(1, "#08000a");
      x.fillStyle = g; x.fillRect(0, 0, mw, mw);
      var sh = x.createRadialGradient(c - R * 0.35, c + R * 0.45, R * 0.2, c - R * 0.35, c + R * 0.45, R * 1.3);
      sh.addColorStop(0, "rgba(0,0,0,.45)"); sh.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = sh; x.fillRect(0, 0, mw, mw);
      x.restore();
    });

    var sh2 = H * 1.2;
    L.stars = layer(W, sh2, function (x, w, h) {
      var seed = 97, n = Math.round(w * h / 9000);
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      for (var i = 0; i < n; i++) {
        var sx = rnd() * w, sy = rnd() * h, r = rnd() < 0.15 ? 0.75 : 0.5, fade = MF.clamp((0.8 - (sy - h * 0.2) / H) / 0.25, 0, 1);
        if (fade <= 0) continue;
        x.globalAlpha = (0.4 + rnd() * 0.6) * fade;
        x.fillStyle = rnd() < 0.2 ? "#ffc8ff" : "#fff";
        x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill();
      }
    });

    var hz = G.haze, hw = W * 1.4;
    L.haze = layer(hw, hz.h, function (x, w, h) {
      x.save(); x.translate(w / 2, h / 2); x.scale(w * 0.46, h * 0.5);
      var g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, "rgba(255,0,255,.18)"); g.addColorStop(0.48, "rgba(255,0,255,.06)"); g.addColorStop(0.74, "rgba(255,0,255,0)"); g.addColorStop(1, "rgba(255,0,255,0)");
      x.fillStyle = g; x.fillRect(-2, -2, 4, 4); x.restore();
    });
    built = true;
  }

  /* perspective floor: a plane hinged at the ground line and tipped 72° toward the viewer (dozfx .foot__floor) */
  function floor(off) {
    var g = G.ground, y0 = H - g.h, cx = W / 2, per = 700, ang = 72 * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    var span = g.h * 2.6;
    function proj(Y) { var s = per / Math.max(1, per - Y * sa); return { y: y0 + Y * ca * s, s: s }; }
    var m0 = proj(0).y, m1 = proj(span * 0.14).y, m2 = proj(span * 0.4).y;
    var grad = ctx.createLinearGradient(0, m0, 0, Math.max(m2, m1 + 1));
    grad.addColorStop(0, rgba(0)); grad.addColorStop(MF.clamp((m1 - m0) / Math.max(1, m2 - m0), 0.01, 0.99), rgba(0.36)); grad.addColorStop(1, rgba(0.6));
    ctx.strokeStyle = grad;
    /* rows drift one cell toward the viewer every 6 s */
    var Ymax = 0; while (Ymax < span && proj(Ymax).y < H + 4) Ymax += 4;
    for (var Y = off % g.cell; Y <= Ymax; Y += g.cell) {
      var p = proj(Y); if (p.y > H + 2) break;
      ctx.lineWidth = Math.min(3, 2 * ca * p.s + 0.4);
      ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(W, p.y); ctx.stroke();
    }
    var bot = proj(Ymax), half = W * 1.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var X = g.cell / 2; X <= half; X += g.cell) {
      ctx.moveTo(cx + X, y0); ctx.lineTo(cx + X * bot.s, bot.y);
      ctx.moveTo(cx - X, y0); ctx.lineTo(cx - X * bot.s, bot.y);
    }
    ctx.stroke();
    /* the horizon itself: a thin hot line with a soft violet bloom */
    var hb = ctx.createLinearGradient(0, y0 - 26, 0, y0 + 26);
    hb.addColorStop(0, "rgba(138,61,255,0)"); hb.addColorStop(0.5, "rgba(200,70,255,.16)"); hb.addColorStop(1, "rgba(138,61,255,0)");
    ctx.fillStyle = hb; ctx.fillRect(0, y0 - 26, W, 52);
    var hl = ctx.createLinearGradient(0, 0, W, 0);
    hl.addColorStop(0, rgba(0)); hl.addColorStop(0.5, "rgba(255,120,240,.55)"); hl.addColorStop(1, rgba(0));
    ctx.fillStyle = hl; ctx.fillRect(0, y0 - 0.5, W, 1);
  }

  function draw(t) {
    if (!built) return;
    var r = ftr.getBoundingClientRect(), vh = S.vh, vw = S.vw;
    var fk = REDUCE ? 0 : MF.clamp(r.top / vh, -1, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#050407"; ctx.fillRect(0, 0, W, H);
    /* stars */
    ctx.globalAlpha = 0.55; ctx.drawImage(L.stars, 0, -H * 0.2 + fk * 0.08 * vh, W, H * 1.2);
    /* glow: breathes over 6 s */
    var br = REDUCE ? 0.5 : 0.5 - 0.5 * Math.cos(t * Math.PI / 3), gs = G.glow.s * (0.97 + 0.07 * br);
    ctx.globalAlpha = 0.6 + 0.4 * br;
    ctx.drawImage(L.glow, G.glow.x - gs / 2, G.glow.y - gs / 2 + fk * 0.22 * vh, gs, gs);
    /* planet: sinks as the footer rises into view, then settles */
    var ps = (G.planet.s + G.planet.pad * 2) * (1 + fk * 0.06);
    ctx.globalAlpha = 1;
    ctx.drawImage(L.planet, G.planet.x - ps / 2, G.planet.y - ps / 2 + fk * 0.26 * vh, ps, ps);
    /* moon */
    var mw = G.moon.s + G.moon.pad * 2;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(L.moon, G.moon.x - mw / 2 - fk * 0.04 * vw, G.moon.y - mw / 2 + Math.min(fk * G.moon.k * vh, G.moon.max), mw, mw);
    /* haze + floor */
    ctx.globalAlpha = 1;
    ctx.drawImage(L.haze, -W * 0.2, G.haze.y, W * 1.4, G.haze.h);
    ctx.globalAlpha = 0.42 / 0.6;
    floor(REDUCE ? 0 : (t / 6) % 1 * G.ground.cell);
    ctx.globalAlpha = 1;
  }

  var pending = false;
  function rebuild() {
    if (pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; build(); draw(t0); });
  }
  build(); draw(0);
  requestAnimationFrame(function () { cv.classList.add("is-live"); });
  if ("ResizeObserver" in window) new ResizeObserver(rebuild).observe(ftr);
  else window.addEventListener("resize", rebuild, { passive: true });

  /* the giant wordmark rises the last few px as the footer settles */
  var big = MF.$(".ftr-big", ftr);
  if (REDUCE) return;
  MF.tick(function (dt) {
    if (document.hidden || !MF.onScreen(ftr, 40)) return;
    t0 += dt; draw(t0);
    if (big) { var p = MF.progress(big); big.style.setProperty("--fbig", ((1 - MF.clamp(p * 2.2, 0, 1)) * 40).toFixed(1) + "px"); }
  });
})();

}catch(e){console.error('fx/95-closing.js', e)}})();
