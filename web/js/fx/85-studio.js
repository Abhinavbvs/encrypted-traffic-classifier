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
