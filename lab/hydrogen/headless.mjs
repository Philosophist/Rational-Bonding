// Run an experiment without a browser and print what it found.
//   node lab/hydrogen/headless.mjs [settings.json | report.json] [out.json]
// Given a report downloaded from the page, it reruns those exact settings; the numbers match the
// page's to the last digit (same code, no random numbers, deterministic sin/exp).
import { readFileSync, writeFileSync } from 'node:fs';
import { runExperiment } from './run.js';
import { compareTextbook } from './compare.js';

const arg = process.argv[2], out = process.argv[3];
let settings = {};
if (arg) { const j = JSON.parse(readFileSync(arg, 'utf8')); settings = j.settings || j; }
let last = -1;
const res = runExperiment(settings, {
  images: false,
  onProgress: f => { const p = Math.floor(f * 20); if (p !== last) { last = p; process.stderr.write(`\r${(f * 100).toFixed(0)}%`); } },
});
process.stderr.write('\n');
delete res._sim;
const T = res.table, end = T[T.length - 1];
const closest = T.reduce((a, b) => (b.meanRNm < a.meanRNm ? b : a));
console.log(`grid: ${res.grid.channels} angular patterns, ${res.grid.points} radial points in all; ${res.timing.steps} steps of ${res.settings.dt} a.u.`);
console.log(`time: setup ${(res.timing.setupMs / 1000).toFixed(1)} s, run ${(res.timing.runMs / 1000).toFixed(1)} s (${res.timing.msPerStep.toFixed(2)} ms per step)`);
console.log(`start: energy ${res.start.energyEv.toFixed(4)} eV, already-bound share ${res.start.boundShare?.toExponential(3)}`);
console.log(`closest mean distance ${closest.meanRNm.toFixed(3)} nm at ${closest.tFs.toFixed(2)} fs`);
console.log(`end (${end.tFs.toFixed(1)} fs): ${(end.gone * 100).toFixed(3)}% left the box, energy ${end.energyEv.toFixed(5)} eV, bound share ${end.boundShare?.toExponential(3)}, spin flipped ${end.spinFlipped.toExponential(2)}`);
if (res.capture) {
  console.log(`captured with a photon: ${res.capture.total.toExponential(4)} (energy into light ${res.capture.lightEnergyEv.toExponential(3)} eV per pass)`);
  const L = 'spdfghik';
  for (const x of res.capture.byState.filter(x => x.P > res.capture.total * 0.005)) console.log(`  ${x.n}${L[x.l]}: ${x.P.toExponential(3)}`);
  const cmp = await compareTextbook(res);
  if (cmp) console.log(`textbook method (Milne relation, exact free waves, n ≤ 6) at ${cmp.energyEv.toFixed(3)} eV: ${cmp.expected.toExponential(4)}; this run, n ≤ 6: ${cmp.simulated.toExponential(4)} (ratio ${cmp.ratio.toFixed(4)})`);
  const lt = res.lifetimes.filter(x => [[2, 1], [3, 1], [3, 2], [4, 3]].some(([n, l]) => x.n === n && x.l === l));
  console.log('lifetimes (ns): ' + lt.map(x => `${x.n}${L[x.l]} ${x.tauNs.toFixed(4)}`).join(', '));
  console.log('cascade lines per capture: ' + res.cascade.lines.slice(0, 8).map(x => `${x.nm.toFixed(1)} nm ${x.perCapture.toFixed(3)}`).join(', '));
}
if (out) { delete res.rho; writeFileSync(out, JSON.stringify(res)); console.log('wrote', out); }
