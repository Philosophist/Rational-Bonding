// Tests for the well bubble (wells.js): node --test alchemfighter/tutorial/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as WL from './wells.js';

const W = WL.buildWell();
const tauNs = a => 1 / W.gamma[a] * WL.T_AU_FS * 1e-6;

test('the bubble finds hydrogen\'s levels from Schrödinger\'s equation alone', () => {
  for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 2], [4, 3], [5, 0], [6, 5]]) {
    const E = W.rad[l].E[n - l - 1] - (n === 2 && l === 0 ? WL.LAMB_AU : 0), exact = -0.5 * WL.MU / (n * n);
    assert.ok(Math.abs(E / exact - 1) < 5e-5, `${n},${l}: ${E} vs ${exact}`);
  }
});

test('lifetimes come out of the computed overlaps (2p 1.596 ns, 3p 5.27 ns, 3d 15.6 ns)', () => {
  assert.ok(Math.abs(tauNs(W.index(2, 1, 0)) - 1.596) < 0.005);
  assert.ok(Math.abs(tauNs(W.index(3, 1, 1)) - 5.27) < 0.03);
  assert.ok(Math.abs(tauNs(W.index(3, 2, -2)) - 15.6) < 0.2);
});

test('a field stretches 1s by most of hydrogen\'s polarizability (4.5 a₀³)', () => {
  const wv = WL.makeWave(W, 1, 0, 0), F = [0, 1e-3, 0], T = [0, 0, 0, 0, 0, 0];
  WL.stepNear(W, wv, F, T, 1);
  const s = WL.dressed(W, wv, F, T), p = WL.meanPosition(W, s);
  const alpha = -p[1] / F[1];
  assert.ok(alpha > 4.1 && alpha < 4.5, `alpha ${alpha}`);   // the rest is in waves above E_CUT
});

test('in a weak field 2s turns fully into 2p, at the linear Stark rate (levels ±3F apart)', () => {
  const wv = WL.makeWave(W, 2, 0, 0), F = 1e-5, half = Math.PI / (6 * F);
  WL.stepNear(W, wv, [0, F, 0], [0, 0, 0, 0, 0, 0], half);
  const p = WL.shares(wv.s).p;
  assert.ok(p[W.index(2, 1, 0)] > 0.99, `2p_y share ${p[W.index(2, 1, 0)]}`);
});

test('near-set stepping agrees with stepping every standing wave', () => {
  const a = WL.makeWave(W, 2, 0, 0), b = WL.pureState(W, 2, 0, 0), F = [0, 3e-4, 1.5e-4], T = [2e-7, -1e-7, -1e-7, 0, 1e-7, 0];
  for (let i = 0; i < 40; i++) { WL.stepNear(W, a, F, T, 27.6); WL.stepWave(W, b, F, T, 27.6); }
  const ad = WL.normalize(WL.dressed(W, a, F, T)); WL.normalize(b);
  // the same up to an overall phase
  let ov = [0, 0]; for (let i = 0; i < b.re.length; i++) { ov[0] += ad.re[i] * b.re[i] + ad.im[i] * b.im[i]; ov[1] += ad.re[i] * b.im[i] - ad.im[i] * b.re[i]; }
  const d = 1 - Math.hypot(ov[0], ov[1]);
  assert.ok(d < 1e-4, `1 − overlap = ${d}`);
});

test('stepping keeps the wave whole (up to the light that leaks out)', () => {
  const wv = WL.makeWave(W, 3, 2, 1), F = [2e-5, 1e-5, 0], T = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 50; i++) WL.stepNear(W, wv, F, T, 27.6);
  const lost = 1 - WL.normSq(wv.s), expect = 50 * 27.6 * W.gamma[W.index(3, 2, 1)];
  assert.ok(Math.abs(lost - expect) < 0.2 * expect + 1e-9, `lost ${lost} vs ${expect}`);
});

test('a turned state is a whole orbital (its m counted about another axis)', () => {
  const ax = [0.6, 0, 0.8], s = WL.turnedState(W, 3, 2, 1, ax);
  assert.ok(Math.abs(WL.normSq(s) - 1) < 1e-9);
  const sz = WL.turnedState(W, 2, 1, 0, [1, 0, 0]);   // 2p along x = the real p_x (m = +1 about y)
  assert.ok(Math.abs(Math.abs(sz.re[W.index(2, 1, 1)]) - 1) < 1e-9);
});

test('jumps follow the computed rates: 3p goes to 1s about 88% of the time', () => {
  const wv = WL.makeWave(W, 3, 1, 0); let to1s = 0, N = 4000; let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) { const j = WL.pickJump(W, wv.s, rand); if (W.states[j.to].n === 1) to1s++; }
  assert.ok(Math.abs(to1s / N - 0.882) < 0.03, `${to1s / N}`);
});

test('the point riding a pure real orbital stays put; in a beat it moves', () => {
  const s = WL.pureState(W, 2, 1, 0), cw = WL.compileWave(W, s), p = [1, 2, 0.5], p0 = [...p];
  WL.rideCompiled(cw, p, 50);
  assert.ok(Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]) < 1e-9);
  const mix = WL.pureState(W, 2, 1, 1); mix.re[W.index(2, 1, 1)] = Math.SQRT1_2; mix.im[W.index(2, 1, -1)] = Math.SQRT1_2;   // m = 1 about y: it circles
  const cw2 = WL.compileWave(W, mix), q = [2, 0.3, 0];
  WL.rideCompiled(cw2, q, 5);
  assert.ok(Math.hypot(q[0] - 2, q[1] - 0.3, q[2]) > 0.1);
  assert.ok(Math.abs(Math.hypot(q[0], q[2]) - 2) < 0.05, 'it keeps its distance from the axis');
  assert.ok(Math.abs(q[1] - 0.3) < 1e-6, 'and its height along it');
});

test('the compiled wave matches the full one', () => {
  const s = WL.turnedState(W, 3, 1, 1, [0.3, 0.9, 0.3]);
  const cw = WL.compileWave(W, s);
  for (const p of [[1, 2, 3], [-4, 1, 0.5], [0.2, -0.1, 7]]) {
    const a = WL.evalCompiled(cw, p), b = WL.waveAt(W, s, p);
    assert.ok(Math.abs(a[0] - b[0]) < 0.02 * Math.abs(b[0]) + 1e-4, `${a} vs ${b}`);
  }
});

test('other charges lower the rim: waves above it leak out, waves below it are held', () => {
  const none = WL.edgeLip(W, []);
  // alone: everything up to n = 7 is held, the box-held waves above −1/R are not
  for (let n = 1; n <= 7; n++) assert.equal(WL.leakRate(W, W.index(n, 0, 0), none), 0);
  const above = W.states.findIndex(s => s.E > -1 / W.R + 1e-4);
  assert.ok(WL.leakRate(W, above, none) > 0);
  // a bare proton 5 nm away spills n = 6 but not n = 3
  const ch = [{ rel: [0, -5 / WL.A0_NM, 0], q: 1 }], lip = WL.edgeLip(W, ch), F = WL.tiltAndDent(ch).F;
  const a = W.index(6, 1, 0);
  assert.ok(WL.leakRate(W, a, lip) > 0);
  assert.equal(WL.leakRate(W, W.index(3, 1, 0), lip), 0);
  // an electron 1 nm away does not open 1s or 2p (it only raises the rim on its own side)
  const lipE = WL.edgeLip(W, [{ rel: [0, 1 / WL.A0_NM, 0], q: -1 }]);
  assert.equal(WL.leakRate(W, W.index(1, 0, 0), lipE), 0);
  assert.equal(WL.leakRate(W, W.index(2, 1, 0), lipE), 0);
  // the share that leaks in a step is the chance it left; it comes out toward the proton, with its energy
  const wv = WL.makeWave(W, 6, 1, 0);
  WL.stepNear(W, wv, [0, 0, 0], [0, 0, 0, 0, 0, 0], 1);
  assert.equal(wv.lostEsc, 0);
  const wv2 = WL.makeWave(W, 6, 1, 0);
  WL.stepNear(W, wv2, F, [0, 0, 0, 0, 0, 0], 2, lip);
  assert.ok(wv2.lostEsc > 0 && wv2.lostEsc < 0.01, `lost ${wv2.lostEsc}`);
  assert.ok(Math.abs(wv2.lostEsc + wv2.lostLight - (1 - WL.normSq(wv2.s))) < 1e-12);
  const ex = WL.escapeExit(W, a, lip);
  assert.ok(ex.dir[1] < 0, 'it leaves on the side of the proton that pulled it');
  const d = Math.hypot(ex.dir[0] * ex.r, ex.dir[1] * ex.r + 5 / WL.A0_NM, ex.dir[2] * ex.r), D = 5 / WL.A0_NM;
  assert.ok(Math.abs(0.5 * ex.v * ex.v - 1 / ex.r - (1 / d - 1 / D) - W.energies[a]) < 1e-12);
});

test('the atom\'s dipole is its wave\'s own, and matches the full wave', () => {
  const F = [0, 1e-3, 0], T = [0, 0, 0, 0, 0, 0], wv = WL.makeWave(W, 1, 0, 0);
  WL.stepNear(W, wv, F, T, 1);
  const wd = WL.waveDipole(W, wv), d = [0, 1, 2].map(i => wd.p0[i] + wd.A[3 * i] * F[0] + wd.A[3 * i + 1] * F[1] + wd.A[3 * i + 2] * F[2]), p = WL.meanPosition(W, WL.dressed(W, wv, F, T));
  assert.ok(Math.abs(d[1] + p[1]) < 0.03 * Math.abs(p[1]), `${d[1]} vs ${-p[1]}`);
});

test('the share of the electron inside a radius', () => {
  const q = WL.enclosed(W, WL.pureState(W, 1, 0, 0)), at = r => { const x = Math.sqrt(r / W.R) * (q.length - 1), i = Math.floor(x); return q[i] + (q[i + 1] - q[i]) * (x - i); };
  assert.ok(Math.abs(at(2) - (1 - Math.exp(-4) * 13)) < 0.02, `${at(2)}`);   // 1s inside 2 a₀: 0.762
  assert.ok(Math.abs(at(1) - (1 - Math.exp(-2) * 5)) < 0.02, `${at(1)}`);    // inside 1 a₀: 0.323
  assert.ok(q[q.length - 1] === 1 && q[0] === 0);
});

test('with spin the point circles its spin axis, even in 1s (angular rate 1/r)', () => {
  const cw = WL.compileWave(W, WL.pureState(W, 1, 0, 0)), p = [1.2, 0.5, 0], s = [0, 1, 0];
  const v = WL.flowCompiled(cw, p, s), r = Math.hypot(1.2, 0.5);
  assert.ok(Math.abs(Math.hypot(...v) - 1.2 / r) < 0.06, `${v}`);   // speed sin θ (in units of αc)
  WL.rideCompiled(cw, p, 2, 400, s);
  assert.ok(Math.abs(Math.hypot(p[0], p[2]) - 1.2) < 0.01 && Math.abs(p[1] - 0.5) < 1e-6, 'a circle about the axis');
  assert.ok(Math.hypot(p[0] - 1.2, p[2]) > 1, 'and it has moved');
  const q = [1.2, 0.5, 0]; WL.rideCompiled(cw, q, 2, 400, s, 0.1);   // shown slowed: at most 0.1 rad
  assert.ok(Math.abs(Math.atan2(-q[2], q[0])) < 0.11);
});

test('van der Waals from the waves: C₆ for two 1s atoms (6.499 exact; the rest is above E_CUT)', () => {
  const c = WL.c6(W, W.index(1, 0, 0), W.index(1, 0, 0));
  assert.ok(c > 5.5 && c < 6.5, `${c}`);
  assert.ok(WL.c6(W, W.index(1, 0, 0), W.index(2, 1, 0)) > 10 * c, 'a wider cloud flickers further');
});
