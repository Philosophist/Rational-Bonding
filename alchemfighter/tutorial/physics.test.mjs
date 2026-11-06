// Run with: node --test alchemfighter/tutorial/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from './physics.js';

// Seeded random numbers so the statistical tests are repeatable.
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('hydrogen lines', () => {
  assert.ok(Math.abs(P.lambdaFor(1, 2) - 121.57) < 0.05);
  assert.ok(Math.abs(P.lambdaFor(2, 3) - 656.47) < 0.1);
  assert.equal(P.lineName(P.lambdaFor(2, 3)), 'H-α');
});

test('Kramers cross section: slower is far more likely, and n = 1 dominates at low energy', () => {
  assert.ok(P.captureSigma(0.1) > 50 * P.captureSigma(10));
  assert.ok(P.kramersSigma(1, 0.1) > P.kramersSigma(2, 0.1));
  // about 2.8e-20 cm² for n = 1 at 0.1 eV
  assert.ok(Math.abs(P.kramersSigma(1, 0.1) * 1e-14 / 2.8e-20 - 1) < 0.05);
});

test('periapsis: the proton pulls slow electrons in close', () => {
  assert.ok(Math.abs(P.periapsis(1, 1000) - 1) < 0.01);          // fast: almost straight
  assert.ok(P.periapsis(1, 0.1) < 0.1);                            // slow: focused inward
  const E = 0.5, b = 1.3, v = P.electronSpeed(E);
  assert.ok(Math.abs(P.periapsisFromL(b * v, E) - P.periapsis(b, E)) < 1e-9);
});

test('capture odds: averaged over a uniform beam, they reproduce the Kramers cross section', () => {
  for (const E of [0.1, 1, 10]) {
    let s = 0;
    const lo = Math.log(1e-5), hi = Math.log(1e4), N = 4000, h = (hi - lo) / N;
    for (let i = 0; i <= N; i++) { const b = Math.exp(lo + i * h); s += (i === 0 || i === N ? 0.5 : 1) * 2 * Math.PI * b * b * P.captureChanceReal(E, P.periapsis(b, E)) * h; }
    assert.ok(Math.abs(s / P.captureSigma(E) - 1) < 0.01, `E=${E}: ${s} vs ${P.captureSigma(E)}`);
  }
});

test('capture odds: slow and close beats fast or wide, by the real ratios', () => {
  const slowClose = P.captureChanceReal(0.1, P.periapsis(0.5, 0.1));
  const fastClose = P.captureChanceReal(10, P.periapsis(0.5, 10));
  const slowWide = P.captureChanceReal(0.1, P.periapsis(4, 0.1));
  assert.ok(slowClose > 10 * fastClose);
  assert.ok(slowClose > 10 * slowWide);
  // Real odds per pass are tiny; the game multiplies them by one shared factor.
  assert.ok(slowClose < 1e-5);
  const g = P.captureChanceGame(0.1, P.periapsis(0.5, 0.1));
  assert.ok(g > 0.15 && g < 0.6, `good slow shot: ${g}`);
  assert.ok(Math.abs(g / slowClose - P.RATE_BOOST) / P.RATE_BOOST < 1e-9);
});

test('aim cone: slower electrons have wider cones', () => {
  assert.ok(P.coneWidth(0.1, 25) > 5 * P.coneWidth(10, 25));
});

test('every cascade ends in 1s and conserves energy', () => {
  const r = rng(7);
  for (let i = 0; i < 2000; i++) {
    const st = P.pickCaptureState(0.1, r);
    assert.ok(st.n >= 1 && st.n <= P.CAPTURE_NMAX && st.l < st.n && Math.abs(st.m) <= st.l);
    const steps = P.cascade(st, r);
    const end = steps.length ? steps[steps.length - 1].to : st;
    assert.equal(end.n, 1);
    const emitted = steps.flatMap(s => s.photons).reduce((a, l) => a + P.HC / l, 0);
    assert.ok(Math.abs(emitted - (P.levelE(st.n) - P.levelE(1))) < 1e-6);
    for (const s of steps) if (!s.twoPhoton) assert.equal(Math.abs(s.from.l - s.to.l), 1);   // Δl = ±1
  }
});

test('2s gives off two photons that share 10.2 eV', () => {
  const d = P.pickDecay({ n: 2, l: 0, m: 0 }, rng(3));
  assert.equal(d.photons.length, 2);
  const e = d.photons.reduce((a, l) => a + P.HC / l, 0);
  assert.ok(Math.abs(e - 10.2) < 0.01);
});

test('Coulomb motion conserves energy through a close pass and reports it once', () => {
  const E = 0.2, b = 0.8, x0 = -20;
  const proton = { id: 'p', q: 1, m: P.MP, pos: [0, 0, 0], vel: [0, 0, 0], active: true };
  const KE0 = E + P.KE / Math.hypot(x0, b);
  const e = { id: 'e', q: -1, m: P.ME, pos: [x0, b, 0], vel: [P.electronSpeed(KE0), 0, 0], active: true };
  const ps = [proton, e], enc = new Map(), E0 = P.totalEnergy(ps);
  const events = [];
  for (let i = 0; i < 150; i++) events.push(...P.stepCharges(ps, 1, enc).events);
  assert.equal(events.length, 1);
  assert.ok(Math.abs(P.totalEnergy(ps) - E0) < 1e-3 * Math.abs(E0) + 1e-4);
  // The measured closest approach matches the two-body prediction for where it started.
  const h = b * P.electronSpeed(KE0);
  assert.ok(Math.abs(events[0].rp - P.periapsisFromL(h, E)) < 0.01, `${events[0].rp} vs ${P.periapsisFromL(h, E)}`);
});

test('the wall keeps matter in', () => {
  const e = { id: 'e', q: -1, m: P.ME, pos: [39, 0, 0], vel: [2, 0, 0], active: true };
  const r = rng(5);
  for (let i = 0; i < 5; i++) P.stepCharges([e], 1, new Map(), P.SPHERE_R, 4000, r);
  assert.ok(Math.hypot(...e.pos) <= P.SPHERE_R);
  assert.equal(e.bounces, 1);
  assert.ok(Math.abs(Math.hypot(...e.vel) - 2) < 1e-9);   // no energy lost
  assert.ok(e.vel[0] < 0);                                   // heading back inside
});
