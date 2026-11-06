// Hydrogen wavefunctions for the orbital renderer.
// Ported unchanged from prototype/index.html on the Alchem Fighter rebuild branch
// (claude/atomic-space-fighter-game-ihpb71), so the two stay in step.

export const fact = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

// Generalized Laguerre L_k^a(x) by upward recurrence.
export function laguerre(k, a, x) {
  if (k === 0) return 1;
  let L0 = 1, L1 = 1 + a - x;
  for (let i = 1; i < k; i++) { const L2 = ((2 * i + 1 + a - x) * L1 - (i + a) * L0) / (i + 1); L0 = L1; L1 = L2; }
  return L1;
}
// Associated Legendre P_l^m(x), m >= 0, with Condon–Shortley phase.
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
export const radialNorm = (n, l, Z) => Math.sqrt(Math.pow(2 * Z / n, 3) * fact(n - l - 1) / (2 * n * fact(n + l)));
export const angularNorm = (l, m) => { const am = Math.abs(m); return Math.sqrt((2 * l + 1) / (4 * Math.PI) * fact(l - am) / fact(l + am)); };
export function radial(n, l, Z, r) { const rho = 2 * Z * r / n; return radialNorm(n, l, Z) * Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho); }
// Radius (Bohr) that encloses essentially all of the n-shell density.
export const extentBohr = (n, Z) => (2.5 * n * n + 5 * n) / Z;

// Peak |psi|^2 for a single orbital (used to normalise brightness).
export function peakDensity(n, l, m, Z, mode) {
  const R = extentBohr(n, Z), am = Math.abs(m), an = angularNorm(l, m);
  let best = 0;
  for (let i = 0; i <= 240; i++) {
    const rr = radial(n, l, Z, R * i / 240) ** 2;
    for (let j = 0; j <= 60; j++) {
      const P = legendre(l, am, Math.cos(Math.PI * j / 60)) * an;
      best = Math.max(best, rr * P * P * (mode ? 2 : 1));
    }
  }
  return best;
}
// Density of the surface that encloses 90% of the probability: the textbook "boundary surface".
export function isoDensity(n, l, m, Z, mode) {
  const R = extentBohr(n, Z), am = Math.abs(m), an = angularNorm(l, m), NR = 110, NT = 40, NP = mode ? 32 : 1;
  const samples = []; let total = 0;
  for (let i = 0; i < NR; i++) {
    const r = (i + 0.5) * R / NR, rr = radial(n, l, Z, r) ** 2;
    for (let j = 0; j < NT; j++) {
      const th = (j + 0.5) * Math.PI / NT, P = legendre(l, am, Math.cos(th)) * an, base = rr * P * P, w = r * r * Math.sin(th);
      for (let k = 0; k < NP; k++) {
        const ph = (k + 0.5) * 2 * Math.PI / NP, a = mode === 0 ? 1 : 2 * (mode === 1 ? Math.cos(am * ph) : Math.sin(am * ph)) ** 2;
        const d = base * a; samples.push([d, d * w]); total += d * w;
      }
    }
  }
  samples.sort((a, b) => b[0] - a[0]);
  let acc = 0;
  for (const [d, p] of samples) { acc += p; if (acc >= 0.9 * total) return d; }
  return 0;
}
// Shader-ready description of one orbital. mode 0 = complex e^{imφ}, 1 = cos(|m|φ), 2 = sin(|m|φ).
export function waveDesc(n, l, m, Z, real) {
  const mode = real && m !== 0 ? (m > 0 ? 1 : 2) : 0;
  const norm = radialNorm(n, l, Z) * angularNorm(l, m) * (mode ? Math.SQRT2 : 1);
  return { n, l, m, Z, mode, norm, peak: peakDensity(n, l, m, Z, mode), iso: isoDensity(n, l, m, Z, mode) };
}
