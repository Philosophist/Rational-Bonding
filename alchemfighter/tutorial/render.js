// WebGL2 renderer for the hydrogen tutorial: starfield, the system sphere's wall, charges drawn as
// the glow of their electric field, electron clouds (ray-marched wavefunctions, as in the prototype),
// point glows for flashes, and a line pass for photons, field lines, trails and the aim cone.

export const MAX_CHARGES = 32, MAX_CLOUDS = 20, MAX_GLOWS = 48;
// Samples in a bent free wave's table (see sampleCoul).
export const COUL_N = 512;
// Orbitals one cloud can be a blend of, and the points in a free electron's radial table.
export const MAX_TERMS = 10, FREE_N = 128;
// Clouds are drawn at this fraction of the picture's width and height (see createRenderer).
export const CLOUD_SCALE = 0.4;
const ROW = 6 + 2 * MAX_TERMS;

const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

// PASS 0: everything in one go. PASS 1: the clouds alone, drawn into a smaller picture (output:
// light added, light let through). PASS 2: everything else at full size, with that picture laid in.
const FRAG = pass => `#version 300 es
#define PASS ${pass}
precision highp float; precision highp int;
out vec4 outColor;
uniform vec4 uViewport; uniform vec3 uCamPos; uniform mat4 uInvVP; uniform float uTime;
uniform float uSphereR; uniform int uSteps;
uniform vec4 uQ[${MAX_CHARGES}]; uniform float uQs[${MAX_CHARGES}]; uniform int uQN; uniform float uFieldGain;
// Clouds: one row of uCloud per cloud (see packCloud), plus a radial table row in uFree for a free
// electron's wave. Each cloud is a sum of up to MAX_TERMS orbitals in the cloud's own frame.
uniform int uNA; uniform float uAS; uniform highp sampler2D uCloud; uniform highp sampler2D uFree;
// Computed waves (the well bubbles): each term's own radial table, one row per (cloud, term).
uniform highp sampler2D uTerm;
uniform highp sampler2D uCloudPic; uniform vec2 uFull; uniform highp sampler2D uCoul;
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
// A free electron's partial wave: its radial part comes from a table (√r spacing out to rmax).
vec2 psiFree(int i, ivec3 q, int mode, float norm, float rmax, vec3 p){
  float r = length(p) + 1e-5;
  if (r >= rmax) return vec2(0.0);
  float x = sqrt(r / rmax) * ${FREE_N - 1}.0; int j = int(x); float f = x - float(j);
  float R = mix(texelFetch(uFree, ivec2(j, i), 0).r, texelFetch(uFree, ivec2(min(j + 1, ${FREE_N - 1}), i), 0).r, f);
  int am = abs(q.z);
  float A = norm * R * legendre(q.y, am, p.y / r), phi = atan(p.z, p.x);
  if (mode == 0) return A * vec2(cos(float(q.z)*phi), sin(float(q.z)*phi));
  if (mode == 1) return vec2(A * cos(float(am)*phi), 0.0);
  return vec2(A * sin(float(am)*phi), 0.0);
}
// A term whose radial part was computed on the well's grid (√r spacing out to rmax).
vec2 psiTab(int i, int t, ivec3 q, int mode, float norm, float rmax, vec3 p){
  float r = length(p) + 1e-5;
  if (r >= rmax) return vec2(0.0);
  float x = sqrt(r / rmax) * ${FREE_N - 1}.0; int j = int(x); float f = x - float(j); int row = i * ${MAX_TERMS} + t;
  float R = mix(texelFetch(uTerm, ivec2(j, row), 0).r, texelFetch(uTerm, ivec2(min(j + 1, ${FREE_N - 1}), row), 0).r, f);
  int am = abs(q.z);
  float A = norm * R * legendre(q.y, am, p.y / r), phi = atan(p.z, p.x);
  if (mode == 0) return vec2(A, 0.0);
  if (mode == 1) return vec2(A * cos(float(am)*phi), 0.0);
  return vec2(A * sin(float(am)*phi), 0.0);
}
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
// Wave phase (Steve, 2026-11-18): +real cyan, −real a magenta-leaning purple; the quarter turns
// between them pale lavender (+imaginary) and amber (−imaginary). None of these is a charge colour
// (+ neon pink, − neon blue), so a lobe's colour never reads as its charge.
vec3 phaseColor(vec2 w){
  vec2 u = w / max(length(w), 1e-30); float ca = u.x, sa = u.y;
  vec3 c = vec3(0.01,0.91,0.96)*max(ca,0.0) + vec3(0.72,0.22,1.0)*max(-ca,0.0)
         + vec3(0.86,0.84,1.0)*max(sa,0.0) + vec3(1.0,0.72,0.25)*max(-sa,0.0);
  return c / max(abs(ca) + abs(sa), 1e-6);   // (a wave that is exactly zero has no colour, not a broken one)
}
// One cloud's terms, read once per pixel.
struct Cloud { vec3 pos; float radius; mat3 frame; float invMax, iso, fade; vec4 lean; int nt; float rmax; float trmax; int steps; vec4 pk; vec4 clip; vec4 side;
  ivec3 q[${MAX_TERMS}]; int mode[${MAX_TERMS}]; float norm[${MAX_TERMS}]; vec2 c[${MAX_TERMS}]; int g[${MAX_TERMS}]; };
vec4 tx(int i, int k){ return texelFetch(uCloud, ivec2(k, i), 0); }
Cloud loadCloud(int i){
  Cloud C;
  vec4 a = tx(i, 0), x = tx(i, 1), y = tx(i, 2), z = tx(i, 3), m = tx(i, 5);
  C.pos = a.xyz; C.radius = a.w; C.frame = mat3(x.xyz, y.xyz, z.xyz); C.invMax = x.w; C.iso = y.w; C.fade = z.w;
  C.lean = tx(i, 4); C.nt = int(m.x); C.rmax = m.y; C.trmax = m.z; C.steps = m.w > 0.5 ? min(int(m.w), uSteps) : uSteps;
  if (C.lean.w > 1.5) { C.pk = tx(i, 6); C.clip = tx(i, 7); C.side = tx(i, 8); return C; }   // a free packet (see sampleCloud)
  for (int t = 0; t < ${MAX_TERMS}; t++) {
    if (t >= C.nt) break;
    vec4 qq = tx(i, 6 + t), cc = tx(i, 6 + ${MAX_TERMS} + t);
    C.q[t] = ivec3(int(qq.x), int(qq.y), int(qq.z)); C.norm[t] = qq.w; C.c[t] = cc.xy; C.g[t] = int(cc.z); C.mode[t] = int(cc.w);
  }
  return C;
}
// How nearby charges' electric field bends a 1s cloud (game.js works it out from the same field that
// moves the atom). To first order the exact 1s wave in a field F becomes ψ·(1 − (F·r)(1 + r/2))
// (Dalgarno and Lewis), which gives hydrogen's real polarizability, 4.5 a₀³: the electron leans
// toward a proton and away from an electron. Excited clouds need no factor: the field mixes their
// shell's orbitals, and game.js sends that mixture as the terms.
// A free particle's wave packet (lean.w = 2): a Gaussian round its middle, rmax wide across its
// motion (density e^(−ρ²/rmax²)... amplitude e^(−ρ²/2rmax²)) and trmax long along it (amplitude
// e^(−s²/4trmax²)), with crests k radians per nm apart along its motion (pk.x), shifted by pk.y.
vec4 samplePacket(Cloud C, vec3 pw){
  vec3 pr = pw - C.pos; float s = dot(pr, C.lean.xyz), r2 = max(dot(pr, pr) - s*s, 0.0);
  float a = exp(-r2 / (2.0 * C.rmax * C.rmax) - s*s / (4.0 * C.trmax * C.trmax)), ph = C.pk.x * s - C.pk.y;
  // A free electron's packet is drawn only within a window round its point (clip: [point, radius]).
  if (C.pk.w > 0.0) a *= 1.0 - smoothstep(0.6 * C.pk.w, C.pk.w, length(pw - C.clip.xyz));
  return vec4(phaseColor(vec2(cos(ph), sin(ph))), a * a);
}
// A free electron's wave where a proton bends it (lean.w = 3): the exact Coulomb wave
// ψ = √C·F(ξ)·e^{ikz} (its table in uCoul), kept to a beam as wide as the gun's spot round the flow
// line the electron rides (its incoming offset b0): each point's own flow line came in at
// b² = η·g(ξ) (see matterwave.js coulombTable), and the beam's envelope is in that offset.
// pk: [k (rad/nm), z0 (nm, the point along u), stepLen, window radius]; clip: [b0, ξ range (a₀)];
// side: [proton]. Drawn only within the window round the point (C.pos).
vec4 sampleCoul(int i, Cloud C, vec3 pw){
  float wd = length(pw - C.pos);
  if (wd > C.pk.w) return vec4(0.0);
  vec3 p = pw - C.side.xyz, u = C.lean.xyz; float R = length(p), z = dot(p, u);
  float xi = (R - z) * uAS, eta = (R + z) * uAS, x = clamp(xi / C.clip.w, 0.0, 1.0) * ${COUL_N - 1}.0;
  int j = min(int(x), ${COUL_N - 2}); float f = x - float(j);
  vec4 T = mix(texelFetch(uCoul, ivec2(j, i), 0), texelFetch(uCoul, ivec2(j + 1, i), 0), f);
  vec3 perp = p - z * u; float pl = length(perp);
  vec3 b = pl > 1e-6 ? perp * (sqrt(max(0.0, eta * T.z)) / uAS / pl) : vec3(0.0);
  vec3 db = b - C.clip.xyz;
  float env = exp(-dot(db, db) / (2.0 * C.rmax * C.rmax) - (z - C.pk.y) * (z - C.pk.y) / (4.0 * C.trmax * C.trmax)) * (1.0 - smoothstep(0.6 * C.pk.w, C.pk.w, wd));
  float ph = C.pk.x * z;
  vec2 w = cmul(T.xy, vec2(cos(ph), sin(ph))) * env;
  return vec4(phaseColor(w), dot(w, w));
}
vec4 sampleCloud(int i, Cloud C, vec3 pw){
  if (C.lean.w > 2.5) return sampleCoul(i, C, pw);
  if (C.lean.w > 1.5) return samplePacket(C, pw);
  vec3 pr = (pw - C.pos) * uAS;
  float f = C.lean.w > 0.5 && C.lean.w < 1.5 ? clamp(1.0 - dot(C.lean.xyz, pr) * (1.0 + 0.5 * length(pr)), 0.0, 2.0) : 1.0;
  vec3 p = pr * C.frame;   // into the cloud's own frame (its y is the axis m is counted about)
  vec2 w0 = vec2(0.0), w1 = vec2(0.0);
  for (int t = 0; t < ${MAX_TERMS}; t++) {
    if (t >= C.nt) break;
    vec2 s = C.q[t].x == 0 ? psiFree(i, C.q[t], C.mode[t], C.norm[t], C.rmax, p) : C.q[t].x < 0 ? psiTab(i, t, C.q[t], C.mode[t], C.norm[t], C.trmax, p) : psi(C.q[t], C.mode[t], C.norm[t], p);
    s = cmul(C.c[t], s) * f;
    if (C.g[t] == 0) w0 += s; else w1 += s;
  }
  // Group 1 is a second, separate possibility (an atom sharing an excitation with others): its
  // density adds to group 0's. One electron on its own is always a single wave (group 0 only).
  float d0 = dot(w0, w0), d1 = dot(w1, w1);
  if (d1 <= 0.0) return vec4(phaseColor(w0), d0);
  return vec4((phaseColor(w0) * d0 + phaseColor(w1) * d1) / max(d0 + d1, 1e-30), d0 + d1);
}
void marchCloud(int i, Cloud C, vec3 ro, vec3 rd, float t0, float t1, int ns, inout vec3 acc, inout float T){
  float dt = (t1 - t0) / float(ns);
  // interleaved gradient noise: a fine, even dither (far less blotchy grain than a plain hash)
  vec2 fc = gl_FragCoord.xy + vec2(5.588238, 5.588238) * floor(fract(uTime * 7.0) * 64.0) + float(i) * 17.0;
  float t = t0 + dt * fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));
  float k = dt / C.radius;
  for (int s = 0; s < 256; s++) {
    if (s >= ns || T < 0.004) break;   // (past T < 0.004 nothing behind can show)
    vec4 c = sampleCloud(i, C, ro + rd*t);
    float dn = c.a * C.invMax; dn = dn >= 0.0 ? min(dn, 1.0) : 0.0;   // (NaN counts as empty)
    if (!(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0)) c.rgb = vec3(0.0);
    float e = pow(dn, 0.5) * C.fade;
    if (C.iso > 0.0) { float x = log(max(dn, 1e-9) / C.iso) / 0.28; e += 1.4 * exp(-x*x) * C.fade; }
    acc += T * c.rgb * e * 1.0 * k;
    T *= exp(-e * 0.9 * k);   // (see-through: Steve, 2026-11-19)
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
vec4 clouds(vec3 ro, vec3 rd){
  float T = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_CLOUDS}; i++) {
    if (i >= uNA) break;
    vec4 a = tx(i, 0), ln = tx(i, 4);
    vec3 oc = ro - a.xyz;
    if (ln.w > 2.5) {
      // A bent wave: the window round its point (pk.w), sampled finely enough for the beam.
      vec4 pk = tx(i, 6);
      float bb = dot(oc, rd), cc = dot(oc, oc) - pk.w*pk.w, hh = bb*bb - cc;
      if (hh > 0.0) { hh = sqrt(hh); float t0 = max(-bb - hh, 0.0), t1 = -bb + hh;
        if (t1 > t0) { Cloud C = loadCloud(i); marchCloud(i, C, ro, rd, t0, t1, clamp(int(ceil((t1 - t0) / pk.z)), 4, C.steps), acc, T); } }
      continue;
    }
    if (ln.w > 1.5) {
      // A packet: its bounds are an ellipsoid, 3 widths across and 4 lengths along, so a long thin
      // packet costs only the rays that actually pass through it, spaced to resolve its crests.
      vec4 m = tx(i, 5), pk = tx(i, 6); vec3 u = ln.xyz;
      float A = 3.0 * m.y, B = 4.0 * m.z, ou = dot(oc, u), du = dot(rd, u);
      vec3 op = oc - ou * u, dp = rd - du * u;
      float qa = dot(dp, dp) / (A*A) + du*du / (B*B), qb = dot(op, dp) / (A*A) + ou*du / (B*B), qc = dot(op, op) / (A*A) + ou*ou / (B*B) - 1.0, hh = qb*qb - qa*qc;
      if (hh > 0.0) { hh = sqrt(hh); float t0 = max((-qb - hh) / qa, 0.0), t1 = (-qb + hh) / qa;
        if (pk.w > 0.0) {   // and within its window
          vec3 ow = ro - tx(i, 7).xyz; float wb = dot(ow, rd), wh = wb*wb - dot(ow, ow) + pk.w*pk.w;
          if (wh <= 0.0) t1 = t0; else { wh = sqrt(wh); t0 = max(t0, -wb - wh); t1 = min(t1, -wb + wh); }
        }
        if (t1 > t0) { Cloud C = loadCloud(i); marchCloud(i, C, ro, rd, t0, t1, clamp(int(ceil((t1 - t0) / pk.z)), 4, C.steps), acc, T); } }
      continue;
    }
    float bb = dot(oc, rd), cc = dot(oc, oc) - a.w*a.w, hh = bb*bb - cc;
    // Samples go where the ray runs through the cloud's ball: a ray that only grazes its edge gets few,
    // one through the middle gets them all, at the same spacing (no samples spent on empty space).
    if (hh > 0.0) { hh = sqrt(hh); float t0 = max(-bb - hh, 0.0), t1 = -bb + hh;
      if (t1 > t0) { Cloud C = loadCloud(i); marchCloud(i, C, ro, rd, t0, t1, clamp(int(ceil(float(C.steps) * (t1 - t0) / (2.0 * C.radius))), 4, C.steps), acc, T); } }
  }
  return vec4(acc, T);
}
void main(){
  vec2 ndc = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw * 2.0 - 1.0;
  vec4 far = uInvVP * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize(far.xyz / far.w - uCamPos);
  vec3 ro = uCamPos;
#if PASS == 1
  outColor = clouds(ro, rd); return;
#endif
  vec3 col = vec3(0.0015, 0.0025, 0.006) + stars(rd) * 0.8;

  // The sealed system sphere: only a faint latitude/longitude grid where the view ray leaves it.
  // The wall itself is clear (no tint or rim glow), so space shows through it unchanged.
  float b = dot(ro, rd), c = dot(ro, ro) - uSphereR*uSphereR, h = b*b - c;
  if (h > 0.0) {
    float tw = -b + sqrt(h);
    if (tw > 0.0) {
      vec3 P = (ro + rd*tw) / uSphereR;
      float lat = asin(clamp(P.y, -1.0, 1.0)) * 12.0 / 3.14159, lon = atan(P.z, P.x) * 24.0 / 6.28318;
      vec2 g = abs(fract(vec2(lat, lon)) - 0.5); vec2 fw = fwidth(vec2(lat, lon));
      float line = max(smoothstep(fw.x * 1.5, 0.0, 0.5 - g.x), smoothstep(fw.y * 1.5, 0.0, 0.5 - g.y) * sqrt(max(0.0, 1.0 - P.y*P.y)));
      col += vec3(0.02, 0.55, 0.6) * 0.05 * line;
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
  col += vec3(1.0, 0.17, 0.82) * 1.1 * pow(fp, 5.0) + vec3(0.1, 0.45, 1.0) * 1.3 * pow(fn, 5.0);   // + neon pink, − neon blue

  // Electron clouds (small and far apart, so their order doesn't matter much).
#if PASS == 2
  vec4 cl = texture(uCloudPic, gl_FragCoord.xy / uFull);
  // (a broken number in the cloud picture must never black out the whole view)
  if (!(cl.a >= 0.0 && cl.a <= 1.0)) cl.a = 1.0;
  if (!(cl.r >= 0.0 && cl.r < 1e4)) cl.r = 0.0; if (!(cl.g >= 0.0 && cl.g < 1e4)) cl.g = 0.0; if (!(cl.b >= 0.0 && cl.b < 1e4)) cl.b = 0.0;
#else
  vec4 cl = clouds(ro, rd);
#endif
  col = col * cl.a + cl.rgb;

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
  // The clouds are the heaviest thing to draw, and they are soft, so they are drawn into a smaller
  // picture (CLOUD_SCALE of the width and height) that is then laid under the sharp lines, labels and
  // stars. That needs a float picture (EXT_color_buffer_float); without it everything is drawn at once.
  const progOf = pass => {
    const p = link(VERT, FRAG(pass), ['aPos']), U = { p };
    for (const n of ['uViewport', 'uCamPos', 'uInvVP', 'uTime', 'uSphereR', 'uSteps', 'uQ', 'uQs', 'uQN', 'uFieldGain',
      'uNA', 'uAS', 'uCloud', 'uFree', 'uTerm', 'uCloudPic', 'uFull', 'uCoul',
      'uG', 'uGC', 'uGN']) U[n] = gl.getUniformLocation(p, n);
    return U;
  };
  let split = !!gl.getExtension('EXT_color_buffer_float');
  let P0 = split ? null : progOf(0);
  const P1 = split ? progOf(1) : null, P2 = split ? progOf(2) : null;
  let cloudFbo = null, cloudPic = null, picW = 0, picH = 0;
  const info = {};
  function cloudTarget(w, h) {
    if (cloudFbo && w === picW && h === picH) return;
    if (!cloudFbo) { cloudFbo = gl.createFramebuffer(); cloudPic = gl.createTexture(); }
    gl.bindTexture(gl.TEXTURE_2D, cloudPic);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cloudFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cloudPic, 0);
    picW = w; picH = h;
    // Some phones list float pictures but can't draw into this one: then draw everything at once.
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { split = false; if (!P0) P0 = progOf(0); info.noSplit = true; }
  }
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
  // Float textures for the clouds: one row each.
  const tex = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const cloudTex = tex(), freeTex = tex(), termTex = tex(), coulTex = tex();
  const coulArr = new Float32Array(MAX_CLOUDS * COUL_N * 4);
  const cloudArr = new Float32Array(MAX_CLOUDS * ROW * 4), freeArr = new Float32Array(MAX_CLOUDS * FREE_N), termArr = new Float32Array(MAX_CLOUDS * MAX_TERMS * FREE_N);
  gl.bindTexture(gl.TEXTURE_2D, cloudTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ROW, MAX_CLOUDS, 0, gl.RGBA, gl.FLOAT, cloudArr);
  gl.bindTexture(gl.TEXTURE_2D, freeTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, FREE_N, MAX_CLOUDS, 0, gl.RED, gl.FLOAT, freeArr);
  gl.bindTexture(gl.TEXTURE_2D, termTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, FREE_N, MAX_CLOUDS * MAX_TERMS, 0, gl.RED, gl.FLOAT, termArr);
  gl.bindTexture(gl.TEXTURE_2D, coulTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, COUL_N, MAX_CLOUDS, 0, gl.RGBA, gl.FLOAT, coulArr);
  // One cloud: { pos, radius (nm), frame: [x, y, z] unit vectors (y = the axis m is counted about),
  //   terms: [{ n (0 = free wave, −1 = own table), l, m, mode, norm, c: [re, im], g, table? }],
//   free?: { table, rmax (a₀) }, trmax? (a₀, the reach of the terms' own tables),
  //   invMax, iso, fade, lean?: [x, y, z, on], steps? (march steps for this cloud; 0 = the scene's) }
  function packCloud(i, c) {
    const o = i * ROW * 4, put = (k, v) => cloudArr.set(v, o + k * 4);
    if (c.packet) {   // { axis (unit), width, length (nm), k (rad/nm), phase, stepLen (nm), win?: { pos, R } (drawn only within R of pos) }
      const P = c.packet;
      put(0, [...c.pos, 3 * P.width]); put(1, [1, 0, 0, c.invMax]); put(2, [0, 1, 0, c.iso]); put(3, [0, 0, 1, c.fade]);
      put(4, [...P.axis, 2]); put(5, [0, P.width, P.length, c.steps || 0]); put(6, [P.k, P.phase, P.stepLen, P.win ? P.win.R : 0]);
      if (P.win) put(7, [...P.win.pos, P.win.R]);
      return;
    }
    if (c.coul) {   // { axis u, width, length, k (rad/nm), z0, stepLen, R (window round c.pos, the point), b0, xiMax (a₀), table, proton (pos) }
      const K = c.coul;
      put(0, [...c.pos, K.R]); put(1, [1, 0, 0, c.invMax]); put(2, [0, 1, 0, c.iso]); put(3, [0, 0, 1, c.fade]);
      put(4, [...K.axis, 3]); put(5, [0, K.width, K.length, c.steps || 0]); put(6, [K.k, K.z0, K.stepLen, K.R]); put(7, [...K.b0, K.xiMax]); put(8, [...K.proton, 0]);
      coulArr.set(K.table.subarray(0, COUL_N * 4), i * COUL_N * 4);
      return;
    }
    const [X, Y, Z] = c.frame || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const nt = Math.min(MAX_TERMS, c.terms.length);
    put(0, [...c.pos, c.radius]); put(1, [...X, c.invMax]); put(2, [...Y, c.iso]); put(3, [...Z, c.fade]);
    put(4, c.lean || [0, 0, 0, 0]); put(5, [nt, c.free ? c.free.rmax : 0, c.trmax || 0, c.steps || 0]);
    for (let t = 0; t < nt; t++) {
      const T = c.terms[t];
      put(6 + t, [T.n, T.l, T.m, T.norm]); put(6 + MAX_TERMS + t, [T.c[0], T.c[1], T.g || 0, T.mode]);
      if (T.table) termArr.set(T.table.subarray(0, FREE_N), (i * MAX_TERMS + t) * FREE_N);
    }
    if (c.free) freeArr.set(c.free.table.subarray(0, FREE_N), i * FREE_N);
  }

  // scene: { views:[{viewport:[x,y,w,h], camPos, VP, invVP}], time, sphereR, steps, bohrPerUnit,
  //          charges:[{pos,q,smear}], clouds:[...], glows:[{pos,size,col}], lines:Float32Array,
  //          panel?: { canvas, version, o, x, y } }  (panel: a world-space quad, used in VR)
  function draw(scene) {
    const nq = Math.min(MAX_CHARGES, scene.charges.length);
    qArr.fill(0); qsArr.fill(0);
    for (let i = 0; i < nq; i++) { const c = scene.charges[i]; qArr.set([...c.pos, c.q], i * 4); qsArr[i] = c.smear; }
    const na = Math.min(MAX_CLOUDS, scene.clouds.length);
    for (let i = 0; i < na; i++) packCloud(i, scene.clouds[i]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ROW, MAX_CLOUDS, gl.RGBA, gl.FLOAT, cloudArr);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, freeTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FREE_N, MAX_CLOUDS, gl.RED, gl.FLOAT, freeArr);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, termTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FREE_N, MAX_CLOUDS * MAX_TERMS, gl.RED, gl.FLOAT, termArr);
    if (scene.clouds.some(c => c.coul)) { gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, coulTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COUL_N, MAX_CLOUDS, gl.RGBA, gl.FLOAT, coulArr); }
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, coulTex);
    gl.activeTexture(gl.TEXTURE0);
    const ng = Math.min(MAX_GLOWS, scene.glows.length);
    gArr.fill(0); gcArr.fill(0);
    for (let i = 0; i < ng; i++) { const g = scene.glows[i]; gArr.set([...g.pos, g.size], i * 4); gcArr.set(g.col, i * 3); }
    const shared = U => {
      gl.useProgram(U.p);
      gl.uniform1f(U.uTime, scene.time);
      gl.uniform1f(U.uSphereR, scene.sphereR); gl.uniform1i(U.uSteps, scene.steps);
      gl.uniform4fv(U.uQ, qArr); gl.uniform1fv(U.uQs, qsArr); gl.uniform1i(U.uQN, nq); gl.uniform1f(U.uFieldGain, 2.0);   // glow brightens inside about 0.3 nm, the capture range
      gl.uniform1i(U.uNA, na); gl.uniform1f(U.uAS, scene.bohrPerUnit);
      gl.uniform1i(U.uCloud, 1); gl.uniform1i(U.uFree, 2); gl.uniform1i(U.uTerm, 3); gl.uniform1i(U.uCloudPic, 4); gl.uniform1i(U.uCoul, 5);
      gl.uniform4fv(U.uG, gArr); gl.uniform3fv(U.uGC, gcArr); gl.uniform1i(U.uGN, ng);
    };
    const view = (U, v, k) => {
      const [x, y, w, h] = v.viewport;
      gl.uniform4f(U.uViewport, x * k, y * k, w * k, h * k);
      gl.uniform3f(U.uCamPos, ...v.camPos);
      gl.uniformMatrix4fv(U.uInvVP, false, v.invVP);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    // Full size of the picture being drawn (the canvas, or the headset's two eyes side by side).
    let fullW = 1, fullH = 1;
    for (const v of scene.views) { fullW = Math.max(fullW, v.viewport[0] + v.viewport[2]); fullH = Math.max(fullH, v.viewport[1] + v.viewport[3]); }
    const k = Math.min(1, scene.cloudScale || CLOUD_SCALE);
    const target = split ? gl.getParameter(gl.FRAMEBUFFER_BINDING) : null;
    if (split) {
      cloudTarget(Math.max(1, Math.round(fullW * k)), Math.max(1, Math.round(fullH * k)));
      gl.bindFramebuffer(gl.FRAMEBUFFER, split ? cloudFbo : target);
    }
    if (split) {
      gl.viewport(0, 0, picW, picH);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      shared(P1);
      for (const v of scene.views) { const [x, y, w, h] = v.viewport; gl.viewport(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)); view(P1, v, k); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, cloudPic); gl.activeTexture(gl.TEXTURE0);
    }
    const M = split ? P2 : P0;
    shared(M);
    if (split) gl.uniform2f(M.uFull, fullW, fullH);

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
      gl.useProgram(M.p);
      view(M, v, 1);
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
  return { gl, draw, info };
}

// Line builder: pairs of points with colour and alpha (the GPU clips them at the near plane).
export class Lines {
  constructor() { this.a = []; this.chunks = []; }
  begin() { this.a.length = 0; this.chunks.length = 0; }
  seg(p, q, col, alpha = 1) {
    this.a.push(p[0], p[1], p[2], col[0], col[1], col[2], alpha, q[0], q[1], q[2], col[0], col[1], col[2], alpha);
  }
  // Segments worked out earlier and kept as one block (see lightLines in game.js).
  chunk(f32) { this.chunks.push(f32); }
  data() {
    if (!this.chunks.length) return new Float32Array(this.a);
    const out = new Float32Array(this.a.length + this.chunks.reduce((n, c) => n + c.length, 0));
    out.set(this.a);
    let o = this.a.length;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}
