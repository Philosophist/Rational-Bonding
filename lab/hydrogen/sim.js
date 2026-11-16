// One electron and one proton, solved from the equations alone. No random numbers anywhere.
// Atomic units throughout (ħ = mₑ = e = 1, length a₀, energy hartree, time ħ/hartree) unless a
// name says otherwise. No DOM code, so the browser worker and Node run the same file.
//
// What is solved:
// - The pair's relative motion (exact for two bodies: the proton's recoil is the reduced mass μ)
//   under Schrödinger's equation with the Coulomb pull, on a spherical grid centred on the proton:
//   radial points times angular patterns (spherical harmonics) l = 0..lmax. The Coulomb pull does
//   not mix patterns, so each one has its own radial grid: fine (0.05 a₀) for the low patterns that
//   reach the proton, coarser for the high ones that a centrifugal barrier keeps far out.
//   Radial derivatives use Numerov's fourth-order formula (with its standard Coulomb-origin row),
//   written as K·u = E·M·u with symmetric K and M, so Crank–Nicolson keeps probability exactly.
// - No orbital shapes or energy levels are put in. The bound shapes used for light are found
//   afterwards as the grid Hamiltonian's own eigenvectors.
// - Fine structure (switch): electron spin, spin–orbit coupling, the relativistic speed correction
//   −p⁴/8c² and the Darwin term (the Breit–Pauli terms of the Dirac equation).
// - Light (switch): the quantized Maxwell field in free space, coupled to the pair's dipole −r, at
//   first order. The one-photon part of the state grows out of the vacuum through the coupling:
//   its amplitude for bound shape b and photon energy ω is ∝ ∫⟨b|r|ψ(t)⟩·e^{i(E_b+ω)t} dt, summed
//   every few steps while the wave moves. Afterwards the captured part cascades by the same coupling
//   (golden-rule rates from the grid's own dipole integrals), followed with rate equations.
// - The grid's edge absorbs (a smooth complex potential): electron that reaches it has left the
//   box. Light is not reflected anywhere (free space, no mirror walls).
import { exp, sincos } from './detmath.js';

export const HARTREE_EV = 27.211386245988;
export const A0_NM = 0.0529177210903;
export const FS_PER_AU = 0.02418884326585747;
export const C = 137.035999084;
export const MP = 1836.15267343;
export const VERSION = 1;

export const DEFAULTS = Object.freeze({
  startNm: 6, energyEv: 1, widthNm: 1,       // where the electron starts, incoming energy, packet width
  coulomb: true, recoil: true, light: true, fine: true,
  lmax: 80, fineL: 10, hFine: 0.05, hCoarse: 0.2,
  rmax: 320, cap: 60, capStrength: 0.1,
  dt: 0.1, tEndAu: 2500, frameEvery: 40, sampleEvery: 2,
  nmax: 8,                                   // bound shells tracked for capture (held well by the box)
  epsMax: 0.08, nEps: 320,                   // electron energies (hartree, above zero) tracked for capture
});

// ---------------------------------------------------------------------------
// Banded matrices (symmetric, bandwidth ≤ 2): { d0, d1, d2 } diagonals
// ---------------------------------------------------------------------------
const band = N => ({ d0: new Float64Array(N), d1: new Float64Array(N), d2: new Float64Array(N) });
function bandMul(B, x, N, y = new Float64Array(N)) {
  const { d0, d1, d2 } = B;
  for (let i = 0; i < N; i++) {
    let s = d0[i] * x[i];
    if (i >= 1) s += d1[i - 1] * x[i - 1];
    if (i < N - 1) s += d1[i] * x[i + 1];
    if (i >= 2) s += d2[i - 2] * x[i - 2];
    if (i < N - 2) s += d2[i] * x[i + 2];
    y[i] = s;
  }
  return y;
}
// LU (no pivoting) of the complex symmetric band matrix P + iQ.
function cfactor(P, Q, N) {
  const F = {};
  for (const k of ['l1r', 'l1i', 'l2r', 'l2i', 'ir', 'ii', 'u1r', 'u1i', 'u2r', 'u2i']) F[k] = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (i >= 2) {               // l2 = A[i][i−2] / u0[i−2]
      const xr = P.d2[i - 2], xi = Q.d2[i - 2];
      F.l2r[i] = xr * F.ir[i - 2] - xi * F.ii[i - 2]; F.l2i[i] = xr * F.ii[i - 2] + xi * F.ir[i - 2];
    }
    if (i >= 1) {               // l1 = (A[i][i−1] − l2·u1[i−2]) / u0[i−1]
      let xr = P.d1[i - 1], xi = Q.d1[i - 1];
      if (i >= 2) { xr -= F.l2r[i] * F.u1r[i - 2] - F.l2i[i] * F.u1i[i - 2]; xi -= F.l2r[i] * F.u1i[i - 2] + F.l2i[i] * F.u1r[i - 2]; }
      F.l1r[i] = xr * F.ir[i - 1] - xi * F.ii[i - 1]; F.l1i[i] = xr * F.ii[i - 1] + xi * F.ir[i - 1];
    }
    let ar = P.d0[i], ai = Q.d0[i];
    if (i >= 2) { ar -= F.l2r[i] * F.u2r[i - 2] - F.l2i[i] * F.u2i[i - 2]; ai -= F.l2r[i] * F.u2i[i - 2] + F.l2i[i] * F.u2r[i - 2]; }
    if (i >= 1) { ar -= F.l1r[i] * F.u1r[i - 1] - F.l1i[i] * F.u1i[i - 1]; ai -= F.l1r[i] * F.u1i[i - 1] + F.l1i[i] * F.u1r[i - 1]; }
    const m = ar * ar + ai * ai; F.ir[i] = ar / m; F.ii[i] = -ai / m;
    let br = i < N - 1 ? P.d1[i] : 0, bi = i < N - 1 ? Q.d1[i] : 0;
    if (i >= 1) { br -= F.l1r[i] * F.u2r[i - 1] - F.l1i[i] * F.u2i[i - 1]; bi -= F.l1r[i] * F.u2i[i - 1] + F.l1i[i] * F.u2r[i - 1]; }
    F.u1r[i] = br; F.u1i[i] = bi;
    F.u2r[i] = i < N - 2 ? P.d2[i] : 0; F.u2i[i] = i < N - 2 ? Q.d2[i] : 0;
  }
  return F;
}
// x ← (P⁺ + iQ)⁻¹ (P⁻ − iQ) x, the Crank–Nicolson step, with F the factor of P⁺ + iQ.
function cnApply(Pm, Q, F, xr, xi, yr, yi, N) {
  const p0 = Pm.d0, p1 = Pm.d1, p2 = Pm.d2, q0 = Q.d0, q1 = Q.d1, q2 = Q.d2;
  for (let i = 0; i < N; i++) {
    let ar = p0[i] * xr[i], ai = p0[i] * xi[i], br = q0[i] * xr[i], bi = q0[i] * xi[i];
    if (i >= 1) { ar += p1[i - 1] * xr[i - 1]; ai += p1[i - 1] * xi[i - 1]; br += q1[i - 1] * xr[i - 1]; bi += q1[i - 1] * xi[i - 1]; }
    if (i < N - 1) { ar += p1[i] * xr[i + 1]; ai += p1[i] * xi[i + 1]; br += q1[i] * xr[i + 1]; bi += q1[i] * xi[i + 1]; }
    if (i >= 2) { ar += p2[i - 2] * xr[i - 2]; ai += p2[i - 2] * xi[i - 2]; br += q2[i - 2] * xr[i - 2]; bi += q2[i - 2] * xi[i - 2]; }
    if (i < N - 2) { ar += p2[i] * xr[i + 2]; ai += p2[i] * xi[i + 2]; br += q2[i] * xr[i + 2]; bi += q2[i] * xi[i + 2]; }
    yr[i] = ar + bi; yi[i] = ai - br;           // P⁻x − i·Qx
  }
  for (let i = 1; i < N; i++) {
    let r = yr[i], m = yi[i];
    r -= F.l1r[i] * yr[i - 1] - F.l1i[i] * yi[i - 1]; m -= F.l1r[i] * yi[i - 1] + F.l1i[i] * yr[i - 1];
    if (i >= 2) { r -= F.l2r[i] * yr[i - 2] - F.l2i[i] * yi[i - 2]; m -= F.l2r[i] * yi[i - 2] + F.l2i[i] * yr[i - 2]; }
    yr[i] = r; yi[i] = m;
  }
  for (let i = N - 1; i >= 0; i--) {
    let r = yr[i], m = yi[i];
    if (i < N - 1) { r -= F.u1r[i] * xr[i + 1] - F.u1i[i] * xi[i + 1]; m -= F.u1r[i] * xi[i + 1] + F.u1i[i] * xr[i + 1]; }
    if (i < N - 2) { r -= F.u2r[i] * xr[i + 2] - F.u2i[i] * xi[i + 2]; m -= F.u2r[i] * xi[i + 2] + F.u2i[i] * xr[i + 2]; }
    xr[i] = r * F.ir[i] - m * F.ii[i]; xi[i] = r * F.ii[i] + m * F.ir[i];
  }
}
// Real solve (K − e·M) x = b.
function realSolve(K, M, e, b, N) {
  const S = band(N);
  for (let i = 0; i < N; i++) { S.d0[i] = K.d0[i] - e * M.d0[i]; S.d1[i] = K.d1[i] - e * M.d1[i]; S.d2[i] = K.d2[i] - e * M.d2[i]; }
  const F = cfactor(S, band(N), N), x = Float64Array.from(b);
  for (let i = 1; i < N; i++) x[i] -= F.l1r[i] * x[i - 1] + (i >= 2 ? F.l2r[i] * x[i - 2] : 0);
  for (let i = N - 1; i >= 0; i--) x[i] = (x[i] - (i < N - 1 ? F.u1r[i] * x[i + 1] : 0) - (i < N - 2 ? F.u2r[i] * x[i + 2] : 0)) * F.ir[i];
  return x;
}
// Number of eigenvalues of the tridiagonal pencil (K − x·M) below x (Sylvester's law of inertia).
export function sturm(K, M, x, N) {
  let q = 1, c = 0;
  for (let i = 0; i < N; i++) {
    const a = K.d0[i] - x * M.d0[i], b = i > 0 ? K.d1[i - 1] - x * M.d1[i - 1] : 0;
    q = a - (i > 0 ? b * b / q : 0);
    if (q === 0) q = 1e-300;
    if (q < 0) c++;
  }
  return c;
}

// ---------------------------------------------------------------------------
// Angular patterns: Legendre functions normalised on [−1, 1] (∫ P̄² dμ = 1)
// ---------------------------------------------------------------------------
export function legendreAll(L, mu) {
  const p = new Float64Array(L + 1);
  let a = 1, b = mu;
  p[0] = Math.sqrt(0.5);
  if (L >= 1) p[1] = b * Math.sqrt(1.5);
  for (let l = 2; l <= L; l++) { const c = ((2 * l - 1) * mu * b - (l - 1) * a) / l; a = b; b = c; p[l] = c * Math.sqrt((2 * l + 1) / 2); }
  return p;
}
export function legendre1All(L, mu) {            // m = 1 patterns, index l (l ≥ 1)
  const p = new Float64Array(L + 1), st = Math.sqrt(Math.max(0, 1 - mu * mu));
  let a = 0, b = st;
  if (L >= 1) p[1] = b * Math.sqrt(3 / 4);
  for (let l = 2; l <= L; l++) {
    const c = ((2 * l - 1) * mu * b - l * a) / (l - 1);
    a = b; b = c;
    p[l] = c * Math.sqrt((2 * l + 1) / (2 * l * (l + 1)));
  }
  return p;
}
export function gaussLegendre(n) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = sincos(Math.PI * (i + 0.75) / (n + 0.5))[1], pp = 1;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      pp = n * (z * p1 - p2) / (z * z - 1);
      const z1 = z; z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x[i] = -z; w[i] = 2 / ((1 - z * z) * pp * pp);
  }
  return { x, w };
}
// Dipole angular factors, by quadrature with the same functions: az[l'][l] = ⟨P̄_l'|μ|P̄_l⟩ and
// ax[l'][l] = ⟨cos-type m = 1 pattern l'| sinθ·cosφ |m = 0 pattern l⟩.
function angularFactors(L) {
  const q = gaussLegendre(L + 8), az = [], ax = [];
  for (let lp = 0; lp <= L; lp++) { az.push(new Float64Array(L + 1)); ax.push(new Float64Array(L + 1)); }
  for (let k = 0; k < q.x.length; k++) {
    const mu = q.x[k], p = legendreAll(L, mu), p1 = legendre1All(L, mu), st = Math.sqrt(1 - mu * mu);
    for (let lp = 0; lp <= L; lp++) for (const l of [lp - 1, lp + 1]) {
      if (l < 0 || l > L) continue;
      az[lp][l] += q.w[k] * p[lp] * mu * p[l];
      if (lp >= 1) ax[lp][l] += q.w[k] * p1[lp] * st * p[l] / Math.SQRT2;
    }
  }
  return { az, ax };
}

// ---------------------------------------------------------------------------
// One radial channel: grid, Numerov matrices, fine-structure terms, Crank–Nicolson factors
// ---------------------------------------------------------------------------
function makeChannel(l, h, s, mu) {
  const N = Math.floor(s.rmax / h), r = Float64Array.from({ length: N }, (_, i) => (i + 1) * h);
  // Numerov: u'' ≈ M⁻¹·A·u, A = (1, −2, 1)/h², M = (1, 10, 1)/12; for l = 0 with the Coulomb pull the
  // first row follows the cusp the equation itself forces on u near r = 0.
  const M = band(N), A = band(N);
  for (let i = 0; i < N; i++) { M.d0[i] = 10 / 12; M.d1[i] = 1 / 12; A.d0[i] = -2 / (h * h); A.d1[i] = 1 / (h * h); }
  M.d1[N - 1] = 0; A.d1[N - 1] = 0;
  if (l === 0 && s.coulomb) { A.d0[0] = -2 / (h * h) * (1 - h / (12 - 10 * h)); M.d0[0] = 1 + h * h / 12 * A.d0[0]; }
  const cent = l * (l + 1), V = Float64Array.from(r, x => cent / (2 * mu * x * x) - (s.coulomb ? 1 / x : 0));
  // K = −A/2μ + M·V (symmetrised)
  const K = band(N);
  for (let i = 0; i < N; i++) {
    K.d0[i] = -A.d0[i] / (2 * mu) + M.d0[i] * V[i];
    if (i < N - 1) K.d1[i] = -A.d1[i] / (2 * mu) + M.d1[i] * 0.5 * (V[i] + V[i + 1]);
  }
  const K0 = { d0: Float64Array.from(K.d0), d1: Float64Array.from(K.d1) };   // without fine structure
  if (s.fine && s.coulomb) {
    // −p⁴/(8c²): p² ≈ −A + centrifugal. The expansion only holds where p ≪ c; right at the proton the
    // centrifugal part for l ≥ 1 would exceed c² and −p⁴ would run away (Dirac's energy does not),
    // so it is capped at c²/4 there: only r < 2√(l(l+1))/c (0.02 a₀ for l = 1), where u ≈ 0.
    // (The plain second difference here: the Coulomb-origin row of A is only right together with M.)
    const P = band(N);
    for (let i = 0; i < N; i++) { P.d0[i] = 2 / (h * h) + Math.min(cent / (r[i] * r[i]), C * C / 4); P.d1[i] = i < N - 1 ? -1 / (h * h) : 0; }
    const f = -1 / (8 * C * C);
    for (let i = 0; i < N; i++) {
      const b0 = i > 0 ? P.d1[i - 1] : 0, b1 = P.d1[i];
      K.d0[i] += f * (P.d0[i] * P.d0[i] + b0 * b0 + b1 * b1);
      if (i < N - 1) K.d1[i] += f * P.d1[i] * (P.d0[i] + P.d0[i + 1]);
      if (i < N - 2) K.d2[i] += f * P.d1[i] * P.d1[i + 1];
    }
    // For s waves u'' does not vanish at r = 0, so ∫(p²u)² dr also gets the half cell [0, h/2]
    // in front of the first node (its value held there).
    if (l === 0) {
      K.d0[0] += 0.5 * f * P.d0[0] * P.d0[0]; K.d1[0] += 0.5 * f * P.d0[0] * P.d1[0]; K.d0[1] += 0.5 * f * P.d1[0] * P.d1[0];
    }
    // Darwin term (π/2c²)·δ³(r) for s waves: |ψ(0)|² = R(0)²/4π with R(0) = 2u₀/h − u₁/2h.
    if (l === 0) {
      const al = 2 / h, be = -1 / (2 * h), D = 1 / (8 * C * C) / h;
      K.d0[0] += D * al * al; K.d0[1] += D * be * be; K.d1[0] += D * al * be;
    }
  }
  // absorbing edge: −i·cap(r), symmetrised with M like V
  const cap = new Float64Array(N), ra = s.rmax - s.cap;
  for (let i = 0; i < N; i++) if (r[i] > ra) { const x = (r[i] - ra) / s.cap; cap[i] = s.capStrength * x * x; }
  // Crank–Nicolson: (M + iδ(K − iC)) u' = (M − iδ(K − iC)) u, δ = dt/2  →  P± = M ± δC, Q = δK
  const dl = s.dt / 2, Pp = band(N), Pm = band(N), Q = band(N);
  for (let i = 0; i < N; i++) {
    const c0 = M.d0[i] * cap[i], c1 = i < N - 1 ? M.d1[i] * 0.5 * (cap[i] + cap[i + 1]) : 0;
    Pp.d0[i] = M.d0[i] + dl * c0; Pm.d0[i] = M.d0[i] - dl * c0;
    Pp.d1[i] = M.d1[i] + dl * c1; Pm.d1[i] = M.d1[i] - dl * c1;
    Q.d0[i] = dl * K.d0[i]; Q.d1[i] = dl * K.d1[i]; Q.d2[i] = dl * K.d2[i];
  }
  const F = cfactor(Pp, Q, N);
  return { l, h, N, r, M, K, K0, Pm, Q, F, ur: new Float64Array(N), ui: new Float64Array(N), dr: null, di: null };
}

// ---------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------
export class Sim {
  constructor(settings = {}) {
    const s = this.s = { ...DEFAULTS, ...settings };
    this.mu = s.recoil ? MP / (1 + MP) : 1;
    this.spin = s.fine && s.coulomb;
    this.ch = [];
    for (let l = 0; l <= s.lmax; l++) this.ch.push(makeChannel(l, l <= s.fineL ? s.hFine : s.hCoarse, s, this.mu));
    const Nmax = Math.max(...this.ch.map(c => c.N));
    this.yr = new Float64Array(Nmax); this.yi = new Float64Array(Nmax);
    if (this.spin) {
      // spin-down m = 1 partner of each l ≥ 1 (the start is spin-up m = 0; only spin–orbit links them)
      for (const c of this.ch) if (c.l >= 1) {
        c.dr = new Float64Array(c.N); c.di = new Float64Array(c.N);
        const kap = (2 * c.l + 1) / 4, tab = new Float64Array(4 * c.N);
        for (let i = 0; i < c.N; i++) {
          const th = s.dt / 2 / (2 * C * C * c.r[i] ** 3);      // ξ(r)·dt/2, ξ = 1/(2c²r³)
          const [sn, cs] = sincos(th * kap), [p, q] = sincos(th / 4);
          tab[4 * i] = cs; tab[4 * i + 1] = sn / kap; tab[4 * i + 2] = q; tab[4 * i + 3] = p;
        }
        c.so = tab; c.sq = Math.sqrt(c.l * (c.l + 1));
      }
    }
    this.initPacket();
    this.t = 0; this.stepCount = 0;
    this.norm0 = this.norm();
    if (s.light) this.initLight();
  }

  initPacket() {
    const s = this.s, L = s.lmax;
    const z0 = -s.startNm / A0_NM, sig = s.widthNm / A0_NM;
    const k0 = this.k0 = Math.sqrt(2 * this.mu * s.energyEv / HARTREE_EV);
    const q = gaussLegendre(Math.max(2 * L + 80, 240)), nq = q.x.length;
    const P = []; for (let k = 0; k < nq; k++) P.push(legendreAll(L, q.x[k]));
    const norm = Math.pow(2 * Math.PI * sig * sig, -0.75), root2pi = Math.sqrt(2 * Math.PI);
    // ψ = N·exp(−|r − z₀ẑ|²/4σ²)·e^{ik₀z};  u_l(r) = r·∫ψ·Y_l0 dΩ = r·√(2π)·Σ_q w_q ψ(r, μ_q) P̄_l(μ_q)
    const proj = r => {
      const acc = new Float64Array(2 * (L + 1));
      if (Math.abs(r - Math.abs(z0)) > 12 * sig) return acc;
      for (let k = 0; k < nq; k++) {
        const mu = q.x[k], d2 = r * r + z0 * z0 - 2 * r * mu * z0;
        const amp = norm * exp(-d2 / (4 * sig * sig));
        if (amp === 0) continue;
        const [sn, cs] = sincos(k0 * r * mu), f = q.w[k] * amp * r * root2pi, pk = P[k];
        for (let l = 0; l <= L; l++) { acc[2 * l] += f * cs * pk[l]; acc[2 * l + 1] += f * sn * pk[l]; }
      }
      return acc;
    };
    const fine = this.ch[0], coarse = this.ch[Math.min(L, s.fineL + 1)];
    for (const G of (L > s.fineL ? [fine, coarse] : [fine])) {
      const lo = G === fine ? 0 : s.fineL + 1, hi = G === fine ? Math.min(L, s.fineL) : L;
      for (let i = 0; i < G.N; i++) {
        const acc = proj(G.r[i]);
        for (let l = lo; l <= hi; l++) { this.ch[l].ur[i] = acc[2 * l]; this.ch[l].ui[i] = acc[2 * l + 1]; }
      }
    }
  }

  // ⟨u|M|u⟩·h, the probability in a channel
  chNorm(c, a, b) {
    const t = bandMul(c.M, a, c.N), t2 = bandMul(c.M, b, c.N);
    let n = 0; for (let i = 0; i < c.N; i++) n += a[i] * t[i] + b[i] * t2[i];
    return n * c.h;
  }
  norm() {
    let n = 0;
    for (const c of this.ch) { n += this.chNorm(c, c.ur, c.ui); if (c.dr) n += this.chNorm(c, c.dr, c.di); }
    return n;
  }

  // The grid's own bound shapes for one pattern: Sturm bisection without fine structure for a
  // starting guess, then inverse iteration with the full Hamiltonian.
  boundStates(c, count) {
    const out = [], N = c.N;
    for (let k = 0; k < count; k++) {
      let a = -1, b = 0;
      if (sturm(c.K0, c.M, b, N) <= k) break;
      for (let it = 0; it < 200; it++) { const m = 0.5 * (a + b); if (sturm(c.K0, c.M, m, N) > k) b = m; else a = m; }
      let e = 0.5 * (a + b), v = new Float64Array(N);
      for (let i = 0; i < N; i++) v[i] = 1 + (i % 7) * 1e-3;
      for (let it = 0; it < 5; it++) {
        const Mv = bandMul(c.M, v, N), x = realSolve(c.K, c.M, e + 1e-12 * Math.abs(e), Mv, N);
        const Mx = bandMul(c.M, x, N), Kx = bandMul(c.K, x, N);
        let nn = 0, kk = 0; for (let i = 0; i < N; i++) { nn += x[i] * Mx[i]; kk += x[i] * Kx[i]; }
        e = kk / nn; const f = 1 / Math.sqrt(nn * c.h); for (let i = 0; i < N; i++) v[i] = x[i] * f;
      }
      let big = 0; for (let i = 0; i < N; i++) if (Math.abs(v[i]) > Math.abs(v[big])) big = i;
      let first = 0; while (first < N && Math.abs(v[first]) < 1e-6 * Math.abs(v[big])) first++;
      if (v[first] < 0) for (let i = 0; i < N; i++) v[i] = -v[i];
      let end = N; while (end > 1 && Math.abs(v[end - 1]) < 1e-14 * Math.abs(v[big])) end--;
      out.push({ E: e, v, end: Math.min(N, end + 2) });
    }
    return out;
  }
  initLight() {
    const s = this.s, Lb = Math.min(s.nmax - 1, s.fineL - 1, s.lmax - 1);
    this.ang = angularFactors(s.lmax);
    this.bound = [];
    for (let l = 0; l <= Lb; l++) this.boundStates(this.ch[l], s.nmax - l).forEach((b, k) => this.bound.push({ n: l + 1 + k, l, ...b }));
    // q_b = h·sym(M·r)·b, so ⟨b|r|u⟩ = q_b·u ; p_b = h·M·b, so ⟨b|u⟩ = p_b·u
    for (const B of this.bound) {
      const c = this.ch[B.l], N = c.N, q = new Float64Array(N), p = bandMul(c.M, B.v, N);
      for (let i = 0; i < N; i++) {
        let x = c.M.d0[i] * c.r[i] * B.v[i];
        if (i >= 1) x += c.M.d1[i - 1] * 0.5 * (c.r[i - 1] + c.r[i]) * B.v[i - 1];
        if (i < N - 1) x += c.M.d1[i] * 0.5 * (c.r[i] + c.r[i + 1]) * B.v[i + 1];
        q[i] = x * c.h; p[i] *= c.h;
      }
      B.q = q; B.p = p;
    }
    const nb = this.bound.length, ne = s.nEps;
    this.eps = Float64Array.from({ length: ne }, (_, j) => s.epsMax * (j + 0.5) / ne);
    this.Szr = new Float64Array(nb * ne); this.Szi = new Float64Array(nb * ne);
    this.Sxr = new Float64Array(nb * ne); this.Sxi = new Float64Array(nb * ne);
    this.phr = new Float64Array(ne).fill(1); this.phi = new Float64Array(ne);
    this.rot = Array.from(this.eps, e => sincos(e * s.dt * s.sampleEvery));
    this.sample(0.5);                                    // trapezoid: half weight at t = 0
  }
  sample(weight) {
    const s = this.s, ne = s.nEps, dts = s.dt * s.sampleEvery * weight, { az, ax } = this.ang;
    for (let b = 0; b < this.bound.length; b++) {
      const B = this.bound[b];
      let zr = 0, zi = 0, xr = 0, xi = 0;
      for (const l of [B.l - 1, B.l + 1]) {
        if (l < 0 || l > s.lmax) continue;
        const c = this.ch[l], q = B.q;
        let a = 0, d = 0; for (let i = 0; i < B.end; i++) { a += q[i] * c.ur[i]; d += q[i] * c.ui[i]; }
        zr += az[B.l][l] * a; zi += az[B.l][l] * d; xr += ax[B.l][l] * a; xi += ax[B.l][l] * d;
      }
      const o = b * ne;
      for (let j = 0; j < ne; j++) {
        const pr = this.phr[j] * dts, pi = this.phi[j] * dts;
        this.Szr[o + j] += zr * pr - zi * pi; this.Szi[o + j] += zr * pi + zi * pr;
        this.Sxr[o + j] += xr * pr - xi * pi; this.Sxi[o + j] += xr * pi + xi * pr;
      }
    }
  }
  advancePhases() {
    if (this.stepCount % (this.s.sampleEvery * 500) === 0) {       // re-anchor exactly now and then
      for (let j = 0; j < this.eps.length; j++) { const [sn, cs] = sincos(this.eps[j] * this.t); this.phr[j] = cs; this.phi[j] = sn; }
      return;
    }
    for (let j = 0; j < this.eps.length; j++) {
      const [sn, cs] = this.rot[j], a = this.phr[j], b = this.phi[j];
      this.phr[j] = a * cs - b * sn; this.phi[j] = a * sn + b * cs;
    }
  }

  spinOrbitHalf() {
    for (const c of this.ch) {
      if (!c.dr) continue;
      const tab = c.so, sq = c.sq, ur = c.ur, ui = c.ui, dr = c.dr, di = c.di;
      // e^{−iθM} on (up, down), M = [[0, s/2], [s/2, −1/2]] = −¼ + Nm, Nm² = κ²:
      // = e^{iθ/4}·(cos κθ − i·(sin κθ/κ)·Nm)
      for (let i = 0; i < c.N; i++) {
        const cs = tab[4 * i], sk = tab[4 * i + 1], pr = tab[4 * i + 2], pi = tab[4 * i + 3];
        const a = 0.25 * sk, b = 0.5 * sq * sk;
        const nur = cs * ur[i] + a * ui[i] + b * di[i], nui = cs * ui[i] - a * ur[i] - b * dr[i];
        const ndr = cs * dr[i] + b * ui[i] - a * di[i], ndi = cs * di[i] - b * ur[i] + a * dr[i];
        ur[i] = nur * pr - nui * pi; ui[i] = nur * pi + nui * pr;
        dr[i] = ndr * pr - ndi * pi; di[i] = ndr * pi + ndi * pr;
      }
    }
  }

  step() {
    const s = this.s;
    if (this.spin) this.spinOrbitHalf();
    for (const c of this.ch) {
      cnApply(c.Pm, c.Q, c.F, c.ur, c.ui, this.yr, this.yi, c.N);
      if (c.dr) cnApply(c.Pm, c.Q, c.F, c.dr, c.di, this.yr, this.yi, c.N);
    }
    if (this.spin) this.spinOrbitHalf();
    this.t += s.dt; this.stepCount++;
    if (s.light && this.stepCount % s.sampleEvery === 0) { this.advancePhases(); this.sample(1); }
  }

  observables() {
    const s = this.s;
    let n = 0, e = 0, rr = 0, down = 0;
    const perL = [];
    for (const c of this.ch) {
      let nl = 0;
      const sets = [[c.ur, c.ui, false]];
      if (c.dr) sets.push([c.dr, c.di, true]);
      for (const [a, b, isDown] of sets) {
        const Ma = bandMul(c.M, a, c.N), Mb = bandMul(c.M, b, c.N), Ka = bandMul(c.K, a, c.N), Kb = bandMul(c.K, b, c.N);
        let p = 0, k = 0, x = 0;
        for (let i = 0; i < c.N; i++) { const m = a[i] * Ma[i] + b[i] * Mb[i]; p += m; x += c.r[i] * m; k += a[i] * Ka[i] + b[i] * Kb[i]; }
        p *= c.h; k *= c.h; x *= c.h;
        n += p; e += k; rr += x; nl += p; if (isDown) down += p;
      }
      if (c.dr) {
        let so = 0;
        for (let i = 0; i < c.N; i++) {
          const xi = 1 / (2 * C * C * c.r[i] ** 3);
          so += xi * (c.sq * (c.ur[i] * c.dr[i] + c.ui[i] * c.di[i]) - 0.5 * (c.dr[i] ** 2 + c.di[i] ** 2));
        }
        e += so * c.h;
      }
      perL.push(nl / this.norm0);
    }
    const o = { t: this.t, tFs: this.t * FS_PER_AU, inBox: n / this.norm0, gone: 1 - n / this.norm0,
      energyEv: e / n * HARTREE_EV, meanRNm: rr / n * A0_NM, spinFlipped: down / this.norm0, perL };
    if (s.light) {
      let bnd = 0;
      for (const B of this.bound) {
        const c = this.ch[B.l];
        let x = 0, y = 0; for (let i = 0; i < B.end; i++) { x += B.p[i] * c.ur[i]; y += B.p[i] * c.ui[i]; }
        bnd += x * x + y * y;
      }
      o.boundShare = bnd / this.norm0;
      const cap = this.captureNow();
      o.captured = cap.total; o.lightEnergyEv = cap.energyEv;
    }
    return o;
  }

  // Capture so far: dP/dω = (2/(3πc³))·ω³·(|S_z|² + 2|S_x|²), ω = ε − E_b.
  captureNow(withSpectra = false) {
    const s = this.s, ne = s.nEps, de = s.epsMax / ne, k = 2 / (3 * Math.PI * C ** 3);
    let total = 0, en = 0;
    const byState = [];
    for (let b = 0; b < this.bound.length; b++) {
      const B = this.bound[b], o = b * ne;
      let pz = 0, px = 0, pe = 0;
      const spec = withSpectra ? new Float64Array(ne) : null;
      for (let j = 0; j < ne; j++) {
        const w = this.eps[j] - B.E, w3 = k * w * w * w * de / this.norm0;
        const a = w3 * (this.Szr[o + j] ** 2 + this.Szi[o + j] ** 2), c = w3 * 2 * (this.Sxr[o + j] ** 2 + this.Sxi[o + j] ** 2);
        pz += a; px += c; pe += (a + c) * w; if (spec) spec[j] = (a + c) / de;
      }
      byState.push({ n: B.n, l: B.l, E: B.E, P: pz + px, Pm0: pz, Pm1: px, spec });
      total += pz + px; en += pe;
    }
    return { total, energyEv: en * HARTREE_EV, byState };
  }

  // Precomputed pixel lookups for a half-slice (x ≥ 0) through the axis, ±half a₀ along the axis.
  makeView(nx, nz, half) {
    const L = this.s.lmax, pix = [];
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = half * (ix + 0.5) / nx, z = half - 2 * half * (iz + 0.5) / nz, r = Math.sqrt(x * x + z * z);
      pix.push({ r, P: Float32Array.from(legendreAll(L, r > 0 ? z / r : 1), p => p / Math.sqrt(2 * Math.PI)) });
    }
    return { nx, nz, half, pix };
  }
  // log10 of the electron density (a₀⁻³) in the view (spin-up part; the spin-flipped part is listed
  // in the numbers and is far too small to change a pixel).
  densityImage(view) {
    const L = this.s.lmax, img = new Float32Array(view.nx * view.nz);
    view.pix.forEach((p, k) => {
      let re = 0, im = 0;
      for (let l = 0; l <= L; l++) {
        const c = this.ch[l], x = p.r / c.h - 1, j = Math.floor(x);
        let a, b;
        if (x < 0) { const f = p.r / c.h; a = f * c.ur[0]; b = f * c.ui[0]; }
        else if (j >= c.N - 1) { a = 0; b = 0; }
        else { const f = x - j; a = c.ur[j] + f * (c.ur[j + 1] - c.ur[j]); b = c.ui[j] + f * (c.ui[j + 1] - c.ui[j]); }
        const P = p.P[l] / Math.max(p.r, 1e-9);
        re += a * P; im += b * P;
      }
      const d = (re * re + im * im) / this.norm0;
      img[k] = d > 0 ? Math.log10(d) : -99;
    });
    return img;
  }

  // ---------------------------------------------------------------------------
  // After the collision
  // ---------------------------------------------------------------------------
  // The captured electron's state, traced over the photon: ρ_bc = k∫dω ω³ D̃_b(ω)·D̃_c*(ω).
  // The same photon energy ω means electron energies ε_b = ω + E_b and ε_c = ω + E_c.
  capturedState() {
    const s = this.s, ne = s.nEps, de = s.epsMax / ne, k = 2 / (3 * Math.PI * C ** 3), nb = this.bound.length;
    const at = (Sr, Si, b, e) => {
      const x = e / de - 0.5, j = Math.floor(x);
      if (j < 0 || j >= ne - 1) return [0, 0];
      const f = x - j, o = b * ne + j;
      return [Sr[o] + f * (Sr[o + 1] - Sr[o]), Si[o] + f * (Si[o + 1] - Si[o])];
    };
    const z = Array.from({ length: nb }, () => new Float64Array(2 * nb)), x = Array.from({ length: nb }, () => new Float64Array(2 * nb));
    for (let b = 0; b < nb; b++) for (let c = b; c < nb; c++) {
      const Bb = this.bound[b], Bc = this.bound[c];
      let zr = 0, zi = 0, xr = 0, xi = 0;
      for (let j = 0; j < ne; j++) {
        const w = this.eps[j] - Bb.E, w3 = k * w * w * w * de / this.norm0, ec = w + Bc.E;
        const ar = this.Szr[b * ne + j], ai = this.Szi[b * ne + j], [cr, ci] = at(this.Szr, this.Szi, c, ec);
        zr += w3 * (ar * cr + ai * ci); zi += w3 * (ai * cr - ar * ci);
        if (Bb.l >= 1 && Bc.l >= 1) {
          const br = this.Sxr[b * ne + j], bi = this.Sxi[b * ne + j], [dr, di] = at(this.Sxr, this.Sxi, c, ec);
          xr += w3 * (br * dr + bi * di); xi += w3 * (bi * dr - br * di);
        }
      }
      z[b][2 * c] = zr; z[b][2 * c + 1] = zi; z[c][2 * b] = zr; z[c][2 * b + 1] = -zi;
      x[b][2 * c] = xr; x[b][2 * c + 1] = xi; x[c][2 * b] = xr; x[c][2 * b + 1] = -xi;
    }
    return { z, x };
  }
  // log10 density of the captured electron (given that its photon came out), τ after the collision.
  capturedImage(nx, nz, half, rho, tau) {
    const B = this.bound, nb = B.length, L = Math.max(...B.map(b => b.l));
    let tr = 0; for (let b = 0; b < nb; b++) tr += rho.z[b][2 * b] + 2 * rho.x[b][2 * b];
    if (!(tr > 0)) return null;
    const img = new Float32Array(nx * nz), ph = B.map(b => sincos(-b.E * tau)), h = this.ch[0].h;
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = half * (ix + 0.5) / nx, z = half - 2 * half * (iz + 0.5) / nz, r = Math.sqrt(x * x + z * z);
      const mu = r > 0 ? z / r : 1, P0 = legendreAll(L, mu), P1 = legendre1All(L, mu);
      const g = r / h - 1, j = Math.max(0, Math.floor(g)), f = g < 0 ? 0 : g - j;
      const R = B.map(b => { if (j >= b.v.length - 1) return 0; if (g < 0) return b.v[0] / h; return (b.v[j] + f * (b.v[j + 1] - b.v[j])) / r; });
      let d = 0;
      for (let b = 0; b < nb; b++) for (let c = 0; c < nb; c++) {
        const pr = ph[b][1] * ph[c][1] + ph[b][0] * ph[c][0], pi = ph[b][0] * ph[c][1] - ph[b][1] * ph[c][0];
        d += R[b] * R[c] * P0[B[b].l] * P0[B[c].l] / (2 * Math.PI) * (rho.z[b][2 * c] * pr - rho.z[b][2 * c + 1] * pi);
        if (B[b].l >= 1 && B[c].l >= 1) d += R[b] * R[c] * P1[B[b].l] * P1[B[c].l] / Math.PI * (rho.x[b][2 * c] * pr - rho.x[b][2 * c + 1] * pi);
      }
      d /= tr;
      img[iz * nx + ix] = d > 0 ? Math.log10(d) : -99;
    }
    return img;
  }

  // Rates between the grid's bound shapes from the same coupling (golden rule, summed over the final
  // m and both photon polarisations), then deterministic rate equations for the cascade.
  rates() {
    const B = this.bound, NS = FS_PER_AU * 1e-6, out = [];
    for (let a = 0; a < B.length; a++) for (let b = 0; b < B.length; b++) {
      if (B[b].n >= B[a].n || Math.abs(B[a].l - B[b].l) !== 1) continue;
      const w = B[a].E - B[b].E;
      let d = 0; const end = Math.min(B[a].end, B[b].end);
      for (let i = 0; i < end; i++) d += B[a].v[i] * B[b].q[i];
      const A = 4 / 3 * w ** 3 / C ** 3 * Math.max(B[a].l, B[b].l) / (2 * B[a].l + 1) * d * d;
      out.push({ a, b, A: A / NS, w });
    }
    return out;
  }
  lifetimes() {
    const R = this.rates(), tot = new Float64Array(this.bound.length);
    for (const r of R) tot[r.a] += r.A;
    return this.bound.map((b, i) => ({ n: b.n, l: b.l, E: b.E, tauNs: tot[i] > 0 ? 1 / tot[i] : Infinity }));
  }
  cascade(byState, tMaxNs = 5000) {
    const B = this.bound, nb = B.length, R = this.rates();
    let p = Float64Array.from(byState, x => x.P);
    const total = p.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return { curve: [], lines: [] };
    const lines = new Map();
    const deriv = (q, tally) => {
      const d = new Float64Array(nb);
      for (const r of R) {
        const f = r.A * q[r.a]; d[r.a] -= f; d[r.b] += f;
        if (tally) {
          const key = `${B[r.a].n}-${B[r.b].n}`;
          let e = lines.get(key);
          if (!e) { e = { from: B[r.a].n, to: B[r.b].n, nm: 2 * Math.PI * C / r.w * A0_NM, count: 0 }; lines.set(key, e); }
          e.count += f * tally;
        }
      }
      return d;
    };
    const i1 = B.findIndex(x => x.n === 1), i2 = B.findIndex(x => x.n === 2 && x.l === 0);
    const snap = t => ({ tNs: t, excited: (total - p[i1] - p[i2]) / total, in1s: p[i1] / total, in2s: p[i2] / total });
    const curve = [snap(0)];
    let t = 0, dt = 0.01, next = 0.05;
    while (t < tMaxNs) {
      const k1 = deriv(p), p2 = p.map((x, i) => x + 0.5 * dt * k1[i]), k2 = deriv(p2);
      const p3 = p.map((x, i) => x + 0.5 * dt * k2[i]), k3 = deriv(p3), p4 = p.map((x, i) => x + dt * k3[i]), k4 = deriv(p4);
      // photons counted with the same RK4 weights as the populations
      deriv(p, dt / 6); deriv(p2, dt / 3); deriv(p3, dt / 3); deriv(p4, dt / 6);
      p = p.map((x, i) => x + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      t += dt;
      if (t >= next) { curve.push(snap(t)); next *= 1.2; }
      if (t > 2 && dt < 0.05) dt = 0.05;
      if (t > 100 && dt < 0.5) dt = 0.5;
    }
    return { curve, lines: [...lines.values()].map(x => ({ ...x, perCapture: x.count / total })).sort((a, b) => b.perCapture - a.perCapture) };
  }
}
