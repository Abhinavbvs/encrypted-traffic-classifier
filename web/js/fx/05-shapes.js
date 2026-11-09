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
