// Checks of the grid against known physics.  node --test lab/hydrogen/sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, MP, C, FS_PER_AU } from './sim.js';
import { exp, sin, cos } from './detmath.js';

const mu = MP / (1 + MP), a2 = 1 / (C * C), En = n => mu / (2 * n * n);
const small = { lmax: 8, fineL: 8, rmax: 120, nmax: 4, nEps: 8, cap: 30 };
const E = (s, n, l) => s.bound.find(b => b.n === n && b.l === l).E;

test('deterministic exp, sin and cos agree with Math to a few units in the last place', () => {
  for (let i = 0; i < 2000; i++) {
    const x = (i - 1000) * 0.37;
    assert.ok(Math.abs(exp(x / 3) / Math.exp(x / 3) - 1) < 2e-15);
    assert.ok(Math.abs(sin(x) - Math.sin(x)) < 1e-15 && Math.abs(cos(x) - Math.cos(x)) < 1e-15);
  }
});

test('levels found by the grid match Bohr (with recoil) to 5 parts per million', () => {
  const s = new Sim({ ...small, fine: false });
  for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 2], [4, 0], [4, 3]]) {
    assert.ok(Math.abs(E(s, n, l) / -En(n) - 1) < 5e-6, `${n},${l}`);
  }
});

test('spin and relativity shift the levels as the Dirac equation does (to 3%)', () => {
  const a = new Sim({ ...small, fine: false }), b = new Sim({ ...small, fine: true });
  for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 1], [3, 2]]) {
    const got = E(b, n, l) - E(a, n, l);
    const want = l === 0 ? -(En(n) ** 2 * a2 / 2) * (4 * n - 3) : -(En(n) ** 2 * a2 / 2) * (4 * n / (l + 0.5) - 3);
    assert.ok(Math.abs(got / want - 1) < 0.03, `${n},${l}: ${got} vs ${want}`);
  }
  // spin–orbit splitting of 2p: ξ·(l + ½) with ξ = ⟨1/(2c²r³)⟩ over the grid's own 2p
  const B = b.bound.find(x => x.n === 2 && x.l === 1), c = b.ch[1];
  let xi = 0; for (let i = 0; i < c.N; i++) xi += B.v[i] * B.p[i] / (2 * C * C * c.r[i] ** 3);
  const splitEv = xi * 1.5 * 27.211386245988;
  assert.ok(Math.abs(splitEv / 4.5283e-5 - 1) < 0.01, `2p split ${splitEv}`);
});

test('lifetimes from the grid match measured values', () => {
  const s = new Sim({ ...small, fine: false });
  const t = s.lifetimes(), tau = (n, l) => t.find(x => x.n === n && x.l === l).tauNs;
  assert.ok(Math.abs(tau(2, 1) / 1.596 - 1) < 0.002);
  assert.ok(Math.abs(tau(3, 2) / 15.47 - 1) < 0.01);
  assert.ok(Math.abs(tau(4, 3) / 72.5 - 1) < 0.01);
});

test('probability and energy are kept while the wave is away from the edge', () => {
  const s = new Sim({ ...small, rmax: 200, cap: 40, startNm: 3, widthNm: 0.6, light: false });
  const o0 = s.observables();
  for (let k = 0; k < 300; k++) s.step();
  const o1 = s.observables();
  assert.ok(Math.abs(o1.inBox - 1) < 1e-12, `norm ${o1.inBox}`);
  assert.ok(Math.abs(o1.energyEv - o0.energyEv) < 1e-9, `energy ${o0.energyEv} → ${o1.energyEv}`);
});

test('without Coulomb a free packet spreads as it should', () => {
  const s = new Sim({ ...small, coulomb: false, light: false, fine: false, rmax: 200, cap: 40, startNm: 0.0001, widthNm: 0.4, energyEv: 0, lmax: 4 });
  const sig = 0.4 / 0.0529177210903, T = 200;
  for (let k = 0; k < T / s.s.dt; k++) s.step();
  // ⟨r²⟩ = 3σ²(1 + (t/2μσ²)²) for a Gaussian at rest
  let r2 = 0, n = 0;
  for (const c of s.ch) for (let i = 0; i < c.N; i++) { const p = c.ur[i] ** 2 + c.ui[i] ** 2; r2 += p * c.r[i] ** 2; n += p; }
  const want = 3 * sig * sig * (1 + (T / (2 * s.mu * sig * sig)) ** 2);
  assert.ok(Math.abs(r2 / n / want - 1) < 1e-3, `${r2 / n} vs ${want}`);
  void FS_PER_AU;
});

test('the same settings give the same bits', () => {
  const run = () => { const s = new Sim({ ...small, rmax: 150, cap: 30 }); for (let k = 0; k < 50; k++) s.step(); return s.observables(); };
  const a = run(), b = run();
  assert.equal(a.energyEv, b.energyEv); assert.equal(a.captured, b.captured);
});
