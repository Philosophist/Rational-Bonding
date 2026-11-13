// Alchemfighter, Level 1 (hydrogen tutorial): the physics, with no DOM or WebGL code.
// Units: lengths in nm, times in fs, energies in eV, charges in units of e.
// Design: docs/levels/01-hydrogen-tutorial.md, beats 1 and 2.
import * as Q from './quantum.js';

export const HC = 1239.84193;        // eV·nm
export const HBARC = 197.3269804;    // eV·nm
export const RY = 13.598434;         // eV, hydrogen Rydberg energy (reduced-mass corrected)
export const A0 = 0.0529177;         // nm, Bohr radius
export const KE = 1.43996448;        // eV·nm, e²/(4πε₀)
export const C = 299.792458;         // nm/fs, speed of light
export const MEC2 = 510998.95;       // eV, electron rest energy
export const MPC2 = 938272088.16;     // eV, proton rest energy
export const ME = MEC2 / (C * C);    // eV·fs²/nm²
export const MP = MPC2 / (C * C);
export const SPHERE_R = 40;          // nm, radius of the sealed system sphere

// Chance encounters are no longer boosted: every catch and collision has its real odds. What helps
// the player catch electrons is the ship's atomic lock-on (game.js), a made-up technology that is
// labelled as such in the game.

export const levelE = n => -RY / (n * n);
export const lambdaFor = (n1, n2) => HC / Math.abs(levelE(n2) - levelE(n1));
export const L_NAMES = 'spdfghi';
export const stateName = s => `${s.n}${L_NAMES[s.l]}`;

// Speed (nm/fs) of an electron with kinetic energy E (eV); non-relativistic, fine below a few keV.
export const electronSpeed = E => Math.sqrt(2 * E / ME);
// Reduced de Broglie wavelength ħ/p (nm): how far a free electron's position is smeared.
export const reducedWavelength = E => HBARC / Math.sqrt(2 * MEC2 * E);

// ---------------------------------------------------------------------------
// Radiative recombination: e⁻ + H⁺ → H(nl) + photon
// ---------------------------------------------------------------------------
// Kramers' textbook cross section for capture into shell n (no Gaunt factor), in nm², kept as a
// check on the computed one: σ_n ≈ 2.105e-22 cm² · Ry² / (n E (Ry + n² E)).
export function kramersSigma(n, E) {
  return 2.105e-22 * 1e14 * RY * RY / (n * E * (RY + n * n * E));
}
// The game uses the computed cross sections (quantum.js): the free electron's own wave, solved at
// its real energy one partial wave at a time, overlapped with every orbital up to n = 6.
export const CAPTURE_NMAX = Q.NMAX;
export const captureSigma = E => Q.captureSigmaQ(Math.max(E, 0.01));

// Closest approach of an electron with energy E (at infinity) and impact parameter b,
// on its hyperbola around a proton: r = √(b² + s²) − s, with s = k/(2E).
export function periapsis(b, E) {
  const s = KE / (2 * E);
  return Math.sqrt(b * b + s * s) - s;
}
// The same from the angular momentum per unit mass h = |r × v| (nm²/fs) and energy E.
export function periapsisFromL(h, E) {
  const L2m = ME * h * h;   // L²/m in eV·nm²
  if (E <= 0) return Math.max(0, (-KE + Math.sqrt(Math.max(0, KE * KE + 2 * E * L2m))) / (2 * E));
  return (-KE + Math.sqrt(KE * KE + 2 * E * L2m)) / (2 * E);
}
// A pass's angular momentum in units of ħ, from h = |r × v| (nm²/fs). It is the same all along the
// pass, so it says how the electron swings past the proton better than any one point does.
export const HBAR = 0.6582119569;   // eV·fs
export const angularL = h => ME * h / HBAR;

// What decides a catch. A slow electron is a wave far wider than an atom (ƛ = 0.62 nm at 0.1 eV), so
// no sharp "closest approach" decides anything. What a pass does fix is its angular momentum L,
// and the wave near the proton is mostly the partial wave l ≈ L/ħ − ½. Each partial wave has its own
// computed chance of being caught, into its own orbitals: light changes l by exactly one, so
// l = 0 (head-on) can only land in p orbitals, l = 1 lands mostly in 1s, l = 3 mostly in 3d.
export const captureChanceReal = (E, L) => Q.captureChancePass(Math.max(E, 0.01), L);

// The capture target, pilot-wave view. The electron is a point riding its wave; the proton catches
// it if the point comes in through a disc whose area is the capture cross section σ (all orbitals
// up to n = 6), seen square-on to the electron's path far from the proton: radius √(σ/π).
// This is an equal-area stand-in for the odds, not something pilot-wave theory says: whether the
// real electron is caught also depends on the light field's state. On average it gives the real
// rate exactly, because a uniform beam crosses the disc in proportion to its area.
export const captureDiscRadius = E => Math.sqrt(captureSigma(E) / Math.PI);
// A pass's impact parameter (nm): how far off-centre its straight line in from far away would pass
// the proton, from its angular momentum L (ħ) and energy E: b = L·ħ/(mv) = L·ƛ.
export const impactParameter = (E, L) => L * reducedWavelength(Math.max(E, 1e-4));
// Did this pass come in through the disc?
export const hitsCaptureDisc = (E, L) => impactParameter(E, L) < captureDiscRadius(E);

// The gun's aim cone. The gun focuses its electron beam on the aimed point from a 30 nm aperture,
// so the spot there can't be smaller than about ƛ·D/a (diffraction of the electron's wave).
// Slower electrons have longer wavelengths, so wider cones: easier to catch, harder to aim.
export const GUN_APERTURE = 30;   // nm
export const coneWidth = (E, D) => Math.max(0.01, reducedWavelength(E) * D / GUN_APERTURE);

// ---------------------------------------------------------------------------
// Random choices
// ---------------------------------------------------------------------------
export function pickWeighted(items, weight, rand = Math.random) {
  const total = items.reduce((a, it) => a + weight(it), 0);
  let x = rand() * total;
  for (const it of items) { x -= weight(it); if (x <= 0) return it; }
  return items[items.length - 1];
}
export const sampleExp = (tau, rand = Math.random) => -tau * Math.log(1 - rand());
export function gaussian(rand = Math.random) {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Which orbital the electron lands in, for a pass with angular momentum L (ħ): chosen from the
// computed odds of every partial wave into every orbital. m is uniform here; the game ties it to
// the pass (see capture in game.js). Returns { n, l, m, lIn }.
export function pickCaptureState(E, L = 1, rand = Math.random) {
  const x = L === null ? Q.pickCaptureBeam(Math.max(E, 0.01), rand) : Q.pickCapture(Math.max(E, 0.01), L, rand);
  const m = Math.floor(rand() * (2 * x.l + 1)) - x.l;
  return { n: x.n, l: x.l, m, lIn: x.lIn };
}
// The photon given off at capture carries the electron's energy plus the binding energy.
export const captureLambda = (E, n) => HC / (E + RY / (n * n));

// ---------------------------------------------------------------------------
// Spontaneous decay of hydrogen: lifetimes (ns) and branching ratios for every level up to n = 6,
// computed from the orbitals' dipole overlaps (quantum.js). 2s cannot give off one photon; in empty
// space it gives off two, sharing 10.2 eV, after 0.122 s.
// ---------------------------------------------------------------------------
export const DECAY = Q.decayTable();

// One downward step from state s. Returns the new state, the photons (nm), and the real delay (ns).
export function pickDecay(s, rand = Math.random) {
  const d = DECAY[`${s.n},${s.l}`];
  if (!d) return null;
  const delayNs = sampleExp(d.tau, rand);
  const [n2, l2] = pickWeighted(d.br, b => b[2], rand);
  if (d.twoPhoton) {
    // The two-photon spectrum is broad and symmetric about half the energy: the median of three
    // uniform numbers (a Beta(2,2) shape) is a fair stand-in for it.
    const u = [rand(), rand(), rand()].sort((a, b) => a - b)[1];
    const dE = levelE(s.n) - levelE(n2);
    return { to: { n: n2, l: l2, m: 0 }, photons: [HC / (u * dE), HC / ((1 - u) * dE)], delayNs, twoPhoton: true };
  }
  const ms = [-1, 0, 1].map(dm => s.m + dm).filter(m => Math.abs(m) <= l2);
  const m = ms[Math.floor(rand() * ms.length)];
  return { to: { n: n2, l: l2, m }, photons: [lambdaFor(s.n, n2)], delayNs, dm: s.m - m };
}

// Runs a whole cascade from a captured state down to 1s, for tests and for the end-of-beat summary.
export function cascade(start, rand = Math.random) {
  const steps = [];
  let s = start;
  while (!(s.n === 1)) {
    const d = pickDecay(s, rand);
    steps.push({ from: s, ...d });
    s = d.to;
  }
  return steps;
}

// Wavelength (nm) → display colour. UV and IR get false colours (prototype convention).
export function lambdaRGB(nm) {
  if (nm < 380) return [0.62, 0.45, 1.0];
  if (nm > 750) return [1.0, 0.3, 0.2];
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; } else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else { r = 1; }
  return [r, g, b];
}
export const band = nm => (nm < 380 ? 'UV' : nm > 750 ? 'IR' : 'visible');

// What kind of radiation a wavelength is, in everyday names. Band edges follow the usual
// conventions (ISO 21348 for ultraviolet; CIE for UV-A/B/C; common colour names for visible).
const CLASSES = [
  [0.01, 'gamma ray', 'gamma', 'from atomic nuclei; far beyond anything hydrogen\'s electron can make'],
  [10, 'X-ray', 'X-ray', 'passes through soft tissue'],
  [100, 'extreme ultraviolet', 'EUV', 'stopped by a few centimetres of air; astronomers see it from space'],
  [200, 'far ultraviolet', 'far UV', 'absorbed by air, so it is also called vacuum UV'],
  [280, 'UV-C', 'UV-C', 'germicidal; the ozone layer blocks it'],
  [315, 'UV-B', 'UV-B', 'causes sunburn'],
  [380, 'UV-A', 'UV-A', 'black light'],
  [450, 'violet light', 'violet', 'visible'],
  [485, 'blue light', 'blue', 'visible'],
  [500, 'cyan light', 'cyan', 'visible'],
  [565, 'green light', 'green', 'visible'],
  [590, 'yellow light', 'yellow', 'visible'],
  [625, 'orange light', 'orange', 'visible'],
  [750, 'red light', 'red', 'visible'],
  [1400, 'near infrared', 'near IR', 'like a TV remote or night-vision camera'],
  [3000, 'short-wave infrared', 'SWIR', 'felt as warmth; used in fibre-optic links'],
  [8000, 'mid infrared', 'mid IR', 'heat-seeking sensors see it'],
  [15000, 'long-wave infrared', 'LWIR', 'thermal cameras: the glow of warm bodies'],
  [1e6, 'far infrared', 'far IR', 'between heat and microwaves'],
  [1e9, 'microwave', 'microwave', 'like a microwave oven or Wi-Fi'],
  [Infinity, 'radio wave', 'radio', 'like radio broadcasts'],
];
export function classify(nm) {
  for (const [max, name, short, note] of CLASSES) if (nm < max) return { name, short, note, visible: note === 'visible' };
}
// Hydrogen's series are named after the step the electron lands on.
const SERIES = ['', 'Lyman', 'Balmer', 'Paschen', 'Brackett', 'Pfund', 'Humphreys'];
export const seriesName = nLow => SERIES[nLow] || `n=${nLow}`;
export function lineName(nm) {
  const named = [[121.57, 'Lyman-α'], [102.57, 'Lyman-β'], [97.25, 'Lyman-γ'], [656.47, 'H-α'], [486.27, 'H-β'], [434.17, 'H-γ'], [410.29, 'H-δ'], [1875.6, 'Paschen-α'], [4052.3, 'Brackett-α'], [7459.9, 'Pfund-α']];
  for (const [l, name] of named) if (Math.abs(nm - l) / l < 2e-3) return name;
  return '';
}

// ---------------------------------------------------------------------------
// Coulomb dynamics inside the sealed sphere
// ---------------------------------------------------------------------------
// Particles: { pos:[x,y,z], vel:[x,y,z], q, m, active, pol? }. Charges pull and push by Coulomb's law.
// A neutral atom carries `pol` (from atomPol): the charges' field stretches its cloud into a small
// dipole, which pulls it toward the stronger field, and the dipole's own field pulls back on the
// charges (equal and opposite, so momentum is kept). Atoms also feel each other (van der Waals).
// Electron–proton and electron–atom encounters are tracked so each pass is reported once.
const SOFT2 = 1e-6;   // nm², softening (0.001 nm) so a dead-centre shot doesn't divide by zero

// Polarizability of hydrogen 1s: α = 4.5 a₀³ (exact). An electric field F (V/nm) gives it the dipole
// p = α·F/k (e·nm), so a charge at distance r pulls it in with energy −α·k/(2r⁴).
export const ALPHA_1S = 4.5 * A0 ** 3;   // nm³
// Atomic unit of electric field (V/nm): the field the electron feels from the proton at a₀.
export const EAU = 514.220675;
// Van der Waals pull between two H atoms: −C₆/r⁶, C₆ = 6.499 hartree·a₀⁶ (exact for 1s–1s).
export const C6_HH = 6.499 * 27.211386 * A0 ** 6;   // eV·nm⁶
// Close in, two H atoms whose electron spins don't pair repel (the b³Σu⁺ curve: a well of 0.56 meV at
// 0.415 nm). Three in four meetings are like that; the bonding quarter (H₂) comes with the H₂ level work.
export const HH_RM = 0.415;
export const HH_EPS = C6_HH / (2 * HH_RM ** 6);
// What a neutral atom in shell n does in a field.
// - n = 1: p = α·F/k, capped near 1 e·a₀ where the simple picture ends.
// - n ≥ 2: 2s and 2p (and the higher shells' sub-levels) are almost the same energy, so even a weak
//   field (about the Stark-mixing field, 477 V/cm) mixes them into a lopsided state with the full
//   dipole (3/2)·n·(n−1)·e·a₀ (the linear Stark effect). We take the state leaning toward the field,
//   the one whose energy goes down (a simplification: half the Stark states lean the other way).
// Both use p(F) = pmax·x/√(1+x²), x = κ·F, κ = α/(k·pmax): linear at first, then saturating.
// Close in, a repulsive core (c8/r⁸) stops a charge passing through the atom; it balances the pull at
// rm (the H₂⁺ bond length, 0.106 nm, for 1s), so there is no made-up well deeper than the real pull.
const polCache = new Map();
export function atomPol(n) {
  let p = polCache.get(n);
  if (p) return p;
  const pmax = n === 1 ? A0 : 1.5 * n * (n - 1) * A0;
  const alpha = n === 1 ? ALPHA_1S : KE * pmax / STARK_FC;
  const rm = 0.106 * n * n, k = alpha / (KE * pmax), Frm = KE / (rm * rm);
  p = { n, alpha, pmax, k, rm, c8: 0 };
  p.c8 = dipoleMag(Frm, p) * Frm * rm ** 8 / 4;
  polCache.set(n, p);
  return p;
}
export function dipoleMag(F, pol) { const x = pol.k * F; return pol.pmax * x / Math.sqrt(1 + x * x); }
export function polEnergy(F, pol) { const x = pol.k * F; return -(pol.pmax / pol.k) * (Math.sqrt(1 + x * x) - 1); }

// The field (V/nm) at atom a from every active charge, with the pieces reused for the forces.
function chargeLinks(ps, a) {
  const F = [0, 0, 0], links = [];
  for (let j = 0; j < ps.length; j++) {
    const b = ps[j];
    if (!b.active || !b.q) continue;
    const d = [a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]];
    const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + SOFT2, r = Math.sqrt(r2), k = KE * b.q / (r2 * r);
    F[0] += k * d[0]; F[1] += k * d[1]; F[2] += k * d[2];
    links.push({ j, b, n: [d[0] / r, d[1] / r, d[2] / r], r });
  }
  return { F, links };
}
// The induced dipole (e·nm) of atom a in the field F.
export function atomDipole(F, pol) {
  const Fm = Math.hypot(F[0], F[1], F[2]);
  if (Fm < 1e-30) return [0, 0, 0];
  const s = dipoleMag(Fm, pol) / Fm;
  return [F[0] * s, F[1] * s, F[2] * s];
}

function accelerations(ps, out) {
  for (let i = 0; i < ps.length; i++) out[i].fill(0);
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!a.active || !a.q) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!b.active || !b.q) continue;
      const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
      const r2 = dx * dx + dy * dy + dz * dz + SOFT2, r = Math.sqrt(r2), f = KE * a.q * b.q / (r2 * r);
      // f > 0 repels
      out[i][0] -= f * dx / a.m; out[i][1] -= f * dy / a.m; out[i][2] -= f * dz / a.m;
      out[j][0] += f * dx / b.m; out[j][1] += f * dy / b.m; out[j][2] += f * dz / b.m;
    }
  }
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!a.active || a.q || !a.pol) continue;
    // Charge ↔ induced dipole. The force on the atom from charge j is (p·∇)F_j = k·q_j·(p − 3(p·n)n)/r³,
    // and charge j feels the opposite. Using the dipole made by the total field is the exact
    // gradient of the atom's energy −∫p dF, so energy is kept too.
    const { F, links } = chargeLinks(ps, a), p = atomDipole(F, a.pol);
    for (const { j, b, n, r } of links) {
      const pn = p[0] * n[0] + p[1] * n[1] + p[2] * n[2], k = KE * b.q / (r * r * r), core = 8 * a.pol.c8 / r ** 9;
      for (let c = 0; c < 3; c++) {
        const f = k * (p[c] - 3 * pn * n[c]) + core * n[c];   // on the atom; n points from the charge to the atom
        out[i][c] += f / a.m; out[j][c] -= f / b.m;
      }
    }
    // Atom ↔ atom: van der Waals pull with the unpaired-spin repulsive core.
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!b.active || b.q || !b.pol) continue;
      const d = [b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]];
      const r = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + SOFT2), s6 = (HH_RM / r) ** 6;
      const f = 12 * HH_EPS * (s6 * s6 - s6) / r;   // −dU/dr, > 0 repels
      for (let c = 0; c < 3; c++) { out[i][c] -= f * d[c] / r / a.m; out[j][c] += f * d[c] / r / b.m; }
    }
  }
}

// The shortest time scale in the system: the time to cross the gap between any two particles that
// push on each other, or to fall across it.
function timeStep(ps) {
  let best = Infinity;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!a.active) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!b.active) continue;
      const qq = a.q && b.q, ap = !a.q && a.pol, bp = !b.q && b.pol;
      if (!qq && !((ap && b.q) || (bp && a.q) || (ap && bp))) continue;
      const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
      const dv = Math.hypot(b.vel[0] - a.vel[0], b.vel[1] - a.vel[1], b.vel[2] - a.vel[2]);
      const mu = a.m * b.m / (a.m + b.m);
      let f;   // how hard the pair pulls or pushes (eV/nm)
      if (qq) f = KE / (r * r);
      else if (ap && bp) { const s6 = (HH_RM / r) ** 6; f = 12 * HH_EPS * (s6 * s6 + s6) / r; }
      else { const pol = ap ? a.pol : b.pol, F = KE / (r * r); f = dipoleMag(F, pol) * 2 * F / r + 8 * pol.c8 / r ** 9; }
      // The atoms' short-range cores are stiffer than Coulomb's law, so they get twice the care.
      best = Math.min(best, (qq ? 1 : 0.5) * Math.min(r / (dv + 1e-9), Math.sqrt(mu * r / f)));
    }
  }
  return best;
}

export function encounterKey(e, p) { return `${e.id}:${p.id}`; }

// Advance by dt fs. Returns pass events [{ e, p, rp, E }] for electron–proton passes closer than 10 nm.
export function stepCharges(ps, dt, enc = new Map(), R = SPHERE_R, maxSub = 4000, rand = Math.random) {
  const acc = ps.map(() => [0, 0, 0]);
  const events = [];
  let t = 0, n = 0;
  accelerations(ps, acc);
  while (t < dt && n < maxSub) {
    const h = Math.min(dt - t, 0.02 * timeStep(ps));
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active) continue;
      for (let k = 0; k < 3; k++) { p.vel[k] += 0.5 * h * acc[i][k]; p.pos[k] += h * p.vel[k]; }
    }
    accelerations(ps, acc);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active) continue;
      for (let k = 0; k < 3; k++) p.vel[k] += 0.5 * h * acc[i][k];
      // The wall: matter bounces off like a ball off a curved mirror, without losing energy. The
      // velocity is mirrored about the wall's normal where it hits (angle in = angle out).
      const r = Math.hypot(p.pos[0], p.pos[1], p.pos[2]);
      if (r > R) {
        const nx = p.pos[0] / r, ny = p.pos[1] / r, nz = p.pos[2] / r;
        const vn = p.vel[0] * nx + p.vel[1] * ny + p.vel[2] * nz;
        if (vn > 0) p.vel = mirrorBounce(p.vel, [nx, ny, nz]);
        const k = (2 * R - r) / r; p.pos[0] *= k; p.pos[1] *= k; p.pos[2] *= k;
        p.bounces = (p.bounces || 0) + 1;
      }
    }
    trackPasses(ps, enc, events);
    t += h; n++;
  }
  return { events, substeps: n, done: t >= dt };
}

// Mirror bounce: flip the part of v along the unit normal n, keep the part along the wall.
export function mirrorBounce(v, n) {
  const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  return [0, 1, 2].map(k => v[k] - 2 * vn * n[k]);
}

function trackPasses(ps, enc, events) {
  for (const e of ps) {
    if (!e.active || e.q !== -1) continue;
    for (const p of ps) {
      const atom = !p.q && !!p.pol;
      if (!p.active || (p.q !== 1 && !atom)) continue;
      const rx = e.pos[0] - p.pos[0], ry = e.pos[1] - p.pos[1], rz = e.pos[2] - p.pos[2];
      const vx = e.vel[0] - p.vel[0], vy = e.vel[1] - p.vel[1], vz = e.vel[2] - p.vel[2];
      const r = Math.hypot(rx, ry, rz), rdot = rx * vx + ry * vy + rz * vz;
      const key = encounterKey(e, p);
      let s = enc.get(key);
      if (!s) { s = { approaching: rdot < 0, min: r }; enc.set(key, s); }
      if (rdot < 0) {
        if (!s.approaching) { s.approaching = true; s.min = r; }
        s.min = Math.min(s.min, r);
      } else if (s.approaching) {
        s.approaching = false;
        s.min = Math.min(s.min, r);
        const mu = e.m * p.m / (e.m + p.m), v2 = vx * vx + vy * vy + vz * vz;
        if (!atom && s.min < 10) events.push({ e, p, rp: s.min, E: 0.5 * mu * v2 - KE / Math.sqrt(r * r + SOFT2) });
        // A neutral atom: the electron's energy relative to it (the atom's pull on it is tiny by now).
        if (atom && s.min < 2) events.push({ e, p, rp: s.min, E: 0.5 * mu * v2, atom: true });
      }
    }
  }
}

// Total energy (kinetic + Coulomb + the atoms' pulls), for tests.
export function totalEnergy(ps) {
  let E = 0;
  for (const p of ps) if (p.active) E += 0.5 * p.m * (p.vel[0] ** 2 + p.vel[1] ** 2 + p.vel[2] ** 2);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (!a.active || !b.active) continue;
    const r = Math.sqrt((a.pos[0] - b.pos[0]) ** 2 + (a.pos[1] - b.pos[1]) ** 2 + (a.pos[2] - b.pos[2]) ** 2 + SOFT2);
    if (a.q && b.q) E += KE * a.q * b.q / r;
    else if (!a.q && !b.q && a.pol && b.pol) { const s6 = (HH_RM / r) ** 6; E += HH_EPS * (s6 * s6 - 2 * s6); }
    else if (a.q && b.pol && !b.q) E += b.pol.c8 / r ** 8;
    else if (b.q && a.pol && !a.q) E += a.pol.c8 / r ** 8;
  }
  for (const a of ps) {
    if (!a.active || a.q || !a.pol) continue;
    const { F } = chargeLinks(ps, a);
    E += polEnergy(Math.hypot(F[0], F[1], F[2]), a.pol);
  }
  return E;
}

// ---------------------------------------------------------------------------
// A sealed box: light and fast electrons breaking atoms apart, and where the box ends up.
// ---------------------------------------------------------------------------
export const BOX_V = 4 / 3 * Math.PI * SPHERE_R ** 3;   // nm³
export const ionE = n => RY / (n * n);                  // eV to free an electron from level n
// Photoionization from level n by a photon of energy E (Kramers; 1s scaled to its measured 6.3e-18 cm²).
export function photoionSigma(n, E) {
  const I = ionE(n);
  if (E < I) return 0;
  return (n === 1 ? 6.3e-4 : 7.91e-4 * n) * (I / E) ** 3;   // nm²
}
// One photon loose in the box hits a given atom at rate c·σ/V (it fills the box evenly).
export const photoRate = (n, E, V = BOX_V) => C * 1e6 * photoionSigma(n, E) / V;   // per ns
// Electron impact on 1s hydrogen: excitation to n = 2 (Bethe-like fit, peak ≈ 0.7e-16 cm²) and
// ionization (Lotz formula). E is the electron's kinetic energy in eV; cross-sections in nm².
export const EXCITE_E = RY * 0.75;
export const collExciteSigma = E => (E <= EXCITE_E ? 0 : 0.02 * Math.log(E / EXCITE_E) / (E / EXCITE_E));
export const collIonSigma = E => (E <= RY ? 0 : 4.5 * Math.log(E / RY) / (E * RY));
// Rate for one electron to hit any of nAtoms atoms spread through the box.
export const collRate = (sigma, E, nAtoms, V = BOX_V) => (nAtoms / V) * sigma * electronSpeed(E) * 1e6;   // per ns

// One pass of an electron by a 1s atom, with closest approach b (nm) and energy E (eV, relative).
// The electron hits only atoms it actually passes: the chance falls off over the reach of the
// collision, s = ħv/ΔE (how far its passing field still changes fast enough to lift the electron,
// Bohr's adiabatic cut-off), but at least the atom's size. The profile e^(−b²/s²)/(πs²) is
// normalised so that, summed over every pass, it gives the real cross section σ exactly.
export function impactReach(E) { return Math.max(HBARC * Math.sqrt(2 * E / MEC2) / EXCITE_E, 2 * A0); }
export function impactChanceReal(E, b) {
  const sig = collExciteSigma(E) + collIonSigma(E), s = impactReach(E);
  return Math.min(1, sig * Math.exp(-b * b / (s * s)) / (Math.PI * s * s));
}

// v3 helpers for the collision maths below.
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vlen = a => Math.hypot(a[0], a[1], a[2]);
function perpBasis(u) {
  const a = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let t = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]];
  t = vsc(t, 1 / vlen(t));
  return [t, [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]]];
}
// How far an electron is turned when it gives up dE of its E: mostly a small nudge (fast collisions
// are glancing), from the Born picture dσ/dΩ ∝ 1/(θ² + θm²) with θm = dE/(2E), out to 90°.
export function impactAngle(E, dE, rand = Math.random) {
  const tm2 = (dE / (2 * E)) ** 2, tM2 = (Math.PI / 2) ** 2;
  return Math.sqrt(tm2 * (Math.pow((tM2 + tm2) / tm2, rand()) - 1));
}
// Two bodies a and b meet and dE (eV) of their motion goes into something else (lifting an
// electron, freeing one). Done in their centre-of-mass frame, so momentum and energy are both kept
// exactly: their shared motion carries on, and what is left of their relative motion turns by theta.
// Returns false (and changes nothing) if they don't have dE to give.
export function inelasticScatter(a, b, dE, theta, rand = Math.random) {
  const M = a.m + b.m, mu = a.m * b.m / M;
  const vcm = vsc(vadd(vsc(a.vel, a.m), vsc(b.vel, b.m)), 1 / M);
  const u = [a.vel[0] - b.vel[0], a.vel[1] - b.vel[1], a.vel[2] - b.vel[2]], ul = vlen(u);
  const K = 0.5 * mu * ul * ul - dE;
  if (K < 0 || ul === 0) return false;
  const uh = vsc(u, 1 / ul), [t, w] = perpBasis(uh), ph = 2 * Math.PI * rand();
  const dir = vadd(vsc(uh, Math.cos(theta)), vadd(vsc(t, Math.sin(theta) * Math.cos(ph)), vsc(w, Math.sin(theta) * Math.sin(ph))));
  const u2 = vsc(dir, Math.sqrt(2 * K / mu));
  a.vel = vadd(vcm, vsc(u2, b.m / M));
  b.vel = vadd(vcm, vsc(u2, -a.m / M));
  return true;
}
// An atom comes apart: its electron leaves from r0 (nm) along dir, with the speed it needs to end up
// with `extra` eV far away. Both pieces are launched from the atom's own motion with opposite
// momenta, so the pair's total momentum is unchanged (the proton takes the recoil).
export function launchApart(vAtom, mP, mE, dir, extra, r0) {
  const M = mP + mE, mu = mP * mE / M, u = Math.sqrt(2 * (extra + KE / r0) / mu);
  return { vE: vadd(vAtom, vsc(dir, u * mP / M)), vP: vadd(vAtom, vsc(dir, -u * mE / M)) };
}

// Where a sealed box with Np protons and Ne electrons in all, and total energy Etot (eV, counting
// binding energy as negative and light as positive), settles once the energy is shared out: the
// Saha balance, with the heat split between free particles (3/2 kT each) and blackbody light.
const RAD_A = 7.5657e-16 * 1e-27 / 1.602176634e-19;   // eV per nm³ per K⁴
const K_B = 8.617333e-5;                               // eV per K
const thermalWavelength = kT => HC / Math.sqrt(2 * Math.PI * MEC2 * kT);   // nm
function kTFor(x, Np, Ne, Etot, V) {
  const heat = Etot + RY * (Np - x), parts = Ne + x;   // free e⁻ + free p⁺ + atoms = Ne + x
  if (heat <= 0) return 0;
  let lo = 0, hi = heat / (1.5 * parts) + 1;
  for (let i = 0; i < 60; i++) {
    const kT = (lo + hi) / 2, T = kT / K_B;
    if (1.5 * kT * parts + RAD_A * T ** 4 * V > heat) hi = kT; else lo = kT;
  }
  return (lo + hi) / 2;
}
export function sahaBalance(Np, Ne, Etot, V = BOX_V) {
  const xMin = Math.max(0, Np - Ne);
  const f = x => {
    const kT = kTFor(x, Np, Ne, Etot, V);
    const rhs = kT > 0 ? V / thermalWavelength(kT) ** 3 * Math.exp(-RY / kT) : 0;
    return x * (Ne - Np + x) / Math.max(Np - x, 1e-9) - rhs;
  };
  let lo = xMin, hi = Np;
  if (f(lo) >= 0) hi = lo;
  else if (f(hi) <= 0) lo = hi;
  else for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  const x = (lo + hi) / 2, kT = kTFor(x, Np, Ne, Etot, V);
  return { ionized: x, fraction: Np ? x / Np : 0, kT, kelvin: kT / K_B };
}
export const kelvin = kT => kT / K_B;

// ---------------------------------------------------------------------------
// Electric fields on excited atoms.
// ---------------------------------------------------------------------------
// The electric field (V/nm) at a point from every loose charge: bare protons and free electrons.
// Neutral atoms carry q = 0 and add nothing.
export function fieldAt(pos, ps) {
  const F = [0, 0, 0];
  for (const p of ps) {
    if (!p.active || !p.q) continue;
    const d = [pos[0] - p.pos[0], pos[1] - p.pos[1], pos[2] - p.pos[2]];
    const r2 = Math.max(d[0] * d[0] + d[1] * d[1] + d[2] * d[2], 0.01), k = KE * p.q / (r2 * Math.sqrt(r2));
    F[0] += k * d[0]; F[1] += k * d[1]; F[2] += k * d[2];
  }
  return F;
}
// 2s cannot give off a single photon by itself. An electric field mixes it with 2p (Stark mixing),
// which can. 2s and 2p sit only the Lamb shift apart (1058 MHz, 4.4 µeV), so a small field is
// enough: the mixing is complete once the field energy √3·e·a₀·F passes the Lamb shift, at about
// 477 V/cm. Rate (per ns) = Γ(2p) × the share of 2p mixed in, which goes as F² for weak fields
// (2,740 per second at 1 V/cm; the measured value is about 2,780) and levels off at half of 2p's rate.
export const LAMB_E = 4.3748e-6;                         // eV
export const STARK_FC = LAMB_E / (Math.sqrt(3) * A0);    // V/nm (4.77e-5 V/nm = 477 V/cm)
export function starkQuenchRate(F) {
  const x = F / STARK_FC;
  return 0.5 * (1 - 1 / Math.sqrt(1 + 4 * x * x)) / DECAY['2,1'].tau;
}
// How far a field shifts level n at most (eV per V/nm): the linear Stark effect, (3/2)·n·(n−1)·e·a₀.
export const starkShift = n => 1.5 * n * (n - 1) * A0;
// ħ in eV·ns: a level that lives τ ns is ħ/τ wide in energy.
export const HBAR_NS = 6.582119569e-7;

// ---------------------------------------------------------------------------
// Two atoms sharing one excitation (resonant dipole-dipole coupling).
// Atom A is in np, atom B in 1s. Their electric fields couple the two, so "A excited" is not a
// settled state: the excitation swings to B and back at rate J, while the pair gives off its
// photon at a rate that depends on whether the two atoms' waves add up (in step, up to twice as
// fast) or cancel (out of step, far slower). With x = 2πr/λ and p = (dipole · direction to the
// other atom)², in units of one atom's own decay rate Γ:
//   F = (3/2)·[(1−p)·sin x/x + (1−3p)·(cos x/x² − sin x/x³)]     shared decay
//   J = (3/4)·[−(1−p)·cos x/x + (1−3p)·(sin x/x² + cos x/x³)]    swinging rate
// (the standard two-atom result; F → 1 and J → 1/x³ as the atoms come closer than the wavelength).
// ---------------------------------------------------------------------------
export function pairCoupling(x, p) {
  const s = Math.sin(x), c = Math.cos(x);
  return {
    F: 1.5 * ((1 - p) * s / x + (1 - 3 * p) * (c / (x * x) - s / (x * x * x))),
    J: 0.75 * (-(1 - p) * c / x + (1 - 3 * p) * (s / (x * x) + c / (x * x * x))),
  };
}
// Advances the pair's two amplitudes c = [Re a, Im a, Re b, Im b] (a: excitation on A, b: on B)
// by time t under  i·dc/dt = [[D/2, g], [g, −D/2]]·c − i·(G/2)·c,  g = J − i·Gr·F/2.
//   G: each atom's total decay rate, Gr: the part that goes to 1s, J and F as above (J already
//   times Gr), D: how far apart a field has shifted the two atoms' levels. All in rad per unit time.
// |c|² shrinks as time passes: it is the chance that no photon has left yet.
export function pairStep(c, t, { G, Gr, J, F, D }) {
  const gr = J, gi = -Gr * F / 2;
  // Ω = sqrt(D²/4 + g²), complex
  const zr = D * D / 4 + gr * gr - gi * gi, zi = 2 * gr * gi, zm = Math.hypot(zr, zi);
  let wr = Math.sqrt((zm + zr) / 2), wi = Math.sqrt(Math.max(0, (zm - zr) / 2)); if (zi < 0) wi = -wi;
  const a = wr * t, b = wi * t;
  const cr = Math.cos(a) * Math.cosh(b), ci = -Math.sin(a) * Math.sinh(b);    // cos(Ωt)
  const sr = Math.sin(a) * Math.cosh(b), si = Math.cos(a) * Math.sinh(b);     // sin(Ωt)
  // q = sin(Ωt)/Ω (→ t as Ω → 0)
  const wm = wr * wr + wi * wi;
  const qr = wm > 1e-24 ? (sr * wr + si * wi) / wm : t, qi = wm > 1e-24 ? (si * wr - sr * wi) / wm : 0;
  // −i·q·M, with M = [[D/2, g], [g, −D/2]]
  const dr = qi * D / 2, di = -qr * D / 2;                                   // −i·q·D/2
  const or = qr * gi + qi * gr, oi = -(qr * gr - qi * gi);                   // −i·q·g
  const [ar, ai, br, bi] = c, k = Math.exp(-G * t / 2);
  const mul = (xr, xi, yr, yi) => [xr * yr - xi * yi, xr * yi + xi * yr];
  const aa = mul(cr + dr, ci + di, ar, ai), ab = mul(or, oi, br, bi);
  const ba = mul(or, oi, ar, ai), bb = mul(cr - dr, ci - di, br, bi);
  c[0] = k * (aa[0] + ab[0]); c[1] = k * (aa[1] + ab[1]);
  c[2] = k * (ba[0] + bb[0]); c[3] = k * (ba[1] + bb[1]);
  return { wr, wi };
}

// ---------------------------------------------------------------------------
// Any number of atoms sharing one excitation: the same physics as the pair above, for a whole
// group. Atom i holds amplitude c_i ("the excitation is on atom i"); every pair of atoms is
// coupled through its electric fields by the same J and F. The amplitudes follow
//   i·dc/dt = H·c,   H_ii = D_i − i·G/2,   H_ij = Gr·(J_ij − i·F_ij/2)
// (D_i: how far a field has shifted atom i's level; G, Gr as in pairStep). This is the standard
// result for N atoms and one photon (Lehmberg 1970), exact for atoms much closer together than the
// light's wave train is long. |c|² summed over the atoms shrinks as time passes: it is the chance
// that no photon has left yet. Light leaves at rate Gr·Σ_ij F_ij·Re(c_i* c_j) (F_ii = 1): faster
// than one atom when the atoms swing in step (they flash together, superradiance), slower when
// they swing against each other (the excitation is held, subradiance).
// ---------------------------------------------------------------------------
// pos: positions (nm). pOf(d): (dipole · direction)² for a unit vector d between two atoms.
// Returns H (real and imaginary parts, row-major N×N) and F, J (in units of Gr).
export function groupMatrix(pos, lam, { G, Gr, D, pOf, minR = 1 }) {
  const N = pos.length, Hr = new Float64Array(N * N), Hi = new Float64Array(N * N), F = new Float64Array(N * N), J = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    Hr[i * N + i] = D ? D[i] : 0; Hi[i * N + i] = -G / 2; F[i * N + i] = 1;
    for (let j = i + 1; j < N; j++) {
      const d = [pos[j][0] - pos[i][0], pos[j][1] - pos[i][1], pos[j][2] - pos[i][2]], r = Math.hypot(d[0], d[1], d[2]);
      const u = r > 1e-9 ? [d[0] / r, d[1] / r, d[2] / r] : [1, 0, 0];
      const k = pairCoupling(2 * Math.PI * Math.max(r, minR) / lam, pOf(u));
      Hr[i * N + j] = Hr[j * N + i] = Gr * k.J; Hi[i * N + j] = Hi[j * N + i] = -Gr * k.F / 2;
      F[i * N + j] = F[j * N + i] = k.F; J[i * N + j] = J[j * N + i] = k.J;
    }
  }
  return { N, Hr, Hi, F, J };
}
// U = exp(−i·H·t) for a complex N×N matrix (scaling and squaring with a 10-term series): the exact
// step for constant H, however fast the atoms swing or however large the shifts.
export function groupPropagator({ N, Hr, Hi }, t) {
  // M = −i·H·t = (Hi + i·(−Hr))·t
  let nrm = 0;
  for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += Math.hypot(Hr[i * N + j], Hi[i * N + j]); nrm = Math.max(nrm, s); }
  const sq = Math.max(0, Math.ceil(Math.log2(Math.max(1e-300, nrm * Math.abs(t) / 0.5)))), sc = t / 2 ** sq, n2 = N * N;
  const Mr = new Float64Array(n2), Mi = new Float64Array(n2);
  for (let k = 0; k < n2; k++) { Mr[k] = Hi[k] * sc; Mi[k] = -Hr[k] * sc; }
  const mul = (Ar, Ai, Br, Bi) => {
    const Cr = new Float64Array(n2), Ci = new Float64Array(n2);
    for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
      const ar = Ar[i * N + k], ai = Ai[i * N + k];
      if (ar === 0 && ai === 0) continue;
      for (let j = 0; j < N; j++) { const br = Br[k * N + j], bi = Bi[k * N + j]; Cr[i * N + j] += ar * br - ai * bi; Ci[i * N + j] += ar * bi + ai * br; }
    }
    return [Cr, Ci];
  };
  let Ur = new Float64Array(n2), Ui = new Float64Array(n2), Tr = new Float64Array(n2), Ti = new Float64Array(n2);
  for (let i = 0; i < N; i++) { Ur[i * N + i] = 1; Tr[i * N + i] = 1; }
  for (let m = 1; m <= 10; m++) {
    [Tr, Ti] = mul(Tr, Ti, Mr, Mi);
    for (let k = 0; k < n2; k++) { Tr[k] /= m; Ti[k] /= m; Ur[k] += Tr[k]; Ui[k] += Ti[k]; }
  }
  for (let s = 0; s < sq; s++) [Ur, Ui] = mul(Ur, Ui, Ur, Ui);
  return { N, Ur, Ui };
}
// c ← U·c, with c = { re, im } arrays of length N.
export function groupApply({ N, Ur, Ui }, c) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    re[i] += Ur[i * N + j] * c.re[j] - Ui[i * N + j] * c.im[j];
    im[i] += Ur[i * N + j] * c.im[j] + Ui[i * N + j] * c.re[j];
  }
  c.re = re; c.im = im;
  return c;
}
export const groupNorm = c => { let s = 0; for (let i = 0; i < c.re.length; i++) s += c.re[i] ** 2 + c.im[i] ** 2; return s; };
// Σ_ij F_ij·Re(c_i* c_j): the group's light-emission rate in units of Gr (1 for one excited atom
// alone; up to N for N atoms sharing equally and in step).
export function groupLightRate({ N, F }, c) {
  let s = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) s += F[i * N + j] * (c.re[i] * c.re[j] + c.im[i] * c.im[j]);
  return Math.max(0, s);
}
// How bright the group's light is in direction dir (unit vector), relative to one atom holding
// all of it: |Σ c_i·exp(−i·k·dir·r_i)|² / Σ|c_i|². The atoms' waves add up in some directions and
// cancel in others.
export function groupArrayFactor(pos, c, lam, dir) {
  const k = 2 * Math.PI / lam;
  let sr = 0, si = 0;
  for (let i = 0; i < pos.length; i++) {
    const ph = -k * (dir[0] * pos[i][0] + dir[1] * pos[i][1] + dir[2] * pos[i][2]), cs = Math.cos(ph), sn = Math.sin(ph);
    sr += c.re[i] * cs - c.im[i] * sn; si += c.re[i] * sn + c.im[i] * cs;
  }
  return (sr * sr + si * si) / Math.max(1e-300, groupNorm(c));
}
