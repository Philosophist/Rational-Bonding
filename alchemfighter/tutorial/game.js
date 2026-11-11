// Alchemfighter, Level 1 "Electromagnetic Stardust": beats 1 and 2 of docs/levels/01-hydrogen-tutorial.md.
// Plays in the browser window or in a PC VR headset (WebXR); the VR button works from the start.
// Beat 1: meet the proton (its field and glow). The system starts with only the proton in it.
// Beat 2: catch an electron with the electron gun, then watch the cascade of light down to 1s.
import * as P from './physics.js';
import { waveDesc, extentBohr } from './orbitals.js';
import { createRenderer, Lines } from './render.js';
import * as M from './mat4.js';

const $ = id => document.getElementById(id);
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
const fmtChance = p => (p >= 0.1 ? `${(p * 100).toFixed(0)}%` : p >= 0.001 ? `${(p * 100).toFixed(1)}%` : p > 0 ? '<0.1%' : '0%');
const fmtOdds = p => (p <= 0 ? 'never' : `1 in ${(1 / p >= 1e6 ? `${(1 / p / 1e6).toFixed(1)} million` : Math.round(1 / p).toLocaleString('en-US'))}`);
const fmtNm = r => (r < 0.1 ? `${(r * 1000).toFixed(0)} pm` : `${r.toFixed(2)} nm`);

// Time: one clock for everything. At full speed one screen second is FS_PER_S femtoseconds.
// Nothing ever pauses: when something worth watching happens, the whole system slows down.
// Rare events (catches, steps down, absorptions, collisions) all run RATE_BOOST times faster than
// in nature, so you don't wait hours, and they stay in their real proportions.
const FS_PER_S = 40;
// Light moves at its real speed on the same clock. While a light wave is out, everything slows
// until light covers LIGHT_SHOW nm per screen second, so you can watch the wave spread; matter is
// then almost still, which is true: light is about 1,600 times faster than a slow electron.
// Light passed from atom to atom (radiation trapping) can bounce dozens of times, so those
// re-emissions slow things less: light covers LIGHT_QUICK nm per screen second, a quick ripple.
const LIGHT_SHOW = 25, LIGHT_QUICK = 300;
const lightSlow = show => show / (299.792458 * FS_PER_S);
const LIGHT_SLOW = lightSlow(LIGHT_SHOW);
// An atom that took light and gives it back changes shape quicker (it is the same light, again).
const REEMIT_MORPH = 0.6;
// Neighbours closer than λ/2π (about 19 nm for Lyman-α) are inside each other's near field. An
// excited atom and a resting neighbour there share the excitation: it swings between them through
// their electric fields, with no light in between (see "Two atoms sharing one excitation").
// While the swinging can be seen, the clock slows until one swing there and back takes PAIR_SWING
// screen seconds. It is held there for PAIR_HOLD seconds (longer the first two times), then eases
// back up (e-fold per PAIR_EASE s), so the swinging speeds up into a blur: the shared shape.
const PAIR_SWING = 3, PAIR_HOLD = [6, 2.5], PAIR_EASE = 1.2;
// The clouds are drawn through a PAIR_BLUR-second average, so fast swinging never flickers.
const PAIR_BLUR = 0.15;
// Closer than this the two atoms would start to bond; the coupling is held at its 1 nm value.
const PAIR_MIN_R = 1;
// While an electron falls in or an atom changes shape, everything slows to EVENT_SLOW.
const EVENT_SLOW = 0.01;
// Game speed the player picks (, and . keys), and automatic slow motion when an electron dives in
// close to a proton: there it speeds up a lot, so the clock slows until it moves at most
// SLOW_TARGET nm per screen second. Odds per pass don't depend on the clock.
const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const SLOW_NEAR = 4, SLOW_TARGET = 1.5, SLOW_MIN = 0.02;
// After a capture the electron's glow is drawn melting into its new cloud over this many seconds.
// (In nature the change is a sudden quantum jump; this lets you see which electron went where.)
const FALL_DUR = 3.0;
// Each step down the ladder: the atom waits its real lifetime (sped up like every rare event, so
// the lifetimes keep their real proportions: 2p 1.6 ns, 3s 159 ns, ...), then the shape morphs
// over STEP_MORPH s while everything slows.
const STEP_MORPH = 1.5;
// Acid Neutrality: this many fresh protons appear for the player to neutralize.
const ACID_N = 10;
// The ship: the keys fire thrusters (an acceleration), and it coasts when you let go.
const THRUST = 5, THRUST_FAST = 15, BRAKE = 10;   // nm/s²
const DIAL = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];   // eV, the electron's energy far from the proton
const PROTON_SMEAR = 0.01;       // nm, keeps the glow's centre finite (log scale, capped)
// Missed electrons stay in the sphere (matter can't leave). Fire as many as you like; past this many
// free electrons the oldest one is removed, to keep the simulation smooth.
const MAX_FREE = 12;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const cam = { p: [0, 1.5, 24], v: [0, 0, 0], yaw: Math.PI, pitch: -0.06, fov: 62 * Math.PI / 180 };
let S;
let nextId = 1;
function newState() {
  const proton = { id: 'p1', kind: 'proton', q: 1, m: P.MP, pos: [0, 0, 0], vel: [0, 0, 0], active: true, glow: 1 };
  return {
    time: 0, simFs: 0, beat: 1, ps: [proton], enc: new Map(), atoms: [], waves: [], flashes: [], spectrum: [],
    shots: 0, absorbed: 0, ionized: 0, bumped: 0, paired: 0, pairs: [], oldSteps: [], light: [], lightOut: 0, lightOutE: 0, passes: [], fieldView: true, dial: 1, cooldown: 0, cascade: null, autoCam: null, falling: [], speed: 3, slow: 1,
    b1: { start: null, maxAngle: 0, toggled: false, glowTried: false, moved: false },
    b2: { tooFastSaid: false, captured: false, doneShown: false, nextAt: 0 }, b3: { spawned: false, doneAt: 0, caught: 0 }, ended: false, said: '',
  };
}
// The player's eye: the flat camera, or the VR headset placed in the ship.
function camBasis() {
  if (xr.session && xr.head) return xr.head;
  return flatBasis();
}
function flatBasis() {
  const cp = Math.cos(cam.pitch);
  const f = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp];
  const r = v3.norm(v3.cross(f, [0, 1, 0])), u = v3.cross(r, f);
  return { p: cam.p, f, r, u, fovT: Math.tan(cam.fov / 2) };
}
const bareProtons = () => S.ps.filter(p => p.kind === 'proton' && p.q === 1 && p.active);
const freeElectrons = () => S.ps.filter(p => p.kind === 'electron' && p.active);

// ---------------------------------------------------------------------------
// Tutor and beats
// ---------------------------------------------------------------------------
const BEATS = {
  1: {
    title: 'Meet the proton',
    say: 'This is a proton. It\'s also a hydrogen ion, written H⁺: a hydrogen atom that has lost its only electron. It carries one unit of positive charge, and that charge reaches out into space as an electric field: the lines show it. They fade as the field weakens with distance, so the bright part shows where it is strong enough to catch an electron. If the lines feel busy, press V for the calmer Glow view. Your ship drifts like anything in space: the keys fire thrusters, and X brakes.',
  },
  2: {
    title: 'First capture',
    say: 'Your gun fires electrons. Electrons are negative, so the proton pulls them in. But an electron can only stay if it gets rid of its energy, and it does that by giving off light. Fire a slow electron at the proton.',
  },
  3: {
    title: 'Acid Neutrality',
    say: `Ten more protons have appeared. Loose H⁺ ions like these are what make an acid acidic: the more of them, the stronger the acid. Neutralize this one. Give every proton an electron, so each becomes a neutral hydrogen atom. Each catch's energy leaves as light through the edge of the system: watch the spectrometer catch it.`,
  },
};
function say(text) {
  if (S.said === text) return;
  S.said = text; $('tutorText').textContent = text;
  if ($('tutor').classList.contains('collapsed')) $('tutor').dataset.unread = '1';
}
// On phones the tutor panel starts folded into one slim bar; ⓘ opens it.
const phone = matchMedia('(max-width: 900px)');
function setTutorOpen(open) {
  $('tutor').classList.toggle('collapsed', !open);
  $('tutorToggle').setAttribute('aria-expanded', String(open));
  if (open) delete $('tutor').dataset.unread;
}
$('tutorToggle').addEventListener('click', () => setTutorOpen($('tutor').classList.contains('collapsed')));
setTutorOpen(!phone.matches);
phone.addEventListener && phone.addEventListener('change', e => setTutorOpen(!e.matches));
function goals() {
  if (S.beat === 1) {
    return [
      ['Fly around the proton (W A S D, X to brake)', S.b1.moved],
      ['Look at it from two sides', S.b1.maxAngle > 1.3],
      ['Try Glow view and back (V)', S.b1.toggled],
    ];
  }
  if (S.beat === 2) {
    return [
      ['Fire electrons at the proton', S.shots > 0],
      ['Catch one: make a neutral hydrogen atom', S.b2.captured],
    ];
  }
  const left = acidLeft();
  const all = protonCount();
  return [[`Neutralize the protons (${all - left} of ${all})`, !!S.b3.doneAt]];
}
let lastGoals = '';
function renderGoals() {
  const g = goals(), key = JSON.stringify(g);
  if (key === lastGoals) return;
  lastGoals = key;
  $('goals').innerHTML = g.map(([t, d]) => `<li class="${d ? 'done' : ''}">${t}</li>`).join('');
}
function startBeat(n) {
  S.beat = n;
  $('beatTitle').textContent = BEATS[n].title;
  say(BEATS[n].say);
  $('fireBtn').disabled = n < 2;
  $('skipBtn').hidden = n >= 3;
  $('skipBtn').textContent = n === 1 ? 'Skip to the gun' : 'Skip to Acid Neutrality';
  lastGoals = '';
  if (n === 3 && !S.b3.spawned) spawnAcid();
  panelDirty();
}
const acidLeft = () => bareProtons().length;
const protonCount = () => S.ps.filter(p => p.kind === 'proton').length;
// Scatter the acid's protons through the sphere, not too close to each other, the atom or you.
function spawnAcid() {
  S.b3.spawned = true;
  const taken = [...S.ps.filter(p => p.kind === 'proton').map(p => p.pos), cam.p];
  for (let i = 0; i < ACID_N; i++) {
    let pos;
    for (let tries = 0; tries < 400; tries++) {
      const r = 8 + 20 * Math.cbrt(Math.random()), z = Math.random() * 2 - 1, th = Math.random() * 2 * Math.PI, rr = Math.sqrt(1 - z * z);
      pos = [r * rr * Math.cos(th), r * z * 0.6, r * rr * Math.sin(th)];
      if (taken.every(q => v3.len(v3.sub(q, pos)) > 7)) break;
    }
    taken.push(pos);
    S.ps.push({ id: `p${nextId++}`, kind: 'proton', q: 1, m: P.MP, pos, vel: [0, 0, 0], active: true, glow: 1, acid: true });
    S.flashes.push({ pos: [...pos], col: [1, 0.8, 0.5], t: 0, life: 1.2, size: 1.4 });
  }
  log(`${ACID_N} protons (H⁺) appeared. Acid Neutrality: neutralize them all.`, 'hit');
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
function addElectron(pos, vel, extra) {
  const e = { id: `e${nextId++}`, kind: 'electron', q: -1, m: P.ME, pos, vel, active: true, trail: [], trailT: 0, passes: 0, ...extra };
  S.ps.push(e);
  return e;
}

// Where the crosshair points, and what the gun would do from here.
function getAim() {
  if (xr.session && xr.aim) return { eye: xr.aim.o, f: xr.aim.d, muzzle: xr.aim.o };
  const B = flatBasis();
  return { eye: B.p, f: B.f, muzzle: v3.add(B.p, v3.add(v3.scale(B.u, -0.45), v3.scale(B.r, 0.3))) };
}
function aimInfo() {
  const g = getAim(), B = { p: g.eye, f: g.f }, muzzle = g.muzzle;
  const targets = [...bareProtons(), ...S.atoms.map(a => a.p)];
  let best = null;
  for (const p of targets) {
    const oc = v3.sub(p.pos, B.p), t = v3.dot(oc, B.f);
    if (t <= 0.5) continue;
    const miss = v3.len(v3.sub(oc, v3.scale(B.f, t)));
    if (!best || miss < best.miss) best = { p, t, miss };
  }
  const D = best ? best.t : 25;
  const aimPoint = v3.add(B.p, v3.scale(B.f, D));
  const E = DIAL[S.dial];
  const cone = P.coneWidth(E, v3.len(v3.sub(aimPoint, muzzle)));
  const info = { muzzle, aimPoint, cone, E, target: best && best.miss < 6 ? best : null };
  if (info.target && info.target.p.q === 1) {
    // Two-body prediction of the closest approach, from the launch point's angular momentum.
    const rel = v3.sub(muzzle, info.target.p.pos), dir = v3.norm(v3.sub(aimPoint, muzzle));
    const h = v3.len(v3.cross(rel, dir)) * P.electronSpeed(launchKE(E, v3.len(rel)));
    info.rp = P.periapsisFromL(h, E);
    info.chance = P.captureChanceGame(E, info.rp);
    info.real = P.captureChanceReal(E, info.rp);
  }
  return info;
}
// The dial sets the energy far from the proton; near it the electron is already moving faster.
const launchKE = (E, dist) => E + P.KE / Math.max(dist, 0.5);

function fire() {
  if (S.beat < 2 || S.cooldown > 0) return;
  const a = aimInfo();
  const ax = v3.norm(v3.sub(a.aimPoint, a.muzzle));
  const e1 = v3.norm(v3.cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(ax, e1);
  const off = v3.add(v3.scale(e1, P.gaussian() * a.cone), v3.scale(e2, P.gaussian() * a.cone));
  const dir = v3.norm(v3.sub(v3.add(a.aimPoint, off), a.muzzle));
  const near = a.target && a.target.p.q === 1 ? a.target.p : bareProtons()[0];
  const KEl = launchKE(a.E, near ? v3.len(v3.sub(a.muzzle, near.pos)) : 99);
  S.shots++;
  addElectron([...a.muzzle], v3.scale(dir, P.electronSpeed(KEl)), { shot: S.shots, E: a.E, born: S.time });
  const free = freeElectrons().filter(e => !e.freed);   // electrons knocked off atoms are never removed
  if (free.length > MAX_FREE) {
    const old = free[0];   // electrons are kept in the order they were fired
    old.active = false;
    S.ps = S.ps.filter(x => x.active);
    S.flashes.push({ pos: [...old.pos], col: [0.3, 0.5, 1], t: 0, life: 0.5, size: 0.6 });
    if (!S.trimSaid) { S.trimSaid = true; log(`More than ${MAX_FREE} free electrons: the oldest is removed each time you fire, to keep the game smooth.`); }
  }
  S.cooldown = 0.35;
  S.flashes.push({ pos: v3.add(a.muzzle, v3.scale(ax, 0.3)), col: [0.3, 0.5, 1.0], t: 0, life: 0.25, size: 0.25 });
}

// ---------------------------------------------------------------------------
// Capture and the light cascade
// ---------------------------------------------------------------------------
const descCache = new Map();
function desc(s) {
  const k = `${s.n},${s.l},${s.m}`;
  if (!descCache.has(k)) descCache.set(k, waveDesc(s.n, s.l, s.m, 1, true));
  return descCache.get(k);
}
// Light leaves as a wave: a shell of electromagnetic ripple spreading out from the atom at the
// speed of light, brightest where the radiation pattern is strongest. A dipole
// whose charge swings along an axis (Δm = 0) sends most light out sideways (sin²θ); one that turns
// in a circle (Δm = ±1) sends (1 + cos²θ)/2. The photon's energy is spread over the whole shell
// until it is detected somewhere, which the spectrometer does at the wall.
const randomDir = () => { const th = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, rr = Math.sqrt(1 - z * z); return [rr * Math.cos(th), z, rr * Math.sin(th)]; };
function emitPhoton(pos, lam, pattern = 'lin', axis = randomDir(), from = null, show = LIGHT_SHOW) {
  const I = pattern === 'lin' ? c => 1 - c * c : pattern === 'circ' ? c => 0.5 * (1 + c * c) : () => 1;
  const avgI = pattern === 'iso' ? 1 : 2 / 3;
  let dir;   // where the photon is found if nothing takes it (and its recoil), drawn from the pattern
  do dir = randomDir(); while (Math.random() > I(v3.dot(dir, axis)));
  const b = v3.dot(pos, dir), c = v3.dot(pos, pos) - P.SPHERE_R ** 2;
  const exitAt = -b + Math.sqrt(Math.max(0, b * b - c));   // distance to the wall along dir
  const L = { lam, E: P.HC / lam, src: [...pos], axis, I, x: 0, exitAt, slow: lightSlow(show), exitPt: v3.add(pos, v3.scale(dir, exitAt)), col: photonColor(lam) };
  planLight(L, avgI, from);
  S.light.push(L);
  S.slow = Math.min(S.slow, L.slow);   // slow everything at once, so the wave can be seen
  return dir;
}

// ---------------------------------------------------------------------------
// Light meeting atoms. In this level light passes out through the edge of the system, so each
// photon gets one pass. Its wave spreads at the speed of light; wherever it reaches an atom, that
// atom may take the whole photon (never part of it), with chance σ·w/(4πr²): its target area σ
// times how bright the wave is that way (w), spread over the sphere of radius r the wave has
// reached. If nothing takes it, it is found at the wall, where the spectrometer records it.
// - Lyman light (121.6, 102.6, 97.3 nm) is exactly the colour that lifts a 1s electron to 2p, 3p or
//   4p. For that colour a 1s atom's target area is huge (about 7,000, 4,400 and 3,800 nm²), so a
//   resting atom within about 20 nm almost always takes it, then gives it back out
//   (radiation trapping).
// - Any photon with more energy than an atom's electron is bound by (13.6 eV from 1s, 3.4 from
//   n = 2, 1.5 from n = 3, 0.85 from n = 4) can knock it free, but the target area is tiny
//   (about 0.0006 nm²), so on one pass that is very rare.
// - Free electrons can't absorb light at all (they can't take its energy and its push together);
//   they only scatter it, about 100 million times less often than an atom absorbs it.
// - An electron faster than 10.2 eV can bump a 1s atom up to n = 2, and one faster than 13.6 eV
//   can knock its electron off (collisions, rate n·σ·v, on the rare-event clock).
// ---------------------------------------------------------------------------
const LYMAN_SIGMA = { 2: 7057, 3: 4424, 4: 3793 };     // nm², resonant absorption from 1s (λ²/2π · g · branch)
// σ/(4πr²) counts the wave as a plane wave. Just outside the near field (λ/2π) that still
// overestimates, so one atom's chance from a single neighbour's wave is capped at about half.
const NEAR_CAP = 0.5;
const lymanUpper = lam => [2, 3, 4].find(n => Math.abs(lam - P.lambdaFor(1, n)) / lam < 1e-4) || 0;
const watched = a => S.cascade && S.cascade.atom === a;
// An atom can swallow Lyman light or be hit by an electron only when it is resting in 1s.
const idle1s = a => !a.trans && !a.pending && !a.pair && !a.mix && a.st.n === 1 && a.fade >= 1 && !watched(a);
// Any atom sitting in a level (not mid-jump) can have its electron knocked off by strong enough light.
const resting = a => !a.trans && !a.pair && a.fade >= 1;
function planLight(L, avgI, from) {
  const nUp = lymanUpper(L.lam);
  const near = S.atoms.filter(a => a !== from && resting(a)).map(a => ({ a, d: v3.sub(a.p.pos, L.src) }))
    .map(o => ({ ...o, r: v3.len(o.d) })).filter(o => o.r > 0.05 && o.r < L.exitAt).sort((x, y) => x.r - y.r);
  for (const o of near) {
    // Inside λ/2π a neighbour is coupled, not absorbing (see tryPair), so only farther atoms take Lyman light.
    const sLy = nUp && idle1s(o.a) && o.r >= L.lam / (2 * Math.PI) ? LYMAN_SIGMA[nUp] : 0, sIon = P.photoionSigma(o.a.st.n, L.E);
    if (!sLy && !sIon) continue;
    const w = L.I(v3.dot(v3.scale(o.d, 1 / o.r), L.axis)) / avgI;
    if (Math.random() < Math.min(NEAR_CAP, (sLy + sIon) * w / (4 * Math.PI * o.r * o.r))) {
      L.absorbAt = o.r; L.target = o.a; L.hitDir = v3.scale(o.d, 1 / o.r);
      L.how = Math.random() * (sLy + sIon) < sLy ? 'lyman' : 'ion';
      L.nUp = nUp;
      return;
    }
  }
}
// dLight: how far light travels this step (c × the real time that passes).
function updateLight(dLight) {
  for (const L of S.light) {
    L.x += dLight;
    if (L.absorbAt && L.x >= L.absorbAt) {
      const a = L.target;
      L.gone = true;
      if (!S.atoms.includes(a) || !resting(a)) continue;   // it changed meanwhile: rare, let it go
      a.p.vel = v3.add(a.p.vel, v3.scale(L.hitDir, L.E / P.C / P.MP));   // the photon's push
      if (L.how === 'lyman' && idle1s(a)) reExcite(a, L);
      else {
        const n = a.st.n;
        freeAtom(a, L.E - P.ionE(n), L.col);
        log(`H(${P.stateName(a.st)}) + ${L.lam.toFixed(1)} nm light → H⁺ + e⁻, with ${(L.E - P.ionE(n)).toFixed(2)} eV to spare.`, 'red');
        say(`The light knocked the electron off a hydrogen atom! ${n === 1 ? 'From 1s that takes at least 13.6 eV of ultraviolet' : `Up on step n = ${n} it only takes ${P.ionE(n).toFixed(1)} eV`}. Light can break atoms apart as well as come out of them. That proton is bare again.`);
      }
    } else if (L.x >= L.exitAt) {
      // Not taken: it is found at the wall and leaves the system. The spectrometer records it.
      L.gone = true;
      S.spectrum.push({ lam: L.lam, t: S.time });
      S.lightOut++; S.lightOutE += L.E;
      S.flashes.push({ pos: L.exitPt, col: L.col.map(v => v * 0.6), t: 0, life: 0.6, size: 0.5 });
    }
  }
  S.light = S.light.filter(L => !L.gone);
}
// Fast electrons hitting resting atoms: n = 2 excitation above 10.2 eV, ionization above 13.6 eV.
function collisions(dtNs) {
  const atoms = S.atoms.filter(idle1s);
  if (!atoms.length) return;
  const bare = bareProtons();
  for (const e of freeElectrons()) {
    if (bare.some(p => v3.len(v3.sub(p.pos, e.pos)) < 2)) continue;   // falling past a proton, not its own speed
    const v = v3.len(e.vel), E = 0.5 * P.ME * v * v;
    if (E <= P.EXCITE_E) continue;
    const rEx = P.collRate(P.collExciteSigma(E), E, atoms.length), rIon = P.collRate(P.collIonSigma(E), E, atoms.length);
    if (Math.random() > 1 - Math.exp(-(rEx + rIon) * dtNs)) continue;
    const pool = atoms.filter(idle1s);
    if (!pool.length) return;
    const a = pool[Math.floor(Math.random() * pool.length)];
    if (Math.random() * (rEx + rIon) < rEx) {
      e.vel = v3.scale(e.vel, Math.sqrt((E - P.EXCITE_E) / E));
      a.trans = { from: a.st, to: { n: 2, l: 1, m: 0 }, t: 0, dur: STEP_MORPH };
      a.reex = true;
      S.bumped++;
      if (S.bumped <= 2) log(`A fast electron (${E.toFixed(1)} eV) hit a hydrogen atom and bumped it up to 2p, slowing down by 10.2 eV.`);
    } else {
      const left = E - P.RY, share = left * 0.5 * Math.random();   // the knocked-out electron usually leaves slow
      e.vel = v3.scale(e.vel, Math.sqrt((left - share) / E));
      freeAtom(a, share, [0.4, 0.6, 1]);
      log(`A fast electron (${E.toFixed(1)} eV) knocked the electron off a hydrogen atom.`, 'red');
      if (S.ionized === 1) say('A fast electron smashed into a hydrogen atom and knocked its electron off. That proton is bare again.');
    }
    atoms.splice(atoms.indexOf(a), 1);
    if (!atoms.length) return;
  }
}
function reExcite(a, L) {
  const to = { n: L.nUp, l: 1, m: 0 };
  a.trans = { from: a.st, to, t: 0, dur: REEMIT_MORPH };
  a.reex = true;
  a.absorbed = (a.absorbed || 0) + 1;
  S.absorbed++;
  S.flashes.push({ pos: [...a.p.pos], col: L.col.map(x => x * 0.5), t: 0, life: 1.2, size: 0.3 });   // soft: this happens often
  if (S.absorbed <= 3) log(`A 1s atom took ${L.lam.toFixed(1)} nm ${P.lineName(L.lam) || 'Lyman'} light and jumped to ${P.stateName(to)}. It will give the same light back out.`);
  if (S.absorbed === 1) say('See that atom light up? Lyman light from another atom reached it and lifted its electron back up: it is exactly the right colour, so a resting hydrogen atom nearby almost always takes it. The atom drops straight back and gives the same light out again. Physicists call this radiation trapping.');
}
// The atom comes apart: its proton is bare again and its electron flies off with `extra` eV.
function freeAtom(a, extra, col) {
  const p = a.p;
  S.atoms = S.atoms.filter(x => x !== a);
  S.oldSteps.push(...a.steps);
  p.q = 1; p.glow = 1;
  // The freed electron starts 0.5 nm out with the speed it needs to end up with `extra` far away.
  const dir = randomDir(), r0 = 0.5;
  addElectron(v3.add(p.pos, v3.scale(dir, r0)), v3.add(p.vel, v3.scale(dir, P.electronSpeed(extra + P.KE / r0))),
    { freed: true, E: extra, born: S.time });
  p.vel = v3.sub(p.vel, v3.scale(dir, P.electronSpeed(extra) * P.ME / P.MP));   // the proton recoils from the electron
  S.ionized++;
  S.flashes.push({ pos: [...p.pos], col, t: 0, life: 1.2, size: 1.0 });
}
function photonColor(lam) {
  const c = P.lambdaRGB(lam), k = P.band(lam) === 'visible' ? 1 : 0.8;
  return c.map(x => x * k);
}
function capture(e, p, E) {
  const st = P.pickCaptureState(Math.max(E, 0.01));
  const lam = P.captureLambda(Math.max(E, 0), st.n);
  e.active = false;
  S.ps = S.ps.filter(x => x !== e);
  p.q = 0;                                  // the pair is neutral now: no more Coulomb force
  const atom = { p, st, trans: null, fade: 0, beat: 0, waitFs: 0, hold: 0, pending: null, steps: [{ lam, kind: 'capture', to: st }] };
  S.atoms.push(atom);
  // Momentum is kept: the atom moves on with the pair's shared momentum, minus the photon's kick.
  p.vel = v3.scale(v3.add(v3.scale(p.vel, P.MP), v3.scale(e.vel, P.ME)), 1 / (P.MP + P.ME));
  // The photon leaves from where the electron is when it is caught.
  const pdir = emitPhoton(e.pos, lam, 'lin', randomDir(), atom);
  p.vel = v3.sub(p.vel, v3.scale(pdir, (P.HC / lam) / P.C / P.MP));
  S.flashes.push({ pos: [...e.pos], col: [0.55, 0.6, 0.75], t: 0, life: 1.2, size: 0.8 });
  const off = v3.sub(e.pos, p.pos), rel = v3.sub(e.vel, p.vel);
  let axis = v3.cross(off, rel); axis = v3.len(axis) > 1e-12 ? v3.norm(axis) : [0, 1, 0];
  S.falling.push({ e, atom, off, axis, t: 0 });
  S.lastPhoton = { lam, nLow: st.n, capture: true };
  log(`Captured into ${P.stateName(st)}: one ${lam.toFixed(1)} nm photon carries off ${(P.HC / lam).toFixed(2)} eV. ${describe(lam, st.n, true, true)}.`, 'hit');
  if (st.n === 1) log('Straight to 1s! That happens: a single ultraviolet photon, shorter than 91.2 nm, takes all the energy at once.', 'hit');
  scheduleDecay(atom);
  atom.hold += FALL_DUR;                    // let the electron settle in before the next step down
  S.cascade = { atom, start: S.time };
  S.autoCam = { atom, t: 0 };
  S.b2.captured = true;
  if (S.beat === 3) S.b3.caught++;
  say(st.n === 1
    ? 'Caught! This one went straight to the bottom step in one go, so a single ultraviolet flash carried off all the energy.'
    : `Caught! It landed on step n = ${st.n}. Now watch it step down, giving off light at each step.`);
}
// The next step down happens after its real (sped-up) delay on the shared clock. That includes
// 2s: its two-photon decay really takes 0.12 s, 76 million times longer than 2p, so left alone it
// outlasts any game. What lets it go sooner is a loose charge's electric field (quench2s).
function scheduleDecay(atom) {
  const d = P.pickDecay(atom.st);
  atom.pending = d;
  if (!d) return;
  atom.waitFs = d.delayNs * 1e6 / P.RATE_BOOST;
  atom.hold = 0; atom.since = S.simFs; atom.alone = 0;
  if (d.twoPhoton && (S.in2s = (S.in2s || 0) + 1) <= 2) log('2s can\'t give off a single photon by itself. Left alone it waits about 0.12 s, then gives off two. A loose charge\'s electric field lets it go far sooner.');
}
// A loose charge's electric field mixes 2s with 2p (Stark mixing), and the atom then gives off one
// Lyman-α photon, its charge swinging along the field. Any bare proton or free electron inside the
// sphere is close enough to mix the two fully, and 2s then lasts twice as long as 2p.
function quench2s(a, dt, dtFs) {
  const Fv = P.fieldAt(a.p.pos, S.ps), F = v3.len(Fv);
  if (Math.random() < 1 - Math.exp(-P.starkQuenchRate(F) * dtFs * P.RATE_BOOST * 1e-6)) {
    a.pending = { to: { n: 1, l: 0, m: 0 }, photons: [P.lambdaFor(2, 1)], delayNs: (S.simFs - a.since) * P.RATE_BOOST * 1e-6, dm: 0, axis: v3.norm(Fv), quenched: true };
    a.waitFs = 0;
    return;
  }
  if (F > P.STARK_FC) return;
  a.alone += dt;
  if (a.alone > 4 && !a.aloneSaid) {
    a.aloneSaid = true;
    say('This atom is resting in 2s, a round shape that can\'t give off a single photon by itself. Left alone it would wait about a tenth of a second, which for an atom is an age: 76 million times longer than 2p. An electric field can let it go. Fire an electron past it.');
  }
}

// ---------------------------------------------------------------------------
// Two atoms sharing one excitation
// An atom in 2p, 3p or 4p with a resting 1s neighbour inside its near field (λ/2π) doesn't just
// sit there until it radiates. The two atoms' electric fields couple them, so the excitation
// swings from one to the other and back, smoothly, for as long as nothing disturbs it. What
// swings is the chance of finding the excitation on each atom, drawn as how much of the p shape
// each cloud has. Meanwhile the pair's light leaves faster when the two atoms' waves are in step
// and far slower when they are out of step, so what is left after a while is the out-of-step
// share: a steady shape, half on each atom, that can hardly radiate. It lasts until its photon
// finally gets out, or until a passing charge's electric field shifts one atom's level against
// the other's (the Stark shift), which upsets the sharing and lets the light out. The maths is in
// physics.js (pairCoupling, pairStep); nothing here is capped or scripted.
// Simplified: only the nearest neighbour is coupled, the p orbital keeps its direction, and the
// field shift uses the field along the orbital's own axis.
// ---------------------------------------------------------------------------
const GROUND = { n: 1, l: 0, m: 0 };
function tryPair(a) {
  const n = a.st.n, lam = P.lambdaFor(1, n), nearR = lam / (2 * Math.PI);
  const b = S.atoms.filter(o => o !== a && idle1s(o)).map(o => ({ o, r: v3.len(v3.sub(o.p.pos, a.p.pos)) }))
    .filter(x => x.r < nearR).sort((x, y) => x.r - y.r)[0];
  if (!b) return false;
  const dk = P.DECAY[`${n},1`], G = P.RATE_BOOST * 1e-6 / dk.tau;   // decays per fs on the game's clock
  const q = { a, b: b.o, up: { ...a.st }, lam, nearR, G, Gr: G * dk.br.find(x => x[0] === 1)[2], c: [1, 0, 0, 0], u: Math.random(),
    age: 0, tFs: 0, wa: 1, slow: 1, reex: !!a.reex, col: photonColor(lam), since: a.since || S.simFs };
  a.pending = null; a.pair = q; b.o.pair = q;
  a.st = GROUND; a.mix = { st: q.up, w: 1 }; b.o.mix = { st: q.up, w: 0 };
  S.pairs.push(q); S.paired++;
  // Slow everything at once (as for a light wave), so the first swing isn't over before it shows.
  pairSlow(q, pairParams(q), P.pairStep(q.c, 0, pairParams(q)));
  S.slow = Math.min(S.slow, q.slow); q.fresh = true;
  if (S.paired <= 2) log(`A ${P.stateName(q.up)} atom and a 1s neighbour ${b.r.toFixed(1)} nm away are sharing the excitation: inside ${nearR.toFixed(0)} nm their electric fields couple them.`);
  return true;
}
function pairParams(q) {
  const d = v3.sub(q.b.p.pos, q.a.p.pos), r = v3.len(d);
  const cy = r > 1e-9 ? d[1] / r : 0, p = q.up.m === 0 ? cy * cy : (1 - cy * cy) / 2;
  const k = P.pairCoupling(2 * Math.PI * Math.max(r, PAIR_MIN_R) / q.lam, p);
  const along = F => (q.up.m === 0 ? Math.abs(F[1]) : Math.hypot(F[0], F[2]) / Math.SQRT2);
  const dE = P.starkShift(q.up.n) * (along(P.fieldAt(q.a.p.pos, S.ps)) - along(P.fieldAt(q.b.p.pos, S.ps)));   // eV
  return { r, G: q.G, Gr: q.Gr, J: k.J * q.Gr, F: k.F, D: dE / P.HBAR_NS * P.RATE_BOOST * 1e-6 };
}
// How much swinging there is to see: its size (less when a field has shifted the two levels
// apart) times how much of the in-step share is still there. While it shows, the clock slows.
function pairSlow(q, k, om) {
  const amp = 4 * k.J * k.J / (k.D * k.D + 4 * k.J * k.J + 1e-30), left = 1 / Math.cosh(Math.min(50, 2 * Math.abs(om.wi) * q.tFs));
  if (!q.shown && amp > 0.3) { q.shown = true; S.pairShown = (S.pairShown || 0) + 1; }
  const x = Math.max(0, Math.min(1, (amp * left - 0.05) / 0.25));
  const ease = Math.exp(Math.max(0, q.age - PAIR_HOLD[S.pairShown <= 2 ? 0 : 1]) / PAIR_EASE);
  const want = Math.min(1, 2 * Math.PI / PAIR_SWING * ease / (2 * Math.abs(om.wr) * FS_PER_S * SPEEDS[S.speed] + 1e-30));
  q.slow = 1 + (want - 1) * x * x * (3 - 2 * x);
  q.amp = amp; q.left = left;
}
function updatePairs(dt, dtFs) {
  for (const q of [...S.pairs]) {
    if (q.fresh) { q.fresh = false; continue; }
    const k = pairParams(q);
    if (k.r > 1.5 * q.nearR) { endPair(q, 'apart'); continue; }
    // Several small exact steps per frame: their average is what is drawn, and the photon leaves
    // the moment the chance that it is still here (|c|²) drops below the pair's random draw.
    const N = 8;
    let wa = 0, m = 0, om = null, out = false;
    for (let i = 0; i < N && !out; i++) {
      om = P.pairStep(q.c, dtFs / N, k);
      const nA = q.c[0] ** 2 + q.c[1] ** 2, n2 = nA + q.c[2] ** 2 + q.c[3] ** 2;
      wa += nA / n2; m++;
      out = n2 <= q.u;
    }
    if (out) {
      const [ar, ai, br, bi] = q.c, n2 = ar * ar + ai * ai + br * br + bi * bi;
      const other = (k.G - k.Gr) * n2, light = Math.max(0, k.Gr * (n2 + 2 * k.F * (ar * br + ai * bi)));
      endPair(q, Math.random() * (other + light) < other ? 'other' : 'light');
      continue;
    }
    q.tFs += dtFs; q.age += dt;
    q.wa += (wa / m - q.wa) * (1 - Math.exp(-dt / PAIR_BLUR));
    q.a.mix.w = q.wa; q.b.mix.w = 1 - q.wa;
    pairSlow(q, k, om);
    const { amp, left } = q;
    if (!S.pairSaid && amp > 0.3 && q.age > 0.5) {
      S.pairSaid = true;
      say(`Watch those two atoms. They are closer together than the light's wavelength, so their electric fields couple them and they share the excitation: one cloud takes on the ${P.stateName(q.up)} shape as the other gives it up, back and forth. No light has left. Everything is slowed so you can see the swings; they really take about a billionth of a second or less.`);
    }
    if (S.pairSaid && !S.darkSaid && amp > 0.3 && left < 0.1) {
      S.darkSaid = true;
      say('The swinging has settled. Each atom now holds half of the excitation, and the light waves the two would send out cancel each other, so almost none gets out. This shared shape lasts until the photon finally escapes or a passing charge disturbs it.');
    }
    if (!q.hinted && q.age > 25 && S.beat === 3 && acidLeft() === 0) {
      q.hinted = true;
      say('Two atoms are still sharing one excitation in a shape that can hardly radiate. Fire an electron past them: its electric field shifts one atom\'s level against the other\'s and lets the light out.');
    }
  }
}
// The sharing ends. 'light': the pair's photon leaves and both atoms are in 1s. 'other': the
// excitation steps down another way (3p or 4p to a lower level that isn't 1s). 'apart': the atoms
// drifted out of each other's near field. The excitation is found on one atom, by its share.
function endPair(q, how) {
  S.pairs = S.pairs.filter(x => x !== q);
  const nA = q.c[0] ** 2 + q.c[1] ** 2, nB = q.c[2] ** 2 + q.c[3] ** 2;
  const x = Math.random() * (nA + nB) < nA ? q.a : q.b, y = x === q.a ? q.b : q.a;
  const realNs = (S.simFs - q.since) * P.RATE_BOOST * 1e-6;
  q.a.pair = q.b.pair = null;
  q.a.mix.fade = q.b.mix.fade = true;
  y.reex = false;
  if (how === 'light') {
    const dir = emitPhoton(x.p.pos, q.lam, q.up.m === 0 ? 'lin' : 'circ', [0, 1, 0], x, q.reex && !watched(x) ? LIGHT_QUICK : LIGHT_SHOW);
    x.p.vel = v3.sub(x.p.vel, v3.scale(dir, (P.HC / q.lam) / P.C / P.MP));
    x.steps.push({ lam: [q.lam], to: GROUND, delayNs: realNs, reemit: q.reex });
    S.lastPhoton = { lam: q.lam, nLow: 1, extra: 0 };
    if (!q.reex || S.paired <= 3) log(`The pair let its photon go after ${realNs.toFixed(1)} ns: ${q.lam.toFixed(1)} nm ${describe(q.lam, 1)}`);
    x.reex = false;
    return;
  }
  x.st = q.up; x.reex = q.reex; x.since = q.since;
  x.mix = { st: GROUND, w: 1 - (x === q.a ? q.wa : 1 - q.wa), fade: true };
  if (how === 'apart') { scheduleDecay(x); return; }
  let d; do d = P.pickDecay(q.up); while (d.to.n === 1);
  d.delayNs = realNs;
  x.pending = d; x.waitFs = 0; x.hold = 0;
}
// "far ultraviolet (Lyman-α, Lyman series)": what kind of radiation a photon is.
function describe(lam, nLow, capture, cap = false) {
  const c = P.classify(lam), line = P.lineName(lam);
  const series = nLow ? (capture ? `${P.seriesName(nLow)} continuum` : `${P.seriesName(nLow)} series`) : '';
  const tag = [line, series].filter(Boolean).join(', ');
  const name = cap ? c.name[0].toUpperCase() + c.name.slice(1) : c.name;
  return `${name}${tag ? ` (${tag})` : ''}`;
}
function updateAtoms(dt, dtFs) {
  for (const a of S.atoms) {
    a.fade = Math.min(1, a.fade + dt / FALL_DUR);
    a.p.glow = Math.max(0, a.p.glow - dt / FALL_DUR);   // the electron's field cancels the proton's outside the atom
    a.beat += dt * 2 * Math.PI * 2.5;
    if (a.trans) {
      a.trans.t += dt;
      if (a.trans.t >= a.trans.dur) { a.st = a.trans.to; a.trans = null; if (a.st.n === 1) a.reex = false; scheduleDecay(a); }
      continue;
    }
    if (a.mix && a.mix.fade) { a.mix.w *= Math.exp(-dt * 4); if (a.mix.w < 0.01) a.mix = null; }
    if (a.pair || !a.pending) continue;
    if (a.st.l === 1 && a.st.n > 1 && a.fade >= 1 && tryPair(a)) continue;
    if (a.pending.twoPhoton) quench2s(a, dt, dtFs);
    a.waitFs -= dtFs; a.hold -= dt;
    if (a.waitFs > 0 || a.hold > 0) continue;
    const d = a.pending; a.pending = null;
    for (const lam of d.photons) {
      const dir = emitPhoton(a.p.pos, lam, d.twoPhoton ? 'iso' : d.dm === 0 ? 'lin' : 'circ', d.axis || [0, 1, 0], a, a.reex && !watched(a) ? LIGHT_QUICK : LIGHT_SHOW);
      // Each photon carries momentum hν/c, so the atom recoils (about 3 m/s for Lyman-α).
      a.p.vel = v3.sub(a.p.vel, v3.scale(dir, (P.HC / lam) / P.C / P.MP));
    }
    a.steps.push({ lam: d.photons, to: d.to, delayNs: d.delayNs, twoPhoton: d.twoPhoton, reemit: !!a.reex });
    const names = d.photons.map(l => `${l.toFixed(1)} nm ${d.twoPhoton ? P.classify(l).name : describe(l, d.to.n)}`).join(' + ');
    S.lastPhoton = { lam: d.photons[0], nLow: d.twoPhoton ? 0 : d.to.n, extra: d.photons.length - 1 };
    const when = d.twoPhoton ? `${(d.delayNs / 1e9).toFixed(2)} s` : `${d.delayNs.toFixed(1)} ns`;
    if (!a.reex || S.absorbed <= 3) log(`${P.stateName(a.st)} → ${P.stateName(d.to)} after ${when}${d.quenched ? ', let go by a nearby charge\'s electric field' : ''}: ${names}`, d.photons.some(l => P.lineName(l) === 'H-α') ? 'red' : '');
    a.trans = { from: a.st, to: d.to, t: 0, dur: a.reex ? REEMIT_MORPH : STEP_MORPH };
  }
  if (S.cascade) {
    const a = S.cascade.atom;
    if (!a.trans && !a.pending && !a.pair && a.st.n === 1 && a.fade >= 1) {
      S.cascade = null; S.autoCam = null;
      const red = a.steps.some(s => [].concat(s.lam).some(l => P.lineName(l) === 'H-α'));
      say(`You just made a hydrogen atom. The electron dropped down an energy staircase and every step came out as light${red ? ', including the red H-alpha line that makes hydrogen nebulae glow' : ''}. It stops at the bottom step, called 1s. It can't fall any further and never lands on the proton: 1s is the lowest energy an electron can have here.`);
      if (S.beat === 2 && !S.b2.nextAt) S.b2.nextAt = S.time + 7;   // time to read, then Acid Neutrality
    }
  }
  if (S.beat === 3 && !S.b3.doneAt && acidLeft() === 0 && S.atoms.every(a => !a.pending && !a.trans && !a.pair && a.fade >= 1)) {
    S.b3.doneAt = S.time;
    say(`The acid is neutral: every proton holds an electron. The energy each catch released left the system as light, ${S.lightOut} photons in all. That escaping light is why hydrogen out in space can stay neutral.`);
    setTimeout(showDone, 3000);
  }
}
const fmtC = K => `${Math.round((K - 273) / (K > 2000 ? 100 : 10)) * (K > 2000 ? 100 : 10)} °C`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function showDone() {
  const photons = [...S.oldSteps, ...S.atoms.flatMap(a => a.steps)].filter(s => !s.reemit).flatMap(s => [].concat(s.lam));
  const count = new Map();
  const cls = new Map();
  for (const l of photons) { const c = P.classify(l); cls.set(c.name, c); count.set(c.name, (count.get(c.name) || 0) + 1); }
  $('doneTitle').textContent = 'You neutralized the acid';
  $('doneText').textContent = `It took ${S.shots} shot${S.shots === 1 ? '' : 's'} to make ${S.atoms.length} hydrogen atoms. On the way down they gave off ${photons.length} photons: ${[...count].map(([name, k]) => `${k} ${name}`).join(', ')}. ${S.lightOut} photons left the system, carrying away ${S.lightOutE.toFixed(0)} eV.`;
  const kinds = [...cls.values()].map(c => `${c.name[0].toUpperCase()}${c.name.slice(1)}: ${c.note === 'visible' ? 'light you can see' : c.note}`);
  const extra = [S.absorbed ? ` Atoms took Lyman light from their neighbours and gave it back ${S.absorbed} time${S.absorbed === 1 ? '' : 's'}.` : '',
    S.ionized ? ` Light and fast electrons knocked atoms apart ${S.ionized} time${S.ionized === 1 ? '' : 's'}.` : ''].join('');
  $('doneKinds').textContent = kinds.join('. ') + '.' + extra;
  $('doneBox').hidden = false;
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------
function onPass(ev) {
  const { e, p, rp } = ev;
  if (p.q !== 1) return;
  e.passes++;
  const E = Math.max(ev.E, 0.01);
  const chance = P.captureChanceGame(E, rp), real = P.captureChanceReal(E, rp);
  const caught = Math.random() < chance;
  const who = e.freed ? 'freed electron' : `shot ${e.shot}`;
  S.passes.unshift({ who, pass: e.passes, rp, E, chance, real, caught });
  S.passes.length = Math.min(S.passes.length, 4);
  renderPasses();
  if (caught) { capture(e, p, E); return; }
  if (E > 3 && rp < 1.5 && !S.b2.tooFastSaid) { S.b2.tooFastSaid = true; say('Too fast to catch. Try slower and closer.'); }
}
function renderPasses() {
  $('passes').innerHTML = S.passes.length ? S.passes.map(p =>
    `<div class="${p.caught ? 'hit' : p.E > 3 ? 'fast' : 'miss'}">${p.who}${p.pass > 1 ? ` (pass ${p.pass})` : ''}: ${fmtNm(p.rp)} at ${p.E.toFixed(2)} eV · ${fmtChance(p.chance)} · ${p.caught ? 'CAUGHT' : 'missed'} <span class="fine">(real ${fmtOdds(p.real)})</span></div>`).join('')
    : '<div class="miss">No passes yet.</div>';
}

// How slow the clock should run: slower while an electron is close to a proton and moving fast.
function slowTarget() {
  let k = 1;
  for (const e of freeElectrons()) for (const p of bareProtons()) {
    const d = v3.len(v3.sub(e.pos, p.pos));
    if (d > SLOW_NEAR) continue;
    const screen = v3.len(v3.sub(e.vel, p.vel)) * FS_PER_S * SPEEDS[S.speed];   // nm per screen second
    const want = Math.max(SLOW_MIN, Math.min(1, SLOW_TARGET / Math.max(screen, 1e-9)));
    const x = Math.min(1, (SLOW_NEAR - d) / 1.5);   // fades in over the outer 1.5 nm
    k = Math.min(k, 1 + (want - 1) * x * x * (3 - 2 * x));
  }
  for (const L of S.light) k = Math.min(k, L.slow);                // a light wave is out
  if (S.falling.length) k = Math.min(k, EVENT_SLOW);               // an electron is settling in
  for (const a of S.atoms) {
    if (a.trans) k = Math.min(k, EVENT_SLOW);                      // an atom is changing shape
  }
  for (const q of S.pairs) k = Math.min(k, q.slow);                // two atoms are swinging an excitation
  return k;
}
function step(dtReal) {
  const dt = dtReal * SPEEDS[S.speed];
  S.time += dt;
  S.cooldown = Math.max(0, S.cooldown - dtReal);
  // Ease into slow motion quickly and back out gently, so a fly-by reads as one smooth swoop.
  const want = slowTarget(), rate = want < S.slow ? 10 : 1.5;
  S.slow += (want - S.slow) * (1 - Math.exp(-dtReal * rate));
  const dtFs = dt * FS_PER_S * S.slow;
  S.simFs += dtFs;
  const res = P.stepCharges(S.ps, dtFs, S.enc);
  for (const ev of res.events) onPass(ev);
  for (const e of freeElectrons()) {
    e.trailT -= dt;
    if (e.trailT <= 0) { e.trailT = 0.04 * Math.max(S.slow, 0.15); e.trail.push([...e.pos]); if (e.trail.length > 90) e.trail.shift(); }
  }
  S.ps = S.ps.filter(x => x.active);
  for (const f of S.falling) f.t += dt;
  S.falling = S.falling.filter(f => f.t < FALL_DUR);
  updateAtoms(dt, dtFs);
  updatePairs(dt, dtFs);
  // Light: c × the real time that passed. Rare events: the same real time, sped up by RATE_BOOST.
  updateLight(P.C * dt * FS_PER_S * S.slow);
  collisions(dt * FS_PER_S * S.slow * P.RATE_BOOST * 1e-6);
  if (S.beat === 2 && S.b2.nextAt && S.time >= S.b2.nextAt) startBeat(3);
  for (const f of S.flashes) f.t += dt;
  S.flashes = S.flashes.filter(f => f.t < f.life);

  // Beat 1 goals
  if (S.beat === 1) {
    const p = S.ps[0];
    const d = v3.norm(v3.sub(camBasis().p, p.pos));
    if (!S.b1.start) S.b1.start = d;
    S.b1.maxAngle = Math.max(S.b1.maxAngle, Math.acos(Math.max(-1, Math.min(1, v3.dot(d, S.b1.start)))));
    if (S.b1.moved && S.b1.maxAngle > 1.3 && S.b1.toggled) {
      log('Nicely done: you have seen the field from two sides. Your electron gun is ready.');
      startBeat(2);
    }
  }
}

// ---------------------------------------------------------------------------
// Log (shown in the pass panel area as one-liners)
// ---------------------------------------------------------------------------
const logLines = [];
function log(msg, cls = '') {
  logLines.unshift({ msg, cls });
  logLines.length = Math.min(logLines.length, 4);
  $('logBox').innerHTML = logLines.map(l => `<div class="${l.cls === 'red' ? 'fast' : l.cls}">${l.msg}</div>`).join('');
}

// ---------------------------------------------------------------------------
// Input: first-person flight
// ---------------------------------------------------------------------------
const canvas = $('gl');
const keys = new Set();
let dragging = null;
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('button') && (e.code === 'Space' || e.code === 'Enter')) return;
  keys.add(e.code);
  if (e.code === 'Space') { e.preventDefault(); fire(); }
  if (e.code === 'KeyV') toggleField();
  if (e.code === 'BracketLeft') setDial(S.dial - 1);
  if (e.code === 'BracketRight') setDial(S.dial + 1);
  if (e.code === 'Comma') setSpeed(S.speed - 1);
  if (e.code === 'Period') setSpeed(S.speed + 1);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const look = (dx, dy) => {
  cam.yaw -= dx * 0.0025;
  cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - dy * 0.0025));
  if (S.autoCam) S.autoCam = null;
};
// Drag to look; a click that doesn't drag fires. Double-click for mouse look (below).
canvas.addEventListener('pointerdown', e => {
  if (!$('startBox').hidden || !$('doneBox').hidden) return;
  if (!locked()) try { canvas.setPointerCapture(e.pointerId); } catch { /* already released */ }
  dragging = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId, t: performance.now() };
});
canvas.addEventListener('pointermove', e => {
  if (!dragging || e.pointerId !== dragging.id) return;
  const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
  dragging.x = e.clientX; dragging.y = e.clientY; dragging.moved += Math.abs(dx) + Math.abs(dy);
  const lim = v => Math.max(-80, Math.min(80, v));
  look(lim(dx) * 1.6, lim(dy) * 1.6);
});
const endDrag = e => {
  if (!dragging || e.pointerId !== dragging.id) return;
  const click = dragging.moved < 6 && performance.now() - dragging.t < 400;
  dragging = null;
  if (click && e.type === 'pointerup' && e.pointerType === 'mouse') fire();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
// Double-click locks the mouse to the view (as in most PC shooters); double-click again or Esc frees it.
// Guards against drift: raw movement where the browser offers it, the first reading after locking
// skipped, and the rare huge jump some browsers report ignored.
const locked = () => document.pointerLockElement === canvas;
let lockFresh = false;
canvas.addEventListener('dblclick', e => {
  if (!$('startBox').hidden || !$('doneBox').hidden || xr.session) return;
  if (locked()) { document.exitPointerLock(); return; }
  try { canvas.requestPointerLock(); } catch { /* not allowed here */ }
});
document.addEventListener('pointerlockchange', () => {
  lockFresh = locked();
  dragging = null;
  document.body.classList.toggle('mouselook', locked());
});
// Some setups report a small, steady movement while the mouse sits still (it showed up as the view
// sinking). A hand never repeats exactly the same tiny step many times in a row, so a run of
// identical small readings is treated as noise and dropped.
let lastMove = '', sameRun = 0;
document.addEventListener('mousemove', e => {
  if (!locked()) return;
  if (lockFresh) { lockFresh = false; return; }
  const dx = e.movementX || 0, dy = e.movementY || 0;
  if (Math.abs(dx) > 250 || Math.abs(dy) > 250) return;
  const key = `${dx},${dy}`;
  sameRun = key === lastMove ? sameRun + 1 : 0; lastMove = key;
  if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2 && sameRun >= 2) return;
  look(dx * 1.6, dy * 1.6);
});
canvas.addEventListener('lostpointercapture', endDrag);
canvas.addEventListener('wheel', e => { e.preventDefault(); setDial(S.dial + (e.deltaY > 0 ? -1 : 1)); }, { passive: false });
const hold = (btn, code) => {
  btn.addEventListener('pointerdown', () => keys.add(code));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => keys.delete(code));
};
hold($('fwdBtn'), 'KeyW'); hold($('backBtn'), 'KeyS'); hold($('brakeBtn'), 'KeyX');
// The touch flight pad: each button is held like its key.
for (const b of document.querySelectorAll('#dpad button')) {
  const code = b.dataset.key;
  b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic or already released */ } keys.add(code); b.classList.add('held'); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { keys.delete(code); b.classList.remove('held'); });
  b.addEventListener('contextmenu', e => e.preventDefault());
}
function setSpeed(i) {
  S.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
  $('speedBtn').textContent = `game speed ×${SPEEDS[S.speed]}`;
}
$('speedBtn').addEventListener('click', () => setSpeed(S.speed === SPEEDS.length - 1 ? 0 : S.speed + 1));

function fly(dt) {
  const B = flatBasis(), acc = keys.has('ShiftLeft') || keys.has('ShiftRight') ? THRUST_FAST : THRUST;
  let m = [0, 0, 0];
  if (keys.has('KeyW') || keys.has('ArrowUp')) m = v3.add(m, B.f);
  if (keys.has('KeyS') || keys.has('ArrowDown')) m = v3.sub(m, B.f);
  if (keys.has('KeyD') || keys.has('ArrowRight')) m = v3.add(m, B.r);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) m = v3.sub(m, B.r);
  if (keys.has('KeyR')) m = v3.add(m, [0, 1, 0]);
  if (keys.has('KeyF')) m = v3.sub(m, [0, 1, 0]);
  if (v3.len(m) > 0) {
    cam.v = v3.add(cam.v, v3.scale(v3.norm(m), acc * dt));
    S.b1.moved = true; S.autoCam = null;
  }
  if (keys.has('KeyX')) brake(dt);
  coast(dt, 1);
  // On a capture, glide in to watch the cascade (any flying or looking hands control back).
  if (S.autoCam && !xr.session) {
    const c = S.autoCam.atom.p.pos, off = v3.sub(cam.p, c), d = v3.len(off);
    const want = 6, k = 1 - Math.exp(-dt * 1.8);
    if (d > want) cam.p = v3.add(c, v3.scale(off, (d + (want - d) * k) / d));
    cam.v = v3.scale(cam.v, 1 - k);    // the glide-in takes over and gently stops the ship
    const f = v3.norm(v3.sub(c, cam.p));
    const yaw = Math.atan2(f[0], f[2]), pitch = Math.asin(f[1]);
    let dy = yaw - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.yaw += dy * k; cam.pitch += (pitch - cam.pitch) * k;
  }
}

function brake(dt) {
  const v = v3.len(cam.v), dv = BRAKE * dt;
  cam.v = v <= dv ? [0, 0, 0] : v3.scale(cam.v, (v - dv) / v);
}
// Newton's first law: the ship keeps its velocity. The wall of the system bounces it back softly.
function coast(dt, margin) {
  cam.p = v3.add(cam.p, v3.scale(cam.v, dt));
  const r = v3.len(cam.p), lim = P.SPHERE_R - margin;
  if (r > lim) {
    const n = v3.scale(cam.p, 1 / r), vr = v3.dot(cam.v, n);
    cam.p = v3.scale(n, lim);
    if (vr > 0) {
      cam.v = v3.sub(cam.v, v3.scale(n, 1.5 * vr));   // keeps half the outward speed, reversed
      if (vr > 2) S.flashes.push({ pos: v3.add(cam.p, v3.scale(n, margin)), col: [0.1, 0.9, 0.95], t: 0, life: 0.5, size: 1.2 });
    }
  }
}

// Field view (lines, the default) or Glow view (calmer: no lines).
function toggleField() {
  S.fieldView = !S.fieldView;
  $('fieldBtn').setAttribute('aria-pressed', String(!S.fieldView));
  if (!S.fieldView) S.b1.glowTried = true;
  if (S.fieldView && S.b1.glowTried) S.b1.toggled = true;
  panelDirty();
}
function setDial(i) {
  S.dial = Math.max(0, Math.min(DIAL.length - 1, i));
  const E = DIAL[S.dial];
  $('dialOut').textContent = `${E} eV`;
  $('speedOut').textContent = `${Math.round(P.electronSpeed(E) * 1e3).toLocaleString('en-US')} km/s · ${E <= 0.2 ? 'slow' : E < 2 ? 'medium' : 'fast'}`;
}
$('fieldBtn').addEventListener('click', toggleField);
$('dialDown').addEventListener('click', () => setDial(S.dial - 1));
$('dialUp').addEventListener('click', () => setDial(S.dial + 1));
$('fireBtn').addEventListener('click', fire);
$('skipBtn').addEventListener('click', () => startBeat(Math.min(3, S.beat + 1)));
$('restartBtn').addEventListener('click', restart);
$('againBtn').addEventListener('click', () => { $('doneBox').hidden = true; restart(); });
$('keepBtn').addEventListener('click', () => { $('doneBox').hidden = true; });
$('startBtn').addEventListener('click', () => { $('startBox').hidden = true; });
$('startCalmBtn').addEventListener('click', () => { $('startBox').hidden = true; if (S.fieldView) toggleField(); });

function restart() {
  S = newState();
  cam.p = [0, 1.5, 24]; cam.v = [0, 0, 0]; cam.yaw = Math.PI; cam.pitch = -0.06;
  logLines.length = 0; $('logBox').innerHTML = '';
  renderPasses(); setDial(1); setSpeed(S.speed); startBeat(1);
  $('fieldBtn').setAttribute('aria-pressed', 'false');
  panelDirty();
}

// ---------------------------------------------------------------------------
// HUD instruments
// ---------------------------------------------------------------------------
const spec = $('spectro'), sctx = spec.getContext('2d');
const LMIN = 60, LMAX = 2500;
const lx = (lam, W) => (Math.log(lam / LMIN) / Math.log(LMAX / LMIN)) * W;
function drawSpectro() {
  const W = spec.width, H = spec.height;
  sctx.clearRect(0, 0, W, H);
  // bands: UV, visible (as a rainbow strip), IR
  const x380 = lx(380, W), x750 = lx(750, W);
  sctx.fillStyle = 'rgba(158,115,255,0.08)'; sctx.fillRect(0, 0, x380, H);
  sctx.fillStyle = 'rgba(255,77,51,0.06)'; sctx.fillRect(x750, 0, W - x750, H);
  for (let x = x380; x < x750; x += 2) {
    const lam = LMIN * Math.pow(LMAX / LMIN, x / W), [r, g, b] = P.lambdaRGB(lam);
    sctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},0.16)`; sctx.fillRect(x, H - 14, 2, 14);
  }
  sctx.font = '20px ui-monospace, monospace';
  // Radiation zones along the top: extreme UV, far UV, near UV, visible, near IR, short-wave IR.
  const zones = [[LMIN, 'EUV'], [100, 'far UV'], [200, 'near UV'], [380, 'visible'], [750, 'near IR'], [1400, 'SWIR']];
  for (const [l0, name] of zones) {
    const x = l0 === LMIN ? 0 : lx(l0, W);
    sctx.fillStyle = 'rgba(214,226,238,.18)'; if (x > 0) sctx.fillRect(x, 0, 1, 30);
    sctx.fillStyle = 'rgba(214,226,238,.5)'; sctx.fillText(name, x + 8, 22);
  }
  sctx.fillStyle = 'rgba(214,226,238,.5)';
  for (const t of [100, 200, 500, 1000, 2000]) { const x = lx(t, W); sctx.fillRect(x, H - 20, 2, 6); sctx.fillText(`${t}`, x + 4, H - 22); }
  // Lyman limit (91.2 nm): shorter than this means a capture straight to 1s.
  const xl = lx(91.18, W); sctx.fillStyle = 'rgba(214,226,238,.25)'; sctx.fillRect(xl, 30, 1, H - 50);
  const seen = new Map();
  for (const s of S.spectrum) {
    const x = Math.round(lx(Math.min(LMAX, s.lam), W)), [r, g, b] = photonColor(s.lam);
    const age = S.time - s.t, k = age < 0.6 ? 1.6 - age : 1;
    sctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${Math.min(1, 0.85 * k)})`;
    sctx.fillRect(x - 2, 30, 4, H - 50);
    const name = P.lineName(s.lam);
    if (name && !seen.has(name)) { seen.set(name, 1); sctx.fillStyle = 'rgba(255,255,255,.85)'; sctx.fillText(name, x + 6, 52 + 22 * (seen.size % 2 === 0)); }
  }
}
const lad = $('ladder'), lctx = lad.getContext('2d');
function drawLadder() {
  const W = lad.width, H = lad.height, top = 46, bot = H - 20;
  lctx.clearRect(0, 0, W, H);
  // √ scale on energy so the upper levels don't crowd together
  const y = E => top + (bot - top) * Math.sqrt(-E / P.RY);
  lctx.font = '20px ui-monospace, monospace';
  lctx.fillStyle = 'rgba(90,140,255,.12)'; lctx.fillRect(0, 0, W, top - 6);
  lctx.fillStyle = 'rgba(214,226,238,.55)'; lctx.fillText('free (E > 0)', 10, 26);
  const a = S.cascade ? S.cascade.atom : S.atoms[S.atoms.length - 1], cur = a ? (a.trans ? a.trans.to : a.st) : null;
  for (let n = 1; n <= 4; n++) {
    const yy = y(P.levelE(n)), lit = cur && cur.n === n;
    lctx.fillStyle = lit ? '#ffe94d' : 'rgba(214,226,238,.35)';
    lctx.fillRect(70, yy - (lit ? 2 : 1), W - 84, lit ? 4 : 2);
    lctx.fillText(`n=${n}`, 8, yy + 7);
    if (lit) lctx.fillText(P.stateName(cur), 74, yy - 8);
  }
  if (!a) {
    const E = DIAL[S.dial], yy = top - 10 - Math.min(26, 26 * Math.log10(1 + E * 10) / 2.3);
    lctx.fillStyle = '#5a8cff'; lctx.beginPath(); lctx.arc(W / 2, yy, 6, 0, Math.PI * 2); lctx.fill();
  }
  lctx.fillStyle = 'rgba(214,226,238,.45)'; lctx.textAlign = 'right'; lctx.fillText('−13.6 eV', W - 14, bot - 8); lctx.textAlign = 'left';
}

function updateHud() {
  const nHp = bareProtons().length, nH = S.atoms.length, nE = freeElectrons().length;
  $('cHp').textContent = nHp; $('cH').textContent = nH; $('cE').textContent = nE;
  if (S.beat >= 2 && S.time - (S.gaugeAt || -9) > 0.5) {
    S.gaugeAt = S.time;
    const fe = freeElectrons();
    const avg = fe.length ? fe.reduce((t, e) => t + 0.5 * P.ME * v3.dot(e.vel, e.vel), 0) / fe.length : 0;
    $('heat').innerHTML = `${fe.length ? `Free electrons: ${avg.toFixed(2)} eV each (${fmtC(P.kelvin(2 * avg / 3))})` : 'No free electrons'}<br>`
      + `Light out through the edge: <b>${S.lightOut}</b> photon${S.lightOut === 1 ? '' : 's'}, ${S.lightOutE.toFixed(0)} eV`;
  }
  const sp = SPEEDS[S.speed], fs = FS_PER_S * sp * S.slow;
  const tf = fs >= 10 ? `${Math.round(fs)} fs` : fs >= 1 ? `${fs.toFixed(1)} fs` : `${Math.round(fs * 1000)} as`;   // as = attoseconds
  $('timeOut').textContent = `1 s = ${tf}${S.light.length ? ' · light out, slowed' : S.pairs.some(q => q.slow < 0.9) ? ' · atoms sharing, slowed' : S.slow < 0.9 ? ' · slow motion' : ''}`;
  const v = v3.len(cam.v);
  $('shipOut').textContent = v < 0.05 ? 'still' : `${v.toFixed(1)} nm/s`;
  if (S.lastPhoton) {
    const L = S.lastPhoton, c = P.classify(L.lam);
    $('photonOut').textContent = `Last photon: ${L.lam.toFixed(1)} nm · ${describe(L.lam, L.nLow, L.capture)} · ${c.visible ? 'visible: you could see this one' : c.note}${L.extra ? ` (+${L.extra} more)` : ''}`;
  } else $('photonOut').textContent = '';
  renderGoals();
  const a = aimInfo();
  const ch = $('crosshair');
  if (S.beat < 2) { $('aimOut').textContent = 'The gun unlocks once you have looked around the proton.'; ch.classList.remove('on'); return; }
  if (a.target && a.rp !== undefined) {
    ch.classList.toggle('on', a.chance > 0.05);
    $('aimOut').innerHTML = `Aimed: closest pass ≈ ${fmtNm(a.rp)} · chance ${fmtChance(a.chance)} <span class="fine">(real ${fmtOdds(a.real)})</span> · cone ±${fmtNm(a.cone)}`;
  } else {
    ch.classList.remove('on');
    $('aimOut').innerHTML = `Not aimed at a proton · cone ±${fmtNm(a.cone)}`;
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
const renderer = (() => { try { return createRenderer(canvas); } catch (err) { console.error(err); return null; } })();
if (!renderer) $('glFail').hidden = false;
const lines = new Lines();

function fieldAt(x, skip) {
  let E = [0, 0, 0];
  for (const p of S.ps) {
    if (!p.active || !p.q || p === skip) continue;
    const q = p.kind === 'proton' ? p.q * p.glow : p.q;
    const d = v3.sub(x, p.pos), r = v3.len(d) + 1e-4;
    E = v3.add(E, v3.scale(d, q / (r * r * r)));
  }
  return E;
}
const fib = n => Array.from({ length: n }, (_, i) => {
  const y = 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(1 - y * y), th = i * 2.399963;
  return [rr * Math.cos(th), y, rr * Math.sin(th)];
});
const SEEDS_P = fib(30), SEEDS_P_CROWD = fib(12), SEEDS_E = fib(10);
// Field lines fade with the field's real strength, which falls as 1/r². They are at full strength
// within FIELD_REACH nm, about the closest approach a capture needs (10% at 0.2 nm, 2.5% at 0.5 nm
// for a slow electron), so what you see is roughly the range where catching can happen.
const FIELD_REACH = 0.5, FIELD_ALPHA = 0.75;
const fieldAlpha = mag => Math.min(FIELD_ALPHA, FIELD_ALPHA * FIELD_REACH * FIELD_REACH * mag);
function fieldLines() {
  for (const p of S.ps) {
    if (!p.active || !p.q) continue;
    const pos = p.kind === 'proton', strength = pos ? p.glow : 1;
    if (strength < 0.05) continue;
    for (const s of pos ? (bareProtons().length > 2 ? SEEDS_P_CROWD : SEEDS_P) : SEEDS_E) {
      let x = v3.add(p.pos, v3.scale(s, 0.12)), prev = x;
      for (let i = 0; i < 140; i++) {
        let F = fieldAt(x);
        const mag = v3.len(F);
        if (mag < 1e-9) break;
        F = v3.scale(F, (pos ? 1 : -1) / mag);
        const r = v3.len(v3.sub(x, p.pos)), ds = 0.02 + 0.1 * r;
        x = v3.add(x, v3.scale(F, ds));
        if (v3.len(x) > P.SPHERE_R) break;
        const a = fieldAlpha(mag) * Math.min(1, 0.35 + r / 0.4);   // a little thinner right at the charge, where lines crowd
        if (a < 0.004) break;                                       // too weak to see: stop the line here
        lines.seg(prev, x, pos ? [1, 0.62, 0.18] : [0.3, 0.5, 1], a);
        prev = x;
        // stop at an opposite charge
        let hit = false;
        for (const o of S.ps) if (o.active && o.q && o !== p && Math.sign(o.q) !== Math.sign(p.q) && v3.len(v3.sub(x, o.pos)) < 0.1) hit = true;
        if (hit) break;
      }
    }
  }
}
// Magnetic field of a moving electron: circles around its path, B = v × E / c². At these speeds
// it is about v/c ≈ 1/1000 of the electric field, so it is drawn far brighter than its true share.
const B_BOOST = 400;
function magneticRings(e) {
  const v = v3.len(e.vel), beta = v / P.C;
  if (beta <= 0) return;
  const d = v3.scale(e.vel, 1 / v);
  const e1 = v3.norm(v3.cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(d, e1);
  // B = v × E / c² falls off as 1/r² like the electric field, so the rings fade the same way.
  for (const [R, off] of [[0.15, 0], [0.3, -0.25], [0.3, 0.25], [0.55, 0]]) {
    const a = Math.min(1, B_BOOST * beta) * fieldAlpha(1 / (R * R)) * 0.8;
    const c = v3.add(e.pos, v3.scale(d, off));
    let prev = null;
    for (let i = 0; i <= 24; i++) {
      const t = 2 * Math.PI * i / 24, pt = v3.add(c, v3.add(v3.scale(e1, Math.cos(t) * R), v3.scale(e2, Math.sin(t) * R)));
      if (prev) lines.seg(prev, pt, [0.36, 0.95, 0.6], a);
      prev = pt;
    }
  }
}
const drawnWavelength = lam => 0.25 + 1.2 * Math.log(lam / LMIN) / Math.log(LMAX / LMIN);
// Where a bit of wavefront that left the source along d is after travelling s nm (straight out:
// in this level light passes through the wall), or null once that bit is outside the system.
function wavePoint(c, d, s) {
  const p = v3.add(c, v3.scale(d, s));
  return v3.dot(p, p) > P.SPHERE_R ** 2 ? null : p;
}
// The light wave drawn as a grid on its wavefront, a few ripples deep. In Field view the grid lines
// that run pole to pole follow the electric field (photon colour) and the rings around the axis
// follow the magnetic field (green), at 90° to each other and to the direction of travel. Brightness
// follows the radiation pattern and thins out as the wave spreads (it is drawn far brighter than 1/r²).
const WAVE_MER = 10, WAVE_PAR = [0.2, 0.35, 0.5, 0.65, 0.8], WAVE_STEPS = 28;
function photonLines(ph) {
  const lw = 1.2 * drawnWavelength(ph.lam), s0 = ph.x;
  const a = ph.axis, e1 = v3.norm(v3.cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(a, e1);
  const dirOf = (th, ph2) => v3.add(v3.scale(a, Math.cos(th)), v3.add(v3.scale(e1, Math.sin(th) * Math.cos(ph2)), v3.scale(e2, Math.sin(th) * Math.sin(ph2))));
  // When the photon is taken (by an atom or the wall) the whole wave is gone at once.
  const base = Math.min(1, s0 / 2) * Math.min(1, 4 / Math.sqrt(1 + s0));
  const ripples = S.fieldView ? 3 : 1;
  for (let k = 0; k < ripples; k++) {
    const s = s0 - k * lw;
    if (s <= 0.05) continue;
    const kk = base * (k === 0 ? 1 : k === 1 ? 0.55 : 0.3) * (S.fieldView ? 1.4 : 0.6);
    // E lines: from pole to pole
    for (let m = 0; m < WAVE_MER; m++) {
      const phi = 2 * Math.PI * m / WAVE_MER;
      let prev = null, prevI = 0;
      for (let i = 0; i <= WAVE_STEPS; i++) {
        const th = 0.08 + (Math.PI - 0.16) * i / WAVE_STEPS, d = dirOf(th, phi), I = ph.I(Math.cos(th));
        const pt = wavePoint(ph.src, d, s);
        if (prev && pt) lines.seg(prev, pt, ph.col, kk * 0.5 * (I + prevI));
        prev = pt; prevI = I;
      }
    }
    if (!S.fieldView) continue;
    // B lines: rings around the axis
    for (const f of WAVE_PAR) {
      const th = Math.PI * f, I = ph.I(Math.cos(th));
      let prev = null;
      for (let i = 0; i <= 36; i++) {
        const pt = wavePoint(ph.src, dirOf(th, 2 * Math.PI * i / 36), s);
        if (prev && pt) lines.seg(prev, pt, [0.36, 0.95, 0.6], kk * 0.6 * I);
        prev = pt;
      }
    }
  }
}
function coneLines(a) {
  const ax = v3.norm(v3.sub(a.aimPoint, a.muzzle));
  const e1 = v3.norm(v3.cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(ax, e1);
  const col = a.chance > 0.05 ? [0.36, 0.95, 0.6] : [0.3, 0.5, 1];
  let prev = null;
  for (let i = 0; i <= 40; i++) {
    const t = 2 * Math.PI * i / 40, p = v3.add(a.aimPoint, v3.add(v3.scale(e1, Math.cos(t) * a.cone), v3.scale(e2, Math.sin(t) * a.cone)));
    if (prev) lines.seg(prev, p, col, 0.5);
    if (i % 10 === 0) lines.seg(v3.add(a.muzzle, v3.scale(ax, 1)), p, col, 0.12);
    prev = p;
  }
}

// The caught electron spirals in from where it was caught and melts into its cloud.
function fallPos(f, t = f.t) {
  const x = Math.min(1, t / FALL_DUR), s = x * x * (3 - 2 * x);
  const r0 = v3.len(f.off), r1 = P.A0 * f.atom.st.n * f.atom.st.n, r = r0 + (r1 - r0) * s;
  const ang = 3 * Math.PI * s, u = v3.norm(f.off), w = v3.cross(f.axis, u);
  const dir = v3.add(v3.scale(u, Math.cos(ang)), v3.scale(w, Math.sin(ang)));
  return v3.add(f.atom.p.pos, v3.scale(dir, r * (1 - 0.7 * s * s)));
}
function flatViews() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const B = flatBasis();
  const VP = M.multiply(M.perspective(cam.fov, w / h, 0.01, 500), M.viewFromBasis(B.p, B.r, B.u, B.f));
  return [{ viewport: [0, 0, w, h], camPos: B.p, VP, invVP: M.invert(VP) }];
}
function draw(views, panel) {
  if (!renderer) return;
  const charges = [];
  for (const p of S.ps) {
    if (!p.active) continue;
    if (p.kind === 'proton' && p.glow > 0.001) charges.push({ pos: p.pos, q: p.glow, smear: PROTON_SMEAR });
    if (p.kind === 'electron') charges.push({ pos: p.pos, q: -1, smear: Math.min(0.25, Math.max(0.05, P.reducedWavelength(Math.max(0.01, p.E || 1)))) });
  }
  const fallGlows = [];
  for (const f of S.falling) {
    const pos = fallPos(f), k = 1 - f.t / FALL_DUR;
    charges.push({ pos, q: -k, smear: 0.05 });
    fallGlows.push({ pos, size: 0.008 + 0.02 * k, col: [0.45 * k, 0.65 * k, k] });
  }
  const clouds = S.atoms.map(a => {
    const A = desc(a.st);
    if (a.trans) {
      const x = Math.min(1, a.trans.t / a.trans.dur), s = x * x * (3 - 2 * x), Bd = desc(a.trans.to);
      const pk = Math.max(A.peak, Bd.peak), cb = Math.sin(s * Math.PI / 2);
      return { pos: a.p.pos, radius: extentBohr(Math.max(a.st.n, a.trans.to.n), 1) * P.A0, A, B: Bd, cA: [Math.cos(s * Math.PI / 2), 0],
        cB: [cb * Math.cos(-a.beat), cb * Math.sin(-a.beat)], invMax: 1 / pk, iso: ((1 - s) * A.iso + s * Bd.iso) / pk, fade: a.fade };
    }
    if (a.mix) {
      // Sharing an excitation: part this shape, part that one, with no sloshing between them
      // (the two parts belong to different joint states of the pair, so their densities just add).
      const Bd = desc(a.mix.st), w = Math.max(0, Math.min(1, a.mix.w)), pk = Math.max(A.peak, Bd.peak), g = Math.min(1, w / 0.05);
      const rA = extentBohr(a.st.n, 1), rB = extentBohr(a.mix.st.n, 1);
      return { pos: a.p.pos, radius: (rB > rA ? rA + (rB - rA) * g : rA) * P.A0, A, B: Bd, cA: [Math.sqrt(1 - w), 0], cB: [Math.sqrt(w), 0], inc: 1,
        invMax: 1 / pk, iso: ((1 - w) * A.iso + w * Bd.iso) / pk, fade: a.fade };
    }
    return { pos: a.p.pos, radius: extentBohr(a.st.n, 1) * P.A0, A, B: A, cA: [1, 0], cB: [0, 0], invMax: 1 / A.peak, iso: A.iso / A.peak, fade: a.fade };
  }).map((c, i) => {
    // Soap-bubble wobble: a gentle shimmer at rest, stronger while settling in or changing shape.
    const a = S.atoms[i], tr = a.trans ? Math.sin(Math.PI * Math.min(1, a.trans.t / a.trans.dur)) : 0;
    c.wobble = 0.06 + 0.14 * (1 - a.fade) + 0.12 * tr;
    c.radius *= 1 + 2.5 * c.wobble;
    return c;
  });
  const glows = [];
  for (const p of S.ps) if (p.kind === 'proton' && p.active) glows.push({ pos: p.pos, size: 0.012, col: [1, 0.85, 0.6] });
  for (const e of freeElectrons()) glows.push({ pos: e.pos, size: 0.008, col: [0.45, 0.65, 1] });
  glows.push(...fallGlows);
  for (const f of S.flashes) {
    const x = f.t / f.life;
    glows.push({ pos: f.pos, size: f.size * (0.3 + Math.sqrt(x)) * 0.4, col: f.col.map(c => c * (1 - x) * 1.4) });
  }

  lines.begin();
  if (S.fieldView) { fieldLines(); for (const e of freeElectrons()) magneticRings(e); }
  for (const e of freeElectrons()) {
    for (let i = 1; i < e.trail.length; i++) lines.seg(e.trail[i - 1], e.trail[i], [0.3, 0.5, 1], 0.08 + 0.4 * i / e.trail.length);
    if (e.trail.length) lines.seg(e.trail[e.trail.length - 1], e.pos, [0.3, 0.5, 1], 0.5);
  }
  for (const f of S.falling) {
    const n = 40, pts = [];
    for (let i = 0; i <= n; i++) pts.push(fallPos(f, f.t * i / n));
    for (let i = 1; i <= n; i++) lines.seg(pts[i - 1], pts[i], [0.3, 0.5, 1], 0.5 * (i / n) * (1 - f.t / FALL_DUR));
  }
  for (const L of S.light) photonLines(L);
  for (const q of S.pairs) {   // the two atoms' coupled electric fields: a faint link, brighter toward the atom holding more
    const A = q.a.p.pos, B = q.b.p.pos, ab = v3.sub(B, A), len = v3.len(ab);
    const side = v3.norm(v3.cross(ab, Math.abs(ab[1]) < 0.9 * len ? [0, 1, 0] : [1, 0, 0]));
    let prev = null;
    for (let i = 0; i <= 48; i++) {
      const u = i / 48, w = Math.sin(u * Math.PI * 10 - S.time * 3) * 0.2 * Math.sin(Math.PI * u);
      const pt = v3.add(A, v3.add(v3.scale(ab, u), v3.scale(side, w)));
      if (prev) lines.seg(prev, pt, q.col, (0.08 + 0.3 * ((1 - u) * q.wa + u * (1 - q.wa))) * (S.fieldView ? 1 : 0.6));
      prev = pt;
    }
  }
  if (S.beat >= 2) coneLines(aimInfo());
  if (xr.session && xr.aim) lines.seg(xr.aim.o, v3.add(xr.aim.o, v3.scale(xr.aim.d, 3)), [0.8, 0.9, 1], 0.5);

  renderer.draw({ views, panel, time: S.time, sphereR: P.SPHERE_R, steps: 72, bohrPerUnit: 1 / P.A0, charges, clouds, glows, lines: lines.data() });
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  if (xr.session) return;   // the headset drives the loop while in VR
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  const paused = !$('startBox').hidden || !$('doneBox').hidden;
  fly(paused ? 0 : dt);
  if (!paused) step(dt);
  updateHud(); drawSpectro(); drawLadder();
  draw(flatViews(), null);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// VR (WebXR). In the headset, 1 metre is drawn as 1 nanometre, so the sphere is 80 m across.
// Left stick: fly where you look. Right stick: turn (left/right) and rise or sink (up/down).
// Trigger: fire along the right controller. A/B: faster/slower electrons. X: Field/Glow view.
// The sticks fire thrusters: the ship keeps drifting until you brake (squeeze the left grip).
// Y: game speed.
// ---------------------------------------------------------------------------
const xr = { session: null, ref: null, head: null, aim: null, buttons: {}, panelCanvas: document.createElement('canvas'), panelVersion: 0, panelT: 0 };
xr.panelCanvas.width = 1024; xr.panelCanvas.height = 640;
function panelDirty() { xr.panelT = 0; }
async function vrSupported() {
  try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch { return false; }
}
async function toggleVR() {
  if (xr.session) { xr.session.end(); return; }
  if (!(await vrSupported())) {
    $('vrNote').hidden = false;
    return;
  }
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    await renderer.gl.makeXRCompatible();
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, renderer.gl) });
    xr.ref = await session.requestReferenceSpace('local');
    xr.session = session;
    $('startBox').hidden = true; $('doneBox').hidden = true;
    $('vrBtn').textContent = 'Exit VR'; $('vrBtn2').textContent = 'Exit VR';
    session.addEventListener('select', ev => { if (ev.inputSource.handedness !== 'left') fire(); });
    session.addEventListener('end', () => {
      xr.session = null; xr.head = null; xr.aim = null;
      $('vrBtn').textContent = 'Enter VR'; $('vrBtn2').textContent = 'Enter VR';
      last = performance.now(); requestAnimationFrame(frame);
    });
    last = performance.now();
    session.requestAnimationFrame(xrFrame);
  } catch (err) {
    console.error(err);
    $('vrNote').textContent = `Couldn't start VR: ${err.message}`;
    $('vrNote').hidden = false;
  }
}
const shipMatrix = () => M.translateRotY(cam.p, cam.yaw + Math.PI);
function poseToWorld(ship, t) {
  const m = t.matrix;
  return { o: M.transformPoint(ship, [t.position.x, t.position.y, t.position.z]), d: v3.norm(M.transformDir(ship, [-m[8], -m[9], -m[10]])),
    u: v3.norm(M.transformDir(ship, [m[4], m[5], m[6]])), r: v3.norm(M.transformDir(ship, [m[0], m[1], m[2]])) };
}
function xrInput(frame, dt) {
  let move = [0, 0, 0];
  xr.aim = null;
  const ship = shipMatrix();
  for (const src of xr.session.inputSources) {
    const gp = src.gamepad, hand = src.handedness;
    if (hand === 'right' || (!xr.aim && hand !== 'left')) {
      const pose = frame.getPose(src.targetRaySpace, xr.ref);
      if (pose) { const w = poseToWorld(ship, pose.transform); xr.aim = { o: w.o, d: w.d }; }
    }
    if (hand === 'left' && xr.session.inputSources.length > 0) {
      const pose = src.gripSpace && frame.getPose(src.gripSpace, xr.ref);
      xr.leftGrip = pose ? poseToWorld(ship, pose.transform) : null;
    }
    if (!gp) continue;
    const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
    const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
    const pressed = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = (key, i) => { const p = pressed(i), was = xr.buttons[key]; xr.buttons[key] = p; return p && !was; };
    if (hand === 'left') {
      if (xr.head) move = v3.add(move, v3.add(v3.scale(xr.head.f, -dz(ax[1])), v3.scale(xr.head.r, dz(ax[0]))));
      if (edge('X', 4)) toggleField();
      xr.brake = pressed(1);   // left grip squeeze: brake
      if (edge('Y', 5)) setSpeed(S.speed === SPEEDS.length - 1 ? 0 : S.speed + 1);
    } else {
      cam.yaw -= dz(ax[0]) * 1.5 * dt;
      move = v3.add(move, [0, -dz(ax[1]), 0]);
      if (edge('A', 4)) setDial(S.dial + 1);
      if (edge('B', 5)) setDial(S.dial - 1);
    }
  }
  if (v3.len(move) > 0.01) {
    cam.v = v3.add(cam.v, v3.scale(move, THRUST * dt));
    S.b1.moved = true;
  }
  if (xr.brake) brake(dt);
  coast(dt, 2);
}
function xrFrame(t, frame) {
  const session = frame.session;
  if (xr.session !== session) return;
  session.requestAnimationFrame(xrFrame);
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
  const pose = frame.getViewerPose(xr.ref);
  if (!pose) return;
  xrInput(frame, dt);
  const ship = shipMatrix(), invShip = M.invert(ship);
  const h = poseToWorld(ship, pose.transform);
  xr.head = { p: h.o, f: h.d, r: h.r, u: h.u, fovT: 1 };
  step(dt);
  updateHud();
  const layer = session.renderState.baseLayer;
  renderer.gl.bindFramebuffer(renderer.gl.FRAMEBUFFER, layer.framebuffer);
  renderer.gl.clear(renderer.gl.COLOR_BUFFER_BIT | renderer.gl.DEPTH_BUFFER_BIT);
  const views = pose.views.map(v => {
    const vp = layer.getViewport(v);
    const VP = M.multiply(v.projectionMatrix, M.multiply(v.transform.inverse.matrix, invShip));
    const p = v.transform.position;
    return { viewport: [vp.x, vp.y, vp.width, vp.height], camPos: M.transformPoint(ship, [p.x, p.y, p.z]), VP, invVP: M.invert(VP) };
  });
  draw(views, vrPanel(dt));
}
// The VR heads-up panel: above the left hand, or floating low in front of you.
function vrPanel(dt) {
  xr.panelT -= dt;
  if (xr.panelT <= 0) { drawPanelCanvas(); xr.panelT = 0.25; xr.panelVersion++; }
  const W = 0.42, H = W * xr.panelCanvas.height / xr.panelCanvas.width;
  let c, r, u;
  if (xr.leftGrip) {
    const g = xr.leftGrip;
    const toHead = v3.norm(v3.sub(xr.head.p, g.o));
    r = v3.norm(v3.cross([0, 1, 0], toHead)); u = v3.cross(toHead, r);
    c = v3.add(g.o, v3.scale(u, 0.22));
  } else {
    const f = xr.head.f; r = xr.head.r; u = v3.norm(v3.cross(r, f));
    c = v3.add(xr.head.p, v3.add(v3.scale(f, 0.9), v3.scale(u, -0.35)));
  }
  const o = v3.sub(c, v3.add(v3.scale(r, W / 2), v3.scale(u, H / 2)));
  return { canvas: xr.panelCanvas, version: xr.panelVersion, o, x: v3.scale(r, W), y: v3.scale(u, H) };
}
function wrap(ctx, text, x, y, maxW, lh, maxLines = 99) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) return y; }
    else line = t;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
function drawPanelCanvas() {
  const c = xr.panelCanvas, g = c.getContext('2d'), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(8,14,26,0.86)'; g.strokeStyle = 'rgba(47,227,230,0.5)'; g.lineWidth = 3;
  g.beginPath(); g.roundRect ? g.roundRect(2, 2, W - 4, H - 4, 18) : g.rect(2, 2, W - 4, H - 4); g.fill(); g.stroke();
  g.fillStyle = '#2fe3e6'; g.font = '700 26px system-ui, sans-serif';
  g.fillText('ALCHEMFIGHTER · LEVEL 1 · ELECTROMAGNETIC STARDUST', 28, 46);
  g.fillStyle = '#ffffff'; g.font = '700 36px system-ui, sans-serif';
  g.fillText($('beatTitle').textContent, 28, 92);
  g.fillStyle = '#d6e2ee'; g.font = '26px system-ui, sans-serif';
  let y = wrap(g, $('tutorText').textContent, 28, 136, W - 56, 33, 7);
  g.font = '24px ui-monospace, monospace'; g.fillStyle = '#ffe94d';
  y = wrap(g, `Electron gun ${$('dialOut').textContent} · ${$('aimOut').textContent}`, 28, y + 12, W - 56, 30, 2);
  g.fillStyle = '#8a9db1';
  for (const p of S.passes.slice(0, 2)) y = wrap(g, `${p.who}: ${fmtNm(p.rp)} · ${fmtChance(p.chance)} · ${p.caught ? 'CAUGHT' : 'missed'}`, 28, y + 4, W - 56, 28, 1);
  g.fillText(`H⁺ ${$('cHp').textContent}   H ${$('cH').textContent}   free e⁻ ${$('cE').textContent}   ·   ${S.fieldView ? 'Field view' : 'Glow view'} (X)   ·   A/B electron speed   ·   ship ${$('shipOut').textContent}`, 28, H - 28);
}
for (const id of ['vrBtn', 'vrBtn2']) $(id).addEventListener('click', toggleVR);
vrSupported().then(ok => { if (!ok) for (const id of ['vrBtn', 'vrBtn2']) $(id).title = 'No VR headset found in this browser'; });

$('rateTag').textContent = `rates ×${P.RATE_BOOST.toLocaleString('en-US')}`;
restart();
// Test hook: lets automated browser checks drive the game. Harmless for players.
window.__alchem = { get state() { return S; }, cam, fire, setSpeed, slowTarget, startBeat, setDial, toggleField, step, capture, xr, drawPanelCanvas };
requestAnimationFrame(frame);
