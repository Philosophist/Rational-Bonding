// Known results to compare a run against. Nothing here feeds into the simulation.
// - Capture: the standard stationary method (exact free Coulomb waves, photoionization turned
//   around by the Milne relation), from the game's alchemfighter/tutorial/quantum.js, a separate
//   code path from this lab's time-dependent grid. Expected chance = Σ_l (share of the packet in
//   partial wave l) × (chance per pass for partial wave l at the packet's energy), shells n ≤ 6.
// - Levels, fine structure and lifetimes: textbook values.
export const TEXTBOOK = {
  lifetimesNs: { '2p': 1.596, '3p': 5.27, '3d': 15.6, '4f': 72.5 },   // e.g. Wiese & Fuhr, NIST
  fineSplit2pEv: 4.5283e-5,                                          // 2p₃/₂ − 2p₁/₂ (0.3652 cm⁻¹)
  lamb2sEv: 4.3748e-6,                                                // not in this simulation
};

export async function compareTextbook(res) {
  let Q = null;
  for (const p of ['../../alchemfighter/tutorial/quantum.js', './alchemfighter/tutorial/quantum.js']) {
    try { Q = await import(new URL(p, import.meta.url).href); break; } catch { /* try the next place */ }
  }
  if (!Q) return null;
  const e = res.start.totalEnergyEv, row = Q.captureTable(e), perL = res.start.perL;
  let expected = 0;
  row.forEach((entries, lIn) => entries.forEach(x => { expected += (perL[lIn] || 0) * x.P; }));
  const simulated = res.capture.byState.filter(x => x.n <= Q.NMAX).reduce((a, x) => a + x.P, 0);
  return { energyEv: e, expected, simulated, ratio: simulated / expected };
}
