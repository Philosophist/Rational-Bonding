// Alchemfighter, Level 1 "Electromagnetic Stardust": beats 1 and 2 of docs/levels/01-hydrogen-tutorial.md.
// Plays in the browser window or in a PC VR headset (WebXR); the VR button works from the start.
// Beat 1: meet the proton (its field and glow). The system starts with only the proton in it.
// Beat 2: catch an electron with the electron gun, then watch the cascade of light down to 1s.
import * as P from './physics.js';
import { waveDesc, extentBohr, angularNorm, legendre } from './orbitals.js';
import * as Q from './quantum.js';
import { createRenderer, Lines } from './render.js';
import * as W from './light.js';
import * as MW from './matterwave.js';
import * as WL from './wells.js';
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
const fmtOdds = p => {
  if (p <= 0) return 'never';
  const x = 1 / p;
  if (x >= 1e15) return `1 in 10^${Math.floor(Math.log10(x))}`;
  for (const [k, w] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']]) if (x >= k) { const y = x / k; return `1 in ${y >= 100 ? Math.round(y) : y.toPrecision(2)} ${w}`; }
  return `1 in ${Math.round(x).toLocaleString('en-US')}`;
};
const fmtNm = r => (r < 0.1 ? `${(r * 1000).toFixed(0)} pm` : `${r.toFixed(2)} nm`);

// Time: one clock for everything. At full speed one screen second is FS_PER_S femtoseconds.
// Nothing ever pauses: when something worth watching happens, the whole system slows down.
// Chance encounters (catches, collisions, light absorbed in flight) have their real odds: nothing is
// boosted. What lets the player catch electrons at all is the ship's atomic lock-on, a made-up
// technology (see "Atomic lock-on" below). How long an atom stays in a level is NOT sped up:
// every level lasts its real lifetime on the game's clock (DECAY_BOOST = 1). At this clock that is
// hours of play even for 2p, so an atom usually keeps the orbital it was caught in.
const FS_PER_S = 40;
const DECAY_BOOST = 1;
// Light moves at its real speed on the same clock. While a light wave is out, everything slows
// until light covers LIGHT_SHOW nm per screen second, so you can watch the wave spread; matter is
// then almost still, which is true: light is about 1,600 times faster than a slow electron.
// Light from an atom that a fast electron bumped up (it happens often once electrons are hot)
// slows things less: light covers LIGHT_QUICK nm per screen second, a quick ripple.
const LIGHT_SHOW = 25, LIGHT_QUICK = 300;
const lightSlow = show => show / (299.792458 * FS_PER_S);
const LIGHT_SLOW = lightSlow(LIGHT_SHOW);
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
// Each step down the ladder: the atom waits its real lifetime on the game's clock (2p 1.6 ns,
// 3s 159 ns, ...: hours to days of play), then the shape morphs
// over STEP_MORPH s while everything slows.
const STEP_MORPH = 1.5;
// When its photon is found, the swinging atom settles into the lower level over SETTLE seconds.
const SETTLE = 0.5;
// An atom starting to send light: the clock slows until one swing of its charge takes EMIT_PERIOD
// screen seconds, holds EMIT_HOLD s (longer the first two times), then speeds up (e-fold per EMIT_EASE s).
const EMIT_PERIOD = 2, EMIT_HOLD = [5, 2], EMIT_EASE = 1;
// Swings faster than SWING_HZ on screen are drawn as their average (no flicker: photosensitivity),
// fully so above SWING_HZ_AVG.
const SWING_HZ = 1.2, SWING_HZ_AVG = 2.2;
// Acid Neutrality: this many fresh protons join the first one, so the system holds 10 hydrogen in all.
const ACID_N = 9;
// The ship: the keys fire thrusters (an acceleration), and it coasts when you let go.
const THRUST = 5, THRUST_FAST = 15, BRAKE = 10;   // nm/s²
const DIAL = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];   // eV, the electron's energy far from the proton
const PROTON_SMEAR = 0.01;       // nm, keeps the glow's centre finite (log scale, capped)
// Missed electrons stay in the sphere (matter can't leave). Fire as many as you like; past this many
// free electrons the oldest one is removed, to keep the simulation smooth.
const MAX_FREE = 12;
// Strongest field (atomic units) a 1s cloud is drawn leaning in; see draw().
const LEAN_MAX_AU = 0.02;

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
    shots: 0, emitShown: 0, pilot: true, ionized: 0, bumped: 0, paired: 0, pairs: [], oldSteps: [], light: [], lightOut: 0, lightOutE: 0, passes: [], fieldView: true, dial: 1, cooldown: 0, cascade: null, autoCam: null, falling: [], trails: [], speed: 3, slow: 1,
    b1: { start: null, maxAngle: 0, toggled: false, glowTried: false, moved: false },
    b2: { tooFastSaid: false, captured: false, doneShown: false, nextAt: 0, lessonAt: 0, lesson: false },
    lock: { on: true, target: null, prog: 0, locked: false }, b3: { spawned: false, doneAt: 0, caught: 0 }, ended: false, said: '',
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
    say: 'Your gun fires electrons. This is the pilot-wave view: each electron is a point riding its own matter wave. Near a proton you see the wave itself, worked out from Schrödinger\'s equation, bending round the proton, and the point pushed and sloshed along by it. Electrons are negative, so the proton pulls them in. But an electron can only stay if it gets rid of its energy by giving off light, and that almost never happens. To be caught, the point has to come in through the proton\'s capture target, a tiny disc (see the Target window). Fire 10 electrons at the proton, with real odds.',
  },
  3: {
    title: 'Acid Neutrality',
    say: `Nine more protons have appeared, so this system now holds ten hydrogen. Loose H⁺ ions like these are what make an acid acidic: the more of them, the stronger the acid. Neutralize this one. Give every proton an electron, so each becomes a neutral hydrogen atom. Each catch's energy leaves as light through the edge of the system: watch the spectrometer catch it.`,
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
  $('tutorToggle').textContent = open ? '−' : 'ⓘ';
  $('tutorToggle').title = open ? 'Minimize the tutor (I)' : 'Show the tutor and options (I)';
  if (open) delete $('tutor').dataset.unread;
}
$('tutorToggle').addEventListener('click', () => setTutorOpen($('tutor').classList.contains('collapsed')));
// Every other window gets the same kind of button: − folds it to its title row (marked .keep, so the
// game-time speed in the Time window stays in view), + opens it again. The choice is remembered.
const folded = (() => { try { return JSON.parse(localStorage.getItem('af-folded') || '{}'); } catch { return {}; } })();
for (const box of document.querySelectorAll('.hud .panel[data-name]')) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'minBtn';
  const set = shut => {
    box.classList.toggle('collapsed', shut);
    btn.textContent = shut ? '+' : '−';
    btn.title = `${shut ? 'Open' : 'Minimize'} the ${box.dataset.name} window`;
    btn.setAttribute('aria-expanded', String(!shut));
    folded[box.id] = shut;
    try { localStorage.setItem('af-folded', JSON.stringify(folded)); } catch {}
  };
  btn.addEventListener('click', () => set(!box.classList.contains('collapsed')));
  box.prepend(btn);
  set(!!folded[box.id]);
}
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
    if (!S.b2.lesson) return [[`Fire ${UNAIDED} electrons at the proton (${Math.min(S.shots, UNAIDED)} of ${UNAIDED})`, S.shots >= UNAIDED]];
    return [
      ['Hold the crosshair on the proton until the lock closes', S.lock.locked || S.b2.captured],
      ['Fire while locked: make a neutral hydrogen atom', S.b2.captured],
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
  if (n >= 3) { $('lockBtn').hidden = false; $('rateTag').hidden = false; }
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
// Where a shot would go: stepped through the field of every charge in the system as it is right
// now (the others are held where they are for the prediction), so the path shifts as they move.
function predictPath(start, vel, target) {
  const charges = S.ps.filter(q => q.active && q.q);
  let x = [...start], v = [...vel], best = { r: Infinity, L: 0 };
  const pts = [[...x]];
  for (let i = 0; i < 2500; i++) {
    let rmin = Infinity;
    for (const q of charges) rmin = Math.min(rmin, v3.len(v3.sub(x, q.pos)));
    const h = Math.min(2, 0.03 * Math.max(rmin, 0.01) / v3.len(v));
    const E = P.fieldAt(x, charges);
    v = v3.add(v, v3.scale(E, -h / P.ME)); x = v3.add(x, v3.scale(v, h));
    pts.push([...x]);
    const d = v3.sub(x, target.pos), r = v3.len(d);
    if (r < best.r) { const Lv = v3.scale(v3.cross(d, v3.sub(v, target.vel)), P.ME / P.HBAR); best = { r, L: v3.len(Lv), Lvec: Lv, v: v3.sub(v, target.vel) }; }
    if (v3.len(x) > P.SPHERE_R || (r > best.r + 3 && best.r < 3) || pts.length > 2000) break;
  }
  return { pts, rp: best.r, L: best.L, Lvec: best.Lvec };
}
let aimCache = null;
function aimInfo() {
  const g0 = getAim(), key = `${S.time}|${g0.eye}|${g0.f}|${S.dial}`;
  if (aimCache && aimCache.key === key) return aimCache.info;
  const info = aimInfoNow(g0);
  aimCache = { key, info };
  return info;
}
function aimInfoNow(g) { const B = { p: g.eye, f: g.f }, muzzle = g.muzzle;
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
    // The predicted path through every charge's field, and the pass it makes by the aimed proton.
    const rel = v3.sub(muzzle, info.target.p.pos), dir = v3.norm(v3.sub(aimPoint, muzzle));
    const pr = predictPath(muzzle, v3.scale(dir, P.electronSpeed(launchKE(E, v3.len(rel)))), info.target.p);
    info.path = pr.pts;
    info.rp = pr.rp;
    info.L = pr.L;   // what the odds depend on: the pass's angular momentum (ħ)
    info.Lvec = pr.Lvec;
    info.unaided = unaidedOdds(E, info.L, cone, launchKE(E, v3.len(rel)));
    info.lands = Q.captureSharesAt(E, Math.min(info.L, LOCK_LMAX));
  }
  return info;
}
// The dial sets the energy far from the proton; near it the electron is already moving faster.
const launchKE = (E, dist) => E + P.KE / Math.max(dist, 0.5);

// ---------------------------------------------------------------------------
// Atomic lock-on (made-up technology, and labelled so in the game)
// ---------------------------------------------------------------------------
// In pilot-wave theory nobody can choose where the electron's point sits inside its wave: that is
// random (the Born rule), and it is exactly why a shot so rarely comes in through the capture disc.
// The ship's lock-on is fiction: held on a proton for LOCK_TIME seconds, it fires the point from the
// same spot in its wave every time and steers it through the disc, so the proton catches it. What
// stays real: which orbital it lands in is rolled from the computed odds for the pass's angular
// momentum (where on the rings you aim), and everything after the catch.
const UNAIDED = 10;             // shots with real odds before the lesson and the lock-on
const LOCK_TIME = 1.0;         // s of steady aim to close the lock
const LOCK_LMAX = Q.NMAX + 0.5;   // the lock holds only inside the rings (angular momentum the odds cover)
const lockReady = () => S.beat >= 3 || (S.beat === 2 && S.b2.lesson);
function updateLock(dtReal) {
  const L = S.lock, a = S.beat >= 2 ? aimInfo() : null;
  const ok = lockReady() && L.on && a && a.target && a.target.p.q === 1 && a.L !== undefined && a.L < LOCK_LMAX;
  if (!ok || (L.target && L.target !== a.target.p)) { L.prog = Math.max(0, L.prog - dtReal * 3); if (L.prog === 0) L.target = null; L.locked = false; return; }
  if (!L.target) L.target = a.target.p;
  L.prog = Math.min(1, L.prog + dtReal / LOCK_TIME);
  if (L.prog >= 1 && !L.locked) { L.locked = true; if (!S.lockSaid) { S.lockSaid = true; log('Lock closed. Fire: the shot will be steered through the capture disc.', 'hit'); } }
}
function toggleLock() {
  if (!lockReady()) return;
  S.lock.on = !S.lock.on;
  if (!S.lock.on) { S.lock.locked = false; S.lock.prog = 0; S.lock.target = null; }
  $('lockBtn').setAttribute('aria-pressed', String(S.lock.on));
  panelDirty();
}
// The lesson after the unaided shots: why it is so hard, and how long nature takes.
function giveLesson() {
  S.b2.lesson = true;
  const E = DIAL[S.dial], disc = 2 * P.captureDiscRadius(E) * 1000, sh = Q.captureShares(E);
  const pct = k => Math.round(100 * (sh[k] || 0));
  say(`${S.b2.captured ? 'You beat the odds!' : 'None caught, and that is normal.'} The point has to come in through a disc only ${disc.toFixed(1)} pm across at ${E} eV (the 1s cloud it would join is 106 pm across, the proton itself 0.0017 pm), and your gun cannot choose where the point sits inside its wave: that is random. On average a 1 eV electron needs about 20 million passes before one is caught. Space is still full of neutral hydrogen because protons and electrons meet so often: in a neon sign's glow a proton waits about 25 seconds, in the thin upper air months to years, and in ordinary air a proton never waits at all, it takes an electron from a molecule within billionths of a second. In this tiny system, with ten free electrons, it would be about 25 microseconds, which at our clock is about 20 years of play. So your ship has a made-up technology: atomic lock-on. Hold the crosshair on the proton until the lock closes, then fire. Which orbital it lands in is still rolled from the real odds: at this speed about ${pct('1s')}% go straight to 1s, ${pct('2p')}% to 2p, ${pct('2s')}% to 2s.`);
  $('lockBtn').hidden = false;
  $('rateTag').hidden = false;
  lastGoals = '';
  log('Atomic lock-on unlocked (made-up technology). L or the Lock-on button turns it on and off.', 'hit');
  panelDirty();
}
// How likely an unaided shot is to come in through the disc, aimed with angular momentum L: the
// point lands at random in the gun's spot (a 2-D Gaussian of width σ around the aimed spot).
function unaidedOdds(E, L, cone, KEl) {
  const R = P.captureDiscRadius(E), sb = cone * Math.sqrt(KEl / E), b0 = P.impactParameter(E, L);
  return Math.min(1, (R * R) / (2 * sb * sb) * Math.exp(-b0 * b0 / (2 * sb * sb)));
}

function fire() {
  if (S.beat < 2 || S.cooldown > 0) return;
  const a = aimInfo();
  const lockOn = S.lock.locked && a.target && a.target.p === S.lock.target;
  const ax = v3.norm(v3.sub(a.aimPoint, a.muzzle));
  const e1 = v3.norm(v3.cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(ax, e1);
  // Unaided, the point starts at a random spot in its wave (the Born rule); locked, always the same spot.
  const off = lockOn ? [0, 0, 0] : v3.add(v3.scale(e1, P.gaussian() * a.cone), v3.scale(e2, P.gaussian() * a.cone));
  const dir = v3.norm(v3.sub(v3.add(a.aimPoint, off), a.muzzle));
  const near = a.target && a.target.p.q === 1 ? a.target.p : bareProtons()[0];
  const KEl = launchKE(a.E, near ? v3.len(v3.sub(a.muzzle, near.pos)) : 99);
  S.shots++;
  // Its spin axis belongs to its wave; the gun does not choose it (unpolarised), so it is random.
  // `so` is where the point sits in its wave, measured from the wave's middle (a locked shot: the middle).
  addElectron([...a.muzzle], v3.scale(dir, P.electronSpeed(KEl)), { shot: S.shots, E: a.E, born: S.time, cone: a.cone, lock: lockOn ? S.lock.target.id : null, spin: randomDir(), so: off });
  if (!S.spinSaid && !lockOn) { S.spinSaid = true; log('Each electron has a spin axis that belongs to its wave. The point is carried round that axis inside its wave, so with its forward motion its path is a corkscrew, about 0.4 nm wide. A locked shot rides the middle of its wave and flies straight.'); }
  if (S.beat === 2 && S.shots === UNAIDED && !S.b2.lesson) S.b2.lessonAt = S.time + 6;   // time for the last shots to pass
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

const fmtSpan = s => (s < 120 ? `${Math.round(s)} seconds` : s < 7200 ? `${Math.round(s / 60)} minutes` : s < 172800 ? `${Math.round(s / 3600)} hours` : s < 3.15e7 * 2 ? `${Math.round(s / 86400)} days` : `${Math.round(s / 3.15e7).toLocaleString('en-US')} years`);
// ---------------------------------------------------------------------------
// Capture and the light cascade
// ---------------------------------------------------------------------------
const descCache = new Map();
function desc(s) {
  const k = `${s.n},${s.l},${s.m}`;
  if (!descCache.has(k)) descCache.set(k, waveDesc(s.n, s.l, s.m, 1, true));
  return descCache.get(k);
}

// ---------------------------------------------------------------------------
// The electron's wave in each atom (quantum.js does the maths)
// ---------------------------------------------------------------------------
// Each atom keeps its electron's amplitudes over the orbitals of its shell (a.c, one per l, all
// with the same m about the atom's own axis a.axis). Inside a shell every l has the same energy,
// so a nearby charge's field mixes them (the linear Stark effect): the amplitudes evolve exactly in
// that field and the cloud sloshes from shape to shape, always centred on its proton. The axis
// follows the field's direction. Sloshing faster than SWING_HZ on screen is shown at SWING_HZ (no
// flicker); the odds of each step down use the true average over the sloshing.
const FIELD_MIN = 1e-5;   // V/nm: in a weaker field the axis stays where it is
const shellLs = (n, m) => { const o = []; for (let l = Math.abs(m); l < n; l++) o.push(l); return o; };
function setPure(a, st) {
  a.st = st;
  if (WELLS) { a.wv = null; a.wvAxis = st.idx == null ? a.axis : null; a.dph = null; }
  const ls = shellLs(st.n, st.m);
  a.c = { re: ls.map(l => (l === st.l ? 1 : 0)), im: ls.map(() => 0) };
  a.shellKey = `${st.n},${st.m}`;
}
function shellOf(a) { if (!a.c || a.shellKey !== `${a.st.n},${a.st.m}`) setPure(a, a.st); return a.c; }
// The field along the atom's axis (atomic units). With dt, the axis turns toward the field's line.
function fieldAlong(a, dt = 0) {
  const F = P.fieldAt(a.p.pos, S.ps), Fm = v3.len(F);
  if (!a.axis) a.axis = Fm > FIELD_MIN ? v3.scale(F, 1 / Fm) : [0, 1, 0];
  if (Fm > FIELD_MIN && dt > 0) {
    let u = v3.scale(F, 1 / Fm);
    if (v3.dot(u, a.axis) < 0) u = v3.scale(u, -1);   // the same line: the field just points the other way along it
    a.axis = v3.norm(v3.add(a.axis, v3.scale(v3.sub(u, a.axis), 1 - Math.exp(-dt * 6))));
  }
  return v3.dot(F, a.axis) / Q.F_AU;
}
// The fastest swing (rad per fs) that still shows at `hz` per screen second right now.
const capOmega = hz => 2 * Math.PI * hz / (FS_PER_S * SPEEDS[S.speed] * Math.max(S.slow, 1e-9));
const showHz = () => (S.fieldView ? SWING_HZ : 0.5);
function stepShell(a, dt, dtFs) {
  if (a.pair || a.mix) { a.axis = [0, 1, 0]; return; }   // sharing an excitation: drawn in the system's frame
  const c = shellOf(a), F = fieldAlong(a, dt);
  if (c.re.length < 2 || !F) return;
  const w = Q.shellAverage(a.st.n, a.st.m, F, c).w / Q.T_AU_FS;   // rad/fs
  a.c = Q.evolveShell(a.st.n, a.st.m, F, c, dtFs * Math.min(1, capOmega(showHz()) / Math.max(w, 1e-30)) / Q.T_AU_FS);
}
// The cloud as the shader draws it: a blend of orbitals in the atom's own frame.
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const termOf = (st, c, g = 0) => { const d = desc(st); return { n: st.n, l: st.l, m: st.m, mode: d.mode, norm: d.norm, c, g, peak: d.peak, iso: d.iso }; };
function shellTerms(a, amp) {
  const c = shellOf(a), ls = shellLs(a.st.n, a.st.m), out = [];
  ls.forEach((l, i) => { const k = cmul(amp, [c.re[i], c.im[i]]); if (k[0] * k[0] + k[1] * k[1] > 1e-6) out.push(termOf({ n: a.st.n, l, m: a.st.m }, k)); });
  return out;
}
const angPeakCache = new Map();
function freeTerm(cap, amp) {
  const { lIn: l, mIn: m } = cap, mode = m === 0 ? 0 : m > 0 ? 1 : 2, key = `${l},${m}`;
  if (!angPeakCache.has(key)) { let b = 0; for (let j = 0; j <= 90; j++) b = Math.max(b, legendre(l, Math.abs(m), Math.cos(Math.PI * j / 90)) ** 2); angPeakCache.set(key, b); }
  const norm = angularNorm(l, m) * (mode ? Math.SQRT2 : 1), peak = cap.free.peak * norm * norm * angPeakCache.get(key);
  return { n: 0, l, m, mode, norm, c: amp, g: 0, peak, iso: 0.15 * peak };
}
function frameOf(a) {
  const y = a.pair || a.mix || !a.axis ? [0, 1, 0] : a.axis;
  const x = v3.norm(v3.cross(Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], y)), z = v3.cross(x, y);
  return [x, y, z];
}
// ---------------------------------------------------------------------------
// Gravity-well physics (the new version; wells.js does the maths)
// ---------------------------------------------------------------------------
// Each proton holding an electron is a well bubble: its own grid (fine at the proton, coarse at
// the edge) on which Schrödinger's equation gives every standing wave. The electron's wave is a set
// of amplitudes over them; every other charge tilts and dents the well, which mixes them, and the
// mix is stepped exactly through the game's time. A settled atom costs next to nothing. The point
// of the electron rides that wave (de Broglie–Bohm). Classic physics (the shell model above) is
// still there: "?physics=classic", or the choice on the start card.
const PHYS_KEY = 'af-physics';
let WELLS = (() => {
  const q = new URLSearchParams(location.search).get('physics');
  if (q) return q !== 'classic';
  try { return localStorage.getItem(PHYS_KEY) !== 'classic'; } catch { return true; }
})();
let WELL = null, wellBuildMs = 0;
function wellAlphabet() {
  if (!WELL) {
    const t = performance.now();
    // Phones get a lighter alphabet: fewer grid points and standing waves (1s still within 0.01%).
    WELL = WL.buildWell(phone.matches ? { N: 1000, ECUT: 0.15, nearCap: 120 } : {});
    wellBuildMs = performance.now() - t;
    // Then, a few at a time while nothing much is happening, each bound wave's brightness numbers
    // and drawing table, so a catch never has to stop and work them out.
    const todo = WELL.states.map((x, i) => (x.n && x.n <= Q.NMAX ? i : -1)).filter(i => i >= 0);
    const warm = () => { const t1 = performance.now(); while (todo.length && performance.now() - t1 < 4) { const i = todo.shift(); WL.stateStats(WELL, i); WL.stateTable(WELL, i); } if (todo.length) setTimeout(warm, 30); };
    setTimeout(warm, 30);
  }
  return WELL;
}
const stKey = st => `${st.n},${st.l},${st.m}`;
// The label of standing wave a (n is 0 for the bubble's share of a free electron's waves).
const labelOf = a => { const x = WELL.states[a]; return { n: x.n || 0, l: x.l, m: x.m, idx: a }; };
const AU_PER_FS = 1 / WL.T_AU_FS;
function wellOf(a) {
  if (!a.wv || a.wvKey !== stKey(a.st)) {
    const Wd = wellAlphabet();
    a.wv = a.st.idx != null ? WL.waveFromIndex(Wd, a.st.idx) : WL.makeWave(Wd, a.st.n, a.st.l, a.st.m, a.wvAxis || null);
    a.wvAxis = null; a.wvKey = stKey(a.st); a.disp = null; a.wvPend = 0;
  }
  return a.wv;
}
// The tilt (field, atomic units) and the dent (how it changes across the atom) at an atom.
P.useWaveC6((a, b) => (WELLS && WELL ? WL.c6(WELL, a, b) * WL.HARTREE * WL.A0_NM ** 6 : P.C6_HH));
// A charge inside the cloud does not tilt the whole well: its field is taken softened over the
// cloud's size s (about 1.5·n² a₀), q·R/(R²+s²)^1.5, and the dent as if it were no closer than s.
const cloudSize = a => 1.5 * Math.max(1, a.st.n || 1) ** 2;   // a₀
function wellPull(a) {
  const s = cloudSize(a), F = [0, 0, 0], ch = [];
  for (const p of S.ps) if (p.active && p.q && p !== a.p) {
    const rel = v3.scale(v3.sub(p.pos, a.p.pos), 1 / WL.A0_NM), k = p.q / (v3.dot(rel, rel) + s * s) ** 1.5;
    for (let c = 0; c < 3; c++) F[c] -= k * rel[c];
    ch.push({ rel, q: p.q });
  }
  return { F, T: WL.tiltAndDent(ch, Math.max(2, s)).T, lip: WL.edgeLip(WELL, ch) };
}
// Relabel the atom by its largest share (for the HUD, the counts and the sharing of light).
function relabel(a) {
  // (by the largest share among the bound waves: the atom's name is an orbital, even while a
  // strong pull has part of the wave in the bubble's unbound standing waves)
  const p = WL.shares(a.wv.s).p; let best = -1;
  for (let i = 0; i < p.length; i++) if (WELL.energies[i] < 0 && (best < 0 || p[i] > p[best])) best = i;
  const st = labelOf(best);
  if (stKey(st) !== stKey(a.st)) { a.st = st; a.wvKey = stKey(st); }
}
// The rate (per ns) that a photon leaves this atom right now.
const wellRateNs = a => WL.emissionRate(WELL, wellOf(a).s) / (WL.T_AU_FS * 1e-6);
// Steps every atom's wave, sharing a time budget per frame (ms): an atom that misses its turn
// keeps its time and is stepped further on its next turn (the stepping is exact for any step).
const WELL_BUDGET = () => (phone.matches ? 4 : 8);
let wellTurn = 0;
function stepWells(dtFs) {
  if (!WELLS || !S.atoms.length) return;
  const list = S.atoms.filter(a => !a.pair && !a.mix && !a.trans && !a.emitL);
  for (const a of S.atoms) if (a.trans || a.emitL) a.wvPend = 0; else if (!a.pair && !a.mix) a.wvPend = (a.wvPend || 0) + dtFs;
  const t0 = performance.now(), n = list.length;
  let used = 0;
  for (let k = 0; k < n; k++) {
    const a = list[(wellTurn + k) % n];
    if (k > 0 && performance.now() - t0 > WELL_BUDGET() && a.wvPend < 200 * FS_PER_S) continue;
    const wv = wellOf(a), pull = wellPull(a), t = a.wvPend * AU_PER_FS;
    a.pull = pull; a.wvPend = 0;
    if (t <= 0) continue;
    WL.stepNear(WELL, wv, pull.F, pull.T, t, pull.lip);
    used++;
    // Light: what the step lost is the chance that a photon left in it (the quantum-jump method).
    // The electron itself: what leaked over the lip of the tilted well is the chance that it left.
    if (!a.capt && a.fade >= 1 && wv.lostEsc > 0 && Math.random() < wv.lostEsc && spill(a, wv, pull)) continue;
    const free = a.pending && a.pending.hazard && a.hold <= 0 && a.fade >= 1 && !a.capt;
    if (free && Math.random() < wv.lostLight) a.wvJump = WL.pickJump(WELL, wv.s);
    WL.normalize(wv.s);
    if (!a.wvJump) relabel(a);
    // What the other charges feel from this atom: its wave's own dipole, and how much of the
    // electron is inside each radius (so a charge inside the cloud feels the proton it uncovers).
    const wd = WL.waveDipole(WELL, wv);
    a.p.dip = wd.p0.map(x => x * WL.A0_NM); a.p.dipA = wd.A.map(x => x * WL.A0_NM ** 3 / P.KE);
    a.p.soft = cloudSize(a) * WL.A0_NM;
    a.p.vdw = a.st.idx != null ? a.st.idx : WELL.index(a.st.n, a.st.l, a.st.m);
    a.p.scr = { q: WL.enclosed(WELL, wv.s), R: WELL.R * WL.A0_NM };
  }
  for (const a of S.atoms) if (a.pair || a.mix || a.trans || a.emitL) { a.p.dip = null; a.p.scr = null; a.p.vdw = null; }
  wellTurn = (wellTurn + 1) % Math.max(1, n);
  S.wellMs = 0.9 * (S.wellMs || 0) + 0.1 * (performance.now() - t0);
  S.wellNear = list.reduce((m, a) => Math.max(m, a.wv && a.wv.near ? a.wv.near.length : 0), 0);
}
// The electron leaves over the lip. It comes out on the open side of the bubble's edge and is a free
// point again. The energy books are kept: it leaves with the energy the atom's wave had, plus, if
// the wave it left from sat higher than that, the difference paid by the nearest charge (the one
// whose pull lifted it); if nobody can pay enough for it to get out, it does not leave.
// Simplified, flagged: the point is put at the edge rather than followed out through it.
function spill(a, wv, pull) {
  const idx = WL.pickEscape(WELL, wv), ex = WL.escapeExit(WELL, idx, pull.lip), p = a.p, M = P.MP + P.ME;
  if (!ex) return false;
  const rel = v3.scale(ex.dir, ex.r * WL.A0_NM), pos = v3.add(p.pos, rel);
  if (v3.len(pos) > P.SPHERE_R - 0.2) return false;
  let U = -P.KE / v3.len(rel), payer = null, dBest = Infinity;
  for (const c of S.ps) if (c.active && c.q && c !== p) {
    const R = v3.len(v3.sub(c.pos, p.pos)), re = v3.len(v3.sub(c.pos, pos));
    U += P.KE * c.q * (1 / Math.max(R, 0.01) - 1 / Math.max(re, 0.01)) - (p.scr ? P.penEnergy(p.scr, R, c.q) : 0);   // (a charge inside the cloud already felt the proton)
    if (R < dBest && !c.guide) { dBest = R; payer = c; }
  }
  const Ea = WELL.energies[idx] * WL.HARTREE, Ew = WL.waveEnergy(WELL, wv, pull.F, pull.T) * WL.HARTREE;
  let paid = 0, rv = null, KEp = 0;
  if (Ea > Ew && payer) { rv = v3.sub(payer.vel, p.vel); KEp = 0.5 * payer.m * v3.dot(rv, rv); paid = Math.min(Ea - Ew, 0.98 * KEp); }
  const KEx = Ew + paid - U;
  if (!(KEx > 0)) return false;
  if (paid > 0) {
    const dv = v3.scale(rv, Math.sqrt(1 - paid / KEp) - 1);
    payer.vel = v3.add(payer.vel, dv); p.vel = v3.sub(p.vel, v3.scale(dv, payer.m / M));
  }
  const v = Math.sqrt(2 * KEx * M / (P.ME * P.MP)), V = p.vel, st = labelOf(idx);
  S.atoms = S.atoms.filter(x => x !== a);
  S.oldSteps.push(...a.steps);
  if (S.cascade && S.cascade.atom === a) { S.cascade = null; S.autoCam = null; }
  p.q = 1; p.glow = 1; p.m = P.MP; p.pol = null; p.dip = null; p.scr = null; p.vdw = null;
  p.vel = v3.sub(V, v3.scale(ex.dir, v * P.ME / M));
  addElectron(pos, v3.add(V, v3.scale(ex.dir, v * P.MP / M)), { freed: true, spilled: S.time, born: S.time, spin: a.spin });
  S.flashes.push({ pos, col: [0.45, 0.6, 0.9], t: 0, life: 1.2, size: 0.6 });
  S.spilled = (S.spilled || 0) + 1;
  const name = WELL.energies[idx] < -1 / WELL.R ? P.stateName(st) : 'a wave too wide for the well';
  if (S.spilled <= 3 || S.spilled % 10 === 0) log(`An electron spilled out of its atom with no light involved. Nearby charges had tilted its well until ${name}, held by ${(-Ea).toFixed(2)} eV, sat above the low side of the rim${paid > 0.005 ? ` (the nearest charge paid ${paid.toFixed(2)} eV to lift it there)` : ''}. That proton is bare again.${S.spilled > 3 ? ` (${S.spilled} so far)` : ''}`);
  if (S.spilled === 1) say('An atom just lost its electron, and no light was involved. A nearby charge tilts an atom\'s well, so the rim is lower on one side. A wide, loosely held orbital can end up above that low side, and then the electron\'s wave pours out over it. Tightly held orbitals like 1s sit far below any rim you can make here.');
  return true;
}
// A jump found by stepWells, as the record the light code uses.
function wellStep(a) {
  const j = a.wvJump; a.wvJump = null;
  if (!j) return null;
  const from = labelOf(j.from), to = labelOf(j.to), A = WELL.states[j.from], B = WELL.states[j.to];
  const delayNs = (S.simFs - a.since) * 1e-6, tauNs = 1 / WELL.gamma[j.from] * WL.T_AU_FS * 1e-6;
  if (stKey(from) !== stKey(a.st) && (S.mixSaid = (S.mixSaid || 0) + 1) <= 2) log(`Nearby charges had tilted this atom's well and blended ${P.stateName(from)} into its ${P.stateName(a.st)} wave, and the light came out of that part.`);
  a.st = from; a.wvKey = stKey(from); a.wv = WL.waveFromIndex(WELL, j.from); a.disp = null;
  if (j.twoPhoton) { const d = P.pickDecay({ n: 2, l: 0, m: 0 }); d.delayNs = delayNs; d.to = to; return d; }
  const eV = (A.E - B.E) * WL.HARTREE, dv = WL.dipoleVector(WELL, j.from, j.to), dm = v3.len(dv);
  return { photons: [P.HC / eV], to, twoPhoton: false, dm: 0, axis: dm > 0 ? v3.scale(dv, 1 / dm) : [0, 1, 0], delayNs, tauNs };
}
// What is drawn and ridden: the near waves with their true phases where they change slowly, and
// with their swings shown at most SWING_HZ per screen second where they change faster than that
// (no flicker, as everywhere in the game); plus the far waves following the pull.
function wellDisplay(a, dtReal) {
  const wv = wellOf(a), s = wv.s, near = wv.near || WL.activeList(s, 1e-9);
  const { best } = WL.shares(s), cr = s.re[best], ci = s.im[best], cm = Math.hypot(cr, ci) || 1;
  if (!a.dph) a.dph = new Map();
  const cap = 2 * Math.PI * showHz() * Math.max(dtReal, 1 / 240);
  const x = { re: new Float64Array(s.re.length), im: new Float64Array(s.re.length) };
  let fast = 0, seen = 0;
  for (const i of near) {
    const re = s.re[i], im = s.im[i], amp = Math.hypot(re, im);
    if (amp < 1e-6) continue;
    // phase relative to the largest share
    const ph = Math.atan2(im * cr - re * ci, re * cr + im * ci) / 1, prev = a.dph.get(i);
    let shown = ph;
    if (prev !== undefined && i !== best) {
      let d = ph - prev; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      if (Math.abs(d) > cap) { shown = prev + Math.sign(d) * cap; if (amp > 0.03) fast = 1; } else seen = Math.max(seen, Math.abs(d));
    }
    a.dph.set(i, shown);
    x.re[i] = amp * Math.cos(shown); x.im[i] = amp * Math.sin(shown);
  }
  void cm;
  // the far waves, following the pull (first order)
  const pull = a.pull || wellPull(a), lTop = Math.min(WELL.LMAX, WL.topL(WELL, x) + 1);
  const y = WL.applyPull(WELL, x, pull.F, pull.T, lTop);
  let Eb = 0, n2 = 0;
  for (const i of near) { const p = x.re[i] ** 2 + x.im[i] ** 2; Eb += p * WELL.energies[i]; n2 += p; }
  Eb /= n2 || 1;
  const isNear = new Set(near);
  for (let i = 0; i < y.re.length; i++) if (!isNear.has(i) && (y.re[i] || y.im[i])) { const g = -1 / (WELL.energies[i] - Eb); x.re[i] = y.re[i] * g; x.im[i] = y.im[i] * g; }
  // The point moves in the same slowed time as the swings that are shown slowed.
  a.ptRate = fast ? Math.min(1, cap / Math.PI) : 1;
  void seen;
  return x;
}
// Terms the shader draws from a compiled wave (one or two per channel: real and imaginary parts).
function wellTerms(cw, amp = [1, 0], g = 0) {
  const out = [], maxW = cw.chans.length ? cw.chans[0].w : 1;
  for (const c of cw.chans) {
    if (c.w < 1e-5 * maxW) break;
    const mode = c.m === 0 ? 0 : c.m > 0 ? 1 : 2, norm = WL.angNorm(c.l, c.m);
    let ri = 0, ii = 0; for (let j = 0; j < c.tr.length; j++) { ri = Math.max(ri, Math.abs(c.tr[j])); ii = Math.max(ii, Math.abs(c.ti[j])); }
    if (ri > 1e-4 * (ri + ii)) out.push({ n: -1, l: c.l, m: c.m, mode, norm, c: [amp[0], amp[1]], g, table: c.tr });
    if (ii > 1e-4 * (ri + ii)) out.push({ n: -1, l: c.l, m: c.m, mode, norm, c: [-amp[1], amp[0]], g, table: c.ti });
  }
  return out;
}
// Mixes another standing wave (index b, amplitude w with phase ph) into the display amplitudes x.
function wellBlend(x, wFrom, b, wTo, ph) {
  const k = Math.sqrt(Math.max(0, wFrom)), out = { re: x.re.map(v => v * k), im: x.im.map(v => v * k) };
  const t = Math.sqrt(Math.max(0, wTo));
  out.re[b] += t * Math.cos(-ph); out.im[b] += t * Math.sin(-ph);
  return out;
}
// The cloud for one atom under gravity-well physics, and its point riding the wave.
// A held electron's spin axis (its wave's; random if the atom was made without one), and how far
// the spin term may carry the point round it per frame.
const spinOf = a => a.spin || (a.spin = randomDir());
const spinTurn = dtReal => 2 * Math.PI * 3 * Math.max(dtReal, 1 / 240);   // (3 = BLUR_HZ: slower than that the dot moves at its true rate; faster, the ring is drawn instead)
// When the real circling is faster than the eye can follow (more than BLUR_HZ turns per screen
// second) the point is drawn as what it would look like: a blurred ring along the loop it runs
// round, in place of the dot. The loop is retraced every few frames.
const BLUR_HZ = 3;
function spinRing(a) {
  if (!a.pt || !a.cw) return null;
  const every = phone.matches ? 12 : 6;
  if (!a.ring || a.ring.cw !== a.cw && S.frameN - a.ring.at >= 2 || S.frameN - a.ring.at >= every) {
    const L = WL.spinLoop(a.cw, a.pt, spinOf(a), phone.matches ? 24 : 36);
    a.ring = { ...L, cw: a.cw, at: S.frameN, hz: L.rate * AU_PER_FS * (S.fsRate || FS_PER_S) / (2 * Math.PI) };
  }
  // (a lop-sided or mixed cloud's loop is not a clean ring at this resolution; there the dot is kept, moving at up to BLUR_HZ turns a second)
  return a.ring.hz > BLUR_HZ && a.ring.clean ? a.ring : null;
}
function drawBoundPoints(glows) {
  for (const a of S.atoms) {
    if (!a.pt || a.capt) continue;
    const ring = spinRing(a), s = spinOf(a), col = [0.6, 0.8, 1.2];
    if (!ring) { glows.push({ pos: v3.add(a.p.pos, v3.scale(a.pt, P.A0)), size: 0.006, col }); continue; }
    // three loops side by side read as a soft tube
    const al = v3.dot(a.pt, s), ctr = v3.scale(s, al), at = (q, k) => v3.add(a.p.pos, v3.scale(v3.add(ctr, v3.scale(v3.sub(q, ctr), k)), P.A0));
    for (const [k, alpha] of [[0.93, 0.22], [1, 0.6], [1.07, 0.22]]) for (let i = 1; i < ring.pts.length; i++) lines.seg(at(ring.pts[i - 1], k), at(ring.pts[i], k), col, alpha * Math.min(1, a.fade * 3));
  }
}
function wellCloud(a, dtReal) {
  // A settled cloud changes slowly: rebuild it every few frames (the point still moves every frame).
  const morphing = a.capt || a.trans || (a.emitL && a.pending);
  S.frameN = (S.frameN || 0);
  if (a.cloud && !morphing && S.frameN - a.cloudAt < (phone.matches ? 3 : 2) && a.cloudKey === a.wvKey) {
    if (a.pt && a.cw) WL.rideCompiled(a.cw, a.pt, (a.ptFs || 0) * AU_PER_FS * (a.ptRate || 1), phone.matches ? 40 : 80, spinOf(a), spinTurn(dtReal));
    a.ptFs = 0;
    a.cloud.pos = a.p.pos; a.cloud.fade = Math.min(1, a.fade * 3);
    return a.cloud;
  }
  let x = wellDisplay(a, dtReal * (a.cloud ? S.frameN - a.cloudAt : 1)), extra = null;
  const twoTo = (to, w, ph) => { const b = to.idx != null ? to.idx : WELL.index(to.n, to.l, to.m); extra = b; return wellBlend(x, w, b, 1 - w, ph); };
  let free = null, freeT = null;
  if (a.capt) {
    const u = Math.min(1, a.capt.t / FALL_DUR), sm = u * u * (3 - 2 * u), ph = a.capt.phase || 0;
    free = a.capt.free; freeT = freeTerm(a.capt, [Math.sqrt(1 - sm), 0]);
    x = { re: x.re.map(v => v * Math.sqrt(sm)), im: x.im.map(v => v * Math.sqrt(sm)) };
    const c = Math.cos(-ph), sn = Math.sin(-ph);
    for (let i = 0; i < x.re.length; i++) { const r = x.re[i], m = x.im[i]; x.re[i] = r * c - m * sn; x.im[i] = r * sn + m * c; }
  } else if (a.trans) {
    const u = Math.min(1, a.trans.t / a.trans.dur), s0 = a.trans.s0 || 0, sm = s0 + (1 - s0) * u * u * (3 - 2 * u);
    x = twoTo(a.trans.to, Math.cos(sm * Math.PI / 2) ** 2, a.phase);
  } else if (a.emitL && a.pending) {
    x = twoTo(a.pending.to, W.emitterShare(S.simFs - a.emitL.em.t0, a.emitL.em.tau), a.phase);
  }
  if (a.capt || a.trans || (a.emitL && a.pending)) { const w = cloudOmega(a); a.ptRate = w > 0 ? Math.min(1, capOmega(showHz()) / w) : 1; }
  const cw = WL.compileWave(WELL, x, 1e-8);
  // Brightness from the standing waves it is mostly made of.
  const sh = WL.shares(x).p;
  let pk = 0, iso = 0, wsum = 0, reach = 3;
  for (let i = 0; i < sh.length; i++) if (sh[i] > 0.02) { const st = WL.stateStats(WELL, i); pk += sh[i] * st.peak; iso += sh[i] * st.iso; wsum += sh[i]; reach = Math.max(reach, st.reach); }
  pk /= wsum || 1; iso /= wsum || 1;
  if (extra != null) reach = Math.max(reach, WL.stateStats(WELL, extra).reach);
  const terms = wellTerms(cw).slice(0, freeT ? MAX_WELL_TERMS - 1 : MAX_WELL_TERMS);
  if (freeT) terms.unshift(freeT);
  // The point: placed by the Born rule once the electron has settled in, then carried by the wave.
  if (!a.capt) {
    if (!a.pt) a.pt = WL.sampleCompiled(cw, Math.max(1.5, 0.6 * reach));
    else WL.rideCompiled(cw, a.pt, (a.ptFs || 0) * AU_PER_FS * (a.ptRate || 1), phone.matches ? 60 : 120, spinOf(a), spinTurn(dtReal * (a.cloud ? S.frameN - a.cloudAt : 1)));
  }
  a.ptFs = 0;
  const radius = Math.max(Math.min(reach * 1.1, WELL.R), free ? free.rmax : 0) * P.A0;
  a.cw = cw; a.cloudAt = S.frameN; a.cloudKey = a.wvKey;
  return (a.cloud = { pos: a.p.pos, radius, frame: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], terms, free, trmax: WELL.R, invMax: 1 / (pk || 1), iso: iso / (pk || 1), fade: Math.min(1, a.fade * 3) });
}
const MAX_WELL_TERMS = phone.matches ? 6 : 10;   // fewer shapes per cloud on phones: the strongest ones
// An atom sharing an excitation with others: its two parts belong to different joint states of
// the group, so their densities add (group 1), as in classic physics.
function wellMixCloud(a) {
  const w = Math.max(0, Math.min(1, a.mix.w)), Wd = wellAlphabet();
  const ia = a.st.idx ?? Wd.index(a.st.n, a.st.l, a.st.m), ib = a.mix.st.idx ?? Wd.index(a.mix.st.n, a.mix.st.l, a.mix.st.m);
  const A = WL.compileWave(Wd, WL.waveFromIndex(Wd, ia).s), B = WL.compileWave(Wd, WL.waveFromIndex(Wd, ib).s);
  const terms = [...wellTerms(A, [Math.sqrt(1 - w), 0], 0), ...wellTerms(B, [Math.sqrt(w), 0], 1)].slice(0, MAX_WELL_TERMS);
  const sa = WL.stateStats(Wd, ia), sb = WL.stateStats(Wd, ib), pk = (1 - w) * sa.peak + w * sb.peak, iso = (1 - w) * sa.iso + w * sb.iso;
  const reach = w > 0.05 ? Math.max(sa.reach, sb.reach) : sa.reach;
  return { pos: a.p.pos, radius: Math.min(reach * 1.1, Wd.R) * P.A0, frame: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], terms, free: null, trmax: Wd.R, invMax: 1 / pk, iso: iso / pk, fade: Math.min(1, a.fade * 3) };
}
// Light leaves as Maxwell's equations say it does (light.js): an atom changing level swings its
// charge like a tiny antenna, and the exact field of that swing spreads out at the speed of light,
// at the light's real wavelength. A swing along an axis (Δm = 0) sends most light out sideways
// (sin²θ); one turning in a circle (Δm = ±1) sends (1 + cos²θ)/2.
// The photon itself (pilot-wave view): a particle that rides the wave along one straight path at c,
// its direction drawn from the wave's brightness. Only where it goes can it be taken: by an atom
// whose target its path runs through, or else by the wall, where the spectrometer records it.
// When it is taken, the swing that sent it stops and the rest of the wave, now empty, runs out.
const randomDir = () => { const th = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, rr = Math.sqrt(1 - z * z); return [rr * Math.cos(th), z, rr * Math.sin(th)]; };
const lifetimeFs = tauNs => tauNs * 1e6 / DECAY_BOOST;   // a real lifetime on the game's clock
// Starts a light wave. launchIn: fs until the photon leaves (0 = now, Infinity = when told to).
// tau: how long the swing lasts (fs). from: the atom sending it.
// vis: how much of the light is inside the system at once, which sets how bright its wave is drawn.
// A long-lived level sends a wave packet c·τ long (48 cm for 2p), so only a sliver of it is ever
// inside the 80 nm system: its wave is real but far too faint to see, and is drawn that faint.
const lightVis = tauFs => (Number.isFinite(tauFs) && tauFs > 0 ? Math.min(1, 3 * (2 * P.SPHERE_R / P.C) / tauFs) : 1);
function startLight({ pos, lam, pattern = 'lin', axis = randomDir(), from = null, show = LIGHT_SHOW, tau = lam / P.C, launchIn = 0, emitter = null, gain = 1, visTau = tau }) {
  if (pattern === 'iso') { pattern = 'lin'; axis = randomDir(); }   // two-photon light: no single axis, a random one stands in
  const em = W.makeEmission({ src: pos, lam, pattern, axis, t0: S.simFs, tau, gain });
  const L = { em, lam, E: P.HC / lam, pattern, col: photonColor(lam), from, emitter, show, slowFlight: lightSlow(show), tLaunch: S.simFs + launchIn,
    launched: false, caught: false, age: 0, vis: lightVis(visTau), quick: show === LIGHT_QUICK, maxR: v3.len(pos) + P.SPHERE_R };
  S.light.push(L);
  if (launchIn <= 0) launchPhoton(L);
  return L;
}
// The one-call form: a photon that leaves at once (capture, 2s's two photons). Returns its direction.
function emitPhoton(pos, lam, pattern = 'lin', axis = randomDir(), from = null, show = LIGHT_SHOW) {
  return startLight({ pos, lam, pattern, axis, from, show }).dir;
}
// A direction drawn from the swing's radiation pattern (times `extra(dir)` ≤ extraMax, if given).
function patternDir(pattern, axis, extra = null, extraMax = 1) {
  let dir;
  do dir = randomDir(); while (Math.random() * extraMax > W.patternI(pattern, v3.dot(dir, axis)) * (extra ? extra(dir) : 1));
  return dir;
}
// The photon leaves: its direction is drawn from the pattern (unless given), and what it will run
// into is settled now, from where the atoms are (they barely move while light crosses the system).
function launchPhoton(L, dir = patternDir(L.pattern, L.em.axis)) {
  const pos = L.em.src;
  const b = v3.dot(pos, dir), c = v3.dot(pos, pos) - P.SPHERE_R ** 2;
  L.dir = dir; L.launched = true; L.tLaunch = S.simFs;
  L.exitAt = -b + Math.sqrt(Math.max(0, b * b - c));   // distance to the wall along its path
  L.exitPt = v3.add(pos, v3.scale(dir, L.exitAt));
  L.target = planTarget(L);
  S.slow = Math.min(S.slow, L.slowFlight);   // slow everything at once, so the photon can be followed
  if (L.emitter) L.emitter.onLaunch(L);
  if (!S.dotSaid && S.pilot) {
    S.dotSaid = true;
    log('The bright point is the photon itself, riding its wave (pilot-wave view, P to hide it). The wave went everywhere; the photon goes one way, and only what it runs into can take it.');
  }
}

// ---------------------------------------------------------------------------
// Light meeting atoms.
// - Lyman light (121.6, 102.6, 97.3 nm) is exactly the colour that lifts a 1s electron to 2p, 3p or
//   4p, so resting 1s atoms answer it strongly. The whole system is smaller than that light's
//   wavelength, so there is no "photon flying from one atom to the next" in here: the atoms'
//   electric fields couple them directly, and they share the excitation (see "Atoms sharing one
//   excitation" below, which handles every 1s atom in the system, near or far). By the time a
//   Lyman photon leaves, the atoms have had their chance at it.
// - Any photon with more energy than an atom's electron is bound by (13.6 eV from 1s, 3.4 from
//   n = 2, 1.5 from n = 3, 0.85 from n = 4) can knock it free. The photon rides out along one
//   straight path (pilot-wave view); an atom takes it when the path runs through the atom's
//   target, a cone of solid angle σ/R² around the direction to it. Averaged over paths that is
//   the wave picture's chance σ·w/(4πR²): target area σ times how bright the wave is that way
//   (w), spread over the sphere of radius R. The target area is tiny (about 0.0006 nm²), so on
//   one pass this is very rare. If nothing takes the photon, it is found at the wall.
// - Free electrons can't absorb light at all (they can't take its energy and its push together);
//   they only scatter it, about 100 million times less often than an atom absorbs it.
// - An electron faster than 10.2 eV can bump a 1s atom up to n = 2, and one faster than 13.6 eV
//   can knock its electron off (collisions, rate n·σ·v, on the rare-event clock).
// ---------------------------------------------------------------------------
const watched = a => S.cascade && S.cascade.atom === a;
// An atom can join in sharing an excitation or be hit by an electron only when it is resting in 1s.
const idle1s = a => !a.trans && !a.pending && !a.pair && !a.mix && a.st.n === 1 && a.fade >= 1 && !watched(a);
// Any atom sitting in a level (not mid-jump) can have its electron knocked off by strong enough light.
const resting = a => !a.trans && !a.pair && a.fade >= 1;
// An atom's chance of being ionized by this light, from where the light started (wave picture).
function lightChance(L, a) {
  const d = v3.sub(a.p.pos, L.em.src), r = v3.len(d);
  if (r < 0.05 || a === L.from || !resting(a)) return null;
  const sIon = P.photoionSigma(a.st.n, L.E);
  if (!sIon) return null;
  const u = v3.scale(d, 1 / r), w = W.patternI(L.pattern, v3.dot(u, L.em.axis)) / W.patternAvg(L.pattern);
  return { r, u, P: Math.min(0.5, sIon * w / (4 * Math.PI * r * r)) };
}
function planTarget(L) {
  const near = S.atoms.map(a => ({ a, c: lightChance(L, a) })).filter(o => o.c && o.c.r < L.exitAt).sort((x, y) => x.c.r - y.c.r);
  for (const { a, c } of near) if (W.inCone(L.dir, c.u, W.targetSolidAngle(c.P, c.u, L.em.axis, L.pattern))) return { a, r: c.r };
  return null;
}
// Each step: send photons whose time has come, and follow each photon along its path.
function updateLight(dt) {
  for (const L of S.light) {
    L.age += dt;
    if (L.caught) { L.gone = P.C * (S.simFs - L.em.tEnd) > L.maxR; continue; }   // found or called off: its wave runs out
    if (!L.launched) { if (S.simFs >= L.tLaunch) launchPhoton(L); else continue; }
    const s = P.C * (S.simFs - L.tLaunch);   // how far the photon has gone
    if (L.target && s >= L.target.r) {
      const a = L.target.a;
      L.endS = L.target.r; trackTrail(L);
      L.target = null;
      if (!S.atoms.includes(a) || !resting(a)) continue;   // it changed meanwhile (rare): the photon flies on
      catchPhoton(L);
      a.p.vel = v3.add(a.p.vel, v3.scale(L.dir, L.E / P.C / P.MP));   // the photon's push
      const n = a.st.n;
      if (a.emitL) {
        // It was sending light of its own: a photon already on its way flies on; one not yet sent never is.
        if (a.emitL.launched) a.emitL.emitter = null; else cancelLight(a.emitL);
        a.emitL = null; a.pending = null;
      }
      freeAtom(a, L.E - P.ionE(n), L.col);
      log(`H(${P.stateName(a.st)}) + ${L.lam.toFixed(1)} nm light → H⁺ + e⁻, with ${(L.E - P.ionE(n)).toFixed(2)} eV to spare.`, 'red');
      say(`The light knocked the electron off a hydrogen atom! ${n === 1 ? 'From 1s that takes at least 13.6 eV of ultraviolet' : `Up on step n = ${n} it only takes ${P.ionE(n).toFixed(1)} eV`}. Light can break atoms apart as well as come out of them. That proton is bare again.`);
    } else if (s >= L.exitAt) {
      L.endS = L.exitAt; trackTrail(L);
      // Not taken: it is found at the wall and leaves the system. The spectrometer records it.
      catchPhoton(L);
      S.spectrum.push({ lam: L.lam, t: S.time });
      S.lightOut++; S.lightOutE += L.E;
      S.flashes.push({ pos: L.exitPt, col: L.col.map(v => v * 0.6), t: 0, life: 0.6, size: 0.5 });
    }
  }
  S.light = S.light.filter(L => !L.gone);
}
// The photon has been found: the swing that sent it stops (its atom settles into the lower level).
function catchPhoton(L) {
  L.caught = true; L.em.tEnd = Math.min(L.em.tEnd, S.simFs);
  if (L.emitter) L.emitter.onCaught(L);
}
// A wave whose photon never leaves (its atom joined a group, lost its share, or was knocked apart).
function cancelLight(L) { L.caught = true; L.cancelled = true; L.em.tEnd = Math.min(L.em.tEnd, S.simFs); }
// Fast electrons hitting resting atoms: n = 2 excitation above 10.2 eV, ionization above 13.6 eV.
function atomPass(ev) {
  const { e, p, rp } = ev, a = S.atoms.find(x => x.p === p);
  const E = ev.E;
  if (!a || !idle1s(a) || E <= P.EXCITE_E) return;
  if (bareProtons().some(q => v3.len(v3.sub(q.pos, e.pos)) < 2)) return;   // falling past a proton, not its own speed
  if (Math.random() > P.impactChanceReal(E, rp)) return;
  const sEx = P.collExciteSigma(E), sIon = P.collIonSigma(E);
  if (Math.random() * (sEx + sIon) < sEx) {
    // The electron gives 10.2 eV to the atom's electron and is turned a little; the atom recoils.
    if (!P.inelasticScatter(e, p, P.EXCITE_E, P.impactAngle(E, P.EXCITE_E))) return;
    a.trans = { from: a.st, to: { n: 2, l: 1, m: 0 }, t: 0, dur: STEP_MORPH };
    a.reex = true;
    S.bumped++;
    if (S.bumped <= 2) log(`A fast electron (${E.toFixed(1)} eV) hit a hydrogen atom ${fmtNm(rp)} away and bumped it up to 2p, slowing down by 10.2 eV. The atom recoiled.`);
  } else {
    const left = E - P.RY, share = left * 0.5 * Math.random();   // the knocked-out electron usually leaves slow
    if (!P.inelasticScatter(e, p, P.RY + share, P.impactAngle(E, P.RY + share))) return;
    freeAtom(a, share, [0.4, 0.6, 1]);
    log(`A fast electron (${E.toFixed(1)} eV) knocked the electron off a hydrogen atom.`, 'red');
    if (S.ionized === 1) say('A fast electron smashed into a hydrogen atom and knocked its electron off. That proton is bare again.');
  }
}
// The atom comes apart: its proton is bare again and its electron flies off with `extra` eV.
function freeAtom(a, extra, col) {
  const p = a.p;
  S.atoms = S.atoms.filter(x => x !== a);
  S.oldSteps.push(...a.steps);
  p.q = 1; p.glow = 1;
  // The freed electron starts 0.5 nm out with the speed it needs to end up with `extra` far away.
  // The two are launched with opposite momenta, so the pair's total momentum is unchanged.
  const dir = randomDir(), r0 = 0.5, { vE, vP } = P.launchApart(p.vel, P.MP, P.ME, dir, extra, r0);
  p.m = P.MP; p.pol = null; p.dip = null; p.scr = null; p.vdw = null;
  addElectron(v3.add(p.pos, v3.scale(dir, r0)), vE, { freed: true, E: extra, born: S.time, spin: a.spin });
  p.vel = vP;
  S.ionized++;
  S.flashes.push({ pos: [...p.pos], col, t: 0, life: 1.2, size: 1.0 });
}
function photonColor(lam) {
  const c = P.lambdaRGB(lam), k = P.band(lam) === 'visible' ? 1 : 0.8;
  return c.map(x => x * k);
}
function capture(e, p, E, viaDisc = false) {
  // Locked shots: the pass's angular momentum (in units of ħ) picks the free wave's l, and light
  // changes l by one. An unaided shot came in through the equal-area disc, which stands for every
  // partial wave at once, so its orbital is drawn from all of them in proportion to their odds.
  const off = v3.sub(e.pos, p.pos), rel = v3.sub(e.vel, p.vel);
  const Lv = v3.scale(v3.cross(off, rel), P.ME / P.HBAR), Lh = v3.len(Lv);
  const pick = P.pickCaptureState(Math.max(E, 0.01), viaDisc ? null : Math.min(Lh, LOCK_LMAX));
  const lam = P.captureLambda(Math.max(E, 0), pick.n);
  e.active = false;
  S.ps = S.ps.filter(x => x !== e);
  p.q = 0;                                  // the pair is neutral now: only the atom's weak pulls (see physics.js)
  // The atom's axis: the field's line where there is a field (that is what mixes the shell), else
  // the pass's own spin axis. m: the pass's angular momentum about that axis, as far as l allows.
  const F0 = P.fieldAt(p.pos, S.ps);
  const axis = v3.len(F0) > FIELD_MIN ? v3.norm(F0) : Lh > 1e-6 ? v3.norm(Lv) : [0, 1, 0];
  const mAbs = Math.min(pick.l, Math.round(Math.abs(v3.dot(Lv, axis)))), m = mAbs && Math.random() < 0.5 ? -mAbs : mAbs;
  const st = { n: pick.n, l: pick.l, m };
  const atom = { p, st, axis, trans: null, fade: 0, beat: 0, waitFs: 0, hold: 0, pending: null, steps: [{ lam, kind: 'capture', from: null, to: st }], spin: e.spin || randomDir() };
  setPure(atom, st);
  // The capture itself: the free electron's wave (its l = pick.lIn part, solved at its energy) turns
  // into the orbital over FALL_DUR, one wave the whole way, sloshing at the light's frequency.
  atom.capt = { t: 0, lIn: pick.lIn, mIn: Math.sign(m) * Math.min(Math.abs(m), pick.lIn), free: Q.freeRadialTable(Math.max(E, 0.01), pick.lIn, extentBohr(st.n, 1)), w: 2 * Math.PI * P.C / lam };
  S.atoms.push(atom);
  // Momentum is kept: the atom moves on with the pair's shared momentum, minus the photon's kick.
  p.vel = v3.scale(v3.add(v3.scale(p.vel, P.MP), v3.scale(e.vel, P.ME)), 1 / (P.MP + P.ME));
  p.m = P.MP + P.ME;
  // The photon leaves from where the electron is when it is caught.
  const pdir = emitPhoton(e.pos, lam, 'lin', randomDir(), atom);
  p.vel = v3.sub(p.vel, v3.scale(pdir, (P.HC / lam) / P.C / P.MP));
  S.flashes.push({ pos: [...e.pos], col: [0.55, 0.6, 0.75], t: 0, life: 1.2, size: 0.8 });
  S.falling.push({ e, atom, off, t: 0 });
  S.lastPhoton = { lam, nLow: st.n, capture: true };
  log(`Captured into ${P.stateName(st)}: one ${lam.toFixed(1)} nm photon carries off ${(P.HC / lam).toFixed(2)} eV. ${describe(lam, st.n, true, true)}.`, 'hit');
  if (!viaDisc && (S.capSaid = (S.capSaid || 0) + 1) <= 3) log(`It swung past with angular momentum ${Lh.toFixed(1)} ħ, so its wave there was mostly l = ${pick.lIn} (${P.L_NAMES[pick.lIn]}). Light changes l by exactly one, so it could only land in ${[pick.lIn - 1, pick.lIn + 1].filter(x => x >= 0).map(x => P.L_NAMES[x]).join(' or ')} orbitals.`);
  if (WELLS && !S.wellSaid) { S.wellSaid = true; log('Gravity-well physics: from now on this electron is a wave worked out from Schrödinger\'s equation on the atom\'s own grid (its well), and every other charge in the system tilts and dents that well. In the pilot-wave view the small bright dot is the electron itself, carried along by its wave: in a settled orbital it sits still (de Broglie and Bohm\'s result), and while the wave sloshes it moves.'); }
  if (st.n === 1) log('Straight to 1s! That happens: a single ultraviolet photon, shorter than 91.2 nm, takes all the energy at once.', 'hit');
  scheduleDecay(atom);
  atom.hold += FALL_DUR;                    // let the electron settle in before the next step down
  S.cascade = { atom, start: S.time };
  S.autoCam = { atom, t: 0 };
  S.b2.captured = true;
  if (S.beat === 3) S.b3.caught++;
  say(st.n === 1
    ? 'Caught! This one went straight to the bottom step in one go, so a single ultraviolet flash carried off all the energy.'
    : `Caught! It landed in ${P.stateName(st)}. As things stand it would wait about ${fmtSpan(lifetimeFs(1 / (WELLS ? wellRateNs(atom) : hazardRates(atom).tot)) / (FS_PER_S * SPEEDS[S.speed]))} of play at this game speed before stepping down (nearby charges change that by blending its orbitals).`);
}
// ---------------------------------------------------------------------------
// Caught without light: an electron left in orbit (three-body capture)
// ---------------------------------------------------------------------------
// A lone electron arrives with energy to spare and can only stay by sending a photon, which a
// 10 fs pass almost never does. But when two electrons are near a proton together, one can shove
// the other: the shoved one leaves faster and the first is left without the energy to escape.
// No photon is needed. The motion code does this on its own (every charge pushes every other);
// what is added here is noticing it. An electron that has stayed bound to a bare proton (pair
// energy below zero) for one full turn of its orbit is caught: it becomes a wave in that proton's
// well, in the orbital nearest its energy and angular momentum, and counts as hydrogen.
// Simplified, flagged: until then it moves as a classical point; the wave it becomes is the one
// nearest orbital, where a real one would be a packet of several; the bubble holds true orbitals
// up to n = 7, so an orbit bound by less than 0.245 eV (wider than the bubble) keeps circling as
// a point until something knocks it deeper or free.
const ORBIT_MIN_BIND = 0.245;   // eV: halfway between n = 7 and n = 8
function updateOrbits() {
  for (const e of freeElectrons()) {
    if (e.gd) { e.orb = null; continue; }
    let p = null, d = Infinity;
    for (const q of bareProtons()) { const r = v3.len(v3.sub(e.pos, q.pos)); if (r < d) { d = r; p = q; } }
    if (!p) { e.orb = null; continue; }
    const off = v3.sub(e.pos, p.pos), rel = v3.sub(e.vel, p.vel);
    const E = 0.5 * P.ME * v3.dot(rel, rel) - P.KE / Math.max(d, 0.01);
    if (E >= 0) { e.orb = null; continue; }
    if (!e.orb || e.orb.p !== p) e.orb = { p, since: S.simFs };
    const a = P.KE / (2 * -E), T = 2 * Math.PI * Math.sqrt(a * a * a * P.ME / P.KE);   // the orbit's size (nm) and one turn (fs)
    e.orb.E = E; e.orb.T = T;
    if (S.simFs - e.orb.since < T) continue;
    const nMax = WELLS ? 7 : Q.NMAX;
    if (-E < (WELLS ? ORBIT_MIN_BIND : P.RY / ((nMax + 0.5) ** 2))) {
      if (!S.wideSaid) { S.wideSaid = true; log(`An electron is circling a proton, bound by only ${(-E).toFixed(2)} eV: another electron carried off its spare energy. Its orbit is wider than the game follows as a wave, so it stays a point until something knocks it deeper or free.`); }
      continue;
    }
    if (WELLS) {
      // If the other charges have the rim below this orbit, the well would spill it straight back out.
      const ch = [];
      for (const c of S.ps) if (c.active && c.q && c !== p && c !== e) ch.push({ rel: v3.scale(v3.sub(c.pos, p.pos), 1 / WL.A0_NM), q: c.q });
      if (ch.length && Math.min(...WL.edgeLip(wellAlphabet(), ch).rim) < E / WL.HARTREE + 0.0005) continue;
    }
    catchOrbit(e, p, E, v3.scale(v3.cross(off, rel), P.ME / P.HBAR));
  }
}
function catchOrbit(e, p, E, Lv) {
  const Lh = v3.len(Lv), nMax = WELLS ? 7 : Q.NMAX;
  const n = Math.max(1, Math.min(nMax, Math.round(Math.sqrt(P.RY / -E))));
  const lTop = Math.min(n - 1, WELLS ? wellAlphabet().LMAX : n - 1), l = Math.max(0, Math.min(lTop, Math.round(Lh - 0.5)));
  const axis = Lh > 1e-6 ? v3.norm(Lv) : [0, 1, 0], st = { n, l, m: l };   // turning about its orbit's own axis
  e.active = false;
  S.ps = S.ps.filter(x => x !== e);
  p.q = 0;
  const atom = { p, st, axis, trans: null, fade: 0, beat: 0, waitFs: 0, hold: 0, pending: null, steps: [], capt: null, spin: e.spin || randomDir() };
  setPure(atom, st);
  S.atoms.push(atom);
  p.vel = v3.scale(v3.add(v3.scale(p.vel, P.MP), v3.scale(e.vel, P.ME)), 1 / (P.MP + P.ME));
  p.m = P.MP + P.ME;
  S.flashes.push({ pos: [...e.pos], col: [0.45, 0.6, 0.9], t: 0, life: 1.2, size: 0.6 });
  scheduleDecay(atom);
  S.cascade = { atom, start: S.time };
  S.b2.captured = true; S.orbitCaught = (S.orbitCaught || 0) + 1;
  if (S.beat === 3) S.b3.caught++;
  if (e.spilled) { S.backIn = (S.backIn || 0) + 1; if (S.backIn <= 3 || S.backIn % 10 === 0) log(`An electron that had spilled out of an atom was drawn back in: it stayed in orbit for a full turn, bound by ${(-E).toFixed(2)} eV, so it is a wave again, in ${P.stateName(st)}.`, 'hit'); return; }
  log(`Caught without light: an electron stayed in orbit for a full turn, bound by ${(-E).toFixed(2)} eV with angular momentum ${Lh.toFixed(1)} ħ, so it is now a wave in ${P.stateName(st)}. Another electron carried off its spare energy (three-body capture); no photon was needed.`, 'hit');
  if (S.orbitCaught === 1) say(`You caught one without the lock-on, and without any light! Two electrons were near the proton together. One shoved the other away and was left without enough energy to escape. That is three-body capture, and it is how crowded places like a spark fill up with atoms. It settled into ${P.stateName(st)}, a wide, loosely held orbital.`);
}
// Steps down are driven by what causes them, moment by moment, never by a timer drawn in advance.
// What a nearby charge does is fully caused: its field, where it is right now, mixes the shell's
// orbitals (stepShell). What has no known trigger is the instant the photon leaves: that is a
// chance per moment, set by how much of each orbital is blended in right now (its share, averaged
// over the fast slosh) times that orbital's own rate. So a lone 2s atom (only the slow two-photon
// way out) just sits there; a passing electron blends in 2p while it is close, and the chance of a
// Lyman-α photon rises and falls with it.
function scheduleDecay(atom) {
  atom.pending = atom.st.n > 1 ? { hazard: true } : null;
  atom.hold = 0; atom.since = S.simFs; atom.alone = 0;
  if (atom.st.n === 2 && atom.st.l === 0 && (S.in2s = (S.in2s || 0) + 1) <= 2) log('2s can\'t give off a single photon by itself, so it stays put. A passing charge\'s electric field blends some 2p into it, and only while it does can one photon get out.');
}
// The rate (per ns) of a step down right now, from each orbital's share, and the shares.
function hazardRates(a) {
  const c = shellOf(a), ls = shellLs(a.st.n, a.st.m);
  const p = c.re.length > 1 ? Q.shellAverage(a.st.n, a.st.m, fieldAlong(a), c).p : [1];
  const rates = ls.map((l, i) => p[i] / P.DECAY[`${a.st.n},${l}`].tau);
  return { ls, p, rates, tot: rates.reduce((x, y) => x + y, 0) };
}
// One moment's chance of a step down. Returns the step if it happens now.
function hazardStep(a, dt, dtFs) {
  if (WELLS) {
    if (a.st.n === 2 && a.st.l === 0 && WL.shares(wellOf(a).s).p[a.st.idx ?? WELL.index(2, 0, 0)] > 0.999) {
      a.alone += dt;
      if (a.alone > 4 && !a.aloneSaid) {
        a.aloneSaid = true;
        say('This atom is resting in 2s, a round wave that can\'t give off a single photon by itself. Left alone it would wait about a tenth of a second, which for an atom is an age. A passing charge tilts its well, which blends in some 2p, and only then can one photon get out. Fire an electron past it.');
      }
    }
    const d = wellStep(a);
    if (d) a.waitFs = 0;
    return d;
  }
  const { ls, p, rates, tot } = hazardRates(a);
  if (a.st.n === 2 && p[0] > 0.999) {
    a.alone += dt;
    if (a.alone > 4 && !a.aloneSaid) {
      a.aloneSaid = true;
      say('This atom is resting in 2s, a round shape that can\'t give off a single photon by itself. Left alone it would wait about a tenth of a second, which for an atom is an age. A passing charge\'s electric field blends in some 2p, and only then can one photon get out. Fire an electron past it.');
    }
  }
  if (!(Math.random() < 1 - Math.exp(-tot * dtFs * DECAY_BOOST * 1e-6))) return null;
  const l = ls[P.pickWeighted(ls.map((_, k) => k), k => rates[k])];
  if (l !== a.st.l && (S.mixSaid = (S.mixSaid || 0) + 1) <= 2) log(`A nearby charge's electric field had blended ${P.stateName({ n: a.st.n, l })} into this ${P.stateName(a.st)} atom, and the light came out of that part.`);
  a.st = { ...a.st, l };
  const d = P.pickDecay(a.st);
  d.delayNs = (S.simFs - a.since) * DECAY_BOOST * 1e-6;
  if (!d.twoPhoton && a.st.n === 2 && p[0] > 0.01) { d.axis = v3.norm(P.fieldAt(a.p.pos, S.ps)); d.dm = 0; d.byField = true; }   // swinging along the field that blended it
  a.waitFs = 0;
  return d;
}
// ---------------------------------------------------------------------------
// Atoms sharing one excitation
// The system is smaller than a wavelength of Lyman light, so an atom in 2p, 3p or 4p doesn't just
// sit there until it radiates: its electric field couples it to every resting 1s atom in the
// system, strongly to close ones (inside λ/2π, about 19 nm for Lyman-α), weakly to far ones. The
// excitation is then shared by the whole group. It swings between close atoms and is passed
// around, smoothly, for as long as nothing disturbs it. What is drawn is each atom's share: how
// much of the p shape its cloud has, and how strongly its own little antenna swings.
// Meanwhile the group's light leaves faster when the atoms' waves are in step (they flash
// together: superradiance) and far slower when they are out of step, so what is left after a
// while is the out-of-step part: a steady shape spread over close atoms that can hardly radiate.
// It lasts until its photon finally gets out, or until a passing charge's electric field shifts
// one atom's level against the others' (the Stark shift), which upsets the sharing and lets the
// light out. The maths is in physics.js (groupMatrix, groupPropagator): each atom's amplitude,
// every pair coupled, stepped exactly. Nothing here is capped or scripted.
// Simplified: one excitation per group (a second excited atom starts its own group with whatever
// resting atoms are left), the p orbital keeps its direction, and the field shift uses the field
// along the orbital's own axis.
// ---------------------------------------------------------------------------
const GROUND = { n: 1, l: 0, m: 0 };
const groupOf = a => a.pair;
function addMember(q, o, re = 0) {
  q.members.push(o); q.c.re = [...q.c.re, re]; q.c.im = [...q.c.im, 0]; q.w.push(re * re);
  o.pair = q; o.mix = { st: q.up, w: re * re };
}
function tryGroup(a) {
  const others = S.atoms.filter(o => o !== a && idle1s(o));
  if (!others.length) return false;
  const n = a.st.n, lam = P.lambdaFor(1, n);
  const dk = P.DECAY[`${n},1`], G = DECAY_BOOST * 1e-6 / dk.tau;   // decays per fs on the game's clock
  const q = { members: [], c: { re: [], im: [] }, w: [], lights: new Map(), up: { ...a.st }, lam, nearR: lam / (2 * Math.PI), G, Gr: G * dk.br.find(x => x[0] === 1)[2],
    u: Math.random(), age: 0, tFs: 0, slow: 1, reex: !!a.reex, col: photonColor(lam), since: a.since || S.simFs, first: a };
  a.pending = null; a.st = GROUND;
  addMember(q, a, 1);
  for (const o of others) addMember(q, o);
  S.pairs.push(q); S.paired++;
  const near = others.map(o => v3.len(v3.sub(o.p.pos, a.p.pos))).filter(r => r < q.nearR).sort((x, y) => x - y);
  if (S.paired <= 2) log(near.length
    ? `A ${P.stateName(q.up)} atom and ${near.length === 1 ? `a 1s neighbour ${near[0].toFixed(1)} nm away` : `${near.length} close 1s neighbours`} are sharing the excitation: inside ${q.nearR.toFixed(0)} nm their electric fields couple them strongly.`
    : `A ${P.stateName(q.up)} atom is sending Lyman light with ${others.length} resting atom${others.length === 1 ? '' : 's'} in the system: they are far off, so they take only a small share.`);
  stepGroup(q, 0, 0);   // sets the lights and the slow-motion at once, so the first swing isn't missed
  S.slow = Math.min(S.slow, q.slow, ...[...q.lights.values()].map(lightSlowNow));
  q.fresh = true;   // this frame's time step was set before the slow-down: the group starts on the next one
  return true;
}
const pOfUp = up => u => (up.m === 0 ? u[1] * u[1] : (1 - u[1] * u[1]) / 2);
const alongUp = (up, F) => (up.m === 0 ? Math.abs(F[1]) : Math.hypot(F[0], F[2]) / Math.SQRT2);
function groupModel(q) {
  const pos = q.members.map(a => a.p.pos), k = P.starkShift(q.up.n) / P.HBAR_NS * DECAY_BOOST * 1e-6;
  const D = q.members.map(a => k * alongUp(q.up, P.fieldAt(a.p.pos, S.ps)));
  const M = P.groupMatrix(pos, q.lam, { G: q.G, Gr: q.Gr, D, pOf: pOfUp(q.up), minR: PAIR_MIN_R });
  M.D = D; M.pos = pos;
  return M;
}
// One step for a group: resting atoms join, the amplitudes move on exactly, each member's cloud and
// antenna follow its share, and the photon leaves the moment the chance that it is still here
// (Σ|c|²) drops below the group's random draw (the usual quantum-jump method).
function stepGroup(q, dt, dtFs) {
  for (const o of S.atoms) if (idle1s(o) && nearestGroup(o) === q) addMember(q, o);
  const M = groupModel(q), N = M.N, SUB = 4;
  if (dtFs > 0) {
    const U = P.groupPropagator(M, dtFs / SUB);
    const acc = new Float64Array(N);
    let m = 0, out = false;
    for (let i = 0; i < SUB && !out; i++) {
      P.groupApply(U, q.c);
      for (let j = 0; j < N; j++) acc[j] += q.c.re[j] ** 2 + q.c.im[j] ** 2;
      m++;
      out = P.groupNorm(q.c) <= q.u;
    }
    if (out) {
      const n2 = P.groupNorm(q.c), other = (q.G - q.Gr) * n2, light = q.Gr * P.groupLightRate(M, q.c);
      endGroup(q, Math.random() * (other + light) < other ? 'other' : 'light', M);
      return;
    }
    q.tFs += dtFs; q.age += dt;
    const blur = 1 - Math.exp(-dt / PAIR_BLUR);
    for (let j = 0; j < N; j++) q.w[j] += (acc[j] / m - q.w[j]) * blur;
  }
  // The atom holding most, and the neighbour it is coupled to most strongly: their swinging sets the slow motion.
  let top = 0; for (let j = 1; j < N; j++) if (q.w[j] > q.w[top]) top = j;
  let mate = -1; for (let j = 0; j < N; j++) if (j !== top && (mate < 0 || Math.abs(M.J[top * N + j]) > Math.abs(M.J[top * N + mate]))) mate = j;
  q.top = top; q.mate = mate;
  const k = { G: q.G, Gr: q.Gr, J: M.J[top * N + mate] * q.Gr, F: M.F[top * N + mate], D: M.D[top] - M.D[mate] };
  groupSlow(q, k, P.pairStep([1, 0, 0, 0], 0, k));
  q.members.forEach((a, j) => {
    a.mix.w = q.w[j];
    // Each member's own antenna: a wave drawn with its share's size and phase.
    let L = q.lights.get(a);
    const amp = Math.hypot(q.c.re[j], q.c.im[j]);
    if (!L && amp > 0.15) {
      L = startLight({ pos: a.p.pos, lam: q.lam, pattern: q.up.m === 0 ? 'lin' : 'circ', axis: [0, 1, 0], from: a, show: q.reex ? LIGHT_QUICK : LIGHT_SHOW, tau: Infinity, launchIn: Infinity, gain: amp, visTau: 1 / q.G });
      L.em.t0 = q.since; L.group = q; L.showEmit = a === q.first && (!q.reex || S.emitShown < 2);
      q.lights.set(a, L);
    }
    if (L) {
      L.em.gain = amp; L.em.phase = Math.atan2(q.c.im[j], q.c.re[j]); L.em.src = [...a.p.pos];
      if (amp < 0.05) { cancelLight(L); q.lights.delete(a); }
    }
  });
  const { amp, left } = q;
  if (!S.pairSaid && amp > 0.3 && q.age > 0.5) {
    S.pairSaid = true;
    say(`Watch those atoms. They are closer together than the light's wavelength, so their electric fields couple them and they share the excitation: one cloud takes on the ${P.stateName(q.up)} shape as another gives it up, back and forth, and on to any other atom close by. No light has left. Everything is slowed so you can see the swings; they really take about a billionth of a second or less.`);
  }
  if (S.pairSaid && !S.darkSaid && amp > 0.3 && left < 0.1) {
    S.darkSaid = true;
    say('The swinging has settled. The close atoms now hold the excitation between them, and the light waves they would send out cancel each other, so almost none gets out. This shared shape lasts until the photon finally escapes or a passing charge disturbs it.');
  }
  if (!q.hinted && q.age > 25 && S.beat === 3 && acidLeft() === 0) {
    q.hinted = true;
    say('Some atoms are still sharing one excitation in a shape that can hardly radiate. Fire an electron past them: its electric field shifts one atom\'s level against the others\' and lets the light out.');
  }
}
// A resting atom joins the group whose busiest atom is nearest.
function nearestGroup(o) {
  let best = null, bd = Infinity;
  for (const q of S.pairs) {
    const t = q.members[q.top || 0], d = v3.len(v3.sub(t.p.pos, o.p.pos));
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
// How much swinging there is to see: its size (less when a field has shifted the two levels
// apart) times how much of the in-step share is still there. While it shows, the clock slows.
function groupSlow(q, k, om) {
  let amp = 4 * k.J * k.J / (k.D * k.D + 4 * k.J * k.J + 1e-30);
  const left = 1 / Math.cosh(Math.min(50, 2 * Math.abs(om.wi) * q.tFs));
  if (Math.abs(k.J) < 0.5 * q.G) amp = 0;   // far apart: the excitation leaves as light before it could swing across
  if (!q.shown && amp > 0.3) { q.shown = true; S.pairShown = (S.pairShown || 0) + 1; }
  const x = Math.max(0, Math.min(1, (amp * left - 0.05) / 0.25));
  const ease = Math.exp(Math.max(0, q.age - PAIR_HOLD[S.pairShown <= 2 ? 0 : 1]) / PAIR_EASE);
  const want = Math.min(1, 2 * Math.PI / PAIR_SWING * ease / (2 * Math.abs(om.wr) * FS_PER_S * SPEEDS[S.speed] + 1e-30));
  q.slow = 1 + (want - 1) * x * x * (3 - 2 * x);
  q.amp = amp; q.left = left;
}
function updateGroups(dt, dtFs) {
  for (const q of [...S.pairs]) { if (q.fresh) q.fresh = false; else stepGroup(q, dt, dtFs); }
}
// The sharing ends. 'light': the group's photon leaves and every atom is in 1s. 'other': the
// excitation steps down another way (3p or 4p to a lower level that isn't 1s), on the atom it is
// found on, by its share.
function endGroup(q, how, M) {
  S.pairs = S.pairs.filter(x => x !== q);
  const N = q.members.length, n2 = P.groupNorm(q.c);
  let r = Math.random() * n2, xi = 0;
  for (; xi < N - 1; xi++) { r -= q.c.re[xi] ** 2 + q.c.im[xi] ** 2; if (r <= 0) break; }
  const x = q.members[xi], realNs = (S.simFs - q.since) * DECAY_BOOST * 1e-6;
  for (const a of q.members) { a.pair = null; a.mix.fade = true; if (a !== x) a.reex = false; }
  let L = q.lights.get(x);
  for (const [a, l] of q.lights) if (l !== L) cancelLight(l);
  if (how === 'light') {
    // Where the photon goes: the atoms' waves add up in some directions and cancel in others.
    const pattern = q.up.m === 0 ? 'lin' : 'circ', sum = q.c.re.reduce((s, v, j) => s + Math.hypot(v, q.c.im[j]), 0);
    const dir = patternDir(pattern, [0, 1, 0], d => P.groupArrayFactor(M.pos, q.c, q.lam, d), sum * sum / n2);
    if (!L) { L = startLight({ pos: x.p.pos, lam: q.lam, pattern, axis: [0, 1, 0], from: x, show: q.reex ? LIGHT_QUICK : LIGHT_SHOW, tau: Infinity, launchIn: Infinity, gain: Math.hypot(q.c.re[xi], q.c.im[xi]), visTau: 1 / q.G }); }
    launchPhoton(L, dir);
    x.p.vel = v3.sub(x.p.vel, v3.scale(dir, (P.HC / q.lam) / P.C / P.MP));
    x.steps.push({ lam: [q.lam], from: q.up, to: GROUND, delayNs: realNs, reemit: q.reex });
    S.lastPhoton = { lam: q.lam, nLow: 1, extra: 0 };
    const rate = P.groupLightRate(M, q.c) / n2;
    if (!q.reex || S.paired <= 3) log(`${N > 2 ? `A group of ${N} atoms` : 'Two atoms'} let the shared photon go after ${realNs.toFixed(1)} ns${rate > 1.3 ? `, flashing together (${rate.toFixed(1)}× one atom's rate)` : rate < 0.5 ? ', after holding it back' : ''}: ${q.lam.toFixed(1)} nm ${describe(q.lam, 1)}`);
    if (rate > 1.5 && !S.flashSaid) { S.flashSaid = true; say('Those atoms just flashed together. Their little antennas were swinging in step, so their waves added up and the light left faster than any one atom could send it. Physicists call it superradiance.'); }
    x.reex = false;
    return;
  }
  if (L) cancelLight(L);
  x.st = q.up; x.reex = q.reex; x.since = q.since;
  x.mix = { st: GROUND, w: 1 - q.w[xi], fade: true };
  let d; do d = P.pickDecay(q.up); while (d.to.n === 1);
  d.delayNs = realNs; d.noShare = true;   // this step isn't Lyman light: nothing to share
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
// An atom in an upper level starts to swing at once (its cloud is part upper shape, part lower,
// beating at the light's frequency) and sends out the exact field of that swing. Its share in the
// upper level fades as exp(−t/τ). The photon leaves after the atom's sampled real lifetime (on the
// game's clock, not sped up), and when the photon is found the atom settles into the lower level.
function startEmission(a, d) {
  const lam = d.photons[0], tauNs = d.tauNs ?? P.DECAY[`${a.st.n},${a.st.l}`].tau;
  const quick = a.reex && !watched(a);
  a.emitL = startLight({ pos: a.p.pos, lam, pattern: d.dm === 0 ? 'lin' : 'circ', axis: d.axis || [0, 1, 0], from: a,
    show: quick ? LIGHT_QUICK : LIGHT_SHOW, tau: lifetimeFs(tauNs), launchIn: a.waitFs,
    emitter: {
      onLaunch: L => {
        // Each photon carries momentum hν/c, so the atom recoils (about 3 m/s for Lyman-α).
        a.p.vel = v3.sub(a.p.vel, v3.scale(L.dir, L.E / P.C / P.MP));
        stepDone(a, d);
      },
      onCaught: L => {
        if (a.emitL !== L || !S.atoms.includes(a)) return;
        const up = W.emitterShare(S.simFs - L.em.t0, L.em.tau);
        a.emitL = null; a.pending = null;
        a.trans = { from: a.st, to: d.to, t: 0, dur: SETTLE, s0: 2 / Math.PI * Math.asin(Math.sqrt(1 - up)), emit: L };
      },
    } });
  a.emitL.showEmit = !quick || S.emitShown < 2;
  a.emitT0 = S.simFs;
  S.slow = Math.min(S.slow, lightSlowNow(a.emitL));   // slow at once, so the first swings aren't missed
}
// The record and the log line for one step down.
function stepDone(a, d) {
  a.steps.push({ lam: d.photons, from: a.st, to: d.to, delayNs: d.delayNs, twoPhoton: d.twoPhoton, reemit: !!a.reex });
  const names = d.photons.map(l => `${l.toFixed(1)} nm ${d.twoPhoton ? P.classify(l).name : describe(l, d.to.n)}`).join(' + ');
  S.lastPhoton = { lam: d.photons[0], nLow: d.twoPhoton ? 0 : d.to.n, extra: d.photons.length - 1 };
  const when = d.twoPhoton ? `${(d.delayNs / 1e9).toFixed(2)} s` : `${d.delayNs.toFixed(1)} ns`;
  if (!a.reex || S.paired <= 3) log(`${P.stateName(a.st)} → ${P.stateName(d.to)} after ${when}${d.byField ? ', let go by a nearby charge\'s electric field' : ''}: ${names}`, d.photons.some(l => P.lineName(l) === 'H-α') ? 'red' : '');
}
// The frequency (rad/fs) the atom's cloud beats at: the light it is sending or answering.
function cloudOmega(a) {
  if (a.emitL) return a.emitL.em.w;
  if (a.trans) return 2 * Math.PI * P.C / P.lambdaFor(a.trans.from.n, a.trans.to.n);
  return 0;
}
function updateAtoms(dt, dtFs) {
  stepWells(dtFs);
  for (const a of S.atoms) {
    a.ptFs = (a.ptFs || 0) + dtFs;
    a.fade = Math.min(1, a.fade + dt / FALL_DUR);
    a.p.glow = Math.max(0, a.p.glow - dt / FALL_DUR);   // the electron's field cancels the proton's outside the atom
    // The cloud's swing between two levels: at its real frequency, or at the fastest that shows
    // without flicker (SWING_HZ on screen), so it is always one wave sloshing, never a blur of two.
    const cap = capOmega(showHz());
    a.phase = (a.phase || 0) + dtFs * Math.min(cloudOmega(a), cap);
    if (a.capt) { a.capt.t += dt; a.capt.phase = (a.capt.phase || 0) + dtFs * Math.min(a.capt.w, cap); if (a.capt.t >= FALL_DUR) a.capt = null; }
    if (!WELLS) stepShell(a, dt, dtFs);
    if (a.trans) {
      a.trans.t += dt;
      if (a.trans.t >= a.trans.dur) { setPure(a, a.trans.to); a.trans = null; if (a.st.n === 1) a.reex = false; scheduleDecay(a); }
      continue;
    }
    if (a.mix && a.mix.fade) { a.mix.w *= Math.exp(-dt * 4); if (a.mix.w < 0.01) a.mix = null; }
    if (a.pair || !a.pending) continue;
    if (a.st.l === 1 && a.st.n > 1 && a.st.n <= Q.NMAX && a.fade >= 1 && !a.pending.noShare && !(a.emitL && a.emitL.launched) && tryGroup(a)) {
      if (a.emitL) { cancelLight(a.emitL); a.emitL = null; }
      continue;
    }
    if (a.emitL) continue;                      // swinging; the photon leaves when its time comes
    a.hold -= dt;
    if (a.hold > 0 || a.fade < 1) continue;
    if (a.pending.hazard) { const h = hazardStep(a, dt, dtFs); if (!h) continue; a.pending = h; }
    const d = a.pending;
    if (d.twoPhoton) {
      // 2s left alone: two photons at once after its long wait (no single swing sends them).
      a.waitFs -= dtFs;
      if (a.waitFs > 0) continue;
      a.pending = null;
      for (const lam of d.photons) {
        const dir = emitPhoton(a.p.pos, lam, 'iso', randomDir(), a, LIGHT_SHOW);
        a.p.vel = v3.sub(a.p.vel, v3.scale(dir, (P.HC / lam) / P.C / P.MP));
      }
      stepDone(a, d);
      a.trans = { from: a.st, to: d.to, t: 0, dur: SETTLE };
      continue;
    }
    startEmission(a, d);
  }
  if (S.cascade) {
    const a = S.cascade.atom;
    if (!a.capt && a.fade >= 1 && !S.falling.length) {
      S.cascade = null; S.autoCam = null;
      say(a.st.n === 1
        ? 'You just made a hydrogen atom. Its electron is in 1s, the bottom step: it can\'t fall any further and never lands on the proton. 1s is the lowest energy an electron can have here.'
        : `You just made a hydrogen atom: neutral, with its electron in ${P.stateName(a.st)}. Higher orbitals are real and last a long time on an atom's scale (2p about 1.6 billionths of a second, which is hours at this clock), so it will most likely still be in ${P.stateName(a.st)} when you move on. When it does step down, each step comes out as light, and it stops at 1s.`);
      if (S.beat === 2 && !S.b2.lesson) { if (!S.b2.lessonAt) S.b2.lessonAt = S.time + 4; }
      else if (S.beat === 2 && !S.b2.nextAt) S.b2.nextAt = S.time + 7;   // time to read, then Acid Neutrality
    }
  }
  if (S.beat === 3 && !S.b3.doneAt && acidLeft() === 0 && !S.falling.length && S.atoms.every(a => !a.capt && a.fade >= 1)) {
    S.b3.doneAt = S.time;
    say(`Congratulations, you solved the system! The acid is neutral: every proton holds an electron. The energy each catch released left the system as light, ${S.lightOut} photons in all. That escaping light is why hydrogen out in space can stay neutral.`);
    setTimeout(showDone, 3000);
  }
}
const fmtC = K => `${Math.round((K - 273) / (K > 2000 ? 100 : 10)) * (K > 2000 ? 100 : 10)} °C`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function showDone() {
  const steps = [...S.oldSteps, ...S.atoms.flatMap(a => a.steps)].filter(s => !s.reemit);
  // Each kind of light on its own line, with the drops (orbital to orbital) that released it.
  const kinds = new Map();
  let total = 0;
  for (const st of steps) for (const l of [].concat(st.lam)) {
    total++;
    const c = P.classify(l);
    if (!kinds.has(c.name)) kinds.set(c.name, { lam: l, n: 0, drops: new Map() });
    const k = kinds.get(c.name); k.n++; k.lam = Math.min(k.lam, l);
    const drop = st.from ? `${P.stateName(st.from)} → ${P.stateName(st.to)}${st.twoPhoton ? ' (two photons)' : ''}` : `free electron caught into ${P.stateName(st.to)}`;
    k.drops.set(drop, (k.drops.get(drop) || 0) + 1);
  }
  $('doneTitle').textContent = 'Congratulations, you solved the system!';
  const extra = [S.paired ? ` Atoms shared an excitation ${S.paired} time${S.paired === 1 ? '' : 's'}.` : '',
    S.ionized ? ` Light and fast electrons knocked atoms apart ${S.ionized} time${S.ionized === 1 ? '' : 's'}.` : ''].join('');
  $('doneText').textContent = `It took ${S.shots} shot${S.shots === 1 ? '' : 's'} to make ${S.atoms.length} hydrogen atoms. On the way down they gave off ${total} photons; ${S.lightOut} left the system, carrying away ${S.lightOutE.toFixed(0)} eV.${extra}`;
  const list = $('doneKinds'); list.replaceChildren();
  for (const [name, k] of [...kinds].sort((a, b) => a[1].lam - b[1].lam)) {
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = `${name[0].toUpperCase()}${name.slice(1)} ×${k.n}`;
    li.append(b, `: ${[...k.drops].sort((a, b) => b[1] - a[1]).map(([d, m]) => m > 1 ? `${d} ×${m}` : d).join(', ')}`);
    list.append(li);
  }
  $('doneBox').hidden = false;
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------
function onPass(ev) {
  const { e, p, rp } = ev;
  if (ev.atom) { atomPass(ev); return; }
  if (p.q !== 1) return;
  e.passes++;
  const E = Math.max(ev.E, 0.01);
  const off = v3.sub(e.pos, p.pos), rel = v3.sub(e.vel, p.vel);
  const Lv = v3.scale(v3.cross(off, rel), P.ME / P.HBAR), L = v3.len(Lv);
  // Where the pass came in, seen along its path from far away: b = L·ƛ, in the plane square to it.
  const u = v3.norm(rel), bvec = v3.scale(v3.norm(v3.cross(u, Lv)), P.impactParameter(E, L));
  const locked = e.lock === p.id, disc = P.captureDiscRadius(E);
  const caught = locked || P.hitsCaptureDisc(E, L);
  if (locked) e.lock = null;   // the steering works once, on the pass it was aimed at
  const who = e.freed ? 'freed electron' : `shot ${e.shot}`;
  // A locked shot is steered in through the middle of the disc (the made-up part), so it is marked there.
  S.passes.unshift({ who, pass: e.passes, rp, E, L, b: locked ? 0 : v3.len(bvec), bvec: locked ? [0, 0, 0] : bvec, disc, locked, caught, p });
  S.passes.length = Math.min(S.passes.length, 4);
  renderPasses();
  if (caught) {
    if (!locked) log(`Shot ${e.shot || ''} came in through the disc on its own (${fmtPm(v3.len(bvec))} off-centre): odds of about ${fmtOdds(unaidedOdds(E, L, e.cone || 0.4, E + P.KE / 20))} for a shot like it.`, 'hit');
    capture(e, p, E, !locked);
    return;
  }
  // Only for shots fired fast (electrons can also be sped up by pushing on each other).
  if ((e.E || 0) > 3 && rp < 1.5 && !S.b2.tooFastSaid) { S.b2.tooFastSaid = true; log('Too fast to catch: the capture disc shrinks as electrons speed up. Try slower.'); }
}
function renderPasses() {
  $('passes').innerHTML = S.passes.length ? S.passes.map(p =>
    `<div class="${p.caught ? 'hit' : p.E > 3 ? 'fast' : 'miss'}">${p.who}${p.pass > 1 ? ` (pass ${p.pass})` : ''}: ${p.locked ? 'steered in through the middle of the' : `came in ${fmtPm(p.b)} off-centre,`} target ${fmtPm(2 * p.disc)} across · L ${p.L.toFixed(1)} ħ · ${p.caught ? (p.locked ? 'CAUGHT (lock-on)' : 'CAUGHT') : 'missed'}</div>`).join('')
    : '<div class="miss">No passes yet.</div>';
}
// Lengths from attometres to nanometres, for the capture target and the passes.
function fmtPm(nm) {
  const pm = nm * 1000;
  if (pm < 0.01) return `${(pm * 1000).toPrecision(2)} fm`;
  if (pm < 10) return `${pm.toPrecision(2)} pm`;
  if (pm < 1000) return `${Math.round(pm)} pm`;
  return `${nm.toFixed(nm < 10 ? 2 : 1)} nm`;
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
  for (const L of S.light) k = Math.min(k, lightSlowNow(L));       // light is being sent or is in flight
  if (S.falling.length) k = Math.min(k, EVENT_SLOW);               // an electron is settling in
  for (const a of S.atoms) {
    if (a.trans) k = Math.min(k, EVENT_SLOW);                      // an atom is changing shape
  }
  for (const q of S.pairs) k = Math.min(k, q.slow);                // atoms are swinging an excitation between them
  return k;
}
// While an atom is starting to swing, the clock slows until one swing takes EMIT_PERIOD screen
// seconds, holds there (longer the first two times), then eases back up, so the swing speeds up
// into a blur, just as for two atoms sharing an excitation. While the photon is in flight, light
// covers LIGHT_SHOW nm per screen second (LIGHT_QUICK for light from atoms bumped up by fast electrons).
function lightSlowNow(L) {
  if (L.launched && !L.caught) return L.slowFlight;
  if (L.launched || !L.showEmit || L.vis < 0.2) return 1;   // nothing visible to slow down for
  const want = (L.lam / P.C) / (EMIT_PERIOD * FS_PER_S * SPEEDS[S.speed]);
  const hold = L.quick ? 0 : EMIT_HOLD[S.emitShown < 2 ? 0 : 1];
  if (L.age > hold + 0.5 && !L.counted) { L.counted = true; S.emitShown++; }
  return Math.min(1, want * Math.exp(Math.max(0, L.age - hold) / EMIT_EASE));
}
function step(dtReal) {
  S.dtReal = dtReal;
  const dt = dtReal * SPEEDS[S.speed];
  S.time += dt;
  S.cooldown = Math.max(0, S.cooldown - dtReal);
  // Ease into slow motion quickly and back out gently, so a fly-by reads as one smooth swoop.
  const want = slowTarget(), rate = want < S.slow ? 10 : 1.5;
  S.slow += (want - S.slow) * (1 - Math.exp(-dtReal * rate));
  const dtFs = dt * FS_PER_S * S.slow;
  S.fsRate = dtReal > 0 ? dtFs / dtReal : FS_PER_S;   // game femtoseconds per screen second right now
  S.simFs += dtFs;
  for (const a of S.atoms) a.p.pol = P.atomPol(Math.max(1, a.st.n || 1));   // how strongly fields pull on each atom
  updateGuides();
  const res = P.stepCharges(S.ps, dtFs, S.enc);
  for (const ev of res.events) onPass(ev);
  spinCircle(dtFs);
  updateSpinPairs();
  updateOrbits();
  for (const e of freeElectrons()) {
    // Its wave's crests drift back through the packet at half the electron's speed (phase speed v/2),
    // capped at SWING_HZ crests per screen second so nothing flickers.
    const v = v3.len(e.vel), lam = 2 * Math.PI * P.reducedWavelength(Math.max(1e-3, 0.5 * P.ME * v * v));
    e.waveS = ((e.waveS || 0) + Math.min(0.5 * v * dtFs, SWING_HZ * lam * dtReal)) % lam;
    // A guided wave turns as e^{−iEt/ħ}: its crests move (capped at SWING_HZ per screen second).
    if (e.gd) e.gd.ph = (e.gd.ph + Math.min(e.gd.E / P.HBAR * dtFs, 2 * Math.PI * SWING_HZ * dtReal)) % (2 * Math.PI);
    e.trailT -= dt;
    if (e.trailT <= 0) { e.trailT = 0.04 * Math.max(S.slow, 0.15); e.trail.push([...e.pos]); if (e.trail.length > 90) e.trail.shift(); }
  }
  S.ps = S.ps.filter(x => x.active);
  for (const f of S.falling) f.t += dt;
  S.falling = S.falling.filter(f => f.t < FALL_DUR);
  updateAtoms(dt, dtFs);
  updateGroups(dt, dtFs);
  // Light: c × the real time that passed. Steps down: the same real time. Chance encounters: real odds.
  updateLight(dt);
  if (S.beat === 2 && S.b2.nextAt && S.time >= S.b2.nextAt) startBeat(3);
  if (S.beat === 2 && !S.b2.lesson && S.b2.lessonAt && S.time >= S.b2.lessonAt) giveLesson();
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
  if (e.code === 'KeyP') togglePilot();
  if (e.code === 'KeyL') toggleLock();
  if (e.code === 'KeyI') setTutorOpen($('tutor').classList.contains('collapsed'));
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
// Pilot-wave view (the default): each photon is drawn as a particle riding its wave as well as the
// wave itself. Off, only the wave is drawn. The physics is the same either way: in both, the photon
// is taken where its path runs.
function linesNote() {
  $('linesNote').textContent = S.pilot
    ? 'Pilot-wave view: each electron is a point riding its matter wave; near a proton the wave bends its path. Glow brightness follows the electric field (log scale, capped at the centre). P for field lines.'
    : 'Lines follow the electric field. Glow brightness follows its strength (log scale, capped at the centre).';
}
function togglePilot() {
  S.pilot = !S.pilot;
  linesNote();
  $('pilotBtn').setAttribute('aria-pressed', String(S.pilot));
  panelDirty();
}
$('pilotBtn').addEventListener('click', togglePilot);
$('dialDown').addEventListener('click', () => setDial(S.dial - 1));
$('dialUp').addEventListener('click', () => setDial(S.dial + 1));
$('fireBtn').addEventListener('click', fire);
$('skipBtn').addEventListener('click', () => startBeat(Math.min(3, S.beat + 1)));
$('restartBtn').addEventListener('click', restart);
$('againBtn').addEventListener('click', () => { $('doneBox').hidden = true; restart(); });
$('keepBtn').addEventListener('click', () => { $('doneBox').hidden = true; });
$('startBtn').addEventListener('click', () => { $('startBox').hidden = true; });
function setPhysics(wells) {
  WELLS = wells;
  try { localStorage.setItem(PHYS_KEY, wells ? 'wells' : 'classic'); } catch { /* private window */ }
  $('physWells').setAttribute('aria-pressed', String(wells)); $('physClassic').setAttribute('aria-pressed', String(!wells));
  if (S.atoms.length) restart();   // the two models keep different states: start the level again
  if (wells) setTimeout(wellAlphabet, 30);
}
$('physWells').addEventListener('click', () => setPhysics(true));
$('physClassic').addEventListener('click', () => setPhysics(false));
$('physWells').setAttribute('aria-pressed', String(WELLS)); $('physClassic').setAttribute('aria-pressed', String(!WELLS));
// Work out the wells' alphabet while the start card is up, so the first catch doesn't stall.
if (WELLS) setTimeout(wellAlphabet, 200);
$('startCalmBtn').addEventListener('click', () => { $('startBox').hidden = true; if (S.fieldView) toggleField(); });

function restart() {
  S = newState();
  cam.p = [0, 1.5, 24]; cam.v = [0, 0, 0]; cam.yaw = Math.PI; cam.pitch = -0.06;
  logLines.length = 0; $('logBox').innerHTML = '';
  renderPasses(); setDial(1); setSpeed(S.speed); startBeat(1);
  $('fieldBtn').setAttribute('aria-pressed', 'false');
  $('pilotBtn').setAttribute('aria-pressed', 'true'); linesNote();
  $('lockBtn').hidden = true; $('lockBtn').setAttribute('aria-pressed', 'true'); $('rateTag').hidden = true;
  panelDirty();
}

// ---------------------------------------------------------------------------
// HUD instruments
// ---------------------------------------------------------------------------
const spec = $('spectro'), sctx = spec.getContext('2d');
const LMIN = 60, LMAX = 8000;   // out to 7.5 µm: the Pfund-α line from n = 6
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
  const zones = [[LMIN, 'EUV'], [100, 'far UV'], [200, 'near UV'], [380, 'visible'], [750, 'near IR'], [1400, 'SWIR'], [3000, 'mid IR']];
  for (const [l0, name] of zones) {
    const x = l0 === LMIN ? 0 : lx(l0, W);
    sctx.fillStyle = 'rgba(214,226,238,.18)'; if (x > 0) sctx.fillRect(x, 0, 1, 30);
    sctx.fillStyle = 'rgba(214,226,238,.5)'; sctx.fillText(name, x + 8, 22);
  }
  sctx.fillStyle = 'rgba(214,226,238,.5)';
  for (const t of [100, 200, 500, 1000, 2000, 5000]) { const x = lx(t, W); sctx.fillRect(x, H - 20, 2, 6); sctx.fillText(`${t}`, x + 4, H - 22); }
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
  $('timeOut').textContent = `1 s = ${tf}${S.slow >= 0.9 ? '' : S.light.some(L => L.launched && !L.caught) ? ' · photon in flight, slowed' : S.pairs.some(q => q.slow < 0.9) ? ' · atoms sharing, slowed' : S.light.length ? ' · light being sent, slowed' : ' · slow motion'}`;
  $('physOut').textContent = WELLS
    ? `Physics: gravity wells${S.atoms.length ? ` · waves ${(S.wellMs || 0).toFixed(1)} ms/frame, up to ${S.wellNear || 0} standing waves mixed` : ''}`
    : 'Physics: classic shells';
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
    const Lk = S.lock, mine = Lk.target === a.target.p;
    ch.classList.toggle('on', Lk.locked && mine);
    const disc = `target ${fmtPm(2 * P.captureDiscRadius(a.E))} across`;
    if (Lk.locked && mine) {
      const sh = Object.entries(a.lands).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(100 * v)}%`).join(', ');
      $('aimOut').innerHTML = `<b style="color:var(--good)">LOCKED</b> · L ≈ ${a.L.toFixed(1)} ħ · lands: ${sh} <span class="fine">(real odds for this aim)</span>`;
    } else {
      const lk = lockReady() && Lk.on ? (a.L < LOCK_LMAX ? ` · locking ${Math.round(100 * (mine ? Lk.prog : 0))}%` : ' · too far off-centre to lock') : '';
      $('aimOut').innerHTML = `Aimed: L ≈ ${a.L.toFixed(1)} ħ · ${disc} · spread ±${fmtNm(a.cone)} · unaided ${fmtOdds(a.unaided)}${lk}`;
    }
  } else {
    ch.classList.remove('on');
    $('aimOut').innerHTML = `Not aimed at a proton · spread ±${fmtNm(a.cone)}`;
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
// How fast a swing at angular frequency w (rad/fs) looks on screen, in swings per second, and how
// much of it to draw as its average instead (0: as it is, 1: averaged). Fast swings are averaged so
// nothing flickers (photosensitivity); Glow view always shows the average.
const screenHz = w => w / (2 * Math.PI) * FS_PER_S * SPEEDS[S.speed] * S.slow;
const avgShare = w => (!S.fieldView ? 1 : Math.max(0, Math.min(1, (screenHz(w) - SWING_HZ) / (SWING_HZ_AVG - SWING_HZ))));
// The light's field, exactly (light.js), at its real wavelength.
// - A straight swing: its electric field lines, which lie in planes through the swing's axis, are
//   drawn in WAVE_PLANES of those planes (photon colour), and its magnetic field lines, which are
//   rings around the axis, in green, brighter where the field is stronger. Lines crowd where the
//   field is strong. Close in they loop from one end of the swing to the other (the near field);
//   for Lyman light, beyond about λ/4 loops break off and travel out (the radiation).
// - A circular swing: electric field lines followed out from the atom, in 3D; they wind into
//   spirals as the swing turns. Magnetic lines are followed round as loops.
// - Too fast to show (or Glow view): nested surfaces of equal average field strength, which don't
//   move, so the wave's shape and reach are seen without flicker.
const WAVE_PLANES = 6, PSI_STEP = 1 / 30, PSI_LEVELS = 9;
const inSystem = x => v3.dot(x, x) <= P.SPHERE_R * P.SPHERE_R;
// The lines are worked out again at most LIGHT_REDRAW times a second of wall time (often enough for
// swings of at most 1.2 per second; the averaged surfaces change only slowly) and replayed between.
const LIGHT_REDRAW = 20, MAX_DRAWN_LIGHTS = 4;
function lightLines(L) {
  const wall = performance.now(), every = avgShare(L.em.w) > 0.99 ? 250 : 1000 / LIGHT_REDRAW;   // the average hardly moves
  if (!L.cache || wall - L.cache.at >= every || L.cache.fv !== S.fieldView) {
    const tmp = new Lines();
    lightLinesNow(L, tmp);
    L.cache = { at: wall, data: tmp.data(), fv: S.fieldView };
  }
  lines.chunk(L.cache.data);
}
function lightLinesNow(L, out) {
  const { em } = L, t = S.simFs, avg = avgShare(em.w) * L.vis, now = (1 - avgShare(em.w)) * L.vis;
  if (L.vis < 0.01) return;
  if (C_LIGHT * (t - em.tEnd) > L.maxR) return;
  // In a group several antennas are drawn at once, so each gets fewer planes, and only the busiest its magnetic rings.
  const lead = !L.group || L.group.members[L.group.top || 0] === L.from;
  const planes = S.fieldView && !L.group ? WAVE_PLANES : 4, rMax = L.maxR;
  const place = (R, th, ph) => {
    const rad = v3.add(v3.scale(em.e1, Math.cos(ph)), v3.scale(em.e2, Math.sin(ph)));
    return v3.add(em.src, v3.add(v3.scale(em.axis, R * Math.cos(th)), v3.scale(rad, R * Math.sin(th))));
  };
  const drawSegs = (segs, col, alpha) => {
    for (let m = 0; m < planes; m++) {
      const ph = 2 * Math.PI * m / planes;
      for (const [R1, t1, R2, t2] of segs) {
        const a = place(R1, t1, ph), b = place(R2, t2, ph);
        if (inSystem(a) && inSystem(b)) out.seg(a, b, col, alpha * Math.min(1, R1 / 0.8));
      }
    }
  };
  if (now > 0.01) {
    if (L.pattern === 'lin') {
      const lv = []; for (let j = 1; j <= PSI_LEVELS; j++) lv.push(j * PSI_STEP, -j * PSI_STEP);
      drawSegs(W.contours((R, c) => W.psiLin(em, R, c, t), lv, { rMin: 0.3, rMax, nR: 60, nT: 40 }), L.col, 0.5 * now);
    } else circLines(L, t, now, out);
  }
  if (avg > 0.01) {
    // log of the cycle-averaged |E|² (exact for a steady swing: two looks a quarter cycle apart)
    const q = Math.PI / (2 * em.w);
    const f = (R, c) => {
      const s = Math.sqrt(Math.max(0, 1 - c * c)), x = v3.add(em.src, v3.add(v3.scale(em.axis, R * c), v3.scale(em.e1, R * s)));
      const E1 = W.field(em, x, t).E, E2 = W.field(em, x, t - q).E;
      const e2 = (v3.dot(E1, E1) + v3.dot(E2, E2)) / 2;
      return e2 > 0 ? Math.log10(e2) : -99;
    };
    const lv = []; for (let j = 1; j <= 10; j++) lv.push(-j);
    drawSegs(W.contours(f, lv, { rMin: 0.3, rMax, nR: 56, nT: 36 }), L.col, (S.fieldView ? 0.4 : 0.22) * avg);
  }
}
const C_LIGHT = P.C;
function place0(em, R, th, ph) {
  const rad = v3.add(v3.scale(em.e1, Math.cos(ph)), v3.scale(em.e2, Math.sin(ph)));
  return v3.add(em.src, v3.add(v3.scale(em.axis, R * Math.cos(th)), v3.scale(rad, R * Math.sin(th))));
}
// Circular swing: field lines followed out from a small sphere round the atom (where the field
// points outward), and magnetic loops through points at right angles to the swing's motion.
function circLines(L, t, k, out) {
  const { em } = L, src = em.src, opts = { src, inside: inSystem, maxSteps: 140 };
  const getE = x => W.field(em, x, t).E, getB = x => W.field(em, x, t).B;
  const N = S.fieldView ? 18 : 8, ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), u = [r * Math.cos(ga * i), z, r * Math.sin(ga * i)];
    const x0 = v3.add(src, v3.scale(u, 0.6)), E0 = getE(x0);
    if (v3.dot(E0, u) <= 0) continue;
    const pts = W.traceLine(getE, x0, opts);
    for (let j = 1; j < pts.length; j++) out.seg(pts[j - 1], pts[j], L.col, 0.55 * k);
  }
  if (!S.fieldView) return;
  const { pd } = W.dipole(em, t);
  const side = v3.len(pd) > 0 ? v3.norm(v3.cross(pd, em.axis)) : em.e1;
  for (const R of [2, 5, 10, 18, 28]) for (const sgn of [1, -1]) {
    const x0 = v3.add(src, v3.scale(side, sgn * R)), B0 = getB(x0);
    if (!v3.len(B0)) continue;
    const pts = W.traceLine(getB, x0, { ...opts, maxSteps: 120, closeTo: x0 });
    for (let j = 1; j < pts.length; j++) out.seg(pts[j - 1], pts[j], [0.36, 0.95, 0.6], 0.4 * k);
  }
}
// The photon's particle (pilot-wave view): a bright point riding its wave, with a short streak behind.
// The photon's path (pilot-wave view): light is far too fast to follow by eye, so the path it has
// flown is left as a trail that fades over TRAIL_S seconds of play. It is drawn the same whether
// the photon leaves through the wall or another atom takes it.
const TRAIL_S = 1, TRAIL_NEAR = 3;
function trackTrail(L) {
  if (!L.launched || L.trailDone) return;
  if (!L.trail) { L.trail = { pts: [{ pos: [...L.em.src], t: S.time }], col: L.col }; S.trails.push(L.trail); }
  const s = Math.min(P.C * (S.simFs - L.tLaunch), L.endS ?? Infinity);
  L.trail.pts.push({ pos: v3.add(L.em.src, v3.scale(L.dir, s)), t: S.time });
  if (L.endS !== undefined) L.trailDone = true;
}
function trailLines() {
  S.trails = S.trails.filter(tr => S.time - tr.pts[tr.pts.length - 1].t < TRAIL_S);
  if (!S.pilot) return;
  for (const tr of S.trails) for (let i = 1; i < tr.pts.length; i++) {
    const a = 1 - (S.time - tr.pts[i].t) / TRAIL_S;
    if (a > 0) lines.seg(tr.pts[i - 1].pos, tr.pts[i].pos, tr.col, 0.7 * a);
  }
}
function photonDot(L, glows) {
  if (!S.pilot || !L.launched || L.caught) return;
  const s = P.C * (S.simFs - L.tLaunch), at = v3.add(L.em.src, v3.scale(L.dir, s));
  glows.push({ pos: at, size: 0.14, col: L.col.map(c => c * 2.6) });
  const back = v3.add(L.em.src, v3.scale(L.dir, Math.max(0, s - 5)));
  lines.seg(back, at, L.col, 0.9);
}
// The aim path: where the electron would go around the aimed proton (that pair alone), and rings
// around the proton marking the angular momentum of a pass (in units of ħ). A shot whose line
// crosses ring l passes with L ≈ l + ½, mostly the partial wave l. Each ring's brightness is that
// wave's real chance of being caught, so the brightest ring is the best place to aim; the rings
// grow as the electron slows, because its wave (ƛ) gets wider.
// A tiny stroke font (digits, '.', n, m, p, µ) drawn as lines, so labels show in VR too.
const GLYPH = {
  0: [[0, 0, 1, 0], [1, 0, 1, 2], [1, 2, 0, 2], [0, 2, 0, 0]], 1: [[1, 0, 1, 2]], 2: [[0, 2, 1, 2], [1, 2, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0]],
  3: [[0, 2, 1, 2], [1, 2, 1, 0], [1, 0, 0, 0], [0, 1, 1, 1]], 4: [[0, 2, 0, 1], [0, 1, 1, 1], [1, 2, 1, 0]], 5: [[1, 2, 0, 2], [0, 2, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0]],
  6: [[1, 2, 0, 2], [0, 2, 0, 0], [0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1]], 7: [[0, 2, 1, 2], [1, 2, 1, 0]], 8: [[0, 0, 1, 0], [1, 0, 1, 2], [1, 2, 0, 2], [0, 2, 0, 0], [0, 1, 1, 1]],
  9: [[1, 1, 0, 1], [0, 1, 0, 2], [0, 2, 1, 2], [1, 2, 1, 0], [1, 0, 0, 0]], '.': [[0.4, 0, 0.6, 0]],
  n: [[0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0]], m: [[0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0], [0.5, 1, 0.5, 0]], p: [[0, -1, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0]],
};
function strokeText(str, at, h, col, alpha) {
  const B = camBasis(), w = 0.5 * h;
  let x = 0;
  for (const ch of str) {
    for (const [x1, y1, x2, y2] of GLYPH[ch] || []) {
      const p1 = v3.add(at, v3.add(v3.scale(B.r, (x + x1) * w), v3.scale(B.u, y1 * w)));
      const p2 = v3.add(at, v3.add(v3.scale(B.r, (x + x2) * w), v3.scale(B.u, y2 * w)));
      lines.seg(p1, p2, col, alpha);
    }
    x += ch === '.' ? 1 : ch === ' ' ? 0.8 : 1.6;
  }
}
const fmtLen = nm => (nm < 0.1 ? `${(nm * 1000).toFixed(0)} pm` : nm < 10 ? `${nm.toFixed(nm < 1 ? 2 : 1)} nm` : `${nm.toFixed(0)} nm`);
function aimPath(a) {
  if (!a.target || a.target.p.q !== 1 || !a.path) return;
  const pc = a.target.p.pos, dir = v3.norm(v3.sub(a.aimPoint, a.muzzle));
  const r0 = v3.len(v3.sub(a.muzzle, pc)), vL = P.electronSpeed(launchKE(a.E, r0)), vInf = P.electronSpeed(a.E);
  for (let i = 1; i < a.path.length; i++) lines.seg(a.path[i - 1], a.path[i], [0.6, 0.75, 1], 0.28);
  const T = Q.captureTable(a.E), P_l = T.map(row => row.reduce((s, z) => s + z.P, 0)), best = Math.max(...P_l);
  const e1 = v3.norm(v3.cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(dir, e1);
  const lb = P.reducedWavelength(a.E) * vInf / vL;   // the miss distance that gives one unit of L from here
  for (let l = 0; l < Math.min(5, P_l.length); l++) {
    const R = (l + 0.5) * lb, k = P_l[l] / best;
    if (!phone.matches || k === 1) {   // its diameter, beside the ring (phones: only the best ring)
      const B = camBasis(), d = v3.len(v3.sub(pc, B.p)), hgt = Math.min(1.5, Math.max(0.06, 0.018 * d));
      const at = v3.add(pc, v3.add(v3.scale(B.r, R * 0.72 + 0.2 * hgt), v3.scale(B.u, R * 0.72)));
      strokeText(fmtLen(2 * R), at, hgt, [0.36, 0.95, 0.6], 0.25 + 0.45 * k);
    }
    let q = null;
    for (let i = 0; i <= 48; i++) {
      const t = 2 * Math.PI * i / 48, pt = v3.add(pc, v3.add(v3.scale(e1, Math.cos(t) * R), v3.scale(e2, Math.sin(t) * R)));
      if (q) lines.seg(q, pt, [0.36, 0.95, 0.6], 0.06 + 0.4 * k);
      q = pt;
    }
  }
}
// The lock-on's reticle: four corners closing in on the target as the lock builds, green once locked.
function lockReticle() {
  const L = S.lock;
  if (!L.target || L.prog <= 0 || !lockReady()) return;
  const B = camBasis(), pc = L.target.pos, d = v3.len(v3.sub(pc, B.p)), s = (0.08 + 0.25 * (1 - L.prog)) * d;
  const col = L.locked ? [0.36, 0.95, 0.6] : [0.18, 0.89, 0.9], al = 0.35 + 0.5 * L.prog;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const c = v3.add(pc, v3.add(v3.scale(B.r, sx * s), v3.scale(B.u, sy * s)));
    lines.seg(c, v3.add(c, v3.scale(B.r, -sx * s * 0.35)), col, al);
    lines.seg(c, v3.add(c, v3.scale(B.u, -sy * s * 0.35)), col, al);
  }
}
function coneLines(a) {
  const ax = v3.norm(v3.sub(a.aimPoint, a.muzzle));
  const e1 = v3.norm(v3.cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(ax, e1);
  const col = S.lock.locked && a.target && a.target.p === S.lock.target ? [0.36, 0.95, 0.6] : [0.3, 0.5, 1];
  let prev = null;
  for (let i = 0; i <= 40; i++) {
    const t = 2 * Math.PI * i / 40, p = v3.add(a.aimPoint, v3.add(v3.scale(e1, Math.cos(t) * a.cone), v3.scale(e2, Math.sin(t) * a.cone)));
    if (prev) lines.seg(prev, p, col, 0.5);
    if (i % 10 === 0) lines.seg(v3.add(a.muzzle, v3.scale(ax, 1)), p, col, 0.12);
    prev = p;
  }
}

// The caught electron's point fades into the middle of its new cloud as its free wave becomes the
// orbital (the cloud shows the wave; the point is only where the electron was seen last).
function fallPos(f, t = f.t) {
  const x = Math.min(1, t / (0.5 * FALL_DUR)), s = x * x * (3 - 2 * x);
  return v3.add(f.atom.p.pos, v3.scale(f.off, 1 - s));
}
// Drawing resolution adapts to the device: when frames take too long (an electron cloud filling a
// phone's screen is the heaviest thing to draw), the picture is drawn with fewer pixels and fewer
// steps through each cloud, and it climbs back when there is time to spare.
let renderScale = 1, frameAvg = 16;
function adaptResolution(dtMs) {
  frameAvg += (dtMs - frameAvg) * 0.1;
  if (frameAvg > 45 && renderScale > 0.35) { renderScale = Math.max(0.35, renderScale * 0.85); frameAvg = 30; }
  else if (frameAvg < 20 && renderScale < 1) renderScale = Math.min(1, renderScale * 1.03);
}
const cloudSteps = () => Math.round((phone.matches ? 48 : 72) * Math.max(0.6, renderScale));
function flatViews() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5) * renderScale;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const B = flatBasis();
  const VP = M.multiply(M.perspective(cam.fov, w / h, 0.01, 500), M.viewFromBasis(B.p, B.r, B.u, B.f));
  return [{ viewport: [0, 0, w, h], camPos: B.p, VP, invVP: M.invert(VP) }];
}
function draw(views, panel) {
  if (!renderer) return;
  S.frameN = (S.frameN || 0) + 1;
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
    const g = Math.max(0, 1 - f.t / (0.5 * FALL_DUR));
    fallGlows.push({ pos, size: 0.008 + 0.012 * g, col: [0.45 * g, 0.65 * g, g] });
  }
  const clouds = S.atoms.map(a => {
    if (WELLS) return a.mix ? wellMixCloud(a) : wellCloud(a, S.dtReal || 1 / 60);
    // Every cloud is one electron's wave: a blend of orbitals (all of its shell, as the field mixes
    // them), centred on its proton. Between two levels it is the two shapes in one wave, sloshing at
    // the light's frequency (Schrödinger's equation: the slosh is what swings the charge).
    const two = (to, w, ph) => [...shellTerms(a, [Math.sqrt(w), 0]), termOf(to, [Math.sqrt(Math.max(0, 1 - w)) * Math.cos(-ph), Math.sqrt(Math.max(0, 1 - w)) * Math.sin(-ph)])];
    let terms, free = null, nMax = a.st.n;
    if (a.capt) {
      // Being caught: the free electron's wave near the proton turns smoothly into the orbital.
      const x = Math.min(1, a.capt.t / FALL_DUR), s = x * x * (3 - 2 * x), ph = a.capt.phase || 0;
      free = a.capt.free;
      terms = [freeTerm(a.capt, [Math.sqrt(1 - s), 0]), ...shellTerms(a, [Math.sqrt(s) * Math.cos(-ph), Math.sqrt(s) * Math.sin(-ph)])];
    } else if (a.trans) {
      const x = Math.min(1, a.trans.t / a.trans.dur), s0 = a.trans.s0 || 0, s = s0 + (1 - s0) * x * x * (3 - 2 * x);
      terms = two(a.trans.to, Math.cos(s * Math.PI / 2) ** 2, a.phase); nMax = Math.max(nMax, a.trans.to.n);
    } else if (a.emitL && a.pending) {
      terms = two(a.pending.to, W.emitterShare(S.simFs - a.emitL.em.t0, a.emitL.em.tau), a.phase); nMax = Math.max(nMax, a.pending.to.n);
    } else if (a.mix) {
      // Sharing an excitation with other atoms: this atom's electron is entangled with theirs, so its
      // two parts belong to different joint states and their densities add (group 1).
      const w = Math.max(0, Math.min(1, a.mix.w));
      terms = [termOf(a.st, [Math.sqrt(1 - w), 0]), termOf(a.mix.st, [Math.sqrt(w), 0], 1)];
      nMax = w > 0.05 ? Math.max(nMax, a.mix.st.n) : nMax;
    } else terms = shellTerms(a, [1, 0]);
    let wsum = 0, pk = 0, iso = 0;
    for (const t of terms) { const w = t.c[0] ** 2 + t.c[1] ** 2; wsum += w; pk += w * t.peak; iso += w * t.iso; }
    pk /= Math.max(wsum, 1e-9); iso /= Math.max(wsum, 1e-9);
    const radius = Math.max(extentBohr(nMax, 1), free ? free.rmax : 0) * P.A0;
    const c = { pos: a.p.pos, radius, frame: frameOf(a), terms, free, invMax: 1 / pk, iso: iso / pk, fade: Math.min(1, a.fade * 3) };
    // A 1s cloud has no partner in its shell, so a field only stretches it a little (second order):
    // a proton 1 nm away moves it about 1%. Past about 0.02 atomic units (a proton closer than
    // ~0.37 nm) the small-lean picture no longer holds: the electron starts to be shared by both
    // protons (H₂⁺), which comes with the H₂ work.
    if (a.st.n === 1 && terms.length === 1 && !a.capt) {
      const F = P.fieldAt(a.p.pos, S.ps), Fm = v3.len(F), k = Math.min(1 / P.EAU, LEAN_MAX_AU / Math.max(Fm, 1e-30));
      c.lean = [F[0] * k, F[1] * k, F[2] * k, 1];
    }
    return c;
  });
  if (WELLS) bondClouds(clouds);
  const glows = [];
  for (const p of S.ps) if (p.kind === 'proton' && p.active) glows.push({ pos: p.pos, size: 0.012, col: [1, 0.85, 0.6] });
  for (const e of freeElectrons()) glows.push({ pos: e.pos, size: 0.008, col: [0.45, 0.65, 1] });
  glows.push(...fallGlows);
  for (const f of S.flashes) {
    const x = f.t / f.life;
    glows.push({ pos: f.pos, size: f.size * (0.3 + Math.sqrt(x)) * 0.4, col: f.col.map(c => c * (1 - x) * 1.4) });
  }

  lines.begin();
  // Gravity-well physics, pilot-wave view: each bound electron's point riding its wave (a blurred ring when it circles too fast to follow).
  if (WELLS && S.pilot) drawBoundPoints(glows);
  if (S.fieldView && !S.pilot) fieldLines();   // the pilot-wave view shows matter waves instead
  for (const e of freeElectrons()) {
    // Its path only where it swings close by a proton (inside TRAIL_NEAR nm), where the pull bends it.
    const near = x => { let d = Infinity; for (const p of S.ps) if (p.kind === 'proton' && p.active) d = Math.min(d, v3.len(v3.sub(x, p.pos))); return Math.max(0, Math.min(1, (TRAIL_NEAR - d) / 1.5)); };
    const pts = [...e.trail, e.pos];
    for (let i = 1; i < pts.length; i++) { const k = near(pts[i]); if (k > 0) lines.seg(pts[i - 1], pts[i], [0.3, 0.5, 1], k * (0.08 + 0.4 * i / pts.length)); }
  }
  // (Near a proton the wave is not drawn: Steve asked for its flat slice of crests to go, 2026-11-15. The point and its trail show the path.)
  if (S.pilot) for (const e of freeElectrons()) if (!e.gd) electronWave(e);
  const strength = L => (L.launched && !L.caught ? 2 : 0) + W.envelope(L.em, Math.min(S.simFs, L.em.tEnd));
  for (const L of [...S.light].sort((x, y) => strength(y) - strength(x)).slice(0, MAX_DRAWN_LIGHTS)) lightLines(L);
  for (const L of S.light) { if (L.launched && !L.caught) trackTrail(L); photonDot(L, glows); }
  trailLines();
  for (const q of S.pairs) {   // strongly coupled atoms' electric fields: a faint link, brighter toward the atom holding more
    const t = q.members[q.top || 0], A = t.p.pos, wt = q.w[q.top || 0];
    q.members.forEach((m, j) => {
      if (m === t) return;
      const B = m.p.pos, ab = v3.sub(B, A), len = v3.len(ab);
      if (len > q.nearR) return;
      const wa = wt / (wt + q.w[j] + 1e-9), side = v3.norm(v3.cross(ab, Math.abs(ab[1]) < 0.9 * len ? [0, 1, 0] : [1, 0, 0]));
      let prev = null;
      for (let i = 0; i <= 48; i++) {
        const u = i / 48, w = Math.sin(u * Math.PI * 10 - S.time * 3) * 0.2 * Math.sin(Math.PI * u);
        const pt = v3.add(A, v3.add(v3.scale(ab, u), v3.scale(side, w)));
        if (prev) lines.seg(prev, pt, q.col, (0.08 + 0.3 * ((1 - u) * wa + u * (1 - wa))) * Math.min(1, 6 * (wt + q.w[j])) * (S.fieldView ? 1 : 0.6));
        prev = pt;
      }
    });
  }
  atomLabels(views[0].camPos);
  if (S.beat >= 2) { const ai = aimInfo(); coneLines(ai); aimPath(ai); lockReticle(); }
  if (xr.session && xr.aim) lines.seg(xr.aim.o, v3.add(xr.aim.o, v3.scale(xr.aim.d, 3)), [0.8, 0.9, 1], 0.5);

  renderer.draw({ views, panel, time: S.time, sphereR: P.SPHERE_R, steps: xr.session ? 72 : cloudSteps(), bohrPerUnit: 1 / P.A0, charges, clouds, glows, lines: lines.data() });
}

// ---------------------------------------------------------------------------
// The matter wave near a proton (pilot-wave dynamics, matterwave.js)
// ---------------------------------------------------------------------------
// Inside guideRadius of a bare proton, a free electron with enough energy to leave again is
// described by the exact Coulomb scattering wave for its energy and the direction it came in from,
// and its point moves with that wave's flow (de Broglie–Bohm). Outside, and for electrons bound
// to a proton (energy below zero), it moves by the forces as before. While guided, the other
// charges' pulls on it are left out (the wave is the one-proton solution).
function updateGuides() {
  for (const e of freeElectrons()) {
    let p = null, d = Infinity;
    for (const q of bareProtons()) { const r = v3.len(v3.sub(e.pos, q.pos)); if (r < d) { d = r; p = q; } }
    const g = e.gd;
    if (g) {
      const r = v3.len(v3.sub(e.pos, g.p.pos));
      if (g.p.q !== 1 || !g.p.active || r > g.R * 1.02) {
        // Leaving: keep the direction the wave gave it, at the speed its energy gives it here.
        const rel = v3.sub(e.vel, g.p.vel), sp = Math.sqrt(2 * Math.max(1e-6, g.E + P.KE / Math.max(r, 0.01)) / P.ME);
        const out = v3.add(g.p.vel, v3.scale(v3.norm(rel), sp));
        g.p.vel = v3.sub(g.p.vel, v3.scale(v3.sub(out, e.vel), P.ME / g.p.m));   // the proton takes the difference
        e.vel = out;
        e.gd = null; e.guide = null; e.guideP = null;
      }
      continue;
    }
    if (!p) continue;
    const rel = v3.sub(e.vel, p.vel), E = 0.5 * P.ME * v3.dot(rel, rel) - P.KE / Math.max(d, 0.01);
    if (E < 0.01) continue;
    const R = MW.guideRadius(E);
    if (d > R || v3.dot(v3.sub(e.pos, p.pos), rel) > 0) continue;   // only on the way in
    const gd = { p, E, R, u: v3.norm(rel), ph: 0, slice: null, sliceW: null };
    e.gd = gd; e.guideP = p;
    e.guide = pos => {
      const r = v3.sub(pos, gd.p.pos), rl = Math.max(v3.len(r), 0.005);
      const vmax = 3 * Math.sqrt(2 * (gd.E + P.KE / rl) / P.ME);   // the flow is fast only right at the wave's zeros
      const v = v3.add(gd.p.vel, MW.guideVelocity(gd.E, gd.u, r, vmax));
      // (the spin term of the guidance rule: the point is also carried round its spin axis wherever the wave's density changes)
      return e.spin ? v3.add(v, MW.spinVelocity(gd.E, gd.u, r, e.spin, vmax)) : v;
    };
  }
}
// Spin pairing. When two 1s atoms come close enough for their clouds to overlap (PAIR_R), their two
// electrons are found either paired (singlet) or not (triplet). The chance of paired is the real
// one for their two spin axes, (1 − ŝ₁·ŝ₂)/4: a quarter on average, a half for opposite axes, none
// for the same axis. It is rolled once per meeting. Paired, the two atoms feel the deep well
// worked out from their two 1s waves (physics.js heitlerLondon); unpaired, the push from the same
// waves. Two atoms that pair still fly apart again unless something else carries off the energy
// they gain falling together; if their energy does end up below zero they are an H₂ molecule.
// Departures, flagged: the roll stands in for the joint spin wave of the two electrons, which
// would settle it; an atom pairs with one partner only (both need the joint two-electron wave,
// which is beyond a phone). The shared cloud is drawn from the two 1s waves (bondClouds).
const PAIR_R = 0.6;   // nm
// A paired couple's shared cloud, worked out live from their two 1s waves at their distance right
// now (wells.js bondCloud): each atom's own cloud thinned by 1/(1 + S²), plus the part piled up
// between the protons, drawn as a third cloud about the midpoint. It reshapes as they move.
function bondClouds(clouds) {
  S.atoms.forEach((a, i) => {
    const q = a.p.paired, j = q ? S.atoms.findIndex(b => b.p === q) : -1;
    if (j <= i || a.st.n !== 1 || S.atoms[j].st.n !== 1 || !clouds[i] || !clouds[j]) return;
    const b = S.atoms[j], d = v3.sub(b.p.pos, a.p.pos), R = v3.len(d) / P.A0;
    if (R < 0.2) return;
    const rec = a.bond && Math.abs(a.bond.R - R) < 0.02 * R ? a.bond : (a.bond = { R, ...WL.bondCloud(R) });
    const y = v3.norm(d), x = v3.norm(v3.cross(y, Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), z = v3.cross(x, y);
    const st = WL.stateStats(WELL, WELL.index(1, 0, 0)), fade = Math.min(clouds[i].fade, clouds[j].fade);
    clouds[i] = { ...clouds[i], fade: clouds[i].fade * rec.thin }; clouds[j] = { ...clouds[j], fade: clouds[j].fade * rec.thin };
    clouds.push({ pos: v3.scale(v3.add(a.p.pos, b.p.pos), 0.5), radius: rec.rmax * P.A0, frame: [x, y, z], free: null, trmax: rec.rmax, invMax: 1 / (st.peak || 1), iso: st.iso / (st.peak || 1), fade,
      terms: rec.ls.map((l, k) => ({ n: -1, l, m: 0, mode: 0, norm: WL.angNorm(l, 0), c: [1, 0], g: 0, table: rec.tables[k] })) });
  });
}
function updateSpinPairs() {
  if (!WELLS) return;
  for (const p of S.ps) if (p.paired && (p.q || p.paired.q || !p.active || !p.paired.active)) { p.paired.paired = null; p.paired = null; }
  for (const a of S.atoms) a.p.hl = a.st.n === 1;
  const at = S.atoms.filter(a => a.st.n === 1 && !a.capt && !a.trans), meet = S.meet || (S.meet = new Map());
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) {
    const a = at[i], b = at[j], r = v3.len(v3.sub(a.p.pos, b.p.pos)), key = `${a.p.id}:${b.p.id}`, rec = meet.get(key);
    if (!rec) {
      if (r > PAIR_R) continue;
      const chance = P.singletChance(spinOf(a), spinOf(b)), paired = !a.p.paired && !b.p.paired && Math.random() < chance;
      meet.set(key, { paired, since: S.simFs, below: 0 });
      S.meetN = (S.meetN || 0) + 1;
      if (paired) { a.p.paired = b.p; b.p.paired = a.p; }
      if (S.meetN <= 4 || paired) log(paired
        ? `Two hydrogen atoms met and their electrons' spins paired (the chance for their two spin axes was ${Math.round(100 * chance)}%). Paired, the atoms pull each other hard, up to 3 eV. They stay together only if something carries that energy away.`
        : `Two hydrogen atoms met and their electrons' spins did not pair (the chance for their two spin axes was ${Math.round(100 * chance)}%), so they push each other apart.`, paired ? 'hit' : undefined);
      continue;
    }
    if (r > PAIR_R * 1.3) {
      if (rec.paired) { if (a.p.paired === b.p) { a.p.paired = null; b.p.paired = null; } if (!rec.bound) log('The paired atoms flew apart again: nothing took away the energy they gained falling together.'); }
      meet.delete(key); continue;
    }
    if (rec.paired && !rec.bound && a.p.paired === b.p) {
      const rv = v3.sub(a.p.vel, b.p.vel), mu = a.p.m * b.p.m / (a.p.m + b.p.m), E = 0.5 * mu * v3.dot(rv, rv) + P.singletEnergy(r);
      rec.below = E < -0.02 ? rec.below + 1 : 0;
      if (rec.below > 30 && S.simFs - rec.since > 40) {
        rec.bound = true; S.h2 = (S.h2 || 0) + 1;
        log(`H₂: two hydrogen atoms are now bound to each other by ${(-E).toFixed(2)} eV, their electrons' spins paired.`, 'hit');
        if (S.h2 === 1) say('You made a hydrogen molecule, H₂. Two atoms met with their electrons\' spins paired, which pulls them together, and something nearby carried off enough energy that they could not fly apart again.');
      }
    }
  }
}
// Spin, in free flight. The guidance rule's spin term, (ħ/2m)·∇ln ρ × ŝ, carries the point round
// the spin axis through the middle of its wave. For a packet whose density falls off as
// exp(−x²/σ²) that is a steady turning at ħ/(m·σ²), with σ the gun's spot (0.41 nm at 0.1 eV: one
// turn every 9 fs). With its forward motion the point's path is a corkscrew. The packet's middle
// is what the forces move (e.vel is its velocity); the point is e.pos = middle + e.so.
// Simplified, flagged: the packet is taken as round and of fixed width, and the axis is not turned
// by the level's magnetic fields (far too weak here to turn it in the time of a flight).
function spinCircle(dtFs) {
  for (const e of freeElectrons()) {
    if (!e.spin || !e.so || e.gd) continue;
    const sig = e.cone || 0.4, th = P.HBAR / (P.ME * sig * sig) * dtFs, s = e.spin, o = e.so;
    const c = Math.cos(th), sn = Math.sin(th), al = v3.dot(o, s), cr = v3.cross(s, o);
    const o2 = [0, 1, 2].map(i => o[i] * c + cr[i] * sn + s[i] * al * (1 - c));
    e.pos = v3.add(e.pos, v3.sub(o2, o)); e.so = o2;
  }
}
// The electron's wave in the pilot-wave view: crests square to its motion, one de Broglie wavelength
// apart (3.9 nm at 0.1 eV), as wide as the gun's spot, inside an envelope a couple of wavelengths
// long. The point (the electron itself) rides inside it. Drawn as the free wave; close to a proton
// the real wave bends round it, while the point's path there is computed from the forces.
function electronWave(e) {
  const mid = e.so ? v3.sub(e.pos, e.so) : e.pos;   // the wave's middle; the point sits e.so from it
  const v = v3.len(e.vel);
  if (v < 1e-6) return;
  const u = v3.scale(e.vel, 1 / v), KEk = 0.5 * P.ME * v * v, lam = 2 * Math.PI * P.reducedWavelength(Math.max(1e-3, KEk));
  const R = 2 * (e.cone || P.coneWidth(Math.max(0.01, e.E || 0.1), 20));
  const e1 = v3.norm(v3.cross(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(u, e1);
  const col = [0.4, 0.6, 1];
  for (let k = -2; k <= 2; k++) {
    const s0 = k * lam - (e.waveS || 0), env = Math.exp(-0.5 * (s0 / lam) ** 2);
    if (env < 0.05) continue;
    const c = v3.add(mid, v3.scale(u, s0)), r = R * (0.6 + 0.4 * env);
    let q = null;
    for (let i = 0; i <= 32; i++) {
      const t = 2 * Math.PI * i / 32, pt = v3.add(c, v3.add(v3.scale(e1, Math.cos(t) * r), v3.scale(e2, Math.sin(t) * r)));
      if (q) lines.seg(q, pt, col, 0.22 * env);
      q = pt;
    }
  }
}
// The Target window: the proton's capture target seen along the shot, at three zooms (1 nm, 10 pm,
// 0.01 pm across), each box the middle of the one before. Marks the gun's spread, where the aim
// would bring the shot in, and where the last passes came in.
const zc = $('zoom'), zctx = zc.getContext('2d');
function drawZoom() {
  const box = $('zoomBox');
  box.hidden = S.beat < 2;
  if (box.hidden || box.classList.contains('collapsed')) return;
  const g = zctx, Wc = zc.width, Hc = zc.height, n = 3, gap = 18, bw = (Wc - gap * (n - 1)) / n, top = 30, bh = Math.min(bw, Hc - top - 34);
  g.clearRect(0, 0, Wc, Hc);
  const a = aimInfo(), E = a.E, disc = P.captureDiscRadius(E), B = camBasis();
  const spans = [1, 0.01, 1e-5];   // nm across each box
  const proj = v => [v3.dot(v, B.r), v3.dot(v, B.u)];
  const font = s => `${s}px ui-monospace, Menlo, Consolas, monospace`;
  let aimB = null;
  if (a.target && a.Lvec && a.L !== undefined) {
    const dir = v3.norm(v3.sub(a.aimPoint, a.muzzle));
    aimB = S.lock.locked && S.lock.target === a.target.p ? [0, 0, 0] : v3.scale(v3.norm(v3.cross(dir, a.Lvec)), P.impactParameter(E, a.L));
  }
  for (let i = 0; i < n; i++) {
    const x0 = i * (bw + gap), y0 = top, span = spans[i], k = bw / span, cx = x0 + bw / 2, cy = y0 + bh / 2;
    const P2 = v => { const [x, y] = proj(v); return [cx + x * k, cy - y * k]; };
    g.save(); g.beginPath(); g.rect(x0, y0, bw, bh); g.clip();
    g.fillStyle = 'rgba(4,6,12,0.55)'; g.fillRect(x0, y0, bw, bh);
    // 1s cloud (106 pm across where 90% of it lies; the shading follows e^(−2r/a₀)).
    const r1s = 0.053 * k * 1.0;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, 2 * r1s));
    grd.addColorStop(0, 'rgba(120,170,255,0.55)'); grd.addColorStop(0.5, 'rgba(120,170,255,0.12)'); grd.addColorStop(1, 'rgba(120,170,255,0)');
    g.fillStyle = grd; g.fillRect(x0, y0, bw, bh);
    g.strokeStyle = 'rgba(159,191,255,0.6)'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, 0.053 * k, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
    // the gun's spread (1σ), in impact-parameter terms
    if (a.target && a.rp !== undefined) {
      const sb = a.cone * Math.sqrt(launchKE(E, v3.len(v3.sub(a.muzzle, a.target.p.pos))) / E);
      const c0 = aimB ? P2(aimB) : [cx, cy];
      g.strokeStyle = 'rgba(90,140,255,0.7)'; g.setLineDash([4, 4]); g.lineWidth = 1.5;
      g.beginPath(); g.arc(c0[0], c0[1], sb * k, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
    }
    // capture disc
    g.fillStyle = 'rgba(255,233,77,0.35)'; g.strokeStyle = 'rgba(255,233,77,0.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, Math.max(0.6, disc * k), 0, 2 * Math.PI); g.fill(); g.stroke();
    // proton (charge radius 0.84 fm)
    g.fillStyle = '#ffa02e'; g.beginPath(); g.arc(cx, cy, Math.max(0.5, 8.4e-7 * k), 0, 2 * Math.PI); g.fill();
    // passes and the aim
    for (const p of S.passes) {
      if (!p.bvec) continue;
      const [px, py] = P2(p.bvec);
      g.fillStyle = p.caught ? '#5cf29a' : 'rgba(214,226,238,0.85)';
      g.beginPath(); g.arc(px, py, 3, 0, 2 * Math.PI); g.fill();
    }
    if (aimB) {
      const [ax, ay] = P2(aimB);
      g.strokeStyle = S.lock.locked ? '#5cf29a' : '#2fe3e6'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(ax - 6, ay); g.lineTo(ax + 6, ay); g.moveTo(ax, ay - 6); g.lineTo(ax, ay + 6); g.stroke();
    }
    // where the next box zooms in
    if (i < n - 1) {
      const z = Math.max(3, spans[i + 1] * k / 2);
      g.strokeStyle = 'rgba(214,226,238,0.7)'; g.lineWidth = 1; g.strokeRect(cx - z, cy - z, 2 * z, 2 * z);
    }
    g.restore();
    g.strokeStyle = 'rgba(47,227,230,0.35)'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1);
    if (i < n - 1) {   // guide lines to the next box
      const z = Math.max(3, spans[i + 1] * k / 2), nx = x0 + bw + gap;
      g.strokeStyle = 'rgba(214,226,238,0.25)';
      g.beginPath(); g.moveTo(cx + z, cy - z); g.lineTo(nx, y0); g.moveTo(cx + z, cy + z); g.lineTo(nx, y0 + bh); g.stroke();
    }
    g.fillStyle = '#8a9db1'; g.font = font(20); g.textAlign = 'center';
    g.fillText(['1 nm wide', '10 pm wide', '0.01 pm wide'][i], cx, 21);
    g.fillStyle = ['#9fbfff', '#ffe94d', '#ffa02e'][i];
    g.font = font(19); g.fillText([`1s cloud 106 pm`, `disc ${fmtPm(2 * disc)}`, 'proton 0.0017 pm'][i], cx, y0 + bh + 24);
  }
  g.textAlign = 'left';
}
// A faint "H" beside every neutral atom, so the player connects the caught proton with hydrogen.
// Drawn as three strokes facing the viewer, sized with distance so it reads the same anywhere.
function atomLabels(eye) {
  const B = camBasis();
  for (const a of S.atoms) {
    const k = Math.min(1, a.fade || 0);
    if (k < 0.05 || a.capt) continue;
    const d = v3.len(v3.sub(a.p.pos, eye)), h = Math.min(4, Math.max(0.15, 0.04 * d));
    const c = v3.add(a.p.pos, v3.add(v3.scale(B.u, 0.25 * a.st.n * a.st.n + 1.1 * h), v3.scale(B.r, 0.6 * h)));
    const at = (x, y) => v3.add(c, v3.add(v3.scale(B.r, x * h), v3.scale(B.u, y * h)));
    const col = [0.75, 0.9, 1], al = 0.32 * k;
    lines.seg(at(-0.3, -0.5), at(-0.3, 0.5), col, al);
    lines.seg(at(0.3, -0.5), at(0.3, 0.5), col, al);
    lines.seg(at(-0.3, 0), at(0.3, 0), col, al);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  if (xr.session) return;   // the headset drives the loop while in VR
  const dtMs = now - last, dt = Math.min(0.05, Math.max(0, dtMs / 1000)); last = now;
  adaptResolution(dtMs);
  const paused = !$('startBox').hidden || !$('doneBox').hidden;
  fly(paused ? 0 : dt);
  if (!paused) { step(dt); updateLock(dt); }
  updateHud(); drawSpectro(); drawLadder(); drawZoom();
  draw(flatViews(), null);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// VR (WebXR). In the headset, 1 metre is drawn as 1 nanometre, so the sphere is 80 m across.
// Left stick: fly where you look. Right stick: turn (left/right) and rise or sink (up/down).
// Trigger: fire along the right controller. A/B: faster/slower electrons. X: Field/Glow view.
// The sticks fire thrusters: the ship keeps drifting until you brake (squeeze the left grip).
// Y: game speed. Left stick click: pilot-wave view on or off. Right stick click: atomic lock-on on or off.
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
      if (edge('LS', 3)) togglePilot();   // left stick click: pilot-wave view on/off
    } else {
      cam.yaw -= dz(ax[0]) * 1.5 * dt;
      move = v3.add(move, [0, -dz(ax[1]), 0]);
      if (edge('A', 4)) setDial(S.dial + 1);
      if (edge('B', 5)) setDial(S.dial - 1);
      if (edge('RS', 3)) toggleLock();   // right stick click: atomic lock-on on/off
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
  for (const p of S.passes.slice(0, 2)) y = wrap(g, `${p.who}: ${fmtPm(p.b)} off-centre, target ${fmtPm(2 * p.disc)} · ${p.caught ? 'CAUGHT' : 'missed'}`, 28, y + 4, W - 56, 28, 1);
  g.fillText(`H⁺ ${$('cHp').textContent}   H ${$('cH').textContent}   free e⁻ ${$('cE').textContent}   ·   ${S.fieldView ? 'Field view' : 'Glow view'} (X)   ·   pilot-wave view ${S.pilot ? 'on' : 'off'} (stick click)${lockReady() ? ` · lock-on ${S.lock.on ? 'on' : 'off'} (right stick click)` : ''}   ·   A/B electron speed   ·   ship ${$('shipOut').textContent}`, 28, H - 28);
}
for (const id of ['vrBtn', 'vrBtn2']) $(id).addEventListener('click', toggleVR);
vrSupported().then(ok => { if (!ok) for (const id of ['vrBtn', 'vrBtn2']) $(id).title = 'No VR headset found in this browser'; });

$('lockBtn').addEventListener('click', toggleLock);
restart();
// Test hook: lets automated browser checks drive the game. Harmless for players.
window.__alchem = { get state() { return S; }, wellCloud, wellAlphabet, cam, fire, startLight, togglePilot, lines, setSpeed, slowTarget, startBeat, setDial, toggleField, step, capture, xr, drawPanelCanvas };
requestAnimationFrame(frame);
