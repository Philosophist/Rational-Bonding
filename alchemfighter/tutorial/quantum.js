// Hydrogen worked out from Schrödinger's equation, for capture, the cascade and the shapes of
// excited clouds in an electric field. Atomic units throughout (Bohr radius, hartree, ħ = mₑ = e = 1)
// unless a name says otherwise. No DOM code.
//
// What is computed here, and how:
// - Bound orbitals: the exact hydrogen radial functions (orbitals.js, the same ones the shader draws).
// - Free electrons: the radial Schrödinger equation integrated numerically (Numerov's method) at the
//   electron's real energy, one partial wave (angular momentum l) at a time, normalised per unit
//   energy from the WKB amplitude far out.
// - Capture: the dipole overlap of each free partial wave with each orbital gives the photo-
//   recombination cross section into that orbital (detailed balance with photoionization).
// - Light from one level to another: the same overlaps between bound orbitals give the decay rates.
// - An electric field: inside one shell n every l has the same energy, so even a weak field mixes
//   them (the linear Stark effect). The field's matrix inside the shell is diagonalised, and the
//   state evolves exactly in it: the cloud sloshes from one shape to another around the proton.
import { radial } from './orbitals.js';

export const C_AU = 137.035999;        // speed of light in atomic units (1/α)
export const HARTREE = 27.211386;      // eV
export const T_AU_FS = 0.02418884;     // fs per atomic unit of time
export const F_AU = 514.220675;        // V/nm per atomic unit of field
export const A0_NM = 0.0529177;        // nm
export const NMAX = 6;                 // shells the game captures into and cascades through
export const LAMB_AU = 4.3748e-6 / HARTREE;   // 2s sits this far above 2p (the Lamb shift)

// ---------------------------------------------------------------------------
// Grids and integrals
// ---------------------------------------------------------------------------
const H = 0.01, RB = 220;                            // radial step and reach (a₀) for bound overlaps
const NB = Math.round(RB / H);
const rGrid = Float64Array.from({ length: NB + 1 }, (_, i) => i * H);
const boundCache = new Map();
function boundOnGrid(n, l) {
  const k = n * 16 + l;
  let f = boundCache.get(k);
  if (!f) { f = Float64Array.from(rGrid, r => radial(n, l, 1, r)); boundCache.set(k, f); }
  return f;
}
// Simpson's rule on the shared grid.
function simpson(f) {
  let s = f[0] + f[NB];
  for (let i = 1; i < NB; i++) s += f[i] * (i & 1 ? 4 : 2);
  return s * H / 3;
}
// ⟨n l | r | n' l'⟩ radial part, a₀.
const rCache = new Map();
export function radialDipole(n, l, n2, l2) {
  const k = `${n},${l},${n2},${l2}`;
  if (rCache.has(k)) return rCache.get(k);
  const a = boundOnGrid(n, l), b = boundOnGrid(n2, l2), g = new Float64Array(NB + 1);
  for (let i = 0; i <= NB; i++) g[i] = a[i] * b[i] * rGrid[i] ** 3;
  const v = simpson(g);
  rCache.set(k, v); rCache.set(`${n2},${l2},${n},${l}`, v);
  return v;
}
// ⟨l m | cos θ | l−1 m⟩ for the normalised spherical harmonics the shader uses (Condon–Shortley).
export const cosElement = (l, m) => Math.sqrt((l * l - m * m) / ((2 * l + 1) * (2 * l - 1)));

// ---------------------------------------------------------------------------
// Light between bound levels
// ---------------------------------------------------------------------------
// Spontaneous decay rate (per atomic unit of time), nl → n'l', summed over the final m:
// A = (4/3)·ω³/c³ · max(l, l')/(2l + 1) · |⟨r⟩|².
export function decayRateAU(n, l, n2, l2) {
  if (n2 >= n || Math.abs(l - l2) !== 1 || l2 >= n2) return 0;
  const w = 0.5 * (1 / (n2 * n2) - 1 / (n * n)), d = radialDipole(n, l, n2, l2);
  return 4 / 3 * w ** 3 / C_AU ** 3 * Math.max(l, l2) / (2 * l + 1) * d * d;
}
const NS_PER_AU = T_AU_FS * 1e-6;
// The table physics.js uses: lifetime (ns) and branching for every nl up to NMAX. 2s can't send one
// photon; it sends two after 0.122 s (that rate is QED's, not a dipole overlap).
export function decayTable(nmax = NMAX) {
  const T = {};
  for (let n = 2; n <= nmax; n++) for (let l = 0; l < n; l++) {
    if (n === 2 && l === 0) { T['2,0'] = { tau: 1.22e8, br: [[1, 0, 1]], twoPhoton: true }; continue; }
    const br = [];
    let tot = 0;
    for (let n2 = 1; n2 < n; n2++) for (const l2 of [l - 1, l + 1]) {
      const A = l2 >= 0 ? decayRateAU(n, l, n2, l2) : 0;
      if (A > 0) { br.push([n2, l2, A]); tot += A; }
    }
    T[`${n},${l}`] = { tau: NS_PER_AU / tot, rate: tot / NS_PER_AU, br: br.map(([a, b, A]) => [a, b, A / tot]) };
  }
  return T;
}

// ---------------------------------------------------------------------------
// Free electrons and capture
// ---------------------------------------------------------------------------
// One free partial wave u(r) = r·R(r) at energy e (hartree), angular momentum l, normalised per unit
// energy: far out it swings as √(2/(πp)) sin(…), p the local momentum (WKB).
const RF = 420, NF = Math.round(RF / H);
export function freeWave(e, l) {
  const k2 = 2 * e, u = new Float64Array(NF + 1), q = i => { const r = i * H; return i === 0 ? 0 : l * (l + 1) / (r * r) - 2 / r - k2; };
  const h2 = H * H / 12;
  u[0] = 0; u[1] = Math.pow(H, l + 1) * (1 - H / (l + 1));
  u[2] = Math.pow(2 * H, l + 1) * (1 - 2 * H / (l + 1));
  let q0 = q(1), q1 = q(2);
  for (let i = 2; i < NF; i++) {
    const q2 = q(i + 1);
    u[i + 1] = (2 * u[i] * (1 + 5 * h2 * q1) - u[i - 1] * (1 - h2 * q0)) / (1 - h2 * q2);
    q0 = q1; q1 = q2;
    if (Math.abs(u[i + 1]) > 1e200) for (let j = 0; j <= i + 1; j++) u[j] *= 1e-200;   // high l starts tiny
  }
  // WKB amplitude, averaged over the outer stretch.
  let s = 0, c = 0;
  for (let i = Math.round(300 / H); i < NF - 1; i += 7) {
    const r = i * H, p = Math.sqrt(k2 + 2 / r - l * (l + 1) / (r * r)), du = (u[i + 1] - u[i - 1]) / (2 * H);
    s += p * (u[i] * u[i] + (du / p) ** 2); c++;
  }
  const scale = Math.sqrt(2 / Math.PI) / Math.sqrt(s / c);
  for (let i = 0; i <= NF; i++) u[i] *= scale;
  return u;
}
// ⟨n l | r | e l_in⟩ with the free wave energy-normalised (a₀ per √hartree).
function boundFree(n, l, u) {
  const b = boundOnGrid(n, l), g = new Float64Array(NB + 1);
  for (let i = 0; i <= NB; i++) g[i] = b[i] * rGrid[i] * rGrid[i] * u[i];
  return simpson(g);
}
// Photoionization cross section of n l at photon energy w (hartree), into partial wave l2, in a₀².
export function photoionSigmaAU(n, l, w, l2) {
  const e = w - 0.5 / (n * n);
  if (e <= 0) return 0;
  const d = boundFree(n, l, freeWave(e, l2));
  return 4 * Math.PI * Math.PI / (3 * C_AU) * w * Math.max(l, l2) / (2 * l + 1) * d * d;
}
// Capture of a free electron with energy E (eV) in partial wave lIn, into each orbital n l up to
// NMAX. Each entry: { n, l, sigma (nm²), P (the chance per pass of an electron in that partial wave) }.
// Detailed balance (Milne): σ_rec = 2(2l+1)·ω²/(c²k²)·σ_PI, split over the incoming partial waves.
const capCache = new Map();
export function captureTable(E) {
  const key = (Math.round(Math.log(Math.max(E, 1e-3)) * 200) / 200).toFixed(3);   // 0.5% energy bins
  let T = capCache.get(key);
  if (T) return T;
  const e = Math.exp(+key) / HARTREE, k2 = 2 * e;
  T = [];
  for (let lIn = 0; lIn <= NMAX; lIn++) {
    const u = freeWave(e, lIn), area = Math.PI * (2 * lIn + 1) / k2, row = [];
    for (let n = 1; n <= NMAX; n++) for (const l of [lIn - 1, lIn + 1]) {
      if (l < 0 || l >= n) continue;
      const w = e + 0.5 / (n * n), d = boundFree(n, l, u);
      const sig = 8 * Math.PI * Math.PI / (3 * C_AU) * w ** 3 / (C_AU * C_AU * k2) * Math.max(l, lIn) * d * d;   // a₀²
      row.push({ n, l, lIn, sigma: sig * A0_NM * A0_NM, P: sig / area });
    }
    T.push(row);
  }
  capCache.set(key, T);
  return T;
}
// Total capture cross section (nm²) into shells up to NMAX at energy E (eV).
export const captureSigmaQ = E => captureTable(E).flat().reduce((s, x) => s + x.sigma, 0);
// How likely each partial wave is for a pass with angular momentum Lħ: the electron is a wave, so a
// pass with L ≈ (l + ½)ħ is mostly partial wave l, with a spread of about one unit. Averaged over a
// uniform beam this gives each partial wave its full share, (2l + 1)·πƛ².
export function partialWeights(L, lmax = NMAX) {
  const w = [];
  let s = 0;
  for (let l = 0; l <= lmax + 3; l++) { const x = (l + 0.5 - L) / 0.5; w.push(Math.exp(-0.5 * x * x)); s += w[l]; }
  return w.map(x => x / s);
}
// The real chance that one pass (energy E eV, angular momentum L in units of ħ) is caught.
export function captureChancePass(E, L) {
  const T = captureTable(E), w = partialWeights(L);
  let p = 0;
  for (let lIn = 0; lIn < T.length; lIn++) for (const x of T[lIn]) p += w[lIn] * x.P;
  return p;
}
// Where the caught electron lands: an orbital n l (and the incoming partial wave it came from),
// chosen in proportion to the computed odds for this pass.
export function pickCapture(E, L, rand = Math.random) {
  const T = captureTable(E), w = partialWeights(L), all = [];
  let tot = 0;
  for (let lIn = 0; lIn < T.length; lIn++) for (const x of T[lIn]) { const p = w[lIn] * x.P; all.push([x, p]); tot += p; }
  let r = rand() * tot;
  for (const [x, p] of all) { r -= p; if (r <= 0) return x; }
  return all[all.length - 1][0];
}
// Where an electron lands when nothing about its pass picks the partial wave (it came in through
// the equal-area capture disc): every orbital and partial wave in proportion to its cross section.
export function pickCaptureBeam(E, rand = Math.random) {
  const all = captureTable(E).flat(), tot = all.reduce((s, x) => s + x.sigma, 0);
  let r = rand() * tot;
  for (const x of all) { r -= x.sigma; if (r <= 0) return x; }
  return all[all.length - 1];
}
// Each orbital's share of captures at energy E (for the tutor and tests): { '1s': 0.47, ... }.
export function captureShares(E) {
  const all = captureTable(E).flat(), tot = all.reduce((s, x) => s + x.sigma, 0), out = {};
  for (const x of all) { const k = `${x.n}${'spdfghi'[x.l]}`; out[k] = (out[k] || 0) + x.sigma / tot; }
  return out;
}
// Each orbital's share of captures for a pass with angular momentum Lħ (the lock-on's odds).
export function captureSharesAt(E, L) {
  const T = captureTable(E), w = partialWeights(L), out = {};
  let tot = 0;
  for (let lIn = 0; lIn < T.length; lIn++) for (const x of T[lIn]) { const k = `${x.n}${'spdfghi'[x.l]}`, p = w[lIn] * x.P; out[k] = (out[k] || 0) + p; tot += p; }
  for (const k in out) out[k] /= tot || 1;
  return out;
}
// The free partial wave's radial function R(r) = u/r near the proton, sampled for the shader on
// a √r grid out to rmax (a₀), scaled so that the part inside rmax holds probability one.
export function freeRadialTable(E, l, rmax, N = 128) {
  const u = freeWave(Math.max(E, 1e-3) / HARTREE, l), out = new Float32Array(N);
  let norm = 0;
  const iMax = Math.min(NF, Math.round(rmax / H));
  for (let i = 1; i <= iMax; i++) norm += u[i] * u[i] * H;
  const s = 1 / Math.sqrt(norm);
  for (let j = 0; j < N; j++) {
    const r = rmax * (j / (N - 1)) ** 2, x = r / H, i = Math.min(NF - 1, Math.floor(x)), f = x - i;
    const uu = u[i] * (1 - f) + u[i + 1] * f;
    out[j] = r > 1e-6 ? s * uu / r : (l === 0 ? s * u[1] / H : 0);
  }
  let peak = 0;
  for (let j = 0; j < N; j++) peak = Math.max(peak, out[j] * out[j]);
  return { table: out, rmax, peak };
}

// ---------------------------------------------------------------------------
// One shell in an electric field (the linear Stark effect), solved exactly
// ---------------------------------------------------------------------------
// The field is along the cloud's own axis; m about that axis is kept, and the states l = |m| … n−1
// mix. ⟨n l m| z |n l−1 m⟩ = radial × angular. Diagonalising gives the Stark states (energies
// (3/2)·n·k·F, k = n₁ − n₂). For n = 2 the Lamb shift holds 2s apart from 2p in weak fields.
export function starkMatrix(n, m) {
  const am = Math.abs(m), ls = [];
  for (let l = am; l < n; l++) ls.push(l);
  const Z = ls.map(() => ls.map(() => 0));
  for (let i = 1; i < ls.length; i++) {
    const l = ls[i], z = radialDipole(n, l, n, l - 1) * cosElement(l, am);
    Z[i][i - 1] = Z[i - 1][i] = z;
  }
  return { ls, Z };
}
// Jacobi eigenvalue method for a small symmetric matrix: { vals, vecs } with vecs[i][k] = component i
// of eigenvector k.
export function eigSym(A0) {
  const n = A0.length, A = A0.map(r => [...r]), V = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  return { vals: A.map((r, i) => r[i]), vecs: V };
}
// The shell's Hamiltonian in field F (atomic units, along the axis), including the Lamb shift.
export function shellH(n, m, F) {
  const { ls, Z } = starkMatrix(n, m);
  const Hm = Z.map((r, i) => r.map((z, j) => z * F + (i === j && n === 2 && ls[i] === 0 ? LAMB_AU : 0)));
  return { ls, H: Hm };
}
// Advance the amplitudes c (arrays re, im over ls) by time t (a.u.) in field F: exact for a steady field.
export function evolveShell(n, m, F, c, t) {
  const { ls, H: Hm } = shellH(n, m, F);
  if (ls.length === 1) return c;
  const { vals, vecs } = eigSym(Hm), N = ls.length;
  const re = new Array(N).fill(0), im = new Array(N).fill(0);
  for (let k = 0; k < N; k++) {
    let ar = 0, ai = 0;
    for (let i = 0; i < N; i++) { ar += vecs[i][k] * c.re[i]; ai += vecs[i][k] * c.im[i]; }
    const ph = -vals[k] * t, cs = Math.cos(ph), sn = Math.sin(ph), br = ar * cs - ai * sn, bi = ar * sn + ai * cs;
    for (let i = 0; i < N; i++) { re[i] += vecs[i][k] * br; im[i] += vecs[i][k] * bi; }
  }
  return { re, im };
}
// How much of each l the state holds on average over the fast sloshing (what sets its decay rate),
// and the fastest slosh frequency (rad per a.u.).
export function shellAverage(n, m, F, c) {
  const { ls, H: Hm } = shellH(n, m, F), N = ls.length;
  if (N === 1) return { ls, p: [c.re[0] ** 2 + c.im[0] ** 2], w: 0 };
  const { vals, vecs } = eigSym(Hm), p = new Array(N).fill(0);
  for (let k = 0; k < N; k++) {
    let ar = 0, ai = 0;
    for (let i = 0; i < N; i++) { ar += vecs[i][k] * c.re[i]; ai += vecs[i][k] * c.im[i]; }
    const a2 = ar * ar + ai * ai;
    for (let i = 0; i < N; i++) p[i] += a2 * vecs[i][k] ** 2;
  }
  return { ls, p, w: Math.max(...vals) - Math.min(...vals) };
}
// The electron's mean position along the axis (a₀) for amplitudes c: where its charge sits.
export function shellDipole(n, m, c) {
  const { Z } = starkMatrix(n, m);
  let z = 0;
  for (let i = 0; i < Z.length; i++) for (let j = 0; j < Z.length; j++) z += Z[i][j] * (c.re[i] * c.re[j] + c.im[i] * c.im[j]);
  return z;
}
