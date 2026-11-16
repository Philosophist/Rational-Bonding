// The well bubble: each proton's electron worked out on its own grid, from Schrödinger's equation.
// Pure maths, no DOM, so it can be tested (wells.test.mjs). Atomic units (Bohr radius a₀, hartree,
// ħ = mₑ = e = 1) unless a name says otherwise.
//
// The idea (Steve, 2026-11-14): instead of one even grid over the whole 80 nm system (hundreds of
// billions of points), give every proton a bubble: a sphere WELL_R across, with a radial grid that
// is very fine at the proton and coarse at the edge, times the spherical harmonics up to l = LMAX.
//
// 1. The well on its own. For each l the radial equation −½u″ + [l(l+1)/2r² − 1/r]·u = E·u is put
//    on the grid (finite differences, u = 0 at the proton and at the bubble's wall; with the
//    reduced mass, so the proton's own small swing is included) and solved for
//    every standing wave below E_CUT. Nothing is pasted in: the low ones come out as the textbook
//    orbitals (1s at −0.5 hartree, 2p living 1.6 ns, ...) and the ones above zero are the bubble's
//    share of the free electron's waves. Together they are the bubble's alphabet ("basis").
// 2. Everything else in the system tilts and dents the well. Every other charge's pull, expanded
//    about the proton, is a tilt (the uniform part of its field, E·r) and a dent (how that field
//    changes across the atom, the quadrupole −½·r·T·r). These mix the standing waves: the electron's
//    state is a set of amplitudes over the alphabet, stepped exactly through time each frame
//    (Chebyshev expansion of e^{−iHt}, accurate to rounding for any step).
// 3. A settled wave costs almost nothing. With no tilt worth counting, each amplitude only turns at
//    its own frequency, which is done in one multiply. Heavy stepping happens only while something
//    disturbs the bubble.
// 4. Light. An amplitude in an upper standing wave leaks away at the rate the dipole overlaps give
//    (4ω³|⟨b|r|a⟩|²/3c³ to each lower one b), so the chance that a photon leaves right now is each
//    wave's share times its rate (the quantum-jump method). Spontaneous emission itself comes from
//    the quantum theory of light, not from Schrödinger's equation; this is its standard result.
// 5. The point. In pilot-wave (de Broglie–Bohm) theory the electron is a point carried by its wave's
//    flow, v = Im(∇ψ/ψ). The bubble gives ψ anywhere inside it, so the point can ride it.
//
// Simplified, and flagged: the bubble's wall is hard (a wave that reaches it reflects; the game
// frees an electron whose point reaches the wall instead); the pull of the other charges is taken
// to second order (tilt and dent), which is very good for charges outside the cloud and rough for
// a charge passing through it; spin and fine structure are left out; the 2s–2p Lamb shift and the
// 2s two-photon rate (both quantum electrodynamics) are added from measurement.

export const C_AU = 137.035999;
export const HARTREE = 27.211386;          // eV
export const T_AU_FS = 0.02418884;         // fs per atomic unit of time
export const F_AU = 514.220675;            // V/nm per atomic unit of field
export const A0_NM = 0.0529177;            // nm per a₀
export const LAMB_AU = 4.3748e-6 / HARTREE;   // 2s above 2p (QED)
export const TWO_PHOTON_2S = 8.2291 * T_AU_FS * 1e-15;   // 2s → 1s by two photons, per a.u. of time (QED)

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const fact = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
// Associated Legendre P_l^m(x), m ≥ 0, Condon–Shortley phase (as the shader's).
export function legendre(l, m, x) {
  let pmm = 1; const s = Math.sqrt(Math.max(0, 1 - x * x)); let f = 1;
  for (let i = 0; i < m; i++) { pmm *= -f * s; f += 2; }
  if (l === m) return pmm;
  let pm1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pm1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) { pll = (x * (2 * ll - 1) * pm1 - (ll + m - 1) * pmm) / (ll - m); pmm = pm1; pm1 = pll; }
  return pll;
}
// Real spherical harmonics in the renderer's convention: the polar axis is y, φ = atan2(z, x),
// m > 0 goes with cos(mφ), m < 0 with sin(|m|φ). The angular normalisation, with √2 for m ≠ 0.
export const angNorm = (l, m) => { const am = Math.abs(m); return Math.sqrt((2 * l + 1) / (4 * Math.PI) * fact(l - am) / fact(l + am)) * (m ? Math.SQRT2 : 1); };
// All real Y_lm (l ≤ L) at unit vector u, into out[l² + l + m].
export function realY(L, ux, uy, uz, out) {
  const phi = Math.atan2(uz, ux);
  for (let l = 0; l <= L; l++) for (let m = -l; m <= l; m++) {
    const am = Math.abs(m), P = legendre(l, am, uy);
    out[l * l + l + m] = angNorm(l, m) * P * (m > 0 ? Math.cos(am * phi) : m < 0 ? Math.sin(am * phi) : 1);
  }
  return out;
}
const chOf = (l, m) => l * l + l + m;

// Gauss–Legendre nodes and weights on [−1, 1].
function gaussLegendre(n) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (z * p1 - p0) / (z * z - 1);
      const dz = p1 / dp; z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = z; w[i] = 2 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}

// ---------------------------------------------------------------------------
// 1. The well on its own: the radial standing waves of each l
// ---------------------------------------------------------------------------
// The grid: r_i = r0·(e^{i·h} − 1), i = 0 … N + 1, from the proton (r = 0) to the wall (r = R):
// spacing about 0.001 a₀ at the proton and 0.3 a₀ at the wall.
function makeGrid(R, N, r0) {
  const h = Math.log(R / r0 + 1) / (N + 1), r = new Float64Array(N + 2);
  for (let i = 0; i <= N + 1; i++) r[i] = r0 * (Math.exp(i * h) - 1);
  r[N + 1] = R;
  return r;
}
// The radial Hamiltonian for one l, as a symmetric tridiagonal matrix (diag d, off-diagonal e):
// finite differences on the uneven grid, made symmetric by the cells' widths (w = √width · u).
// The electron and proton turn about their shared centre, so the electron moves as if it were a
// little lighter (the reduced mass μ = mₑ·m_p/(mₑ + m_p)); that is why real hydrogen's lines sit
// 0.05% longer than an infinitely heavy proton would give.
export const MU = 1 / (1 + 1 / 1836.15267343);
function radialMatrix(r, l, N) {
  const d = new Float64Array(N), e = new Float64Array(N), M = new Float64Array(N);
  for (let i = 1; i <= N; i++) M[i - 1] = 0.5 * (r[i + 1] - r[i - 1]);
  for (let i = 1; i <= N; i++) {
    const hp = r[i + 1] - r[i], hm = r[i] - r[i - 1];
    d[i - 1] = (0.5 / MU * (1 / hp + 1 / hm)) / M[i - 1] + l * (l + 1) / (2 * MU * r[i] * r[i]) - 1 / r[i];
    if (i < N) e[i - 1] = -0.5 / MU / hp / Math.sqrt(M[i - 1] * M[i]);
  }
  return { d, e, M };
}
// Eigenvalues of a symmetric tridiagonal matrix below x (Sturm count).
function countBelow(d, e, x) {
  let c = 0, q = 1;
  for (let i = 0; i < d.length; i++) {
    q = d[i] - x - (i ? e[i - 1] * e[i - 1] / q : 0);
    if (q === 0) q = 1e-300;
    if (q < 0) c++;
  }
  return c;
}
function eigenvalue(d, e, k, lo, hi) {   // the k-th (from 0) eigenvalue, by bisection
  for (let it = 0; it < 200; it++) {
    const mid = 0.5 * (lo + hi);
    if (countBelow(d, e, mid) > k) hi = mid; else lo = mid;
    if (hi - lo < 1e-15 * Math.max(1, Math.abs(mid))) break;
  }
  return 0.5 * (lo + hi);
}
// Its eigenvector, by inverse iteration (tridiagonal solves).
function eigenvector(d, e, lam) {
  const n = d.length, x = new Float64Array(n).fill(1);
  const sh = lam + 1e-13 * Math.max(1, Math.abs(lam));
  for (let it = 0; it < 4; it++) {
    const c = new Float64Array(n), y = new Float64Array(n);
    let b = d[0] - sh; if (b === 0) b = 1e-300;
    y[0] = x[0] / b;
    for (let i = 1; i < n; i++) {
      c[i - 1] = e[i - 1] / b;
      b = d[i] - sh - e[i - 1] * c[i - 1]; if (b === 0) b = 1e-300;
      y[i] = (x[i] - e[i - 1] * y[i - 1]) / b;
    }
    for (let i = n - 2; i >= 0; i--) y[i] -= c[i] * y[i + 1];
    let s = 0; for (let i = 0; i < n; i++) s += y[i] * y[i];
    s = 1 / Math.sqrt(s);
    for (let i = 0; i < n; i++) x[i] = y[i] * s;
  }
  // sign: positive near the proton, like the textbook radial functions
  let k = 0; while (k < n - 1 && Math.abs(x[k]) < 1e-8) k++;
  if (x[k] < 0) for (let i = 0; i < n; i++) x[i] = -x[i];
  return x;
}

// ---------------------------------------------------------------------------
// The bubble's alphabet: every standing wave (l, m, radial index k) below E_CUT
// ---------------------------------------------------------------------------
// opts: R (a₀, the bubble's radius), N (radial points), LMAX, ECUT (hartree), lamb (add the Lamb shift).
export function buildWell(opts = {}) {
  const nearCap = opts.nearCap ?? 260, R = opts.R ?? 120, N = opts.N ?? 1400, LMAX = opts.LMAX ?? 5, ECUT = opts.ECUT ?? 0.25, r0 = opts.r0 ?? 0.4;
  const r = makeGrid(R, N, r0), ri = r.subarray(1, N + 1);
  const rad = [];   // rad[l] = { E: [...], w: [Float64Array...] }  (w_i = √cell · u_i, Σ w² = 1)
  for (let l = 0; l <= LMAX; l++) {
    const { d, e } = radialMatrix(r, l, N);
    const n = countBelow(d, e, ECUT), E = [], w = [];
    for (let k = 0; k < n; k++) {
      const lam = eigenvalue(d, e, k, -1, ECUT);
      E.push(lam); w.push(eigenvector(d, e, lam));
    }
    if (opts.lamb !== false && l === 0 && n > 1 && E[1] < 0) E[1] += LAMB_AU;   // 2s, from QED
    rad.push({ E, w, M: radialMatrix(r, l, N).M });
  }
  // States, grouped by channel (l, m); within a channel by k.
  const states = [], start = new Int32Array((LMAX + 1) ** 2 + 1);
  for (let l = 0; l <= LMAX; l++) for (let m = -l; m <= l; m++) {
    start[chOf(l, m)] = states.length;
    rad[l].E.forEach((E, k) => states.push({ l, m, k, E, n: E < 0 ? k + l + 1 : 0 }));
  }
  start[(LMAX + 1) ** 2] = states.length;
  // Radial overlaps ⟨l k| r^p |l' k'⟩, p = 1 (Δl = ±1) and p = 2 (Δl = 0, ±2).
  const radEl = (la, lb, p) => {
    const A = rad[la], B = rad[lb], out = [];
    for (let a = 0; a < A.E.length; a++) {
      const row = new Float64Array(B.E.length);
      for (let b = 0; b < B.E.length; b++) { let s = 0; const wa = A.w[a], wb = B.w[b]; for (let i = 0; i < N; i++) s += wa[i] * wb[i] * (p === 1 ? ri[i] : ri[i] * ri[i]); row[b] = s; }
      out.push(row);
    }
    return out;
  };
  const R1 = {}, R2 = {};
  for (let l = 0; l < LMAX; l++) { R1[`${l},${l + 1}`] = radEl(l, l + 1, 1); }
  for (let l = 0; l <= LMAX; l++) { R2[`${l},${l}`] = radEl(l, l, 2); if (l + 2 <= LMAX) R2[`${l},${l + 2}`] = radEl(l, l + 2, 2); }
  const rad1 = (la, lb, a, b) => (la < lb ? R1[`${la},${lb}`][a][b] : R1[`${lb},${la}`][b][a]);
  const rad2 = (la, lb, a, b) => (la <= lb ? R2[`${la},${lb}`][a][b] : R2[`${lb},${la}`][b][a]);

  // Angular overlaps ⟨Y_a| n_q |Y_b⟩ (q = x, y, z) and ⟨Y_a| n_i n_j |Y_b⟩, by quadrature.
  const NC = (LMAX + 1) ** 2, NG = 2 * LMAX + 6, NP = 4 * LMAX + 12, gl = gaussLegendre(NG);
  const A1 = [0, 1, 2].map(() => new Float64Array(NC * NC));
  const QK = [[0, 0], [1, 1], [2, 2], [0, 1], [0, 2], [1, 2]], A2 = QK.map(() => new Float64Array(NC * NC));
  const Y = new Float64Array(NC);
  for (let g = 0; g < NG; g++) for (let p = 0; p < NP; p++) {
    const uy = gl.x[g], s = Math.sqrt(1 - uy * uy), ph = 2 * Math.PI * p / NP, n = [s * Math.cos(ph), uy, s * Math.sin(ph)];
    const wt = gl.w[g] * 2 * Math.PI / NP;
    realY(LMAX, n[0], n[1], n[2], Y);
    for (let a = 0; a < NC; a++) { if (Y[a] === 0) continue; const ya = Y[a] * wt;
      for (let b = 0; b < NC; b++) { const yy = ya * Y[b]; if (!yy) continue;
        for (let q = 0; q < 3; q++) A1[q][a * NC + b] += yy * n[q];
        for (let q = 0; q < 6; q++) A2[q][a * NC + b] += yy * n[QK[q][0]] * n[QK[q][1]];
      } }
  }
  const lOfCh = c => Math.floor(Math.sqrt(c));
  // Channel pairs that couple: dipole (Δl = ±1), quadrupole (Δl = 0, ±2). Each keeps its angular numbers.
  const pairs1 = [], pairs2 = [];
  for (let a = 0; a < NC; a++) for (let b = 0; b < NC; b++) {
    const la = lOfCh(a), lb = lOfCh(b);
    if (Math.abs(la - lb) === 1) { const q = [0, 1, 2].map(i => A1[i][a * NC + b]); if (q.some(x => Math.abs(x) > 1e-12)) pairs1.push({ a, b, la, lb, q }); }
    if (la === lb || Math.abs(la - lb) === 2) { const q = QK.map((_, i) => A2[i][a * NC + b]); if (q.some(x => Math.abs(x) > 1e-12)) pairs2.push({ a, b, la, lb, q }); }
  }
  // Each l pair's radial block as a flat matrix for the stepping (rows: a's k, columns: b's k).
  const block = (la, lb, p) => {
    const na = rad[la].E.length, nb = rad[lb].E.length, B = new Float64Array(na * nb);
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) B[i * nb + j] = p === 1 ? rad1(la, lb, i, j) : rad2(la, lb, i, j);
    return B;
  };
  const blocks1 = new Map(), blocks2 = new Map();
  for (const P of pairs1) { const k = `${P.la},${P.lb}`; if (!blocks1.has(k)) blocks1.set(k, block(P.la, P.lb, 1)); }
  for (const P of pairs2) { const k = `${P.la},${P.lb}`; if (!blocks2.has(k)) blocks2.set(k, block(P.la, P.lb, 2)); }

  // 4. Light: each standing wave's rate to every lower one, and its total.
  const NS = states.length, gamma = new Float64Array(NS), down = [];
  for (let a = 0; a < NS; a++) {
    const A = states[a], list = [];
    for (let b = 0; b < NS; b++) {
      const B = states[b];
      if (B.E >= A.E || Math.abs(A.l - B.l) !== 1) continue;
      const ca = chOf(A.l, A.m), cb = chOf(B.l, B.m), rr = rad1(B.l, A.l, B.k, A.k);
      let d2 = 0; for (let q = 0; q < 3; q++) d2 += (A1[q][cb * NC + ca] * rr) ** 2;
      if (d2 < 1e-20) continue;
      const w = A.E - B.E, rate = 4 / 3 * w ** 3 / C_AU ** 3 * d2;
      list.push({ b, rate }); gamma[a] += rate;
    }
    if (A.l === 0 && A.k === 1 && A.E < 0) gamma[a] += TWO_PHOTON_2S;
    down.push(list);
  }
  const energies = Float64Array.from(states, x => x.E);
  const index = (n, l, m) => { if (l > LMAX || n - l - 1 >= rad[l].E.length) return -1; return start[chOf(l, m)] + (n - l - 1); };
  return { nearCap, energies, R, N, LMAX, ECUT, r, ri, rad, states, start, NC, pairs1, pairs2, blocks1, blocks2, rad1, rad2, A1, A2, QK, gamma, down, index, h: Math.log(R / r0 + 1) / (N + 1), r0 };
}

// ---------------------------------------------------------------------------
// A wave in the bubble: amplitudes over the alphabet
// ---------------------------------------------------------------------------
export function pureState(W, n, l, m) {
  const s = { re: new Float64Array(W.states.length), im: new Float64Array(W.states.length) };
  const i = W.index(n, l, m);
  if (i >= 0) s.re[i] = 1;
  return s;
}
// A state |n l⟩ whose m is counted about `axis` (a unit vector) rather than about y: its
// amplitudes over the bubble's real harmonics, by projecting the turned harmonic (quadrature).
export function turnedState(W, n, l, m, axis) {
  const s = pureState(W, n, 0, 0); s.re.fill(0);
  const k = n - l - 1; if (l > W.LMAX || k >= W.rad[l].E.length) return pureState(W, 1, 0, 0);
  const y = axis, x = norm3(cross3(Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], y)), z = cross3(x, y);
  const NG = 2 * l + 4, NP = 4 * l + 8, gl = gaussLegendre(NG), Yw = new Float64Array((l + 1) ** 2), Yt = new Float64Array((l + 1) ** 2);
  const amp = new Float64Array(2 * l + 1);
  for (let g = 0; g < NG; g++) for (let p = 0; p < NP; p++) {
    const uy = gl.x[g], sn = Math.sqrt(1 - uy * uy), ph = 2 * Math.PI * p / NP, u = [sn * Math.cos(ph), uy, sn * Math.sin(ph)];
    const wt = gl.w[g] * 2 * Math.PI / NP;
    realY(l, u[0], u[1], u[2], Yw);
    realY(l, dot3(u, x), dot3(u, y), dot3(u, z), Yt);   // the harmonic in the axis's own frame
    for (let mm = -l; mm <= l; mm++) amp[mm + l] += wt * Yw[chOf(l, mm)] * Yt[chOf(l, m)];
  }
  for (let mm = -l; mm <= l; mm++) s.re[W.start[chOf(l, mm)] + k] = amp[mm + l];
  return s;
}
export function normSq(s) { let t = 0; for (let i = 0; i < s.re.length; i++) t += s.re[i] * s.re[i] + s.im[i] * s.im[i]; return t; }
export function normalize(s) { const k = 1 / Math.sqrt(Math.max(normSq(s), 1e-300)); for (let i = 0; i < s.re.length; i++) { s.re[i] *= k; s.im[i] *= k; } return s; }

// The tilt and dent at the proton from other charges: charges = [{ rel: [x, y, z] (a₀, from the
// proton), q }]. F (a.u.) is the field there; T_ij = Σ q·(3R̂_iR̂_j − δ_ij)/R³. The electron's energy
// in them is E·r − ½·r·T·r (it has charge −1). A charge closer than rMin is held at rMin.
export function tiltAndDent(charges, rMin = 2) {
  const F = [0, 0, 0], T = [0, 0, 0, 0, 0, 0];   // xx, yy, zz, xy, xz, yz
  for (const c of charges) {
    const R = Math.max(Math.hypot(c.rel[0], c.rel[1], c.rel[2]), 1e-9), Re = Math.max(R, rMin), u = c.rel.map(v => v / R);
    for (let i = 0; i < 3; i++) F[i] -= c.q * u[i] / (Re * Re);
    const k = c.q / Re ** 3;
    T[0] += k * (3 * u[0] * u[0] - 1); T[1] += k * (3 * u[1] * u[1] - 1); T[2] += k * (3 * u[2] * u[2] - 1);
    T[3] += k * 3 * u[0] * u[1]; T[4] += k * 3 * u[0] * u[2]; T[5] += k * 3 * u[1] * u[2];
  }
  return { F, T };
}

// y = H·x over the first NS states (channels up to lTop), H = E_a + E·r − ½ r·T·r. Per pair of l
// values, each radial block multiplies a channel's amplitudes once; the angular numbers then share
// that result out to every channel it couples to.
function groupPairs(pairs, lTop) {
  const by = new Map();   // key: `${lb},${b}` → { la, lb, b, to: [[pairIndex, a]] }
  pairs.forEach((P, i) => {
    if (P.la > lTop || P.lb > lTop) return;
    const k = `${P.la},${P.b}`;
    let g = by.get(k); if (!g) { g = { la: P.la, lb: P.lb, b: P.b, to: [] }; by.set(k, g); }
    g.to.push([i, P.a]);
  });
  return [...by.values()];
}
function makeOp(W, F, T, lTop) {
  const key = lTop;
  if (!W._groups) W._groups = new Map();
  if (!W._groups.has(key)) W._groups.set(key, { g1: groupPairs(W.pairs1, lTop), g2: groupPairs(W.pairs2, lTop) });
  const { g1, g2 } = W._groups.get(key);
  const s1 = W.pairs1.map(P => P.q[0] * F[0] + P.q[1] * F[1] + P.q[2] * F[2]);
  // −½ Σ_ij T_ij n_i n_j, with the off-diagonal ij counted twice
  const s2 = W.pairs2.map(P => -0.5 * (T[0] * P.q[0] + T[1] * P.q[1] + T[2] * P.q[2] + 2 * (T[3] * P.q[3] + T[4] * P.q[4] + T[5] * P.q[5])));
  const tiltOn = Math.hypot(...F) > 0, dentOn = T.some(x => x !== 0);
  const NS = W.start[(lTop + 1) ** 2], E = W.energies;
  const tmpR = new Float64Array(64), tmpI = new Float64Array(64);
  return function apply(xr, xi, yr, yi) {
    for (let a = 0; a < NS; a++) { yr[a] = E[a] * xr[a]; yi[a] = E[a] * xi[a]; }
    const add = (groups, coef, blocks) => {
      for (const G of groups) {
        const B = blocks.get(`${G.la},${G.lb}`), ob = W.start[G.b], nb = W.start[G.b + 1] - ob, na = W.rad[G.la].E.length;
        let any = false; for (const [i] of G.to) if (coef[i]) { any = true; break; }
        if (!any) continue;
        for (let i = 0; i < na; i++) {
          let sr = 0, si = 0; const row = i * nb;
          for (let j = 0; j < nb; j++) { const v = B[row + j]; sr += v * xr[ob + j]; si += v * xi[ob + j]; }
          tmpR[i] = sr; tmpI[i] = si;
        }
        for (const [p, a] of G.to) {
          const c = coef[p]; if (!c) continue;
          const oa = W.start[a];
          for (let i = 0; i < na; i++) { yr[oa + i] += c * tmpR[i]; yi[oa + i] += c * tmpI[i]; }
        }
      }
    };
    if (tiltOn) add(g1, s1, W.blocks1);
    if (dentOn) add(g2, s2, W.blocks2);
  };
}
// The highest l the wave needs right now: two above the highest l it has any share in.
export function topL(W, s, eps = 1e-9) {
  let top = 0;
  for (let a = 0; a < W.states.length; a++) if (s.re[a] ** 2 + s.im[a] ** 2 > eps && W.states[a].l > top) top = W.states[a].l;
  return Math.min(W.LMAX, top + 2);
}
// A bound on how far the tilt and dent can move any energy (for the Chebyshev scale).
const pullBound = (W, F, T) => Math.hypot(...F) * W.R + 1.5 * Math.hypot(...T) * W.R * W.R;
// The size of the tilt and dent in energy over a typical cloud (used to decide "settled").
export const pullSize = (W, F, T, rTyp) => Math.hypot(...F) * rTyp + 1.5 * Math.hypot(...T) * rTyp * rTyp;

// Bessel functions J_0 … J_K(x) by Miller's backward recurrence.
function besselJ(x, K) {
  const out = new Float64Array(K + 1);
  if (x === 0) { out[0] = 1; return out; }
  const M = 2 * Math.ceil((Math.max(K, x) + 15 + Math.sqrt(40 * Math.max(K, x))) / 2);
  let jp = 0, j = 1e-30, sum = 0;
  const tmp = new Float64Array(M + 2);
  for (let k = M; k >= 1; k--) {
    const jm = 2 * k / x * j - jp; jp = j; j = jm;
    if (k - 1 <= K) tmp[k - 1] = j;
    if (k - 1 > 0 && (k - 1) % 2 === 0) sum += 2 * j;
    if (Math.abs(j) > 1e250) { j *= 1e-250; jp *= 1e-250; sum *= 1e-250; for (let i = 0; i <= K; i++) tmp[i] *= 1e-250; }
  }
  sum += j;   // J_0 counted once
  for (let k = 0; k <= K; k++) out[k] = tmp[k] / sum;
  return out;
}

// Steps the wave s through time t (a.u.) in the tilt F and dent T. Exact up to rounding.
// Returns the work done (matrix–vector products), so the game can watch the cost.
export function stepWave(W, s, F, T, t, lTop = topL(W, s)) {
  const NS = W.start[(lTop + 1) ** 2];
  let Emin = Infinity, Emax = -Infinity;
  for (let a = 0; a < NS; a++) { const E = W.energies[a]; if (E < Emin) Emin = E; if (E > Emax) Emax = E; }
  const pb = pullBound(W, F, T);
  Emin -= pb; Emax += pb;
  const mid = 0.5 * (Emin + Emax), half = 0.5 * (Emax - Emin);
  const settled = pb < 1e-14;
  if (settled) lTop = W.LMAX;
  if (settled) {   // no pull: every amplitude just turns at its own frequency
    for (let a = 0; a < W.states.length; a++) { const ph = -W.energies[a] * t, c = Math.cos(ph), sn = Math.sin(ph), x = s.re[a], y = s.im[a]; s.re[a] = x * c - y * sn; s.im[a] = x * sn + y * c; }
    decay(W, s, t);
    return 0;
  }
  // Split long steps so that each Chebyshev series stays short.
  const pieces = Math.max(1, Math.ceil(half * t / 40)), dt = t / pieces, x = half * dt;
  const K = Math.ceil(x + 12 + 3 * Math.cbrt(x));
  const J = besselJ(x, K), op = makeOp(W, F, T, lTop);
  const t0r = new Float64Array(NS), t0i = new Float64Array(NS), t1r = new Float64Array(NS), t1i = new Float64Array(NS);
  const t2r = new Float64Array(NS), t2i = new Float64Array(NS), accR = new Float64Array(NS), accI = new Float64Array(NS);
  let work = 0;
  // Normalised operator Hn = (H − mid)/half, so the series is Σ (2 − δ_k0)(−i)^k J_k(x) T_k(Hn).
  const applyN = (xr, xi, yr, yi) => { op(xr, xi, yr, yi); for (let a = 0; a < NS; a++) { yr[a] = (yr[a] - mid * xr[a]) / half; yi[a] = (yi[a] - mid * xi[a]) / half; } work++; };
  for (let piece = 0; piece < pieces; piece++) {
    t0r.set(s.re.subarray(0, NS)); t0i.set(s.im.subarray(0, NS));
    for (let a = 0; a < NS; a++) { accR[a] = J[0] * t0r[a]; accI[a] = J[0] * t0i[a]; }
    applyN(t0r, t0i, t1r, t1i);
    // (−i)^1 · 2J_1
    for (let a = 0; a < NS; a++) { accR[a] += 2 * J[1] * t1i[a]; accI[a] -= 2 * J[1] * t1r[a]; }
    let pr = t0r, pi = t0i, cr = t1r, ci = t1i, nr = t2r, ni = t2i;
    for (let k = 2; k <= K; k++) {
      applyN(cr, ci, nr, ni);
      for (let a = 0; a < NS; a++) { nr[a] = 2 * nr[a] - pr[a]; ni[a] = 2 * ni[a] - pi[a]; }
      const c = 2 * J[k], ph = k % 4;   // (−i)^k: 1, −i, −1, i
      for (let a = 0; a < NS; a++) {
        const xr = nr[a], xi = ni[a];
        if (ph === 0) { accR[a] += c * xr; accI[a] += c * xi; }
        else if (ph === 1) { accR[a] += c * xi; accI[a] -= c * xr; }
        else if (ph === 2) { accR[a] -= c * xr; accI[a] -= c * xi; }
        else { accR[a] -= c * xi; accI[a] += c * xr; }
      }
      const tr = pr, ti = pi; pr = cr; pi = ci; cr = nr; ci = ni; nr = tr; ni = ti;
      if (Math.abs(J[k]) < 1e-16 && k > x) break;
    }
    // the overall phase e^{−i·mid·dt}
    const c = Math.cos(-mid * dt), sn = Math.sin(-mid * dt);
    for (let a = 0; a < NS; a++) { s.re[a] = accR[a] * c - accI[a] * sn; s.im[a] = accR[a] * sn + accI[a] * c; }
  }
  // States above lTop hold (next to) nothing; they only turn.
  for (let a = NS; a < W.states.length; a++) { const ph = -W.energies[a] * t, c = Math.cos(ph), sn = Math.sin(ph), x = s.re[a], y = s.im[a]; s.re[a] = x * c - y * sn; s.im[a] = x * sn + y * c; }
  decay(W, s, t);
  return work;
}
// Light leaking out: each upper amplitude shrinks at half its rate (what is lost is the chance
// that the photon has already left).
function decay(W, s, t) {
  for (let a = 0; a < W.states.length; a++) { const g = W.gamma[a]; if (!g) continue; const k = Math.exp(-0.5 * g * t); s.re[a] *= k; s.im[a] *= k; }
}
// The rate (per a.u. of time) that a photon leaves right now, and a pick of which step it is.
export function emissionRate(W, s) {
  let tot = 0; const n2 = normSq(s);
  for (let a = 0; a < W.states.length; a++) tot += W.gamma[a] * (s.re[a] ** 2 + s.im[a] ** 2);
  return tot / Math.max(n2, 1e-300);
}
export function pickJump(W, s, rand = Math.random) {
  let tot = 0;
  for (let a = 0; a < W.states.length; a++) tot += W.gamma[a] * (s.re[a] ** 2 + s.im[a] ** 2);
  let x = rand() * tot;
  for (let a = 0; a < W.states.length; a++) {
    const p = s.re[a] ** 2 + s.im[a] ** 2;
    for (const { b, rate } of W.down[a]) { x -= rate * p; if (x <= 0) return { from: a, to: b, twoPhoton: false }; }
    if (W.states[a].l === 0 && W.states[a].k === 1 && W.states[a].E < 0) { x -= TWO_PHOTON_2S * p; if (x <= 0) return { from: a, to: W.index(1, 0, 0), twoPhoton: true }; }
  }
  return null;
}
// Each standing wave's share, and the largest one.
export function shares(s) {
  const n2 = normSq(s), p = new Float64Array(s.re.length);
  let best = 0;
  for (let a = 0; a < p.length; a++) { p[a] = (s.re[a] ** 2 + s.im[a] ** 2) / n2; if (p[a] > p[best]) best = a; }
  return { p, best };
}
// The share of the electron's wave that is bound (energy below zero).
export const boundShare = (W, s) => { const { p } = shares(s); let b = 0; for (let a = 0; a < p.length; a++) if (W.states[a].E < 0) b += p[a]; return b; };
// The average energy (hartree) without the pull, and the electron's average position (a₀): the
// atom's dipole is −⟨r⟩.
export function meanEnergy(W, s) { const { p } = shares(s); let e = 0; for (let a = 0; a < p.length; a++) e += p[a] * W.states[a].E; return e; }
export function meanPosition(W, s) {
  const out = [0, 0, 0], NC = W.NC, n2 = normSq(s);
  for (const P of W.pairs1) {
    const B = W.blocks1.get(`${P.la},${P.lb}`), oa = W.start[P.a], ob = W.start[P.b], na = W.start[P.a + 1] - oa, nb = W.start[P.b + 1] - ob;
    let sum = 0;
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) sum += B[i * nb + j] * (s.re[oa + i] * s.re[ob + j] + s.im[oa + i] * s.im[ob + j]);
    for (let q = 0; q < 3; q++) out[q] += P.q[q] * sum;
  }
  void NC;
  return out.map(v => v / n2);
}

// ---------------------------------------------------------------------------
// 5. The wave at a point, and the point riding it
// ---------------------------------------------------------------------------
// u_a(r)/r for radial wave k of l at radius r (a₀), interpolated on the grid.
function radialAt(W, l, k, r) {
  if (r >= W.R) return 0;
  const x = Math.log(r / W.r0 + 1) / W.h, i = Math.floor(x), f = x - i, N = W.N, w = W.rad[l].w[k], M = W.rad[l].M;
  // u_i = w_i / √M_i at grid point i (1 … N); u = 0 at 0 and N+1.
  const u = j => (j <= 0 || j > N ? 0 : w[j - 1] / Math.sqrt(M[j - 1]));
  const ui = u(i), uj = u(i + 1), uu = ui + (uj - ui) * f;
  if (r < 1e-9) return 0;
  return uu / r;
}
// For l = 0 near the proton u/r → u′(0), finite: take the limit from the first point.
export function waveAt(W, s, p, active) {
  const r = Math.hypot(p[0], p[1], p[2]);
  if (r >= W.R) return [0, 0];
  const rr = Math.max(r, 1e-6), Y = W._Y || (W._Y = new Float64Array(W.NC));
  realY(W.LMAX, p[0] / rr, p[1] / rr, p[2] / rr, Y);
  let re = 0, im = 0;
  const list = active || W.states.map((_, a) => a);
  for (const a of list) {
    const st = W.states[a], R = radialAt(W, st.l, st.k, Math.max(r, W.r[1])) * Y[chOf(st.l, st.m)];
    re += s.re[a] * R; im += s.im[a] * R;
  }
  return [re, im];
}
// Amplitudes worth counting (share above eps), for quick evaluation.
export function activeList(s, eps = 1e-7) {
  const n2 = normSq(s), out = [];
  for (let a = 0; a < s.re.length; a++) if ((s.re[a] ** 2 + s.im[a] ** 2) / n2 > eps) out.push(a);
  return out;
}
// The flow velocity (a.u.) at p: v = Im(∇ψ/ψ), from the wave's values either side.
export function flowAt(W, s, p, active) {
  const d = 1e-3 * Math.max(0.05, Math.hypot(p[0], p[1], p[2]));
  const w0 = waveAt(W, s, p, active), den = w0[0] * w0[0] + w0[1] * w0[1];
  if (den < 1e-300) return [0, 0, 0];
  const v = [0, 0, 0];
  for (let q = 0; q < 3; q++) {
    const a = [...p], b = [...p]; a[q] += d; b[q] -= d;
    const wa = waveAt(W, s, a, active), wb = waveAt(W, s, b, active);
    const gr = (wa[0] - wb[0]) / (2 * d), gi = (wa[1] - wb[1]) / (2 * d);
    v[q] = (w0[0] * gi - w0[1] * gr) / den;
  }
  return v;
}
// Moves the point for time t (a.u.) with the wave held as it is (the game calls it often, as the
// wave changes). Substeps keep each move small next to the point's distance from the proton.
export function ridePoint(W, s, p, t, active, maxSub = 400) {
  let left = t, n = 0;
  while (left > 0 && n < maxSub) {
    const v = flowAt(W, s, p, active), sp = Math.hypot(...v), r = Math.hypot(...p);
    const dt = Math.min(left, 0.05 * Math.max(r, 0.3) / Math.max(sp, 1e-9));
    // midpoint step
    const mid = [p[0] + 0.5 * dt * v[0], p[1] + 0.5 * dt * v[1], p[2] + 0.5 * dt * v[2]], vm = flowAt(W, s, mid, active);
    p[0] += dt * vm[0]; p[1] += dt * vm[1]; p[2] += dt * vm[2];
    left -= dt; n++;
  }
  return p;
}
// A starting point drawn from |ψ|² (the Born rule), by a short Metropolis walk.
export function samplePoint(W, s, rand = Math.random, steps = 600) {
  const active = activeList(s, 1e-5);
  const { best } = shares(s), st = W.states[best];
  const scale = Math.max(1, st.n ? st.n * st.n : 4);
  let p = [scale * (rand() - 0.5), scale * (rand() - 0.5), scale * (rand() - 0.5)];
  const dens = q => { const w = waveAt(W, s, q, active); return w[0] * w[0] + w[1] * w[1]; };
  let d = dens(p);
  for (let i = 0; i < steps; i++) {
    const q = p.map(v => v + scale * 0.6 * (rand() - 0.5));
    const dq = dens(q);
    if (dq >= d || rand() * d < dq) { p = q; d = dq; }
  }
  return p;
}

// The radial wave of one standing wave as a table at r_j = rmax·(j/(n−1))² (the shader's √r spacing).
export function radialTable(W, a, rmax, n = 128) {
  const st = W.states[a], t = new Float32Array(n);
  for (let j = 0; j < n; j++) { const r = rmax * (j / (n - 1)) ** 2; t[j] = radialAt(W, st.l, st.k, Math.max(r, W.r[1])); }
  return t;
}
// Rough outer reach (a₀) of standing wave a: where 99% of it is inside.
export function reach(W, a) {
  const st = W.states[a], w = W.rad[st.l].w[st.k];
  let acc = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i] * w[i]; if (acc > 0.99) return W.ri[i]; }
  return W.R;
}

// small vector helpers
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// ---------------------------------------------------------------------------
// 3. Cheap stepping: the near waves exactly, the far ones by how they follow
// ---------------------------------------------------------------------------
// Stepping every standing wave each frame costs about 10 ms per atom, mostly spent following
// swings far too fast to see (1s against 2p beats 2.5 million billion times a second). So the
// alphabet is split:
// - near: the standing waves the electron is in, and every one close enough in energy that the
//   tilt and dent can really mix it in (energy gap under NEAR_K times the pull). These are stepped
//   exactly, as above, but over a few dozen waves instead of a thousand.
// - far: the rest. The pull still mixes a little of each into the electron's wave, but so far off
//   in energy that it just follows the pull from moment to moment (adiabatically). That part is
//   worked out directly (first order: c_a = −⟨a|V|ψ⟩/(E_a − E)), and its effect back on the near
//   waves is the second-order shift (for 1s, the energy −½αF² of hydrogen's polarizability).
// The split is the standard one (adiabatic elimination); it is exact to second order in the pull
// for the far waves and exact for the near ones. A settled atom (no pull, nothing changing) costs
// a few hundred multiplies a frame.
export const NEAR_K = 10;
const shellPull = (n, Fm, Tm) => { const r = n ? 1.5 * n * n : 3; return Fm * r + 1.5 * Tm * r * r; };
// Each wave's dipole couplings to every other wave: D[i] = [{ a, q: [x, y, z] }].
function dipoleRows(W) {
  if (W._drows) return W._drows;
  const rows = W.states.map(() => []);
  for (const P of W.pairs1) {
    const B = W.blocks1.get(`${P.la},${P.lb}`), oa = W.start[P.a], ob = W.start[P.b], na = W.start[P.a + 1] - oa, nb = W.start[P.b + 1] - ob;
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) { const v = B[i * nb + j]; if (Math.abs(v) < 1e-14) continue; rows[ob + j].push({ a: oa + i, q: [P.q[0] * v, P.q[1] * v, P.q[2] * v] }); }
  }
  return (W._drows = rows);
}
// The near set for a wave right now: wave a is near if some wave p the electron is in could mix a
// noticeable share into it, share_p·(pull_p/ΔE)² > NEAR_EPS, i.e. ΔE < NEAR_K·pull_p·√share_p.
// At most cap waves (the most strongly mixed first); sorted indices.
export const NEAR_CAP = 260;
function nearSet(W, s, Fm, Tm, cap = W.nearCap || NEAR_CAP) {
  const n2 = normSq(s), pops = [], score = new Map();
  for (let a = 0; a < s.re.length; a++) { const p = (s.re[a] ** 2 + s.im[a] ** 2) / n2; if (p > 1e-7) { pops.push([a, p]); score.set(a, Infinity); } }
  for (const [p, sh] of pops) {
    const st = W.states[p], E = st.E, pull = shellPull(st.n, Fm, Tm), M = Math.max(2e-5, NEAR_K * pull * Math.sqrt(sh));
    for (let a = 0; a < W.states.length; a++) {
      const dE = Math.abs(W.energies[a] - E);
      if (dE < M) { const k = sh * (pull / Math.max(dE, 1e-12)) ** 2; if (!(score.get(a) >= k)) score.set(a, k); }
    }
  }
  let list = [...score.entries()];
  const capped = list.length > cap;
  if (capped) list = list.sort((x, y) => y[1] - x[1]).slice(0, cap);
  const out = Int32Array.from(list.map(x => x[0]).sort((x, y) => x - y));
  // When capped, what must be in the set is only the waves the electron is in (share > 1e-5).
  out.core = capped ? pops.filter(x => x[1] > 1e-5).map(x => x[0]) : out;
  out.capped = capped;
  return out;
}
// The second-order tensors over a near set: H2_ij = Σ_qq' F_q F_q' X[qq'][i][j].
function farTensors(W, near) {
  const d = near.length, rows = dipoleRows(W), isNear = new Uint8Array(W.states.length);
  for (const i of near) isNear[i] = 1;
  const X = Array.from({ length: 9 }, () => new Float64Array(d * d));
  const maps = Array.from(near, i => { const m = new Map(); for (const c of rows[i]) if (!isNear[c.a]) m.set(c.a, c.q); return m; });
  for (let i = 0; i < d; i++) for (let j = i; j < d; j++) {
    const Ei = W.energies[near[i]], Ej = W.energies[near[j]], mi = maps[i], mj = maps[j];
    for (const [a, qi] of mi) {
      const qj = mj.get(a); if (!qj) continue;
      const g = -0.5 * (1 / (W.energies[a] - Ei) + 1 / (W.energies[a] - Ej));
      for (let q = 0; q < 3; q++) for (let r = 0; r < 3; r++) { const v = g * qi[q] * qj[r]; X[q * 3 + r][i * d + j] += v; if (i !== j) X[r * 3 + q][j * d + i] += v; }
    }
  }
  return X;
}
// The electron's wave in one bubble: amplitudes over the alphabet (only the near ones are kept),
// plus what is cached for the current near set.
export function makeWave(W, n, l, m, axis) {
  const s = axis ? turnedState(W, n, l, m, axis) : pureState(W, n, l, m);
  return { s, near: null, key: '', X: null };
}
// The near-set Hamiltonian's pattern (sparse, real symmetric), built when the near set changes:
// for each entry its parts per tilt component (3), dent component (6) and, for small near sets,
// the second-order far-wave part per pair of tilt components (9).
const X_MAX = 80;
function nearPattern(W, near) {
  const d = near.length, pos = new Map(); near.forEach((a, i) => pos.set(a, i));
  const ent = new Map();   // i*d + j → Float64Array(18)
  const get = (i, j) => { const k = i * d + j; let e = ent.get(k); if (!e) { e = new Float64Array(18); ent.set(k, e); } return e; };
  const chs = new Set(Array.from(near, a => chOf(W.states[a].l, W.states[a].m)));
  const fill = (pairs, blocks, off, nq) => {
    for (const P of pairs) {
      if (!chs.has(P.a) || !chs.has(P.b)) continue;
      const B = blocks.get(`${P.la},${P.lb}`), oa = W.start[P.a], ob = W.start[P.b], na = W.start[P.a + 1] - oa, nb = W.start[P.b + 1] - ob;
      for (let i = 0; i < na; i++) { const pi = pos.get(oa + i); if (pi === undefined) continue;
        for (let j = 0; j < nb; j++) { const pj = pos.get(ob + j); if (pj === undefined) continue; const v = B[i * nb + j]; if (Math.abs(v) < 1e-15) continue;
          const e = get(pi, pj); for (let q = 0; q < nq; q++) e[off + q] += P.q[q] * v; } }
    }
  };
  fill(W.pairs1, W.blocks1, 0, 3);
  fill(W.pairs2, W.blocks2, 3, 6);
  if (d <= X_MAX) { const X = farTensors(W, near); for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { let nz = false; for (let q = 0; q < 9; q++) if (X[q][i * d + j]) { nz = true; break; } if (!nz) continue; const e = get(i, j); for (let q = 0; q < 9; q++) e[9 + q] = X[q][i * d + j]; } }
  const keys = [...ent.keys()].sort((x, y) => x - y), nnz = keys.length;
  const rowStart = new Int32Array(d + 1), col = new Int32Array(nnz), comp = new Float64Array(nnz * 18);
  keys.forEach((k, n) => { const i = Math.floor(k / d); rowStart[i + 1]++; col[n] = k % d; comp.set(ent.get(k), n * 18); });
  for (let i = 0; i < d; i++) rowStart[i + 1] += rowStart[i];
  return { d, rowStart, col, comp, nnz, diag: Float64Array.from(near, a => W.energies[a]) };
}
function nearValues(pat, F, T) {
  const v = new Float64Array(pat.nnz), c = pat.comp;
  const k = [F[0], F[1], F[2], -0.5 * T[0], -0.5 * T[1], -0.5 * T[2], -T[3], -T[4], -T[5],
    F[0] * F[0], F[0] * F[1], F[0] * F[2], F[1] * F[0], F[1] * F[1], F[1] * F[2], F[2] * F[0], F[2] * F[1], F[2] * F[2]];
  const on = []; for (let q = 0; q < 18; q++) if (k[q]) on.push(q);
  for (let n = 0; n < pat.nnz; n++) { let s = 0; const o = n * 18; for (const q of on) s += k[q] * c[o + q]; v[n] = s; }
  return v;
}
// Steps the wave through t (a.u.) in tilt F and dent T, with the rim as the other charges leave it
// (lip, from edgeLip; none given: no other charge). Returns the size of the near set.
export function stepNear(W, wv, F, T, t, lip = edgeLip(W, NO_CHARGES)) {
  const Fm = Math.hypot(...F), Tm = Math.hypot(...T), s = wv.s;
  // The near set only grows while it must, and is trimmed when it is far bigger than needed, so
  // its pattern is rebuilt rarely.
  const want = nearSet(W, s, Fm, Tm);
  let near = wv.near;
  if (!near || !want.core.every(a => wv.nearHas[a]) || (!want.capped && near.length > 2 * want.length + 16)) {
    const keepOld = near && near.length <= 2 * want.length + 16;
    const u = new Set(want); if (keepOld) for (const a of near) u.add(a);
    near = Int32Array.from([...u].sort((x, y) => x - y));
    if (near.length > (W.nearCap || NEAR_CAP)) near = want;
    const keep = new Uint8Array(s.re.length); for (const a of near) keep[a] = 1;
    for (let a = 0; a < s.re.length; a++) if (!keep[a]) { s.re[a] = 0; s.im[a] = 0; }   // what is left out only follows
    normalize(s);
    wv.near = near; wv.nearHas = keep; wv.pat = nearPattern(W, near); wv.rebuilds = (wv.rebuilds || 0) + 1;
  }
  const pat = wv.pat, d = pat.d, val = nearValues(pat, F, T), rs = pat.rowStart, col = pat.col, dg = pat.diag;
  // Chebyshev over the near set (Gershgorin bounds on its energies)
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < d; i++) { let off = 0, dd = dg[i]; for (let n = rs[i]; n < rs[i + 1]; n++) { if (col[n] === i) dd += val[n]; else off += Math.abs(val[n]); } lo = Math.min(lo, dd - off); hi = Math.max(hi, dd + off); }
  const mid = 0.5 * (lo + hi), half = Math.max(0.5 * (hi - lo), 1e-12);
  const xr = new Float64Array(d), xi = new Float64Array(d);
  near.forEach((a, i) => { xr[i] = s.re[a]; xi[i] = s.im[a]; });
  const pieces = Math.max(1, Math.ceil(half * t / 40)), dt = t / pieces, x = half * dt, K = Math.ceil(x + 12 + 3 * Math.cbrt(x)), J = besselJ(x, K);
  const mv = (ur, ui, vr, vi) => { for (let i = 0; i < d; i++) { let sr = dg[i] * ur[i], si = dg[i] * ui[i]; for (let n = rs[i]; n < rs[i + 1]; n++) { const h = val[n], j = col[n]; sr += h * ur[j]; si += h * ui[j]; } vr[i] = (sr - mid * ur[i]) / half; vi[i] = (si - mid * ui[i]) / half; } };
  let pr = new Float64Array(d), pi = new Float64Array(d), cr = new Float64Array(d), ci = new Float64Array(d), nr = new Float64Array(d), ni = new Float64Array(d);
  const ar = new Float64Array(d), ai = new Float64Array(d);
  for (let piece = 0; piece < pieces; piece++) {
    pr.set(xr); pi.set(xi);
    for (let i = 0; i < d; i++) { ar[i] = J[0] * pr[i]; ai[i] = J[0] * pi[i]; }
    mv(pr, pi, cr, ci);
    for (let i = 0; i < d; i++) { ar[i] += 2 * J[1] * ci[i]; ai[i] -= 2 * J[1] * cr[i]; }
    for (let k = 2; k <= K; k++) {
      mv(cr, ci, nr, ni);
      for (let i = 0; i < d; i++) { nr[i] = 2 * nr[i] - pr[i]; ni[i] = 2 * ni[i] - pi[i]; }
      const c = 2 * J[k], ph = k % 4;
      for (let i = 0; i < d; i++) {
        const u = nr[i], v = ni[i];
        if (ph === 0) { ar[i] += c * u; ai[i] += c * v; } else if (ph === 1) { ar[i] += c * v; ai[i] -= c * u; }
        else if (ph === 2) { ar[i] -= c * u; ai[i] -= c * v; } else { ar[i] -= c * v; ai[i] += c * u; }
      }
      [pr, cr, nr] = [cr, nr, pr]; [pi, ci, ni] = [ci, ni, pi];
      if (Math.abs(J[k]) < 1e-16 && k > x) break;
    }
    const c = Math.cos(-mid * dt), sn = Math.sin(-mid * dt);
    for (let i = 0; i < d; i++) { xr[i] = ar[i] * c - ai[i] * sn; xi[i] = ar[i] * sn + ai[i] * c; }
  }
  // What leaves in this step: light (each wave's own rate) and, over a lip, the electron itself.
  // The share lost to each is the chance that it happened (the quantum-jump method).
  let lostLight = 0, lostEsc = 0; const escW = wv.escW && wv.escW.length === d ? wv.escW.fill(0) : (wv.escW = new Float64Array(d));
  near.forEach((a, i) => {
    const g = W.gamma[a], kap = leakRate(W, a, lip), k = Math.exp(-0.5 * (g + kap) * t);
    if (g + kap > 0) { const loss = (xr[i] * xr[i] + xi[i] * xi[i]) * (1 - k * k); lostLight += loss * g / (g + kap); escW[i] = loss * kap / (g + kap); lostEsc += escW[i]; }
    s.re[a] = xr[i] * k; s.im[a] = xi[i] * k;
  });
  wv.lostLight = lostLight; wv.lostEsc = lostEsc;
  return d;
}

// ---------------------------------------------------------------------------
// The lip: how a held electron gets out
// ---------------------------------------------------------------------------
// Other charges lower the well's rim in some directions. Along each of a set of directions out
// from the proton we take the electron's energy in the proton's pull plus the other charges' exact
// pull, −1/r − Σ q·(1/|r − R_q| − 1/R_q), and the highest it gets on the way to the bubble's edge is
// the rim that way. A standing wave whose energy is above the rim in some directions is no longer
// held: it reaches the edge about once per crossing (speed/2R) and the open share of the edge lets
// it through. With no other charge the rim is −1/R everywhere, which holds everything up to n = 7.
// Simplified, flagged: the leak is this estimate, not a wave solved through an open edge; it uses
// each standing wave's own energy (not its shift in the pull); and there is no tunnelling under
// the rim.
const LIP_DIRS = (() => { const out = [], K = 32, g = Math.PI * (3 - Math.sqrt(5)); for (let k = 0; k < K; k++) { const y = 1 - 2 * (k + 0.5) / K, r = Math.sqrt(1 - y * y); out.push([r * Math.cos(g * k), y, r * Math.sin(g * k)]); } return out; })();
const LIP_N = 16;
// charges = [{ rel: [x, y, z] (a₀ from the proton), q }]. Returns { dirs, rim, edge, exitR } (a.u.):
// per direction the rim (the first top on the way out; past it the electron is out of this well,
// free or in another proton's), and the radius and energy just past it, where it comes out.
export function edgeLip(W, charges) {
  const dirs = LIP_DIRS.slice(), F = tiltAndDent(charges, 1).F, Fm = Math.hypot(F[0], F[1], F[2]);
  if (Fm > 1e-14) dirs.push([-F[0] / Fm, -F[1] / Fm, -F[2] / Fm]);   // straight downhill is always looked at
  for (const c of charges) { const D = Math.hypot(c.rel[0], c.rel[1], c.rel[2]); if (c.q > 0 && D < 2 * W.R && D > 1) dirs.push(c.rel.map(v => v / D)); }   // and straight at a close positive charge
  const rim = new Float64Array(dirs.length), edge = new Float64Array(dirs.length), exitR = new Float64Array(dirs.length);
  const D0 = charges.map(c => Math.max(Math.hypot(c.rel[0], c.rel[1], c.rel[2]), 1));
  dirs.forEach((u, k) => {
    let top = -Infinity, V = 0, r = 0;
    for (let i = 1; i <= LIP_N; i++) {
      r = W.R * (0.1 + 0.9 * i / LIP_N); V = -1 / r;
      for (let n = 0; n < charges.length; n++) { const c = charges[n], d = Math.hypot(u[0] * r - c.rel[0], u[1] * r - c.rel[1], u[2] * r - c.rel[2]); V -= c.q * (1 / Math.max(d, 1) - 1 / D0[n]); }
      if (V < top) break;   // past the top
      top = V;
    }
    rim[k] = top; edge[k] = Math.min(V, top); exitR[k] = r;
  });
  return { dirs, rim, edge, exitR };
}
const NO_CHARGES = [];
export function leakRate(W, a, lip) {
  const E = W.energies[a]; let open = 0, v = 0;
  for (let k = 0; k < lip.rim.length; k++) if (E > lip.rim[k]) { open++; v += Math.sqrt(2 * (E - lip.edge[k])); }
  return open ? v / lip.rim.length / (2 * W.R) : 0;
}
// Which standing wave the electron left from (after a step in which it left).
export function pickEscape(W, wv, rand = Math.random) {
  let u = rand() * wv.lostEsc, last = wv.near[0];
  for (let i = 0; i < wv.near.length; i++) { if (!wv.escW[i]) continue; last = wv.near[i]; u -= wv.escW[i]; if (u <= 0) break; }
  return last;
}
// Where and how fast it comes out: through one of the open directions (the faster ones more
// often, as they carry more of the flow), just past the rim, moving straight out with what its energy
// leaves over there. dir is a unit vector from the proton, r in a₀, v in a.u.
export function escapeExit(W, a, lip, rand = Math.random) {
  const E = W.energies[a], vs = Array.from(lip.rim, (rim, k) => (E > rim ? Math.sqrt(2 * (E - lip.edge[k])) : 0)), tot = vs.reduce((x, y) => x + y, 0);
  if (!(tot > 0)) return null;
  let u = rand() * tot, k = 0; for (; k < vs.length - 1; k++) { u -= vs[k]; if (u <= 0) break; }
  while (!vs[k]) k--;
  return { dir: lip.dirs[k], r: lip.exitR[k], v: vs[k], E };
}

// The atom's own dipole right now (a.u., = −⟨r⟩ of its wave), from the near waves and, where the
// near set carries them, the far waves following the tilt. This is what pulls back on the charges
// that tilt the well: the force −⟨∂H/∂F⟩ that goes with the wave's own equation, so the energy the
// wave gains is energy those charges lose.
export function waveDipole(W, wv) {
  // p = p0 + A·F: p0 is the part the wave carries by itself (its near waves beating), A (3×3, row
  // by row) is how far the far waves let the tilt F stretch it further.
  const pat = wv.pat, near = wv.near, s = wv.s, p0 = [0, 0, 0], A = new Array(9).fill(0);
  if (!pat || !near) return { p0, A };
  const d = pat.d, rs = pat.rowStart, col = pat.col, c = pat.comp; let n2 = 0;
  for (let i = 0; i < d; i++) {
    const a = near[i], ur = s.re[a], ui = s.im[a]; n2 += ur * ur + ui * ui;
    for (let n = rs[i]; n < rs[i + 1]; n++) {
      const b = near[col[n]], w = ur * s.re[b] + ui * s.im[b], o = n * 18;
      if (!w) continue;
      for (let q = 0; q < 3; q++) { p0[q] -= w * c[o + q]; for (let e = 0; e < 3; e++) A[3 * q + e] -= w * (c[o + 9 + 3 * q + e] + c[o + 9 + 3 * e + q]); }
    }
  }
  n2 = Math.max(n2, 1e-300);
  return { p0: p0.map(v => v / n2), A: A.map(v => v / n2) };
}
// The wave's energy right now (a.u.): in the proton's well plus in the tilt and dent.
export function waveEnergy(W, wv, F, T) {
  const pat = wv.pat, near = wv.near, s = wv.s;
  if (!pat || !near) return meanEnergy(W, s);
  const val = nearValues(pat, F, T), rs = pat.rowStart, col = pat.col; let E = 0, n2 = 0;
  for (let i = 0; i < pat.d; i++) {
    const a = near[i], ur = s.re[a], ui = s.im[a], pa = ur * ur + ui * ui; n2 += pa; E += pat.diag[i] * pa;
    for (let n = rs[i]; n < rs[i + 1]; n++) { const b = near[col[n]]; E += val[n] * (ur * s.re[b] + ui * s.im[b]); }
  }
  return E / Math.max(n2, 1e-300);
}
// Van der Waals pull between two neutral atoms, from their waves. Each atom's electron keeps
// flickering toward every standing wave its own wave has a dipole overlap with; two atoms'
// flickers fall into step and that lowers their energy by C₆/R⁶ (London's second-order sum):
//   C₆ = (2/3)·Σ_a Σ_b |⟨A|r|a⟩|²·|⟨B|r|b⟩|² / (ΔE_a + ΔE_b)     (a.u.; 6.499 for 1s with 1s).
// Simplified, flagged: averaged over the atoms' orientations; each atom taken in its one main
// standing wave; pairs of flickers that cost nearly nothing in total (|ΔE_a + ΔE_b| < 0.002
// hartree: a true resonance, where energy is handed over rather than borrowed) are left out.
function flickers(W, a) {
  if (!W._osc) W._osc = new Map();
  let o = W._osc.get(a);
  if (!o) { o = dipoleRows(W)[a].map(c => ({ dE: W.energies[c.a] - W.energies[a], d2: c.q[0] * c.q[0] + c.q[1] * c.q[1] + c.q[2] * c.q[2] })).filter(x => x.d2 > 1e-12); W._osc.set(a, o); }
  return o;
}
export function c6(W, a, b) {
  if (!W._c6) W._c6 = new Map();
  const key = a < b ? a * 65536 + b : b * 65536 + a; let v = W._c6.get(key);
  if (v === undefined) {
    v = 0; const A = flickers(W, a), B = flickers(W, b);
    for (const x of A) for (const y of B) { const d = x.dE + y.dE; if (Math.abs(d) > 0.002) v += x.d2 * y.d2 / d; }
    v *= 2 / 3; W._c6.set(key, v);
  }
  return v;
}
// How much of the electron is inside radius r: a table at r_j = R·(j/(n−1))² (fine near the proton). A charge that far from
// the proton feels the proton less that much of the electron (the cloud taken as round; the
// lop-sided part is the dipole above). Shares of the standing waves only, their beats left out.
export function enclosed(W, s, n = 64) {
  const out = new Float32Array(n), n2 = normSq(s);
  if (!W._cum) W._cum = new Map();
  for (let a = 0; a < s.re.length; a++) {
    const p = (s.re[a] * s.re[a] + s.im[a] * s.im[a]) / n2;
    if (p < 0.004) continue;
    const st = W.states[a], key = st.l * 4096 + st.k; let t = W._cum.get(key);
    if (!t || t.length !== n) {
      t = new Float32Array(n); const w = W.rad[st.l].w[st.k]; let acc = 0, i = 0;
      for (let j = 0; j < n; j++) { const r = W.R * (j / (n - 1)) ** 2; while (i < w.length && W.ri[i] <= r) { acc += w[i] * w[i]; i++; } t[j] = Math.min(1, acc); }
      W._cum.set(key, t);
    }
    for (let j = 0; j < n; j++) out[j] += p * t[j];
  }
  const top = out[n - 1] || 1; for (let j = 0; j < n; j++) out[j] = Math.min(1, out[j] / top);
  return out;
}
// The whole wave as it is right now: the near part plus the far waves following the pull (first
// order). This is what is drawn and what the point rides.
export function dressed(W, wv, F, T) {
  const s = wv.s, NS = s.re.length, out = { re: Float64Array.from(s.re), im: Float64Array.from(s.im) };
  if (!wv.near) return out;
  const isNear = new Uint8Array(NS); for (const a of wv.near) isNear[a] = 1;
  const op = makeOp(W, F, T, W.LMAX), yr = new Float64Array(NS), yi = new Float64Array(NS);
  // V·ψ (the op adds E_a·ψ_a, which is zero on far waves since ψ is zero there)
  op(s.re, s.im, yr, yi);
  const n2 = normSq(s); let Ebar = 0; for (const a of wv.near) Ebar += W.energies[a] * (s.re[a] ** 2 + s.im[a] ** 2) / n2;
  for (let a = 0; a < NS; a++) if (!isNear[a]) { const g = -1 / (W.energies[a] - Ebar); out.re[a] = yr[a] * g; out.im[a] = yi[a] * g; }
  return out;
}

// ---------------------------------------------------------------------------
// For the game: labels, light, and the wave compiled for drawing and for the point
// ---------------------------------------------------------------------------
export function waveFromIndex(W, a) {
  const s = { re: new Float64Array(W.states.length), im: new Float64Array(W.states.length) };
  s.re[a] = 1;
  return { s, near: null, key: '', pat: null };
}
// The swing a step from a down to b makes: the dipole ⟨b|r|a⟩ (a₀), a real vector.
export function dipoleVector(W, a, b) {
  const A = W.states[a], B = W.states[b], NC = W.NC, ca = chOf(A.l, A.m), cb = chOf(B.l, B.m);
  if (Math.abs(A.l - B.l) !== 1) return [0, 0, 0];
  const rr = W.rad1(B.l, A.l, B.k, A.k);
  return [0, 1, 2].map(q => W.A1[q][cb * NC + ca] * rr);
}
// y = V·x (the tilt and dent alone), over channels up to lTop.
export function applyPull(W, x, F, T, lTop = W.LMAX) {
  const NS = W.states.length, yr = new Float64Array(NS), yi = new Float64Array(NS);
  makeOp(W, F, T, lTop)(x.re, x.im, yr, yi);
  const n = W.start[(lTop + 1) ** 2];
  for (let a = 0; a < n; a++) { yr[a] -= W.energies[a] * x.re[a]; yi[a] -= W.energies[a] * x.im[a]; }
  return { re: yr, im: yi };
}
// Per-wave radial tables (√r spacing to the wall), cached.
const TAB_N = 128;
export function stateTable(W, a) {
  if (!W._tabs) W._tabs = new Map();
  let t = W._tabs.get(a);
  if (!t) { t = radialTable(W, a, W.R, TAB_N); W._tabs.set(a, t); }
  return t;
}
// Brightness numbers for one standing wave drawn alone: its peak density and the density of the
// surface holding 90% of it (as orbitals.js does for the textbook ones), worked out from the grid.
export function stateStats(W, a) {
  if (!W._stats) W._stats = new Map();
  let st = W._stats.get(a);
  if (st) return st;
  // Sampled on a modest grid; the 90% surface is found from a histogram of log density (no sort),
  // so this stays a millisecond or two even on a phone.
  const S = W.states[a], ext = Math.min(W.R, reach(W, a) * 1.05), NR = 64, NT = 24, NP = S.m ? 12 : 1;
  const an = angNorm(S.l, S.m), dens = new Float64Array(NR * NT * NP), wts = new Float64Array(NR * NT * NP);
  let total = 0, peak = 0, k = 0;
  const ang = new Float64Array(NT * NP);
  for (let j = 0; j < NT; j++) {
    const th = (j + 0.5) * Math.PI / NT, P = legendre(S.l, Math.abs(S.m), Math.cos(th)) * an;
    for (let q = 0; q < NP; q++) { const ph = (q + 0.5) * 2 * Math.PI / NP, f = S.m > 0 ? Math.cos(S.m * ph) : S.m < 0 ? Math.sin(-S.m * ph) : 1; ang[j * NP + q] = (P * f) ** 2 * Math.sin(th); }
  }
  for (let i = 0; i < NR; i++) {
    const r = (i + 0.5) * ext / NR, R = radialAt(W, S.l, S.k, r), rr = R * R;
    for (let j = 0; j < NT; j++) {
      const sn = Math.sin((j + 0.5) * Math.PI / NT);
      for (let q = 0; q < NP; q++, k++) { const g = ang[j * NP + q]; const d = rr * g / sn; dens[k] = d; wts[k] = d * r * r * sn; total += wts[k]; if (d > peak) peak = d; }
    }
  }
  const NB = 400, hist = new Float64Array(NB), lo = Math.log(peak) - 30;
  for (let i = 0; i < k; i++) { if (dens[i] <= 0) continue; const b = Math.min(NB - 1, Math.max(0, Math.floor((Math.log(dens[i]) - lo) / 30 * NB))); hist[b] += wts[i]; }
  let acc = 0, iso = 0;
  for (let b = NB - 1; b >= 0; b--) { acc += hist[b]; if (acc >= 0.9 * total) { iso = Math.exp(lo + 30 * b / NB); break; } }
  st = { peak, iso, reach: reach(W, a) };
  W._stats.set(a, st);
  return st;
}
// The wave compiled per channel (l, m): its radial part Σ_k c_k R_k(r) as two tables (real and
// imaginary), so it can be drawn as a few terms and evaluated quickly for the point.
export function compileWave(W, amps, eps = 1e-9) {
  const n2 = normSq(amps), chans = [];
  for (let c = 0; c < W.NC; c++) {
    const o = W.start[c], e = W.start[c + 1];
    let wgt = 0; for (let a = o; a < e; a++) wgt += amps.re[a] ** 2 + amps.im[a] ** 2;
    wgt /= n2;
    if (wgt < eps) continue;
    const tr = new Float32Array(TAB_N), ti = new Float32Array(TAB_N);
    const k = 1 / Math.sqrt(n2);
    for (let a = o; a < e; a++) {
      const cr = amps.re[a] * k, ci = amps.im[a] * k;
      if (cr * cr + ci * ci < 1e-14) continue;
      const t = stateTable(W, a);
      for (let j = 0; j < TAB_N; j++) { tr[j] += cr * t[j]; ti[j] += ci * t[j]; }
    }
    const l = Math.floor(Math.sqrt(c)), m = c - l * l - l;
    chans.push({ l, m, ch: c, w: wgt, tr, ti });
  }
  chans.sort((x, y) => y.w - x.w);
  return { chans, R: W.R, LMAX: W.LMAX, Y: new Float64Array(W.NC) };
}
function tabAt(t, r, R) {
  if (r >= R) return 0;
  const x = Math.sqrt(r / R) * (TAB_N - 1), j = Math.min(TAB_N - 2, Math.floor(x)), f = x - j;
  return t[j] + (t[j + 1] - t[j]) * f;
}
export function evalCompiled(cw, p) {
  const r = Math.hypot(p[0], p[1], p[2]);
  if (r >= cw.R) return [0, 0];
  const rr = Math.max(r, 1e-6);
  realY(cw.LMAX, p[0] / rr, p[1] / rr, p[2] / rr, cw.Y);
  let re = 0, im = 0;
  for (const c of cw.chans) { const y = cw.Y[c.ch]; re += tabAt(c.tr, r, cw.R) * y; im += tabAt(c.ti, r, cw.R) * y; }
  return [re, im];
}
// The point's velocity (a.u.) at p. With a spin axis (unit vector `spin`) the guidance rule has its
// spin term too: v = Im(∇ψ/ψ) + Re(∇ψ/ψ) × ŝ (that is (ħ/2m)·∇ln ρ × ŝ, the flow of the spin's own
// current), scaled by spinK (1 = real).
export function flowCompiled(cw, p, spin = null, spinK = 1) {
  const d = 1e-3 * Math.max(0.05, Math.hypot(p[0], p[1], p[2]));
  const w0 = evalCompiled(cw, p), den = w0[0] * w0[0] + w0[1] * w0[1];
  if (den < 1e-300) return [0, 0, 0];
  const v = [0, 0, 0], g = [0, 0, 0];
  for (let q = 0; q < 3; q++) {
    const a = [p[0], p[1], p[2]], b = [p[0], p[1], p[2]]; a[q] += d; b[q] -= d;
    const wa = evalCompiled(cw, a), wb = evalCompiled(cw, b);
    v[q] = (w0[0] * (wa[1] - wb[1]) - w0[1] * (wa[0] - wb[0])) / (2 * d) / den;
    g[q] = (w0[0] * (wa[0] - wb[0]) + w0[1] * (wa[1] - wb[1])) / (2 * d) / den;
  }
  if (spin && spinK) { v[0] += spinK * (g[1] * spin[2] - g[2] * spin[1]); v[1] += spinK * (g[2] * spin[0] - g[0] * spin[2]); v[2] += spinK * (g[0] * spin[1] - g[1] * spin[0]); }
  return v;
}
// Moves the point p (a₀) for time t (a.u.) on the compiled wave. Returns the substeps used.
// spinTurn (radians): the most the spin term may carry the point round its axis in this call, so
// the circling can be shown slowed instead of as a flicker (Infinity = real rate).
export function rideCompiled(cw, p, t, maxSub = 120, spin = null, spinTurn = Infinity) {
  let left = t, n = 0, spinK = 1;
  if (spin && t > 0 && Number.isFinite(spinTurn)) {
    const v0 = flowCompiled(cw, p), v1 = flowCompiled(cw, p, spin), vs = Math.hypot(v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]);
    const al = p[0] * spin[0] + p[1] * spin[1] + p[2] * spin[2], perp = Math.hypot(p[0] - al * spin[0], p[1] - al * spin[1], p[2] - al * spin[2]);
    const turn = vs * t / Math.max(perp, 1e-6);
    if (turn > spinTurn) spinK = spinTurn / turn;
  }
  while (left > 1e-12 && n < maxSub) {
    const v = flowCompiled(cw, p, spin, spinK), sp = Math.hypot(v[0], v[1], v[2]), r = Math.hypot(p[0], p[1], p[2]);
    if (sp < 1e-12) break;
    const dt = Math.min(left, 0.08 * Math.max(r, 0.3) / sp);
    const mid = [p[0] + 0.5 * dt * v[0], p[1] + 0.5 * dt * v[1], p[2] + 0.5 * dt * v[2]], vm = flowCompiled(cw, mid, spin, spinK);
    p[0] += dt * vm[0]; p[1] += dt * vm[1]; p[2] += dt * vm[2];
    left -= dt; n++;
  }
  const r = Math.hypot(p[0], p[1], p[2]);
  if (r > 0.97 * cw.R) { const k = 0.97 * cw.R / r; p[0] *= k; p[1] *= k; p[2] *= k; }
  return n;
}
// The loop the spin term carries the point round, traced from p in n steps (points in a₀), and how
// fast it goes round it (radians per a.u. of time). For a round cloud it is a circle about the axis.
export function spinLoop(cw, p, spin, n = 32) {
  const sv = q => { const a = flowCompiled(cw, q), b = flowCompiled(cw, q, spin); return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; };
  const al = p[0] * spin[0] + p[1] * spin[1] + p[2] * spin[2], perp = Math.hypot(p[0] - al * spin[0], p[1] - al * spin[1], p[2] - al * spin[2]);
  const v0 = sv(p), sp0 = Math.hypot(v0[0], v0[1], v0[2]), pts = [[p[0], p[1], p[2]]];
  if (sp0 < 1e-9 || perp < 1e-6) return { pts, rate: 0 };
  const ds = 2 * Math.PI * perp / n; let q = [p[0], p[1], p[2]];
  for (let i = 0; i < n; i++) {
    const v = sv(q), sp = Math.hypot(v[0], v[1], v[2]); if (sp < 1e-12) break;
    const mid = [0, 1, 2].map(k => q[k] + 0.5 * ds * v[k] / sp), vm = sv(mid), sm = Math.hypot(vm[0], vm[1], vm[2]); if (sm < 1e-12) break;
    q = [0, 1, 2].map(k => q[k] + ds * vm[k] / sm);
    if (Math.hypot(q[0], q[1], q[2]) > 0.97 * cw.R) break;
    pts.push(q);
  }
  return { pts, rate: sp0 / perp };
}
// A starting point drawn from |ψ|² (the Born rule): a Metropolis walk on the compiled wave.
export function sampleCompiled(cw, scale, rand = Math.random, steps = 800) {
  let p = [scale * (rand() - 0.5), scale * (rand() - 0.5), scale * (rand() - 0.5)];
  const dens = q => { const w = evalCompiled(cw, q); return w[0] * w[0] + w[1] * w[1]; };
  let d = dens(p);
  for (let i = 0; i < steps; i++) {
    const q = [p[0] + scale * 0.5 * (rand() - 0.5), p[1] + scale * 0.5 * (rand() - 0.5), p[2] + scale * 0.5 * (rand() - 0.5)];
    const dq = dens(q);
    if (dq >= d || rand() * d < dq) { p = q; d = dq; }
  }
  return p;
}
