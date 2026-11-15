import test from 'node:test';
import assert from 'node:assert/strict';
import * as MW from './matterwave.js';

const k = E => Math.sqrt(2 * E / MW.HARTREE);
const onBin = kk => Math.exp(Math.round(Math.log(kk) * 100) / 100);
function series(kk, xi) {   // plain power series of ₁F₁(i/k; 1; iξ), fine for small ξ
  let tr = 1, ti = 0, Fr = 1, Fi = 0;
  for (let n = 0; n < 400; n++) { const mr = tr * n - ti / kk, mi = tr / kk + ti * n, s = xi / ((n + 1) * (n + 1)); tr = -mi * s; ti = mr * s; Fr += tr; Fi += ti; }
  return [Fr, Fi];
}

test('₁F₁ from Kummer\'s equation matches the power series where the series is reliable', () => {
  for (const E of [0.05, 0.1, 1]) {
    const kk = onBin(k(E));
    for (const xi of [0, 0.3, 1, 3.005, 6, 9]) {
      const [a, b] = MW.hyp(kk, xi), [c, d] = series(kk, xi);
      assert.ok(Math.hypot(a - c, b - d) < 1e-5, `E=${E} xi=${xi}: ${a},${b} vs ${c},${d}`);
    }
  }
});

test('the guided flow conserves probability: div(ρv) = 0 around the proton', () => {
  const E = 0.1, u = [0, 0, 1], h = 0.002;
  const J = r => { const w = MW.wave(E, u, r), v = MW.guideVelocity(E, u, r); return v.map(c => c * w.rho); };
  for (const r of [[0.6, 0.2, -0.8], [1.1, -0.4, 0.3], [0.4, 0.5, 1.2]]) {
    let div = 0, mag = 0;
    for (let i = 0; i < 3; i++) {
      const p = [...r], m = [...r]; p[i] += h; m[i] -= h;
      div += (J(p)[i] - J(m)[i]) / (2 * h);
      mag += Math.abs(J(p)[i]) / h;
    }
    assert.ok(Math.abs(div) < 2e-3 * mag, `${r}: div ${div} vs ${mag}`);
  }
});

test('the wave focuses behind the proton and the flow bends toward the axis', () => {
  const E = 0.1, u = [0, 0, 1];
  // Behind the proton, on the axis, the attraction piles the wave up far above the incoming 1.
  assert.ok(MW.wave(E, u, [0, 0, 2]).rho > 20);
  // Upstream and off to the side, the flow is turned in toward the axis.
  assert.ok(MW.guideVelocity(E, u, [1, 0, -0.5])[0] < 0);
});

test('crests: a slice gives finite segments, and the reach stays inside the table', () => {
  const E = 0.1, Rg = MW.guideRadius(E);
  assert.ok(Rg > 1 && Rg <= 4);
  for (const e of [0.05, 0.1, 1, 5, 20]) assert.ok(2 * (MW.guideRadius(e) / MW.A0_NM) * k(e) <= MW.XI_MAX + 1e-9);
  const segs = MW.crests(MW.waveSlice(E, [0, 0, 1], [1, 0, 0], Rg, 40), 0);
  assert.ok(segs.length > 50);
  for (const g of segs) assert.ok(g.every(Number.isFinite));
});
