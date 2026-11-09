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
