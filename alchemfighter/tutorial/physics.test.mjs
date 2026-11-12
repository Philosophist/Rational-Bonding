// Run with: node --test alchemfighter/tutorial/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from './physics.js';
import * as Q from './quantum.js';

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

test('capture odds: averaged over a uniform beam, they reproduce the computed cross section', () => {
  for (const E of [0.1, 1, 10]) {
    // ∫ 2πb·chance db, with the pass's angular momentum L = b/ƛ (in ħ)
    const lb = P.reducedWavelength(E);
    let s = 0;
    const N = 6000, bMax = 14 * lb, h = bMax / N;
    for (let i = 0; i <= N; i++) { const b = i * h; s += (i === 0 || i === N ? 0.5 : 1) * 2 * Math.PI * b * P.captureChanceReal(E, b / lb) * h; }
    assert.ok(Math.abs(s / P.captureSigma(E) - 1) < 0.04, `E=${E}: ${s} vs ${P.captureSigma(E)}`);
  }
});

test('computed capture agrees with Kramers (with the known Gaunt factors)', () => {
  // into 1s the exact cross section is about 0.8 of Kramers at low energy; summed to n = 6 it is close
  const Q1 = Q.captureTable(0.1).flat().filter(x => x.n === 1).reduce((a, x) => a + x.sigma, 0);
  assert.ok(Q1 / P.kramersSigma(1, 0.1) > 0.75 && Q1 / P.kramersSigma(1, 0.1) < 0.85);
  let k = 0;
  for (let n = 1; n <= 6; n++) k += P.kramersSigma(n, 0.1);
  assert.ok(Math.abs(P.captureSigma(0.1) / k - 0.9) < 0.1);
});

test('capture odds: what matters is the pass\'s angular momentum, by the real ratios', () => {
  const lb = P.reducedWavelength(0.1);
  const good = P.captureChanceReal(0.1, 0.5 / lb);          // b = 0.5 nm: mostly the l = 1 wave
  const fast = P.captureChanceReal(10, 0.5 / P.reducedWavelength(10));
  const wide = P.captureChanceReal(0.1, 4 / lb);
  const headOn = P.captureChanceReal(0.1, 0);
  assert.ok(good > 10 * fast);
  assert.ok(good > 10 * wide);
  assert.ok(good > headOn);                                   // dead centre is the l = 0 wave: p orbitals only
  assert.ok(good < 1e-5);
  const g = P.captureChanceGame(0.1, 0.5 / lb);
  assert.ok(g > 0.1 && g < 0.6, `good slow shot: ${g}`);
  assert.ok(Math.abs(g / good - P.RATE_BOOST) / P.RATE_BOOST < 1e-9);
});

test('capture lands where the pass\'s angular momentum allows: l changes by exactly one', () => {
  const r = rng(3);
  for (let i = 0; i < 400; i++) {
    const s = P.pickCaptureState(0.1, 0, r);                 // head-on: l = 0 wave (mostly)
    if (s.lIn === 0) assert.equal(s.l, 1);
    assert.equal(Math.abs(s.l - s.lIn), 1);
  }
  // A head-on slow pass essentially never lands in 3d; a pass with L ≈ 3.5 ħ often does.
  const count = (L, n, l) => { let c = 0; for (let i = 0; i < 2000; i++) { const s = P.pickCaptureState(0.1, L, r); if (s.n === n && s.l === l) c++; } return c / 2000; };
  assert.ok(count(0, 3, 2) < 0.02);
  assert.ok(count(3.5, 3, 2) > 0.15);
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

test('a group of two is the pair model exactly', () => {
  const lam = 121.567, G = 0.37, Gr = 0.37, pos = [[0, 0, 0], [6, 2, 1]];
  const d = [6, 2, 1], r = Math.hypot(...d), cy = d[1] / r, p = cy * cy;
  for (const [t, D] of [[0.5, 0], [3, 40], [20, 0]]) {
    const k = P.pairCoupling(2 * Math.PI * r / lam, p), c2 = [1, 0, 0, 0];
    P.pairStep(c2, t, { G, Gr, J: k.J * Gr, F: k.F, D });
    const M = P.groupMatrix(pos, lam, { G, Gr, D: [D / 2, -D / 2], pOf: u => u[1] * u[1] });
    const c = P.groupApply(P.groupPropagator(M, t), { re: [1, 0], im: [0, 0] });
    for (const [x, y] of [[c.re[0], c2[0]], [c.im[0], c2[1]], [c.re[1], c2[2]], [c.im[1], c2[3]]]) assert.ok(Math.abs(x - y) < 1e-9, `${x} vs ${y}`);
  }
});

test('a group far apart behaves as lone atoms; one step equals many small ones', () => {
  const lam = 121.567, G = 0.4, Gr = 0.35, pOf = u => u[1] * u[1];
  const far = P.groupMatrix([[0, 0, 0], [5e4, 0, 0], [0, 0, 7e4]], lam, { G, Gr, pOf });
  const c = P.groupApply(P.groupPropagator(far, 3), { re: [1, 0, 0], im: [0, 0, 0] });
  assert.ok(Math.abs(P.groupNorm(c) - Math.exp(-G * 3)) < 1e-3, P.groupNorm(c));
  const pos = [[0, 0, 0], [3, 1, 0], [-2, 4, 5], [8, -3, 2], [1, 9, -6]];
  const M = P.groupMatrix(pos, lam, { G, Gr, D: [30, -500, 0, 2000, 7], pOf });
  const a = P.groupApply(P.groupPropagator(M, 2), { re: [1, 0, 0, 0, 0], im: [0, 0, 0, 0, 0] });
  let b = { re: [1, 0, 0, 0, 0], im: [0, 0, 0, 0, 0] };
  const U = P.groupPropagator(M, 2 / 64);
  for (let i = 0; i < 64; i++) b = P.groupApply(U, b);
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(a.re[i] - b.re[i]) < 1e-8 && Math.abs(a.im[i] - b.im[i]) < 1e-8);
  // the norm only ever falls, at the rate the light and the other branches leave
  const c0 = { re: [0.5, 0.5, 0.5, 0.5, 0], im: [0, 0, 0, 0, 0] }, M0 = P.groupMatrix(pos, lam, { G, Gr, pOf });
  const h = 1e-5, c1 = P.groupApply(P.groupPropagator(M0, h), { re: [...c0.re], im: [...c0.im] });
  const rate = (P.groupNorm(c0) - P.groupNorm(c1)) / h;
  assert.ok(Math.abs(rate - ((G - Gr) * P.groupNorm(c0) + Gr * P.groupLightRate(M0, c0))) < 1e-3 * rate, rate);
});

test('atoms close together and in step flash together: N times one atom\'s rate', () => {
  const lam = 121.567, pOf = u => u[1] * u[1];
  // four atoms in the plane across the dipole, 1.2 nm apart: far closer than the wavelength
  const pos = [[0, 0, 0], [1.2, 0, 0], [0, 0, 1.2], [1.2, 0, 1.2]];
  const M = P.groupMatrix(pos, lam, { G: 1, Gr: 1, pOf });
  const inStep = { re: [0.5, 0.5, 0.5, 0.5], im: [0, 0, 0, 0] }, against = { re: [0.5, -0.5, -0.5, 0.5], im: [0, 0, 0, 0] };
  assert.ok(P.groupLightRate(M, inStep) > 3.95, P.groupLightRate(M, inStep));
  assert.ok(P.groupLightRate(M, against) < 0.01, P.groupLightRate(M, against));
  // and the light's direction: two atoms half a wavelength apart, in step, send nothing along their line
  const two = [[0, 0, 0], [lam / 2, 0, 0]], c = { re: [Math.SQRT1_2, Math.SQRT1_2], im: [0, 0] };
  assert.ok(P.groupArrayFactor(two, c, lam, [1, 0, 0]) < 1e-9);
  assert.ok(Math.abs(P.groupArrayFactor(two, c, lam, [0, 0, 1]) - 2) < 1e-9);
});

// ---------------------------------------------------------------------------
// Neutral atoms, collisions and recoil
// ---------------------------------------------------------------------------
const mom = ps => ps.reduce((s, p) => s.map((x, k) => x + p.m * p.vel[k]), [0, 0, 0]);
const atomAt = (pos, vel = [0, 0, 0], n = 1) => ({ id: `a${pos}`, q: 0, m: P.MP + P.ME, pos: [...pos], vel: [...vel], active: true, pol: P.atomPol(n) });

test('a 1s atom is pulled by a charge with its real polarizability', () => {
  assert.ok(Math.abs(P.ALPHA_1S / P.A0 ** 3 - 4.5) < 1e-12);
  const pol = P.atomPol(1);
  for (const r of [1, 2, 5]) {   // far out, the pull is −α·k/(2r⁴)
    const F = P.KE / (r * r), want = -0.5 * P.ALPHA_1S * P.KE / r ** 4;
    assert.ok(Math.abs(P.polEnergy(F, pol) / want - 1) < 0.01, `${r} nm`);
  }
  // About 0.5 meV at 1 nm: some 10,000 times a Lyman-α kick's energy.
  const vKick = (P.HC / P.lambdaFor(1, 2)) / P.C / P.MP, kick = 0.5 * P.MP * vKick ** 2;
  assert.ok(-P.polEnergy(P.KE, pol) / kick > 5000);
});

test('an atom and a proton pull together, bounce off the core, and keep energy and momentum', () => {
  const proton = { id: 'p', q: 1, m: P.MP, pos: [0, 0, 0], vel: [0, 0, 0], active: true };
  const atom = atomAt([0.6, 0.02, 0]);
  const ps = [proton, atom], E0 = P.totalEnergy(ps);
  let rmin = Infinity;
  for (let i = 0; i < 400; i++) { P.stepCharges(ps, 5, new Map()); rmin = Math.min(rmin, Math.hypot(...atom.pos.map((x, k) => x - proton.pos[k]))); }
  assert.ok(rmin < 0.3 && rmin > 0.05, `closest ${rmin}`);
  assert.ok(Math.abs(P.totalEnergy(ps) - E0) < 1e-3 * Math.abs(E0), `${P.totalEnergy(ps)} vs ${E0}`);
  const p = mom(ps);
  assert.ok(Math.hypot(...p) < 1e-6 * P.MP * 1e-3, `momentum ${p}`);
});

test('the dipole made by an electron and a proton side by side pulls an atom less than the proton alone', () => {
  const pol = P.atomPol(1);
  const alone = P.totalEnergy([{ q: 1, m: P.MP, pos: [0, 0, 0], vel: [0, 0, 0], active: true }, atomAt([1, 0, 0])]);
  const pair = [{ q: 1, m: P.MP, pos: [0, 0, 0], vel: [0, 0, 0], active: true }, { q: -1, m: P.ME, pos: [0, 0.1, 0], vel: [0, 0, 0], active: true }, atomAt([1, 0, 0])];
  const pairE = P.totalEnergy(pair) - P.totalEnergy(pair.slice(0, 2));
  assert.ok(Math.abs(pairE) < 0.1 * Math.abs(alone), `${pairE} vs ${alone}`);
  assert.ok(pol.c8 > 0);
});

test('two H atoms attract by van der Waals, bounce, and keep energy', () => {
  const a = atomAt([0, 0, 0], [0, 0, 0]), b = atomAt([0.8, 0.05, 0], [-2e-6, 0, 0]);
  const ps = [a, b], E0 = P.totalEnergy(ps);
  // C6 at 1 nm: about 3.9 µeV.
  assert.ok(Math.abs(P.C6_HH - 3.88e-6) < 0.02e-6, P.C6_HH);
  let rmin = Infinity;
  for (let i = 0; i < 300; i++) { P.stepCharges(ps, 200, new Map()); rmin = Math.min(rmin, Math.hypot(...a.pos.map((x, k) => x - b.pos[k]))); }
  assert.ok(rmin > 0.3 && rmin < 0.45, `closest ${rmin}`);
  assert.ok(Math.abs(P.totalEnergy(ps) - E0) < 1e-3 * Math.abs(E0) + 1e-12);
  const p = mom(ps);
  assert.ok(Math.hypot(p[0] + 2e-6 * b.m, p[1], p[2]) < 1e-9 * b.m);   // momentum is what b started with
});

test('an electron passing an atom is reported once, with its closest approach', () => {
  const atom = atomAt([0, 0, 0]);
  const e = { id: 'e', q: -1, m: P.ME, pos: [-10, 0.5, 0], vel: [P.electronSpeed(15), 0, 0], active: true };
  const ps = [atom, e], enc = new Map(), events = [];
  for (let i = 0; i < 20; i++) events.push(...P.stepCharges(ps, 1, enc).events);
  assert.equal(events.length, 1);
  assert.ok(events[0].atom && Math.abs(events[0].rp - 0.5) < 0.02 && Math.abs(events[0].E - 15) < 0.05, JSON.stringify({ rp: events[0].rp, E: events[0].E }));
});

test('electron impact: local reach, real total cross section, momentum and energy kept, real atom recoil', () => {
  const E = 15;
  // Summed over a uniform beam, the pass chance gives back σ.
  let sum = 0;
  for (let i = 0; i < 4000; i++) { const b = (i + 0.5) * 0.001; sum += 2 * Math.PI * b * 0.001 * P.impactChanceReal(E, b); }
  const sig = P.collExciteSigma(E) + P.collIonSigma(E);
  assert.ok(Math.abs(sum / sig - 1) < 0.01, `${sum} vs ${sig}`);
  // In the game, a 2 nm pass has almost no chance; a 0.3 nm pass almost always hits.
  assert.ok(P.impactChanceGame(E, 2.5) < 0.01 && P.impactChanceGame(E, 0.3) > 0.5);
  const r = rng(3);
  for (let k = 0; k < 20; k++) {
    const e = { m: P.ME, vel: [P.electronSpeed(E), 0, 0] }, a = { m: P.MP + P.ME, vel: [0, 0, 0] };
    const p0 = mom([e, a]), K0 = 0.5 * e.m * P.electronSpeed(E) ** 2;
    assert.ok(P.inelasticScatter(e, a, P.EXCITE_E, P.impactAngle(E, P.EXCITE_E, r), r));
    const p1 = mom([e, a]), K1 = 0.5 * e.m * e.vel.reduce((s, x) => s + x * x, 0) + 0.5 * a.m * a.vel.reduce((s, x) => s + x * x, 0);
    assert.ok(Math.hypot(...p1.map((x, i) => x - p0[i])) < 1e-12 * Math.hypot(...p0));
    assert.ok(Math.abs(K0 - K1 - P.EXCITE_E) < 1e-9);
    // The atom moves off at hundreds of m/s (1 m/s = 1e-6 nm/fs): over 100 Lyman-α kicks.
    assert.ok(Math.hypot(...a.vel) / 1e-6 > 450, `${Math.hypot(...a.vel) / 1e-6} m/s`);
  }
  assert.equal(P.inelasticScatter({ m: P.ME, vel: [P.electronSpeed(5), 0, 0] }, { m: P.MP, vel: [0, 0, 0] }, P.EXCITE_E, 0), false);
});

test('when an atom comes apart, the proton takes the recoil and momentum is kept', () => {
  const vAtom = [1e-5, -2e-5, 3e-6], dir = [0, 0.6, 0.8], extra = 0.3, r0 = 0.5;
  const { vE, vP } = P.launchApart(vAtom, P.MP, P.ME, dir, extra, r0);
  const before = vAtom.map(v => v * (P.MP + P.ME)), after = vE.map((v, k) => v * P.ME + vP[k] * P.MP);
  assert.ok(Math.hypot(...after.map((x, k) => x - before[k])) < 1e-12 * P.MP);
  // Let the pair fly apart: far away the electron has `extra` eV relative to the proton.
  const proton = { id: 'p', q: 1, m: P.MP, pos: [0, 0, 0], vel: vP, active: true };
  const e = { id: 'e', q: -1, m: P.ME, pos: dir.map(x => x * r0), vel: vE, active: true };
  const ps = [proton, e];
  for (let i = 0; i < 100; i++) P.stepCharges(ps, 1, new Map(), 1e9);
  const rel = e.vel.map((v, k) => v - proton.vel[k]), mu = P.MP * P.ME / (P.MP + P.ME), r = Math.hypot(...e.pos.map((x, k) => x - proton.pos[k]));
  assert.ok(Math.abs(0.5 * mu * rel.reduce((s, x) => s + x * x, 0) - P.KE / r - extra) < 2e-3);
  const pEnd = mom(ps);
  assert.ok(Math.hypot(...pEnd.map((x, k) => x - before[k])) < 1e-9 * P.MP);
});

test('excited atoms lean far more than 1s in the same field', () => {
  const F = P.KE / 25;   // a proton 5 nm away
  const p1 = P.dipoleMag(F, P.atomPol(1)), p2 = P.dipoleMag(F, P.atomPol(2));
  assert.ok(p2 / p1 > 1000, `${p2 / p1}`);
  assert.ok(Math.abs(p2 / (3 * P.A0) - 1) < 1e-3);   // the full n = 2 Stark dipole, 3 e·a₀
});

test('quantum: decay rates computed from the orbitals match the measured lifetimes', () => {
  const T = Q.decayTable();
  for (const [k, tau] of [['2,1', 1.596], ['3,0', 158.6], ['3,1', 5.27], ['3,2', 15.6], ['4,3', 72.6]]) assert.ok(Math.abs(T[k].tau / tau - 1) < 0.015, `${k}: ${T[k].tau}`);
  assert.ok(Math.abs(T['3,1'].br[0][2] - 0.882) < 0.002);
  for (let n = 2; n <= Q.NMAX; n++) for (let l = 0; l < n; l++) assert.ok(T[`${n},${l}`], `${n},${l}`);
});

test('quantum: photoionization of 1s at threshold is 6.30e-18 cm²', () => {
  const s = Q.photoionSigmaAU(1, 0, 0.5 + 1e-6, 1) * (0.529177e-8) ** 2;
  assert.ok(Math.abs(s / 6.30e-18 - 1) < 0.01, `${s}`);
});

test('quantum: a field splits shell n into the Stark states (3/2)·n·k, and the cloud stays centred', () => {
  for (const [n, m] of [[2, 0], [3, 0], [3, 1], [4, 0], [5, 2]]) {
    const v = Q.eigSym(Q.starkMatrix(n, m).Z).vals.sort((a, b) => a - b);
    const want = [];
    for (let k = -(n - 1 - m); k <= n - 1 - m; k += 2) want.push(1.5 * n * k);
    v.forEach((x, i) => assert.ok(Math.abs(x - want[i]) < 1e-6, `${n},${m}: ${v}`));
  }
  // A pure 3d0 state in a field sloshes into 3s and 3p and back. Its norm is kept, and so is its
  // mean position along the field (z commutes with the field's energy F·z inside the shell): it
  // starts centred on the proton and stays centred; only its shape changes.
  let c = { re: [0, 0, 1], im: [0, 0, 0] }, minD = 1;
  for (let i = 0; i < 200; i++) {
    c = Q.evolveShell(3, 0, 1e-3, c, 20);
    const nrm = c.re.reduce((a, x, j) => a + x * x + c.im[j] ** 2, 0);
    assert.ok(Math.abs(nrm - 1) < 1e-9);
    assert.ok(Math.abs(Q.shellDipole(3, 0, c)) < 1e-9);
    minD = Math.min(minD, c.re[2] ** 2 + c.im[2] ** 2);
  }
  assert.ok(minD < 0.5, `the shape sloshes away from pure 3d: ${minD}`);
  // Averaged over the sloshing, a field takes much of 3d0 into 3s and 3p
  const avg = Q.shellAverage(3, 0, 1e-3, { re: [0, 0, 1], im: [0, 0, 0] });
  assert.ok(avg.p[2] < 0.7 && avg.p[1] > 0.1);
  // 2s in a field far below the Lamb-shift field stays 2s
  const weak = Q.shellAverage(2, 0, 1e-12, { re: [1, 0], im: [0, 0] });
  assert.ok(weak.p[0] > 0.999);
});
