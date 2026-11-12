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

test('the wall is a mirror: angle in equals angle out', () => {
  const e = { id: 'e', q: -1, m: P.ME, pos: [30, 25, 0], vel: [1.5, 1, 0.5], active: true };
  const v0 = [...e.vel];
  for (let i = 0; i < 40 && !e.bounces; i++) P.stepCharges([e], 1, new Map(), P.SPHERE_R, 4000);
  assert.equal(e.bounces, 1);
  const r = Math.hypot(...e.pos), n = e.pos.map(x => x / r);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vin = dot(v0, n), vout = dot(e.vel, n);
  assert.ok(Math.abs(vin + vout) < 1e-6, `${vin} vs ${vout}`);   // normal part reversed
  const tin = v0.map((x, k) => x - vin * n[k]), tout = e.vel.map((x, k) => x - vout * n[k]);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(tin[k] - tout[k]) < 1e-6);   // along-wall part kept
  assert.deepEqual(P.mirrorBounce([1, 2, 3], [1, 0, 0]), [-1, 2, 3]);
});

test('classify names the radiation', () => {
  assert.equal(P.classify(121.57).name, 'far ultraviolet');
  assert.equal(P.classify(91).name, 'extreme ultraviolet');
  assert.equal(P.classify(656.47).name, 'red light');
  assert.equal(P.classify(486.27).name, 'cyan light');
  assert.equal(P.classify(434.2).name, 'violet light');
  assert.equal(P.classify(1875.6).name, 'short-wave infrared');
  assert.equal(P.classify(0.005).name, 'gamma ray');
  assert.equal(P.classify(2.1e8).name, 'microwave');   // the 21 cm hydrogen line
  assert.equal(P.seriesName(2), 'Balmer');
});

test('photoionization and collision cross-sections', () => {
  assert.equal(P.photoionSigma(1, 13), 0);
  assert.ok(Math.abs(P.photoionSigma(1, P.RY) - 6.3e-4) < 1e-9);
  assert.ok(P.photoionSigma(2, 3.5) > P.photoionSigma(2, 10.2));
  // A 13.7 eV photon loose in the box finds a given 1s atom in about 1.4 ns.
  const t = 1 / P.photoRate(1, 13.7);
  assert.ok(t > 1 && t < 2, t);
  assert.equal(P.collExciteSigma(5), 0);
  assert.ok(P.collExciteSigma(20) > 0.005 && P.collExciteSigma(20) < 0.01);
  assert.ok(P.collIonSigma(40) > 0.005 && P.collIonSigma(40) < 0.012);
});

test('a sealed box of 11 freshly made atoms settles mostly ionized', () => {
  // 11 protons and 11 electrons fired in at 0.1 eV each.
  const b = P.sahaBalance(11, 11, 11 * 0.1);
  assert.ok(b.fraction > 0.6 && b.fraction < 0.9, b.fraction);
  assert.ok(b.kelvin > 10000 && b.kelvin < 20000, b.kelvin);
  // With all the energy drained out (light escaped), it stays neutral.
  const cold = P.sahaBalance(11, 11, -11 * P.RY + 0.3);
  assert.ok(cold.fraction < 0.05, cold.fraction);
});

test('2s is let go by an electric field (Stark mixing)', () => {
  // 1 V/cm = 1e-7 V/nm: about 2,780 per second measured.
  const perS = P.starkQuenchRate(1e-7) * 1e9;
  assert.ok(perS > 2600 && perS < 2900, perS);
  assert.ok(Math.abs(P.STARK_FC / 1e-7 - 477) < 3, P.STARK_FC);
  // A strong field mixes 2s and 2p half and half: 2s then lives twice as long as 2p.
  assert.ok(Math.abs(1 / P.starkQuenchRate(1e-2) - 2 * P.DECAY['2,1'].tau) < 0.01);
  assert.equal(P.starkQuenchRate(0), 0);
  // One bare proton 40 nm away is already far past the mixing field.
  const F = P.fieldAt([40, 0, 0], [{ active: true, q: 1, pos: [0, 0, 0] }, { active: true, q: 0, pos: [39, 0, 0] }]);
  assert.ok(Math.abs(F[0] - P.KE / 1600) < 1e-12 && F[1] === 0);
  assert.ok(F[0] > 10 * P.STARK_FC);
});

test('two atoms sharing one excitation', () => {
  // Close together the shared decay is complete (F → 1) and the swinging goes as 1/x³.
  for (const p of [0, 0.5, 1]) {
    const k = P.pairCoupling(0.05, p);
    assert.ok(Math.abs(k.F - 1) < 0.01, k.F);
    assert.ok(Math.abs(k.J - 0.75 * (1 - 3 * p) / 0.05 ** 3) / Math.abs(k.J) < 0.01, k.J);
  }
  // Far apart both fade away.
  const far = P.pairCoupling(60, 0);
  assert.ok(Math.abs(far.F) < 0.03 && Math.abs(far.J) < 0.02);
  // No field shift: the excitation swings fully across in a quarter period π/(2J), and the chance
  // that no photon has left is (e^(−Γs·t) + e^(−Γa·t))/2 with Γs,a = Γ(1 ± F).
  const k = P.pairCoupling(0.26, 0), G = 1, par = { G, Gr: G, J: k.J * G, F: k.F, D: 0 };
  const c = [1, 0, 0, 0], t = Math.PI / (2 * par.J);
  for (let i = 0; i < 50; i++) P.pairStep(c, t / 50, par);
  const nA = c[0] ** 2 + c[1] ** 2, nB = c[2] ** 2 + c[3] ** 2;
  assert.ok(nA / (nA + nB) < 1e-3, nA / (nA + nB));
  const expect = (Math.exp(-(1 + k.F) * t) + Math.exp(-(1 - k.F) * t)) / 2;
  assert.ok(Math.abs(nA + nB - expect) < 1e-9, `${nA + nB} vs ${expect}`);
  // Left alone a long time, what survives is the out-of-step shape: half on each atom.
  const d = [1, 0, 0, 0];
  P.pairStep(d, 8, par);
  const dA = d[0] ** 2 + d[1] ** 2, dB = d[2] ** 2 + d[3] ** 2;
  assert.ok(Math.abs(dA / (dA + dB) - 0.5) < 0.01, dA / (dA + dB));
  // A field that shifts one atom's level far more than the coupling keeps the excitation at home,
  // and it then leaves at the single atom's own rate.
  const e = [1, 0, 0, 0], off = { ...par, D: 400 * par.J };
  let maxB = 0;
  for (let i = 0; i < 400; i++) { P.pairStep(e, 0.0025, off); maxB = Math.max(maxB, e[2] ** 2 + e[3] ** 2); }
  assert.ok(maxB < 1e-3, maxB);
  assert.ok(Math.abs(e[0] ** 2 + e[1] ** 2 - Math.exp(-1)) < 0.01);
});
