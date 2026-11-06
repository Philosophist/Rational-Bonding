// Alchemfighter, Level 1 (hydrogen tutorial): the physics, with no DOM or WebGL code.
// Units: lengths in nm, times in fs, energies in eV, charges in units of e.
// Design: docs/levels/01-hydrogen-tutorial.md, beats 1 and 2.

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

// The one factor every capture chance is multiplied by (design doc §7: "rates ×N").
// Real per-pass odds for a well-aimed slow electron are about one in a million; this factor makes
// a good slow shot work about one time in three, and keeps every ratio between shots real.
export const RATE_BOOST = 6e5;

export const levelE = n => -RY / (n * n);
export const lambdaFor = (n1, n2) => HC / Math.abs(levelE(n2) - levelE(n1));
export const L_NAMES = 'spdfg';
export const stateName = s => `${s.n}${L_NAMES[s.l]}`;

// Speed (nm/fs) of an electron with kinetic energy E (eV); non-relativistic, fine below a few keV.
export const electronSpeed = E => Math.sqrt(2 * E / ME);
// Reduced de Broglie wavelength ħ/p (nm): how far a free electron's position is smeared.
export const reducedWavelength = E => HBARC / Math.sqrt(2 * MEC2 * E);

// ---------------------------------------------------------------------------
// Radiative recombination: e⁻ + H⁺ → H(n) + photon
// ---------------------------------------------------------------------------
// Kramers' cross section for capture into shell n (no Gaunt factor), in nm².
// σ_n = (32π / 3√3) α³ a₀² · Ry² / (n E (Ry + n² E)) ≈ 2.105e-22 cm² · Ry² / (n E (Ry + n² E))
export const CAPTURE_NMAX = 4;   // levels the slice renders and cascades through
export function kramersSigma(n, E) {
  return 2.105e-22 * 1e14 * RY * RY / (n * E * (RY + n * n * E));
}
export function captureSigma(E) {
  let s = 0;
  for (let n = 1; n <= CAPTURE_NMAX; n++) s += kramersSigma(n, E);
  return s;
}

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

// How capture depends on the closest approach. Classically, an electron radiates almost all of its
// energy loss near the closest point, and that energy falls as r_p^(−5/2) (Larmor's formula on a
// near-parabolic orbit). The electron is a wave, so the closest approach can't be sharper than its
// reduced wavelength: that sets the core radius r_c. The weight is then normalised so that, averaged
// over a uniform beam, the chance reproduces the Kramers cross section exactly.
export const CORE_R = 4 * A0;   // nm, about the size of the n = 2 orbit
export const coreRadius = () => CORE_R;
const passWeight = (rp, rc) => Math.pow(rp + rc, -2.5);
const normCache = new Map();
function passNorm(E) {
  const key = E.toPrecision(4);
  let v = normCache.get(key);
  if (v !== undefined) return v;
  const rc = coreRadius(E);
  // ∫₀^∞ 2πb w(r_p(b)) db on a log grid in b
  const lo = Math.log(1e-5), hi = Math.log(1e4), N = 1200, h = (hi - lo) / N;
  v = 0;
  for (let i = 0; i <= N; i++) {
    const b = Math.exp(lo + i * h), f = 2 * Math.PI * b * b * passWeight(periapsis(b, E), rc);
    v += (i === 0 || i === N ? 0.5 : 1) * f * h;
  }
  normCache.set(key, v);
  return v;
}
// Real chance that one pass with energy E and closest approach rp ends in capture.
export function captureChanceReal(E, rp) {
  const Ee = Math.max(E, 0.01);
  return captureSigma(Ee) * passWeight(rp, coreRadius(Ee)) / passNorm(Ee);
}
export const captureChanceGame = (E, rp) => Math.min(0.9, RATE_BOOST * captureChanceReal(E, rp));

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

// Which level the electron lands in: shell n by Kramers' partial cross sections, then the
// sub-level l in proportion to its 2l + 1 states (a statistical simplification), and m uniformly.
export function pickCaptureState(E, rand = Math.random) {
  const ns = [];
  for (let n = 1; n <= CAPTURE_NMAX; n++) ns.push(n);
  const n = pickWeighted(ns, k => kramersSigma(k, E), rand);
  const ls = [];
  for (let l = 0; l < n; l++) ls.push(l);
  const l = pickWeighted(ls, k => 2 * k + 1, rand);
  const m = Math.floor(rand() * (2 * l + 1)) - l;
  return { n, l, m };
}
// The photon given off at capture carries the electron's energy plus the binding energy.
export const captureLambda = (E, n) => HC / (E + RY / (n * n));

// ---------------------------------------------------------------------------
// Spontaneous decay of hydrogen: lifetimes (ns) and branching ratios, from the prototype.
// 2s cannot give off one photon; in empty space it gives off two, sharing 10.2 eV, after 0.122 s.
// ---------------------------------------------------------------------------
export const DECAY = {
  '2,1': { tau: 1.596, br: [[1, 0, 1]] },
  '2,0': { tau: 1.22e8, br: [[1, 0, 1]], twoPhoton: true },
  '3,0': { tau: 158.6, br: [[2, 1, 1]] },
  '3,1': { tau: 5.27, br: [[1, 0, 0.882], [2, 0, 0.118]] },
  '3,2': { tau: 15.6, br: [[2, 1, 1]] },
  '4,0': { tau: 226.5, br: [[2, 1, 0.584], [3, 1, 0.416]] },
  '4,1': { tau: 12.4, br: [[1, 0, 0.841], [2, 0, 0.119], [3, 0, 0.028], [3, 2, 0.012]] },
  '4,2': { tau: 36.5, br: [[2, 1, 0.746], [3, 1, 0.254]] },
  '4,3': { tau: 72.6, br: [[3, 2, 1]] },
};

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
export function lineName(nm) {
  const named = [[121.57, 'Lyman-α'], [102.57, 'Lyman-β'], [97.25, 'Lyman-γ'], [656.47, 'H-α'], [486.27, 'H-β'], [1875.6, 'Paschen-α']];
  for (const [l, name] of named) if (Math.abs(nm - l) / l < 2e-3) return name;
  return '';
}

// ---------------------------------------------------------------------------
// Coulomb dynamics inside the sealed sphere
// ---------------------------------------------------------------------------
// Particles: { pos:[x,y,z], vel:[x,y,z], q, m, active }. Neutral or inactive ones feel no force.
// Electron–proton encounters are tracked so each pass is reported once, with its closest approach.
const SOFT2 = 1e-6;   // nm², softening (0.001 nm) so a dead-centre shot doesn't divide by zero

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
}

// The shortest time scale in the system: the time to cross the gap between any two charges.
function timeStep(ps) {
  let best = Infinity;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!a.active) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!b.active || !a.q || !b.q) continue;
      const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
      const dv = Math.hypot(b.vel[0] - a.vel[0], b.vel[1] - a.vel[1], b.vel[2] - a.vel[2]);
      const mu = a.m * b.m / (a.m + b.m), tff = Math.sqrt(mu * r * r * r / KE);
      best = Math.min(best, r / (dv + 1e-9), tff);
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
      // The wall: matter bounces off without losing energy, in a random direction (real surfaces
      // scatter diffusely, following Knudsen's cosine law), so a miss doesn't come straight back.
      const r = Math.hypot(p.pos[0], p.pos[1], p.pos[2]);
      if (r > R) {
        const nx = p.pos[0] / r, ny = p.pos[1] / r, nz = p.pos[2] / r;
        const vn = p.vel[0] * nx + p.vel[1] * ny + p.vel[2] * nz;
        if (vn > 0) p.vel = diffuseBounce(p.vel, [-nx, -ny, -nz], rand);
        const k = (2 * R - r) / r; p.pos[0] *= k; p.pos[1] *= k; p.pos[2] *= k;
        p.bounces = (p.bounces || 0) + 1;
      }
    }
    trackPasses(ps, enc, events);
    t += h; n++;
  }
  return { events, substeps: n, done: t >= dt };
}

// Same speed, new direction drawn from a cosine-weighted hemisphere around the inward normal n.
export function diffuseBounce(v, n, rand = Math.random) {
  const speed = Math.hypot(v[0], v[1], v[2]);
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let t = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const tl = Math.hypot(t[0], t[1], t[2]); t = t.map(x => x / tl);
  const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  const u = rand(), phi = 2 * Math.PI * rand(), st = Math.sqrt(u), ct = Math.sqrt(1 - u);
  return [0, 1, 2].map(k => speed * (n[k] * ct + st * (Math.cos(phi) * t[k] + Math.sin(phi) * b[k])));
}

function trackPasses(ps, enc, events) {
  for (const e of ps) {
    if (!e.active || e.q !== -1) continue;
    for (const p of ps) {
      if (!p.active || p.q !== 1) continue;
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
        if (s.min < 10) {
          const mu = e.m * p.m / (e.m + p.m), v2 = vx * vx + vy * vy + vz * vz;
          events.push({ e, p, rp: s.min, E: 0.5 * mu * v2 - KE / Math.sqrt(r * r + SOFT2) });
        }
      }
    }
  }
}

// Total energy (kinetic + Coulomb) of the active charges, for tests.
export function totalEnergy(ps) {
  let E = 0;
  for (const p of ps) if (p.active) E += 0.5 * p.m * (p.vel[0] ** 2 + p.vel[1] ** 2 + p.vel[2] ** 2);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (!a.active || !b.active || !a.q || !b.q) continue;
    E += KE * a.q * b.q / Math.sqrt((a.pos[0] - b.pos[0]) ** 2 + (a.pos[1] - b.pos[1]) ** 2 + (a.pos[2] - b.pos[2]) ** 2 + SOFT2);
  }
  return E;
}
