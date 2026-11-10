// WebGL2 renderer for the hydrogen tutorial: starfield, the system sphere's wall, charges drawn as
// the glow of their electric field, electron clouds (ray-marched wavefunctions, as in the prototype),
// point glows for flashes, and a line pass for photons, field lines, trails and the aim cone.

export const MAX_CHARGES = 32, MAX_CLOUDS = 12, MAX_GLOWS = 48;

const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float; precision highp int;
out vec4 outColor;
uniform vec4 uViewport; uniform vec3 uCamPos; uniform mat4 uInvVP; uniform float uTime;
uniform float uSphereR; uniform int uSteps;
uniform vec4 uQ[${MAX_CHARGES}]; uniform float uQs[${MAX_CHARGES}]; uniform int uQN; uniform float uFieldGain;
uniform int uNA; uniform vec3 uAP[${MAX_CLOUDS}]; uniform float uAR[${MAX_CLOUDS}]; uniform float uAS;
uniform ivec3 uQA[${MAX_CLOUDS}]; uniform int uModeA[${MAX_CLOUDS}]; uniform float uNormA[${MAX_CLOUDS}]; uniform vec2 uCA[${MAX_CLOUDS}];
uniform ivec3 uQB[${MAX_CLOUDS}]; uniform int uModeB[${MAX_CLOUDS}]; uniform float uNormB[${MAX_CLOUDS}]; uniform vec2 uCB[${MAX_CLOUDS}];
uniform float uInvMax[${MAX_CLOUDS}]; uniform float uIso[${MAX_CLOUDS}]; uniform float uFade[${MAX_CLOUDS}]; uniform float uWob[${MAX_CLOUDS}];
uniform vec4 uG[${MAX_GLOWS}]; uniform vec3 uGC[${MAX_GLOWS}]; uniform int uGN;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float laguerre(int k, float a, float x){
  if (k == 0) return 1.0;
  float L0 = 1.0, L1 = 1.0 + a - x;
  for (int i = 1; i < k; i++) { float fi = float(i); float L2 = ((2.0*fi + 1.0 + a - x)*L1 - (fi + a)*L0) / (fi + 1.0); L0 = L1; L1 = L2; }
  return L1;
}
float legendre(int l, int m, float x){
  float pmm = 1.0, s = sqrt(max(0.0, 1.0 - x*x)), f = 1.0;
  for (int i = 0; i < m; i++) { pmm *= -f*s; f += 2.0; }
  if (l == m) return pmm;
  float pm1 = x*float(2*m + 1)*pmm;
  if (l == m + 1) return pm1;
  float pll = 0.0;
  for (int ll = m + 2; ll <= l; ll++) { pll = (x*float(2*ll - 1)*pm1 - float(ll + m - 1)*pmm) / float(ll - m); pmm = pm1; pm1 = pll; }
  return pll;
}
float radialShape(int n, int l, float r){
  float rho = 2.0*r/float(n);
  return pow(rho, float(l)) * exp(-0.5*rho) * laguerre(n - l - 1, float(2*l + 1), rho);
}
vec2 psi(ivec3 q, int mode, float norm, vec3 p){
  float r = length(p) + 1e-5; int am = abs(q.z);
  float A = norm * radialShape(q.x, q.y, r) * legendre(q.y, am, p.y / r);
  float phi = atan(p.z, p.x);
  if (mode == 0) return A * vec2(cos(float(q.z)*phi), sin(float(q.z)*phi));
  if (mode == 1) return vec2(A * cos(float(am)*phi), 0.0);
  return vec2(A * sin(float(am)*phi), 0.0);
}
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
// Wave phase: +real cyan, −real magenta, ±imaginary violet / amber (prototype convention).
vec3 phaseColor(vec2 w){
  vec2 u = w / max(length(w), 1e-30); float ca = u.x, sa = u.y;
  vec3 c = vec3(0.01,0.91,0.96)*max(ca,0.0) + vec3(0.94,0.18,0.37)*max(-ca,0.0)
         + vec3(0.58,0.42,1.0)*max(sa,0.0) + vec3(1.0,0.72,0.25)*max(-sa,0.0);
  return c / (abs(ca) + abs(sa));
}
// Soap-bubble wobble: the cloud's surface breathes in a few slow shape modes (quadrupole and
// octupole ripples, like a bubble's). An artistic hint that the shape can change; the real change
// happens during a step down, when two shapes mix (uCB below).
float wobble(int i, vec3 p){
  float r = length(p); if (r < 1e-4) return 1.0;
  vec3 n = p / r; float t = uTime + float(i) * 1.7;
  float w = n.x*n.y * sin(2.3*t) + 0.5*(3.0*n.z*n.z - 1.0) * sin(1.7*t + 1.0)
          + n.x*n.z * sin(2.9*t + 2.0) + (n.x*n.x - n.y*n.y) * sin(2.1*t + 4.0)
          + 0.6 * n.x*n.y*n.z * 4.0 * sin(3.7*t + 0.5);
  return 1.0 + uWob[i] * w;
}
vec4 sampleCloud(int i, vec3 pw){
  vec3 p = (pw - uAP[i]) * uAS;
  p /= wobble(i, p);
  vec2 w = cmul(uCA[i], psi(uQA[i], uModeA[i], uNormA[i], p));
  if (dot(uCB[i], uCB[i]) > 0.0) w += cmul(uCB[i], psi(uQB[i], uModeB[i], uNormB[i], p));
  return vec4(phaseColor(w), dot(w, w));
}
void marchCloud(int i, vec3 ro, vec3 rd, float t0, float t1, inout vec3 acc, inout float T){
  float dt = (t1 - t0) / float(uSteps);
  float t = t0 + dt * hash(gl_FragCoord.xy + fract(uTime) * 61.0 + float(i) * 7.3);
  float k = dt / uAR[i];
  for (int s = 0; s < 256; s++) {
    if (s >= uSteps) break;
    vec4 c = sampleCloud(i, ro + rd*t);
    float dn = clamp(c.a * uInvMax[i], 0.0, 1.0);
    float e = pow(dn, 0.5) * uFade[i];
    if (uIso[i] > 0.0) { float x = log(max(dn, 1e-9) / uIso[i]) / 0.28; e += 1.4 * exp(-x*x) * uFade[i]; }
    acc += T * c.rgb * e * 1.3 * k;
    T *= exp(-e * 1.6 * k);
    t += dt;
  }
}
float pointGlow(vec3 ro, vec3 rd, vec3 c, float s){
  vec3 v = c - ro; float t = max(dot(v, rd), 0.0); vec3 d = v - rd*t;
  return s*s / (dot(d, d) + s*s);
}
vec3 stars(vec3 d){
  vec2 sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 70.0;
  vec2 cell = floor(sp); float h = hash(cell);
  if (h < 0.982) return vec3(0.0);
  vec2 o = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.6 + 0.2;
  float s = smoothstep(0.12, 0.0, length(fract(sp) - o));
  return vec3(0.55, 0.65, 0.8) * s * (h - 0.982) * 40.0;
}
void main(){
  vec2 ndc = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw * 2.0 - 1.0;
  vec4 far = uInvVP * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize(far.xyz / far.w - uCamPos);
  vec3 ro = uCamPos;
  vec3 col = vec3(0.0015, 0.0025, 0.006) + stars(rd) * 0.8;

  // The sealed system sphere: a faint latitude/longitude grid where the view ray leaves it.
  float b = dot(ro, rd), c = dot(ro, ro) - uSphereR*uSphereR, h = b*b - c;
  if (h > 0.0) {
    float tw = -b + sqrt(h);
    if (tw > 0.0) {
      vec3 P = (ro + rd*tw) / uSphereR;
      float lat = asin(clamp(P.y, -1.0, 1.0)) * 12.0 / 3.14159, lon = atan(P.z, P.x) * 24.0 / 6.28318;
      vec2 g = abs(fract(vec2(lat, lon)) - 0.5); vec2 fw = fwidth(vec2(lat, lon));
      float line = max(smoothstep(fw.x * 1.5, 0.0, 0.5 - g.x), smoothstep(fw.y * 1.5, 0.0, 0.5 - g.y) * sqrt(max(0.0, 1.0 - P.y*P.y)));
      float rim = pow(1.0 - abs(dot(P, rd)), 3.0);
      col += vec3(0.02, 0.55, 0.6) * (0.05 * line + 0.05 * rim);
    }
  }

  // Charges as the glow of their electric field: each adds q / (distance to the view ray), so
  // charges of one sign add up. Positive and negative glows are mapped separately (log scale, capped);
  // a neutral atom's cancelling field is shown by the proton's glow fading as its electron settles.
  float Sp = 0.0, Sn = 0.0;
  for (int i = 0; i < ${MAX_CHARGES}; i++) {
    if (i >= uQN) break;
    vec3 v = uQ[i].xyz - ro; float t = dot(v, rd);
    vec3 d = t > 0.0 ? v - rd*t : v;
    float s = uQs[i], f = uQ[i].w / sqrt(dot(d, d) + s*s);
    if (f > 0.0) Sp += f; else Sn -= f;
  }
  float L = log(1.0 + 40.0 * uFieldGain);
  float fp = clamp(log(1.0 + Sp * uFieldGain) / L, 0.0, 1.0), fn = clamp(log(1.0 + Sn * uFieldGain) / L, 0.0, 1.0);
  // A steep curve keeps the bright part of each glow well inside a 1s atom (about 0.1 nm).
  col += vec3(1.0, 0.62, 0.18) * 1.1 * pow(fp, 5.0) + vec3(0.3, 0.5, 1.0) * 1.3 * pow(fn, 5.0);

  // Electron clouds (small and far apart, so their order doesn't matter much).
  float T = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_CLOUDS}; i++) {
    if (i >= uNA) break;
    vec3 oc = ro - uAP[i]; float bb = dot(oc, rd), cc = dot(oc, oc) - uAR[i]*uAR[i], hh = bb*bb - cc;
    if (hh > 0.0) { hh = sqrt(hh); float t0 = max(-bb - hh, 0.0), t1 = -bb + hh; if (t1 > t0) marchCloud(i, ro, rd, t0, t1, acc, T); }
  }
  col = col * T + acc;

  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (i >= uGN) break;
    col += uGC[i] * pointGlow(ro, rd, uG[i].xyz, uG[i].w);
  }
  col = 1.0 - exp(-col * 1.15);
  outColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}`;

const LINE_VERT = `#version 300 es
in vec3 aP; in vec4 aC; out vec4 vC;
uniform mat4 uVP;
void main(){ gl_Position = uVP * vec4(aP, 1.0); vC = aC; }`;

// A textured panel floating in the world (the VR heads-up display).
const PANEL_VERT = `#version 300 es
in vec2 aPos; out vec2 vUV; uniform mat4 uVP; uniform vec3 uO, uX, uY;
void main(){ vUV = vec2(aPos.x, 1.0 - aPos.y); gl_Position = uVP * vec4(uO + uX * aPos.x + uY * aPos.y, 1.0); }`;
const PANEL_FRAG = `#version 300 es
precision mediump float; in vec2 vUV; out vec4 o; uniform sampler2D uTex;
void main(){ o = texture(uTex, vUV); }`;
const LINE_FRAG = `#version 300 es
precision mediump float; in vec4 vC; out vec4 o; void main(){ o = vec4(vC.rgb * vC.a, 1.0); }`;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance', xrCompatible: true });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const link = (vs, fs, attrs) => {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  const prog = link(VERT, FRAG, ['aPos']);
  const U = {};
  for (const n of ['uViewport', 'uCamPos', 'uInvVP', 'uTime', 'uSphereR', 'uSteps', 'uQ', 'uQs', 'uQN', 'uFieldGain',
    'uNA', 'uAP', 'uAR', 'uAS', 'uQA', 'uModeA', 'uNormA', 'uCA', 'uQB', 'uModeB', 'uNormB', 'uCB', 'uInvMax', 'uIso', 'uFade', 'uWob',
    'uG', 'uGC', 'uGN']) U[n] = gl.getUniformLocation(prog, n);
  const quadVao = gl.createVertexArray(); gl.bindVertexArray(quadVao);
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const lineProg = link(LINE_VERT, LINE_FRAG, ['aP', 'aC']);
  const LU = {};
  LU.uVP = gl.getUniformLocation(lineProg, 'uVP');
  const lineVao = gl.createVertexArray(); gl.bindVertexArray(lineVao);
  const lineBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);

  const panelProg = link(PANEL_VERT, PANEL_FRAG, ['aPos']);
  const PU = {};
  for (const n of ['uVP', 'uO', 'uX', 'uY', 'uTex']) PU[n] = gl.getUniformLocation(panelProg, n);
  const panelVao = gl.createVertexArray(); gl.bindVertexArray(panelVao);
  const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const panelTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, panelTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let panelVersion = -1;

  const qArr = new Float32Array(MAX_CHARGES * 4), qsArr = new Float32Array(MAX_CHARGES);
  const gArr = new Float32Array(MAX_GLOWS * 4), gcArr = new Float32Array(MAX_GLOWS * 3);
  const cl = {
    ap: new Float32Array(MAX_CLOUDS * 3), ar: new Float32Array(MAX_CLOUDS),
    qa: new Int32Array(MAX_CLOUDS * 3), ma: new Int32Array(MAX_CLOUDS), na: new Float32Array(MAX_CLOUDS), ca: new Float32Array(MAX_CLOUDS * 2),
    qb: new Int32Array(MAX_CLOUDS * 3), mb: new Int32Array(MAX_CLOUDS), nb: new Float32Array(MAX_CLOUDS), cb: new Float32Array(MAX_CLOUDS * 2),
    inv: new Float32Array(MAX_CLOUDS), iso: new Float32Array(MAX_CLOUDS), fade: new Float32Array(MAX_CLOUDS), wob: new Float32Array(MAX_CLOUDS),
  };

  // scene: { views:[{viewport:[x,y,w,h], camPos, VP, invVP}], time, sphereR, steps, bohrPerUnit,
  //          charges:[{pos,q,smear}], clouds:[...], glows:[{pos,size,col}], lines:Float32Array,
  //          panel?: { canvas, version, o, x, y } }  (panel: a world-space quad, used in VR)
  function draw(scene) {
    gl.useProgram(prog);
    gl.uniform1f(U.uTime, scene.time);
    gl.uniform1f(U.uSphereR, scene.sphereR); gl.uniform1i(U.uSteps, scene.steps);
    const nq = Math.min(MAX_CHARGES, scene.charges.length);
    qArr.fill(0); qsArr.fill(0);
    for (let i = 0; i < nq; i++) { const c = scene.charges[i]; qArr.set([...c.pos, c.q], i * 4); qsArr[i] = c.smear; }
    gl.uniform4fv(U.uQ, qArr); gl.uniform1fv(U.uQs, qsArr); gl.uniform1i(U.uQN, nq); gl.uniform1f(U.uFieldGain, 6.0);

    const na = Math.min(MAX_CLOUDS, scene.clouds.length);
    for (let i = 0; i < na; i++) {
      const c = scene.clouds[i];
      cl.ap.set(c.pos, i * 3); cl.ar[i] = c.radius;
      cl.qa.set([c.A.n, c.A.l, c.A.m], i * 3); cl.ma[i] = c.A.mode; cl.na[i] = c.A.norm; cl.ca.set(c.cA, i * 2);
      cl.qb.set([c.B.n, c.B.l, c.B.m], i * 3); cl.mb[i] = c.B.mode; cl.nb[i] = c.B.norm; cl.cb.set(c.cB, i * 2);
      cl.inv[i] = c.invMax; cl.iso[i] = c.iso; cl.fade[i] = c.fade; cl.wob[i] = c.wobble || 0;
    }
    gl.uniform1i(U.uNA, na); gl.uniform1f(U.uAS, scene.bohrPerUnit);
    gl.uniform3fv(U.uAP, cl.ap); gl.uniform1fv(U.uAR, cl.ar);
    gl.uniform3iv(U.uQA, cl.qa); gl.uniform1iv(U.uModeA, cl.ma); gl.uniform1fv(U.uNormA, cl.na); gl.uniform2fv(U.uCA, cl.ca);
    gl.uniform3iv(U.uQB, cl.qb); gl.uniform1iv(U.uModeB, cl.mb); gl.uniform1fv(U.uNormB, cl.nb); gl.uniform2fv(U.uCB, cl.cb);
    gl.uniform1fv(U.uInvMax, cl.inv); gl.uniform1fv(U.uIso, cl.iso); gl.uniform1fv(U.uFade, cl.fade); gl.uniform1fv(U.uWob, cl.wob);

    const ng = Math.min(MAX_GLOWS, scene.glows.length);
    gArr.fill(0); gcArr.fill(0);
    for (let i = 0; i < ng; i++) { const g = scene.glows[i]; gArr.set([...g.pos, g.size], i * 4); gcArr.set(g.col, i * 3); }
    gl.uniform4fv(U.uG, gArr); gl.uniform3fv(U.uGC, gcArr); gl.uniform1i(U.uGN, ng);


    if (scene.lines && scene.lines.length) {
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, scene.lines, gl.DYNAMIC_DRAW);
    }
    if (scene.panel && scene.panel.version !== panelVersion) {
      gl.bindTexture(gl.TEXTURE_2D, panelTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene.panel.canvas);
      panelVersion = scene.panel.version;
    }
    for (const v of scene.views) {
      const [x, y, w, h] = v.viewport;
      gl.viewport(x, y, w, h);
      gl.useProgram(prog);
      gl.uniform4f(U.uViewport, x, y, w, h);
      gl.uniform3f(U.uCamPos, ...v.camPos);
      gl.uniformMatrix4fv(U.uInvVP, false, v.invVP);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (scene.lines && scene.lines.length) {
        gl.useProgram(lineProg);
        gl.uniformMatrix4fv(LU.uVP, false, v.VP);
        gl.bindVertexArray(lineVao);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.LINES, 0, scene.lines.length / 7);
        gl.disable(gl.BLEND);
      }
      if (scene.panel) {
        gl.useProgram(panelProg);
        gl.uniformMatrix4fv(PU.uVP, false, v.VP);
        gl.uniform3f(PU.uO, ...scene.panel.o); gl.uniform3f(PU.uX, ...scene.panel.x); gl.uniform3f(PU.uY, ...scene.panel.y);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, panelTex); gl.uniform1i(PU.uTex, 0);
        gl.bindVertexArray(panelVao);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disable(gl.BLEND);
      }
    }
  }
  return { gl, draw };
}

// Line builder: pairs of points with colour and alpha (the GPU clips them at the near plane).
export class Lines {
  constructor() { this.a = []; }
  begin() { this.a.length = 0; }
  seg(p, q, col, alpha = 1) {
    this.a.push(p[0], p[1], p[2], col[0], col[1], col[2], alpha, q[0], q[1], q[2], col[0], col[1], col[2], alpha);
  }
  data() { return new Float32Array(this.a); }
}
