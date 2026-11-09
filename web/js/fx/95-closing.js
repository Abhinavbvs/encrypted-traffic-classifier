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
