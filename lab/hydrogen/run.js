// Runs one experiment from its settings: the same code in the browser worker and in Node, so a
// run is reproduced exactly from its settings. No DOM code.
import { Sim, DEFAULTS, VERSION, HARTREE_EV, A0_NM, FS_PER_AU } from './sim.js';
import { GRIDS, fieldFrame, packLog } from './fields.js';

// onFrame(frame) gets { i, obs, dens: [Uint16Array per grid], cum, phi, cur } every frameEvery steps.
export function runExperiment(settings, { onFrame, onProgress, images = true, now = () => Date.now() } = {}) {
  const t0 = now();
  const sim = new Sim(settings), s = sim.s;
  const setupMs = now() - t0;
  const views = images ? GRIDS.map(g => sim.makeView(g.nx, g.nz, g.half)) : null;
  const steps = Math.round(s.tEndAu / s.dt), table = [];
  const start = sim.observables(), startPerL = start.perL;
  const frame = i => {
    const obs = i === 0 ? start : sim.observables();
    delete obs.perL;
    table.push(obs);
    if (onFrame) onFrame({ i: table.length - 1, obs, dens: views && views.map(v => packLog(sim.densityImage(v))), ...(views ? fieldFrame(sim) : {}) });
  };
  frame(0);
  const tRun = now();
  for (let k = 1; k <= steps; k++) {
    sim.step();
    if (k % s.frameEvery === 0) { frame(k); if (onProgress) onProgress(k / steps); }
  }
  const runMs = now() - tRun;
  const result = {
    version: VERSION, settings: s,
    grid: { channels: sim.ch.length, points: sim.ch.reduce((a, c) => a + c.N * (c.dr ? 2 : 1), 0), hFine: s.hFine, hCoarse: s.hCoarse, rmaxNm: s.rmax * A0_NM },
    timing: { setupMs, runMs, steps, msPerStep: runMs / steps },
    start: { ...start, perL: startPerL, k0: sim.k0, totalEnergyEv: start.energyEv },
    table,
  };
  if (s.light && sim.bound.length) {
    const cap = sim.captureNow(true);
    result.bound = sim.bound.map(b => ({ n: b.n, l: b.l, Eev: b.E * HARTREE_EV }));
    result.lifetimes = sim.lifetimes();
    result.capture = { total: cap.total, lightEnergyEv: cap.energyEv,
      byState: cap.byState.map(x => ({ n: x.n, l: x.l, P: x.P, Pm0: x.Pm0, Pm1: x.Pm1 })),
      spectrum: photonSpectrum(sim, cap) };
    const casc = sim.cascade(cap.byState);
    result.cascade = casc;
    result.rho = sim.capturedState();
    result._sim = sim;              // kept in memory for drawing the captured cloud (not serialised)
  }
  return result;
}

// Photon energies from capture, summed over the final shapes: photons per pass per eV.
function photonSpectrum(sim, cap) {
  const bins = 240, maxEv = 16, out = new Float64Array(bins);
  const de = sim.s.epsMax / sim.s.nEps;
  cap.byState.forEach(x => {
    for (let j = 0; j < sim.eps.length; j++) {
      const wEv = (sim.eps[j] - x.E) * HARTREE_EV, k = Math.floor(wEv / maxEv * bins);
      if (k >= 0 && k < bins) out[k] += x.spec[j] * de / (maxEv / bins);
    }
  });
  return { maxEv, perEv: Array.from(out) };
}

export { DEFAULTS, FS_PER_AU, A0_NM, HARTREE_EV };
