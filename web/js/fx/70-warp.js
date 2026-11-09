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
