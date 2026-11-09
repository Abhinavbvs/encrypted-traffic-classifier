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
