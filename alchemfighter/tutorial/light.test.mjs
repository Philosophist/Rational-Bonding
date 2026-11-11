// Run with: node --test alchemfighter/tutorial/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './light.js';

function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-30, Math.abs(b)), `${msg}: ${a} vs ${b}`);

test('the stream function gives the exact dipole field (field lines are its contours)', () => {
  const em = L.makeEmission({ src: [0, 0, 0], lam: 121.6, axis: [0, 0, 1], t0: -1e6 });
  for (const [R, th, t] of [[0.7, 0.4, 0.13], [5, 1.2, 0.31], [19, 2.0, 0.05], [60, 0.9, 0.2]]) {
    const h = 1e-4 * R, ht = 1e-5;
    const dPdT = (L.psiLin(em, R, Math.cos(th + ht), t) - L.psiLin(em, R, Math.cos(th - ht), t)) / (2 * ht);
    const dPdR = (L.psiLin(em, R + h, Math.cos(th), t) - L.psiLin(em, R - h, Math.cos(th), t)) / (2 * h);
    const Er = dPdT / (R * R * Math.sin(th)), Et = -dPdR / (R * Math.sin(th));
    const x = [R * Math.sin(th), 0, R * Math.cos(th)], { E } = L.field(em, x, t);
    const rhat = [Math.sin(th), 0, Math.cos(th)], that = [Math.cos(th), 0, -Math.sin(th)];
    const er = E[0] * rhat[0] + E[2] * rhat[2], et = E[0] * that[0] + E[2] * that[2], mag = Math.hypot(er, et);
    assert.ok(Math.abs(Er - er) < 1e-4 * mag && Math.abs(Et - et) < 1e-4 * mag, `R=${R}: (${Er}, ${Et}) vs (${er}, ${et})`);
  }
});

test('near field falls as 1/R³, radiation as 1/R and across the direction of travel', () => {
  const em = L.makeEmission({ src: [0, 0, 0], lam: 121.6, axis: [0, 0, 1], t0: -1e9 });
  const amp = (R, f) => { let m = 0; for (let i = 0; i < 64; i++) { const t = i / 64 * em.lam / L.C; m = Math.max(m, Math.hypot(...L.field(em, [R, 0, 0], t + R / L.C)[f])); } return m; };
  close(amp(0.5, 'E') / amp(1, 'E'), 8, 0.02, 'near field');
  close(amp(2e5, 'E') / amp(4e5, 'E'), 2, 0.01, 'far field');
  // far out E ⟂ n and |E| = |B|
  const { E, B } = L.field(em, [3e5, 0, 1e5], 0.123);
  const n = [3, 0, 1].map(v => v / Math.hypot(3, 1));
  assert.ok(Math.abs(E[0] * n[0] + E[2] * n[2]) < 1e-3 * Math.hypot(...E));
  close(Math.hypot(...E), Math.hypot(...B), 1e-3, '|E| = |B|');
});

test('the field is zero before light from the start can arrive, and after the swing stops', () => {
  const em = L.makeEmission({ src: [0, 0, 0], lam: 656, axis: [0, 1, 0], t0: 0, tau: 10, tEnd: 5 });
  assert.equal(Math.hypot(...L.field(em, [30, 0, 0], 0.09).E), 0);    // light needs 0.1 fs for 30 nm
  assert.ok(Math.hypot(...L.field(em, [30, 0, 0], 0.11).E) > 0);
  assert.equal(Math.hypot(...L.field(em, [30, 0, 0], 5.11).E), 0);   // stopped at 5 fs, gone by 5.1 fs
});

test('a circular swing keeps the same size and turns', () => {
  const em = L.makeEmission({ src: [0, 0, 0], lam: 121.6, pattern: 'circ', axis: [0, 0, 1] });
  const T = em.lam / L.C;
  for (const t of [0, T / 4, T / 3]) close(Math.hypot(...L.dipole(em, t).p), 1, 1e-9, 'size');
  assert.ok(Math.abs(L.dipole(em, 0).p[2]) < 1e-12);
});

test('contours of a static dipole are its textbook field lines', () => {
  // A static dipole (no swing): Ψ = sin²θ / R, so each line is R = R_max sin²θ.
  const segs = L.contours((R, c) => (1 - c * c) / R, [1 / 10], { rMin: 0.3, rMax: 20, nR: 120, nT: 90 });
  assert.ok(segs.length > 50);
  for (const [R, th] of segs.map(s => [s[0], s[1]])) close(R, 10 * Math.sin(th) ** 2, 0.03, 'line');
});

test('pilot-wave targets give each atom the same chance as the wave picture', () => {
  const rand = rng(7), I = c => 1 - c * c, avgI = 2 / 3, axis = [0, 1, 0];
  const atoms = [{ d: [1, 0, 0], R: 30, sigma: 600 }, { d: [0.6, 0.8, 0], R: 25, sigma: 300 }, { d: [0, 0, 1], R: 38, sigma: 40 }];
  const hits = atoms.map(() => 0), N = 400000;
  for (let i = 0; i < N; i++) {
    let dir;
    do { const z = 2 * rand() - 1, ph = 2 * Math.PI * rand(), r = Math.sqrt(1 - z * z); dir = [r * Math.cos(ph), z, r * Math.sin(ph)]; } while (rand() > I(dir[1]));
    atoms.forEach((a, k) => {
      const P = a.sigma * (I(a.d[1]) / avgI) / (4 * Math.PI * a.R * a.R);
      if (L.inCone(dir, a.d, L.targetSolidAngle(P, a.d, axis, 'lin'))) hits[k]++;
    });
  }
  atoms.forEach((a, k) => {
    const want = a.sigma * (I(a.d[1]) / avgI) / (4 * Math.PI * a.R * a.R);
    close(hits[k] / N, want, 0.06, `atom ${k}`);
  });
});

test('a driven atom reaches the absorption chance once the whole photon has passed', () => {
  close(L.drivenShare(0.3, 1e6, 2.7), 0.3, 1e-9, 'all passed');
  assert.ok(L.drivenShare(0.3, 2.7, 2.7) < 0.3 && L.drivenShare(0.3, 2.7, 2.7) > 0.03);
  close(L.emitterShare(2.7, 2.7), Math.exp(-1), 1e-12, 'emitter');
  // launch times follow the lifetime
  const rand = rng(3); let s = 0; for (let i = 0; i < 20000; i++) s += L.sampleLaunch(2.7, rand);
  close(s / 20000, 2.7, 0.03, 'mean launch');
});
