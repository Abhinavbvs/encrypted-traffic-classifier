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
