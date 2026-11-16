// A 3D view of an electron cloud that is the same all the way round one axis (the line the
// electron came in along). WebGL2, no libraries. The cloud is drawn as glowing gas: a pixel's
// brightness is the amount of electron along that line of sight (column density), inside a
// sphere around the proton whose radius is the zoom. Nothing is scaled up or added; the colour
// scale is either linear (true proportions) or logarithmic (each colour step ×10), and the page
// labels which. Lines (field lines, current arrows) are drawn on top, in the same 3D space.

const VS = `#version 300 es
in vec2 p; out vec2 v; void main(){ v = p; gl_Position = vec4(p, 0., 1.); }`;
const FS = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D t0, t1, t2, lut;
uniform vec3 halves, nxs;      // half-size (a.u.) and columns of each grid, largest first; 0 = unused
uniform mat4 invVP; uniform vec3 eye;
uniform float R, white, logMode, slice;
float logn(sampler2D t, float h, float nx, float rho, float y){
  // column 0 of the texture is a mirrored copy of the first column, so the axis is interpolated
  vec2 uv = vec2((rho / h * nx + 1.) / (nx + 1.), (h - y) / (2. * h));
  return texture(t, uv).r;
}
float dens(vec3 p){
  float rho = length(p.xz), y = p.y, m = max(rho, abs(y));
  float l = -99.;
  if (halves.z > 0. && m < halves.z * 0.985) l = logn(t2, halves.z, nxs.z, rho, y);
  else if (halves.y > 0. && m < halves.y * 0.985) l = logn(t1, halves.y, nxs.y, rho, y);
  else if (halves.x > 0. && m < halves.x) l = logn(t0, halves.x, nxs.x, rho, y);
  return l < -60. ? 0. : pow(10., l);
}
void main(){
  vec4 a = invVP * vec4(v, -1., 1.), b = invVP * vec4(v, 1., 1.);
  vec3 ro = eye, rd = normalize(b.xyz / b.w - a.xyz / a.w);
  float val = 0.;
  if (slice > 0.5) {
    // the flat cut through the axis that faces the camera (the plane z = 0)
    if (abs(rd.z) > 1e-6) { float t = -ro.z / rd.z; vec3 q = ro + rd * t; if (t > 0. && length(q) < R) val = dens(q) / white; else { o = vec4(0,0,0,1); return; } }
  } else {
    float bb = dot(ro, rd), c = dot(ro, ro) - R * R, disc = bb * bb - c;
    if (disc <= 0.) { o = vec4(0,0,0,1); return; }
    float s = sqrt(disc), t0_ = max(0., -bb - s), t1_ = -bb + s;
    const int N = 220; float dt = (t1_ - t0_) / float(N), col = 0.;
    for (int i = 0; i < N; i++) col += dens(ro + rd * (t0_ + (float(i) + 0.5) * dt)) * dt;
    val = col / white;
  }
  float x = logMode > 0.5 ? (val > 0. ? (log(val) / log(10.) + 10.) / 10. : 0.) : val;
  o = vec4(texture(lut, vec2(clamp(x, 0., 1.), 0.5)).rgb, 1.);
}`;
const LVS = `#version 300 es
in vec3 p; in vec4 c; uniform mat4 VP; out vec4 vc; out vec3 wp;
void main(){ vc = c; wp = p; gl_Position = VP * vec4(p, 1.); gl_PointSize = 6.; }`;
const LFS = `#version 300 es
precision highp float; in vec4 vc; in vec3 wp; uniform float R; out vec4 o;
void main(){ if (length(wp) > R * 1.001) discard; o = vc; }`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
function invert(m) {
  const inv = new Float32Array(16), a = m;
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}

export class Viewer {
  constructor(canvas, lutRGB, { onChange } = {}) {
    this.canvas = canvas; this.onChange = onChange;
    const gl = this.gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error('This browser has no WebGL2, which the 3D view needs.');
    this.prog = compile(gl, VS, FS); this.lprog = compile(gl, LVS, LFS);
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tex = [0, 1, 2].map(() => this.makeTex(1, 1, new Float32Array([-99])));
    this.halves = [0, 0, 0]; this.nxs = [1, 1, 1];
    const lut = new Uint8Array(256 * 4); for (let i = 0; i < 256; i++) { lut[4 * i] = lutRGB[3 * i]; lut[4 * i + 1] = lutRGB[3 * i + 1]; lut[4 * i + 2] = lutRGB[3 * i + 2]; lut[4 * i + 3] = 255; }
    this.lut = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    this.lineBuf = gl.createBuffer(); this.lines = new Float32Array(0); this.points = new Float32Array(0);
    this.yaw = 0.6; this.pitch = 0.25; this.R = 320; this.white = 1; this.logMode = false; this.slice = false;
    this.minR = 1; this.maxR = 320;
    this.bindInput();
  }
  makeTex(w, h, data) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  // grids: [{ half, nx, nz, log10: Float32Array }] largest first (up to 3)
  setGrids(grids) {
    const gl = this.gl;
    for (let i = 0; i < 3; i++) {
      const g = grids[i];
      if (!g) { this.halves[i] = 0; continue; }
      // the texture holds x ≥ 0 only; column 0 sits at x = half/(2nx), so pad one mirrored column at x = 0
      const w = g.nx + 1, d = new Float32Array(w * g.nz);
      for (let z = 0; z < g.nz; z++) { d[z * w] = g.log10[z * g.nx]; for (let x = 0; x < g.nx; x++) d[z * w + x + 1] = g.log10[z * g.nx + x]; }
      gl.deleteTexture(this.tex[i]); this.tex[i] = this.makeTex(w, g.nz, d);
      this.halves[i] = g.half; this.nxs[i] = g.nx;
    }
  }
  setLines(segments, colors) { this.lines = segments; this.lineColors = colors; }
  matrices() {
    const c = this.canvas, asp = c.width / c.height, fov = 0.7, dist = this.R / Math.sin(fov / 2) * 1.02;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const eye = [dist * cp * sy, dist * sp, dist * cp * cy];
    // look-at the origin, up = +y
    const f = eye.map(v => -v / dist), up = [0, 1, 0];
    const s = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]], sl = Math.hypot(...s); s.forEach((v, i) => { s[i] = v / sl; });
    const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    const V = new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0,
      -(s[0] * eye[0] + s[1] * eye[1] + s[2] * eye[2]), -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]), f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2], 1]);
    const n = Math.max(1e-3, dist - this.R * 1.2), fa = dist + this.R * 1.2, t = 1 / Math.tan(fov / 2);
    const P = new Float32Array([t, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]);
    if (asp >= 1) { P[0] = t / asp; P[5] = t; } else { P[0] = t; P[5] = t * asp; }
    const VP = mul(P, V);
    return { VP, inv: invert(VP), eye };
  }
  draw() {
    const gl = this.gl, c = this.canvas;
    const w = Math.round(c.clientWidth * devicePixelRatio), h = Math.round(c.clientHeight * devicePixelRatio);
    if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
    gl.viewport(0, 0, c.width, c.height);
    const { VP, inv, eye } = this.matrices();
    gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    const P = this.prog, U = n => gl.getUniformLocation(P, n);
    for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, this.tex[i]); gl.uniform1i(U('t' + i), i); }
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.lut); gl.uniform1i(U('lut'), 3);
    gl.uniform3f(U('halves'), ...this.halves); gl.uniform3f(U('nxs'), ...this.nxs);
    gl.uniformMatrix4fv(U('invVP'), false, inv); gl.uniform3f(U('eye'), ...eye);
    gl.uniform1f(U('R'), this.R); gl.uniform1f(U('white'), this.white); gl.uniform1f(U('logMode'), this.logMode ? 1 : 0); gl.uniform1f(U('slice'), this.slice ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const loc = gl.getAttribLocation(P, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(loc);
    // lines on top
    if (this.lines.length) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.lprog);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lprog, 'VP'), false, VP);
      gl.uniform1f(gl.getUniformLocation(this.lprog, 'R'), this.R);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf); gl.bufferData(gl.ARRAY_BUFFER, this.lines, gl.DYNAMIC_DRAW);
      const lp = gl.getAttribLocation(this.lprog, 'p'), lc = gl.getAttribLocation(this.lprog, 'c');
      gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 28, 12);
      gl.drawArrays(gl.LINES, 0, this.lines.length / 7);
      gl.disableVertexAttribArray(lp); gl.disableVertexAttribArray(lc);
    }
  }
  bindInput() {
    const c = this.canvas, pts = new Map();
    let lastPinch = 0;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); });
    c.addEventListener('pointerup', e => { pts.delete(e.pointerId); lastPinch = 0; });
    c.addEventListener('pointercancel', e => { pts.delete(e.pointerId); lastPinch = 0; });
    c.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const [x0, y0] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) {
        this.yaw -= (e.clientX - x0) * 0.008;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + (e.clientY - y0) * 0.008));
        this.changed();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (lastPinch) this.zoomTo(this.R * lastPinch / d);
        lastPinch = d;
      }
    });
    c.addEventListener('wheel', e => { e.preventDefault(); this.zoomTo(this.R * Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  }
  zoomTo(R) { this.R = Math.max(this.minR, Math.min(this.maxR, R)); this.changed(); }
  changed() { if (this.onChange) this.onChange(this); }
}
