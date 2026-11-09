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
