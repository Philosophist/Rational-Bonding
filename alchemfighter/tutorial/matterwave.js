// The electron's matter wave near a proton, and the electron's point riding it (pilot-wave view).
// Pure maths, no DOM, so it can be tested (matterwave.test.mjs).
//
// The wave. An electron of energy E coming in along ẑ at a lone proton is an exact solution of
// Schrödinger's equation (the Coulomb scattering state, Landau & Lifshitz §135):
//   ψ(r) = e^{ikz} · ₁F₁(a; 1; iξ),   a = i/k,   ξ = k(r − z)
// in atomic units (Bohr radius, ħ = mₑ = e = 1), k the electron's wave number far away. It holds the
// incoming wave and the wave the proton scatters, so it bends round the proton, focuses behind it
// and shows fringes where the two parts meet. It is a steady state: in time it only turns as
// e^{−iEt/ħ}, so its crests move but its shape does not.
//
// The point. In pilot-wave (de Broglie–Bohm) theory the electron is a point that moves with the
// wave's local flow: v = (ħ/m)·Im(∇ψ/ψ), the gradient of the wave's phase. For this wave that is
//   v = k·[ẑ + (r̂ − ẑ)·Re(F′/F)]
// with F = ₁F₁(a; 1; iξ) and F′ its derivative. Far away it is the plain speed ħk/m along ẑ;
// close in, the wave pushes the point round the proton, and where the fringes are, it wiggles.
//
// The wave is only worked out within guideRadius(E) of the proton (up to 4 nm), where ξ stays
// inside the tabulated range.

export const A0_NM = 0.0529177;            // nm per Bohr radius
export const V_AU = 2.18769126;            // nm/fs per atomic unit of speed (αc)
export const HARTREE = 27.211386;          // eV
export const XI_MAX = 120;

const k_au = E => Math.sqrt(2 * Math.max(E, 1e-4) / HARTREE);
// How far from the proton (nm) the wave is worked out, at energy E (eV): at most 4 nm.
export const guideRadius = E => Math.min(4, 0.5 * XI_MAX / k_au(E) * A0_NM);

// ₁F₁(a; 1; iξ) and its derivative with respect to its argument x = iξ, for a = i/k.
// Returns [Fre, Fim, F′re, F′im]. The power series cancels badly for slow electrons (terms reach
// 10¹⁵ by ξ = 25), so F is instead integrated along ξ from Kummer's equation, which in ξ reads
//   ξ·F″ + (1 − iξ)·F′ + F/k = 0,   F(0) = 1,  dF/dξ(0) = −1/k,
// with the series only for the first small step, then classic Runge–Kutta, and tabulated per
// energy (2% bins) for quick lookups.
const XI_STEP = 0.01, tables = new Map();
function series(k, xi) {   // the series, fine for small ξ: F and dF/dξ
  const ai = 1 / k;
  let tr = 1, ti = 0, Fr = 1, Fi = 0, Dr = 0, Di = 0;
  for (let n = 0; n < 200; n++) {
    const mr = tr * n - ti * ai, mi = tr * ai + ti * n, sc = xi / ((n + 1) * (n + 1));
    tr = -mi * sc; ti = mr * sc;
    Fr += tr; Fi += ti; Dr += (n + 1) * tr; Di += (n + 1) * ti;
    if (n > 4 && Math.abs(tr) + Math.abs(ti) < 1e-17) break;
  }
  return [Fr, Fi, Dr / xi, Di / xi];   // Σ n tₙ / ξ = dF/dξ
}
function table(k) {
  const key = Math.round(Math.log(k) * 100);
  let T = tables.get(key);
  if (T) return T;
  const kk = Math.exp(key / 100), n = Math.ceil(XI_MAX / XI_STEP) + 2, t = new Float64Array(4 * n);
  const deriv = (x, y) => {   // y = [Fr, Fi, Gr, Gi], G = dF/dξ;  F″ = −((1 − iξ)G + F/k)/ξ
    const ar = y[2] + x * y[3] + y[0] / kk, ai = y[3] - x * y[2] + y[1] / kk;
    return [y[2], y[3], -ar / x, -ai / x];
  };
  const x0 = 0.5;
  let y = series(kk, x0), i0 = Math.round(x0 / XI_STEP);
  for (let i = 0; i <= i0; i++) { const v = i === 0 ? [1, 0, 0, -1 / kk] : series(kk, i * XI_STEP); t.set(v, 4 * i); }
  for (let i = i0; i < n - 1; i++) {
    const x = i * XI_STEP, h = XI_STEP;
    const k1 = deriv(x, y), y2 = y.map((v, j) => v + 0.5 * h * k1[j]);
    const k2 = deriv(x + 0.5 * h, y2), y3 = y.map((v, j) => v + 0.5 * h * k2[j]);
    const k3 = deriv(x + 0.5 * h, y3), y4 = y.map((v, j) => v + h * k3[j]);
    const k4 = deriv(x + h, y4);
    y = y.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    t.set(y, 4 * (i + 1));
  }
  T = { k: kk, t, n };
  tables.set(key, T);
  return T;
}
export function hyp(k, xi) {
  const T = table(k), x = Math.min(Math.max(xi, 0), XI_MAX) / XI_STEP, i = Math.min(T.n - 2, Math.floor(x)), f = x - i, t = T.t, h = XI_STEP;
  if (i === 0 && f < 1) { const v = xi > 1e-9 ? series(T.k, xi) : [1, 0, 0, -1 / T.k]; return [v[0], v[1], v[3], -v[2]]; }
  // Cubic Hermite interpolation: F from F and G = dF/dξ, G from G and F″ (Kummer's equation).
  const kk = T.k, F2 = (j, c) => { const xj = j * h, Fr = t[4 * j], Fi = t[4 * j + 1], Gr = t[4 * j + 2], Gi = t[4 * j + 3];
    const ar = Gr + xj * Gi + Fr / kk, ai = Gi - xj * Gr + Fi / kk; return c ? -ai / xj : -ar / xj; };
  const h00 = 2 * f ** 3 - 3 * f * f + 1, h10 = f ** 3 - 2 * f * f + f, h01 = -2 * f ** 3 + 3 * f * f, h11 = f ** 3 - f * f;
  const H = (v0, d0, v1, d1) => h00 * v0 + h10 * h * d0 + h01 * v1 + h11 * h * d1;
  const j0 = 4 * i, j1 = 4 * (i + 1);
  const Fr = H(t[j0], t[j0 + 2], t[j1], t[j1 + 2]), Fi = H(t[j0 + 1], t[j0 + 3], t[j1 + 1], t[j1 + 3]);
  const Gr = H(t[j0 + 2], F2(i, 0), t[j1 + 2], F2(i + 1, 0)), Gi = H(t[j0 + 3], F2(i, 1), t[j1 + 3], F2(i + 1, 1));
  // F′ = dF/dx = −i·dF/dξ
  return [Fr, Fi, Gi, -Gr];
}

// The wave at point r (nm, from the proton) for an electron of energy E (eV) coming in along u
// (unit vector). Returns { re, im, rho } (ψ = re + i·im, rho = |ψ|², 1 far upstream).
export function wave(E, u, r) {
  const k = k_au(E), x = r.map(c => c / A0_NM);
  const z = x[0] * u[0] + x[1] * u[1] + x[2] * u[2], R = Math.hypot(x[0], x[1], x[2]);
  const [Fr, Fi] = hyp(k, k * (R - z));
  const c = Math.cos(k * z), s = Math.sin(k * z);
  // Normalised so the incoming wave far upstream has density 1: |e^{πη/2}Γ(1 + iη)|² with η = −1/k.
  const g = 2 * Math.PI / k, C = g / (1 - Math.exp(-g)), sq = Math.sqrt(C);
  const re = sq * (c * Fr - s * Fi), im = sq * (c * Fi + s * Fr);
  return { re, im, rho: re * re + im * im };
}
// The point's velocity (nm/fs) at r (nm, from the proton): the flow of the wave.
export function guideVelocity(E, u, r, vmax = Infinity) {
  const k = k_au(E), x = r.map(c => c / A0_NM);
  const R = Math.hypot(x[0], x[1], x[2]) || 1e-9, z = x[0] * u[0] + x[1] * u[1] + x[2] * u[2];
  const [Fr, Fi, Dr, Di] = hyp(k, k * (R - z));
  const q = (Dr * Fr + Di * Fi) / Math.max(Fr * Fr + Fi * Fi, 1e-300);   // Re(F′/F)
  const v = [0, 1, 2].map(i => k * (u[i] + (x[i] / R - u[i]) * q) * V_AU);
  const m = Math.hypot(v[0], v[1], v[2]);
  return m > vmax ? v.map(c => c * vmax / m) : v;
}
// A slice of the wave in the plane through the proton spanned by u (along the beam) and w (square
// to it): an N×N grid out to radius Rg (nm). Phase and density at each grid point.
export function waveSlice(E, u, w, Rg, N = 56) {
  const phase = new Float32Array(N * N), rho = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = -Rg + 2 * Rg * i / (N - 1), b = -Rg + 2 * Rg * j / (N - 1);
    const r = [0, 1, 2].map(c => u[c] * a + w[c] * b);
    const p = wave(E, u, r);
    phase[j * N + i] = Math.atan2(p.im, p.re);
    rho[j * N + i] = p.rho;
  }
  return { E, u, w, Rg, N, phase, rho };
}
// The wave's crests at phase offset t (radians; the wave turns as e^{−iωt}): line segments in the
// slice's plane, as [a1, b1, a2, b2, brightness]. A crest is where the phase minus t is a multiple
// of 2π. Brightness follows the density there (log scale, 1 = the incoming wave).
export function crests(slice, t) {
  const { N, Rg, phase, rho } = slice, out = [];
  const val = new Float32Array(N * N), pos = new Uint8Array(N * N);
  for (let n = 0; n < N * N; n++) { const d = phase[n] - t; val[n] = Math.sin(d); pos[n] = Math.cos(d) > 0 ? 1 : 0; }
  const X = i => -Rg + 2 * Rg * i / (N - 1);
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const id = [j * N + i, j * N + i + 1, (j + 1) * N + i + 1, (j + 1) * N + i];
    if (!(pos[id[0]] | pos[id[1]] | pos[id[2]] | pos[id[3]])) continue;
    const v = id.map(n => val[n]), c = [[X(i), X(j)], [X(i + 1), X(j)], [X(i + 1), X(j + 1)], [X(i), X(j + 1)]];
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const f = e, g = (e + 1) % 4;
      if ((v[f] > 0) === (v[g] > 0)) continue;
      const s = v[f] / (v[f] - v[g]);
      // a sign change of sin with cos < 0 is a trough's wrap (phase jumping by 2π), not a crest
      if (!pos[id[f]] && !pos[id[g]]) continue;
      pts.push([c[f][0] + (c[g][0] - c[f][0]) * s, c[f][1] + (c[g][1] - c[f][1]) * s]);
    }
    if (pts.length >= 2) {
      const d = 0.25 * (rho[id[0]] + rho[id[1]] + rho[id[2]] + rho[id[3]]);
      out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1], d]);
    }
  }
  return out;
}
