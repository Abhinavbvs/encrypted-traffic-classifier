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
