// What the viewer needs from each recorded moment, all computed from the electron's wave:
// - its density on three nested half-slices through the axis (the wave is the same all the way
//   round the axis, so a half-slice holds the whole 3D cloud), stored as log10 for compactness;
// - how much of the electron lies within each distance of the proton;
// - the electric potential of the electron's own charge cloud, as multipoles (the proton's
//   +1/r is added by the viewer), for tracing electric field lines;
// - the electron's current (probability current; the electric current is its negative).
// No DOM code.
import { legendreAll, gaussLegendre } from './sim.js';

export const GRIDS = [
  { name: 'box', nx: 120, nz: 240, half: 320 },   // the whole box (its radius is 320 a₀ = 16.9 nm)
  { name: 'mid', nx: 80, nz: 160, half: 40 },
  { name: 'near', nx: 64, nz: 128, half: 6 },
];
export const CURRENT = [
  { nx: 20, nz: 40, half: 320 }, { nx: 16, nz: 32, half: 40 }, { nx: 16, nz: 32, half: 6 },
];
export const LPOT = 40;
export const RAD = (() => { const r = []; for (let x = 0.1; x < 16; x += 0.2) r.push(x); for (let x = 16; x <= 320; x += 2) r.push(x); return Float64Array.from(r); })();
export const CUMR = Float64Array.from({ length: 48 }, (_, k) => 0.5 * Math.pow(640, k / 47));   // 0.5 … 320 a₀

// u_l at radius r for every channel (spin-up), as [re[], im[]]
function radialAt(sim, r) {
  const L = sim.s.lmax, re = new Float64Array(L + 1), im = new Float64Array(L + 1);
  for (let l = 0; l <= L; l++) {
    const c = sim.ch[l], x = r / c.h - 1, j = Math.floor(x);
    if (x < 0) { const f = r / c.h; re[l] = f * c.ur[0]; im[l] = f * c.ui[0]; }
    else if (j < c.N - 1) { const f = x - j; re[l] = c.ur[j] + f * (c.ur[j + 1] - c.ur[j]); im[l] = c.ui[j] + f * (c.ui[j + 1] - c.ui[j]); }
  }
  return [re, im];
}
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);
function psiAt(sim, x, z) {
  const r = Math.max(1e-6, Math.sqrt(x * x + z * z)), P = legendreAll(sim.s.lmax, z / r), [ur, ui] = radialAt(sim, r);
  let a = 0, b = 0;
  for (let l = 0; l <= sim.s.lmax; l++) { a += ur[l] * P[l]; b += ui[l] * P[l]; }
  const f = INV_SQRT_2PI / r / Math.sqrt(sim.norm0);
  return [a * f, b * f];
}

export function fieldFrame(sim) {
  const L = sim.s.lmax, n0 = sim.norm0;
  // cumulative probability within CUMR
  const cum = new Float32Array(CUMR.length);
  for (const c of sim.ch) {
    let acc = 0, k = 0;
    for (let i = 0; i < c.N && k < CUMR.length; i++) {
      while (k < CUMR.length && c.r[i] > CUMR[k]) { cum[k] += acc; k++; }
      acc += (c.ur[i] ** 2 + c.ui[i] ** 2 + (c.dr ? c.dr[i] ** 2 + c.di[i] ** 2 : 0)) * c.h;
    }
    for (; k < CUMR.length; k++) cum[k] += acc;
  }
  for (let k = 0; k < cum.length; k++) cum[k] /= n0;
  // electron charge multipoles: n(r, μ) on Gauss nodes, projected on P_L (unnormalised)
  if (!fieldFrame.q) {
    const q = gaussLegendre(128);
    fieldFrame.q = { ...q, P: Array.from(q.x, mu => legendreAll(L, mu)), PL: Array.from(q.x, mu => { const p = legendreAll(LPOT, mu); return p.map((v, l) => v / Math.sqrt((2 * l + 1) / 2)); }) };
  }
  const Q = fieldFrame.q, NR = RAD.length, cL = new Float64Array((LPOT + 1) * NR);
  for (let k = 0; k < NR; k++) {
    const r = RAD[k], [ur, ui] = radialAt(sim, r);
    for (let q = 0; q < Q.x.length; q++) {
      const P = Q.P[q];
      let a = 0, b = 0;
      for (let l = 0; l <= L; l++) { a += ur[l] * P[l]; b += ui[l] * P[l]; }
      const n = (a * a + b * b) / (2 * Math.PI * r * r * n0), w = Q.w[q] * n, PL = Q.PL[q];
      for (let l = 0; l <= LPOT; l++) cL[l * NR + k] += (2 * l + 1) / 2 * w * PL[l];
    }
  }
  // φ_L(r) = −4π/(2L+1)·[r^−(L+1)∫₀^r c_L r'^(L+2) dr' + r^L ∫_r^∞ c_L r'^(1−L) dr']  (charge −1)
  const phi = new Float32Array((LPOT + 1) * NR);
  for (let l = 0; l <= LPOT; l++) {
    const inn = new Float64Array(NR), out = new Float64Array(NR), o = l * NR;
    let acc = 0;
    for (let k = 0; k < NR; k++) {
      const f = RAD[k] ** (l + 2) * cL[o + k];
      if (k > 0) acc += 0.5 * (f + RAD[k - 1] ** (l + 2) * cL[o + k - 1]) * (RAD[k] - RAD[k - 1]);
      else acc += f * RAD[0] / (l + 3);
      inn[k] = acc;
    }
    acc = 0;
    for (let k = NR - 1; k >= 0; k--) {
      out[k] = acc;
      if (k > 0) acc += 0.5 * (RAD[k] ** (1 - l) * cL[o + k] + RAD[k - 1] ** (1 - l) * cL[o + k - 1]) * (RAD[k] - RAD[k - 1]);
    }
    for (let k = 0; k < NR; k++) phi[o + k] = -4 * Math.PI / (2 * l + 1) * (inn[k] / RAD[k] ** (l + 1) + RAD[k] ** l * out[k]);
  }
  // current j = Im(ψ*∇ψ)/μ at cell centres of the current grids, components (along x, along z)
  const cur = CURRENT.map(g => {
    const out = new Float32Array(2 * g.nx * g.nz), d = g.half / g.nx * 0.05;
    for (let iz = 0; iz < g.nz; iz++) for (let ix = 0; ix < g.nx; ix++) {
      const x = g.half * (ix + 0.5) / g.nx, z = g.half - 2 * g.half * (iz + 0.5) / g.nz;
      const p = psiAt(sim, x, z), px1 = psiAt(sim, x + d, z), px0 = psiAt(sim, x - d, z), pz1 = psiAt(sim, x, z + d), pz0 = psiAt(sim, x, z - d);
      const gx = [(px1[0] - px0[0]) / (2 * d), (px1[1] - px0[1]) / (2 * d)], gz = [(pz1[0] - pz0[0]) / (2 * d), (pz1[1] - pz0[1]) / (2 * d)];
      const k = 2 * (iz * g.nx + ix);
      out[k] = (p[0] * gx[1] - p[1] * gx[0]) / sim.mu; out[k + 1] = (p[0] * gz[1] - p[1] * gz[0]) / sim.mu;
    }
    return out;
  });
  return { cum, phi, cur };
}

// log10 density on a grid, packed to 16 bits: v = log10(n·a₀³) in [−32, 0.7] → (v + 32)·2000; 0 = nothing.
export function packLog(img) {
  const o = new Uint16Array(img.length);
  for (let i = 0; i < img.length; i++) { const v = img[i]; o[i] = v <= -32 ? 0 : Math.min(65535, Math.round((v + 32) * 2000)); }
  return o;
}
export const unpackLog = u => (u === 0 ? -99 : u / 2000 - 32);
