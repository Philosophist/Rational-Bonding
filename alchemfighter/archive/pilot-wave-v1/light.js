// Light as Maxwell's equations give it, for one atom giving off one photon, plus the photon's
// particle in the pilot-wave view. Pure maths, no DOM, so it can be tested (light.test.mjs).
//
// The field. An atom changing level swings its charge like a tiny antenna: an oscillating dipole
// p(t). Maxwell's equations have an exact answer for the field of such a dipole, everywhere, close
// in and far out (Jackson §9.2, Griffiths §11.1), with every part felt where it is only after light
// has had time to get there (the "retarded" time t − R/c):
//   E = [3n(n·p) − p]/R³ + [3n(n·ṗ) − ṗ]/(cR²) + [n(n·p̈) − p̈]/(c²R)
//   B = [ṗ × n]/(cR²) + [p̈ × n]/(c²R)
// (Gaussian units, n the direction from the atom, p and its rates of change at the retarded time.)
// The first term is the near field, a dipole's static-looking field that swells and shrinks; the
// last is the radiation that carries the photon's energy away. Which one dominates depends on
// distance compared with λ/2π. Hydrogen's light (97 to 1,875 nm here) is longer than the whole
// 80 nm system, so most of what is inside it is near field: drawn at its real wavelength, the
// field mostly breathes in and out, and ripples only start to peel off for the shortest (Lyman)
// light near the far wall. Nothing here is shrunk to make ripples show.
//
// The swing's size (its envelope) is the one from quantum electrodynamics for a single atom
// (Wigner–Weisskopf): it starts the moment the atom is in the upper level and fades as
// exp(−t/2τ), τ the level's lifetime. When the photon is found somewhere (by the wall or an atom)
// the swing stops, and the rest of the field already on its way keeps going out at c.
//
// Units: nm, fs; c in nm/fs; p in arbitrary units (only shapes and ratios are drawn).
export const C = 299.792458;   // nm/fs

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const perpBasis = a => { const e1 = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); return [e1, cross(a, e1)]; };

// One emission. pattern 'lin': the charge swings along `axis` (Δm = 0). 'circ': it turns in a circle
// about `axis` (Δm = ±1), which is two swings at right angles, a quarter cycle apart.
// t0: when the swing starts (fs); tau: the envelope's lifetime (fs); tEnd: when it stops (fs).
// gain and phase: the swing's size and where in its cycle it is, for an atom that holds only a
// share of an excitation (a group sharing one; these are set from its amplitude as it changes).
export function makeEmission({ src, lam, pattern = 'lin', axis = [0, 1, 0], t0 = 0, tau = Infinity, tEnd = Infinity, gain = 1, phase = 0 }) {
  const k = 2 * Math.PI / lam, w = k * C;
  const [e1, e2] = perpBasis(axis);
  return { src: [...src], lam, k, w, pattern, axis: norm(axis), e1, e2, t0, tau, tEnd, gain, phase };
}
// Envelope of the swing at time t (0 before it starts and after it stops).
export function envelope(em, t) {
  if (t < em.t0 || t > em.tEnd) return 0;
  return em.gain * (em.tau === Infinity ? 1 : Math.exp(-(t - em.t0) / (2 * em.tau)));
}
// The swing and its first two rates of change at time t, as [cos-like, sin-like] parts:
// z = A·e^{(iω−γ)(t−t0)+iφ} with γ = 1/2τ, so ż = (iω−γ)·z and z̈ = (iω−γ)²·z, exactly.
function swing(em, t) {
  const A = envelope(em, t);
  if (!A) return null;
  const ph = em.w * (t - em.t0) + em.phase, zr = A * Math.cos(ph), zi = A * Math.sin(ph);
  const g = em.tau === Infinity ? 0 : 1 / (2 * em.tau), w = em.w;
  const dr = -g * zr - w * zi, di = -g * zi + w * zr;
  return { zr, zi, dr, di, ddr: -g * dr - w * di, ddi: -g * di + w * dr };
}
// p, ṗ, p̈ at time t.
export function dipole(em, t) {
  const z = swing(em, t);
  if (!z) return { p: [0, 0, 0], pd: [0, 0, 0], pdd: [0, 0, 0] };
  if (em.pattern === 'circ') {
    const mk = (r, i) => [0, 1, 2].map(k => em.e1[k] * r + em.e2[k] * i);
    return { p: mk(z.zr, z.zi), pd: mk(z.dr, z.di), pdd: mk(z.ddr, z.ddi) };
  }
  const a = em.axis;
  return { p: a.map(x => x * z.zr), pd: a.map(x => x * z.dr), pdd: a.map(x => x * z.ddr) };
}
// The exact E and B at point x and time t.
export function field(em, x, t) {
  const d = [x[0] - em.src[0], x[1] - em.src[1], x[2] - em.src[2]], R = Math.hypot(d[0], d[1], d[2]);
  if (R < 1e-6) return { E: [0, 0, 0], B: [0, 0, 0], R };
  const n = [d[0] / R, d[1] / R, d[2] / R], { p, pd, pdd } = dipole(em, t - R / C);
  const np = dot(n, p), npd = dot(n, pd), npdd = dot(n, pdd), R2 = R * R, R3 = R2 * R;
  const E = [0, 1, 2].map(i => (3 * n[i] * np - p[i]) / R3 + (3 * n[i] * npd - pd[i]) / (C * R2) + (n[i] * npdd - pdd[i]) / (C * C * R));
  const b1 = cross(pd, n), b2 = cross(pdd, n);
  const B = [0, 1, 2].map(i => b1[i] / (C * R2) + b2[i] / (C * C * R));
  return { E, B, R };
}
// For a straight swing the field lines lie in planes through the swing's axis, and they are exactly
// the contour lines of one function (the Hertz stream function):
//   Ψ = sin²θ · [p(t_r)/R + ṗ(t_r)/c]      with t_r = t − R/c
// so E_R = ∂Ψ/∂θ / (R² sinθ) and E_θ = −∂Ψ/∂R / (R sinθ). Equal steps in Ψ carry equal amounts of
// field between neighbouring lines, so where lines crowd the field is strong.
export function psiLin(em, R, cosT, t) {
  const z = swing(em, t - R / C);
  return z ? (1 - cosT * cosT) * (z.zr / R + z.dr / C) : 0;
}

// Contour lines of f(R, θ) on a grid that is even in log R and in θ (fine close to the atom,
// coarse far out), by marching squares. Returns segments [R1, θ1, R2, θ2] for each level.
export function contours(f, levels, { rMin = 0.3, rMax = 80, nR = 72, nT = 48 } = {}) {
  const lr0 = Math.log(rMin), dl = (Math.log(rMax) - lr0) / nR, dt = Math.PI / nT;
  const Rs = [], Ts = [], v = new Float64Array((nR + 1) * (nT + 1));
  for (let i = 0; i <= nR; i++) Rs.push(Math.exp(lr0 + i * dl));
  for (let j = 0; j <= nT; j++) Ts.push(j * dt);
  for (let i = 0; i <= nR; i++) for (let j = 0; j <= nT; j++) v[i * (nT + 1) + j] = f(Rs[i], Math.cos(Ts[j]));
  const segs = [];
  const at = (i, j) => v[i * (nT + 1) + j];
  for (const L of levels) {
    for (let i = 0; i < nR; i++) for (let j = 0; j < nT; j++) {
      const a = at(i, j) - L, b = at(i + 1, j) - L, c = at(i + 1, j + 1) - L, d = at(i, j + 1) - L;
      const pts = [];
      // edges: (i,j)-(i+1,j), (i+1,j)-(i+1,j+1), (i+1,j+1)-(i,j+1), (i,j+1)-(i,j)
      const edge = (x, y, i0, j0, i1, j1) => {
        if ((x > 0) === (y > 0)) return;
        const s = x / (x - y);
        pts.push([Rs[i0] + (Rs[i1] - Rs[i0]) * s, Ts[j0] + (Ts[j1] - Ts[j0]) * s]);
      };
      edge(a, b, i, j, i + 1, j); edge(b, c, i + 1, j, i + 1, j + 1); edge(c, d, i + 1, j + 1, i, j + 1); edge(d, a, i, j + 1, i, j);
      if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
      else if (pts.length === 4) { segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]); segs.push([pts[2][0], pts[2][1], pts[3][0], pts[3][1]]); }
    }
  }
  return segs;
}

// Follows a field line from `start` (steps a fixed fraction of the distance to the atom, midpoint
// method). get(x) returns the field vector; sign +1 follows it, −1 goes against it. Stops at the
// atom, outside `inside(x)`, where the field vanishes, or after `maxSteps`. Returns the points.
export function traceLine(get, start, { sign = 1, src = [0, 0, 0], h = 0.08, rMin = 0.25, maxSteps = 160, inside = () => true, closeTo = null } = {}) {
  const pts = [start];
  let x = start;
  for (let s = 0; s < maxSteps; s++) {
    const R = Math.hypot(x[0] - src[0], x[1] - src[1], x[2] - src[2]);
    const step = h * Math.max(R, 0.5);
    const f1 = get(x), m1 = Math.hypot(f1[0], f1[1], f1[2]);
    if (m1 < 1e-30) break;
    const mid = [0, 1, 2].map(i => x[i] + sign * f1[i] / m1 * step / 2);
    const f2 = get(mid), m2 = Math.hypot(f2[0], f2[1], f2[2]);
    if (m2 < 1e-30) break;
    x = [0, 1, 2].map(i => x[i] + sign * f2[i] / m2 * step);
    pts.push(x);
    if (!inside(x) || Math.hypot(x[0] - src[0], x[1] - src[1], x[2] - src[2]) < rMin) break;
    if (closeTo && s > 6 && Math.hypot(x[0] - closeTo[0], x[1] - closeTo[1], x[2] - closeTo[2]) < step) { pts.push(closeTo); break; }
  }
  return pts;
}

// ---------------------------------------------------------------------------
// The photon's particle (pilot-wave view, de Broglie–Bohm). The wave goes everywhere; the photon
// itself rides it along one path, at c, and only where it actually goes can it be taken. Its
// direction is drawn from the radiation pattern (the wave's brightness), so on average it lands
// exactly where the wave says it should. Averaged over a cycle a dipole's energy flows straight
// out from the atom (the near field just sloshes back and forth), so the path is a straight line.
// An atom takes the photon if the path passes through its target: a cone around the direction to
// it whose solid angle is σ/R² (its target area seen from the source). That gives each atom the
// same chance as the wave picture, σ·w/(4πR²), with w the pattern's brightness that way.
// ---------------------------------------------------------------------------
// Brightness of the pattern that way: c = cos(angle to the swing's axis).
export const patternI = (pattern, c) => (pattern === 'lin' ? 1 - c * c : pattern === 'circ' ? 0.5 * (1 + c * c) : 1);
export const patternAvg = pattern => (pattern === 'iso' ? 1 : 2 / 3);
// The cone around `toward` that the photon's path passes through with probability P, for a path
// drawn from the pattern. For a small cone that is Ω = 4π·avg·P / I(toward); for a wider one the
// pattern's brightness is averaged over the cone (exact for these patterns), a few rounds.
export function targetSolidAngle(P, toward, axis, pattern) {
  if (P <= 0) return 0;
  const cb = dot(toward, axis), avg = patternAvg(pattern);
  let omega = 4 * Math.PI * avg * P / Math.max(1e-9, patternI(pattern, cb));
  for (let it = 0; it < 6; it++) {
    const ca = Math.max(-1, 1 - Math.min(4 * Math.PI, omega) / (2 * Math.PI));
    const m2 = (1 + ca + ca * ca) / 3;                           // mean cos² from the cone's centre
    const meanSq = cb * cb * m2 + (1 - cb * cb) * (1 - m2) / 2;   // mean cos² from the swing's axis
    const Ibar = pattern === 'lin' ? 1 - meanSq : pattern === 'circ' ? 0.5 * (1 + meanSq) : 1;
    omega = 4 * Math.PI * avg * P / Math.max(1e-9, Ibar);
  }
  return Math.min(4 * Math.PI, omega);
}
// Is direction `dir` inside a cone of solid angle Ω around `toward` (unit vectors)?
export const inCone = (dir, toward, omega) => dot(dir, toward) >= 1 - omega / (2 * Math.PI);
// When the photon leaves: its chance of leaving in each moment follows the swing's power, which
// fades as exp(−t/τ), so the time is drawn from that (the level's real lifetime).
export const sampleLaunch = (tau, rand = Math.random) => -tau * Math.log(1 - rand());

// The emitting atom's share still in the upper level: it fades as exp(−t/τ).
export const emitterShare = (t, tau) => (t <= 0 ? 1 : Math.exp(-t / tau));
