// Alchemfighter, Level 1 "Electromagnetic Stardust": beats 1 and 2 of docs/levels/01-hydrogen-tutorial.md.
// Plays in the browser window or in a PC VR headset (WebXR); the VR button works from the start.
// Beat 1: meet the proton (its field and glow). The system starts with only the proton in it.
// Beat 2: catch an electron with the electron gun, then watch the cascade of light down to 1s.
import * as P from './physics.js';
import { waveDesc, extentBohr, angularNorm, legendre } from './orbitals.js';
import * as Q from './quantum.js';
import { createRenderer, Lines } from './render.js';
import * as W from './light.js';
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
// Each step down the ladder: the atom waits its real lifetime (sped up like every rare event, so
// the lifetimes keep their real proportions: 2p 1.6 ns, 3s 159 ns, ...), then the shape morphs
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
    shots: 0, emitShown: 0, pilot: true, ionized: 0, bumped: 0, paired: 0, pairs: [], oldSteps: [], light: [], lightOut: 0, lightOutE: 0, passes: [], fieldView: true, dial: 1, cooldown: 0, cascade: null, autoCam: null, falling: [], speed: 3, slow: 1,
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
    info.L = P.angularL(h);   // what the odds depend on: the pass's angular momentum (ħ)
    info.chance = P.captureChanceGame(E, info.L);
    info.real = P.captureChanceReal(E, info.L);
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
// Which orbital of the shell the next step down leaves from: each l's share (averaged over the
// sloshing) times its own decay rate. Returns that state and the shell's lifetime as it is mixed.
function shellDecay(a) {
  const c = shellOf(a);
  if (c.re.length < 2) return { st: a.st, tauNs: null };
  const { ls, p } = Q.shellAverage(a.st.n, a.st.m, fieldAlong(a), c);
  const rates = ls.map((l, i) => p[i] / P.DECAY[`${a.st.n},${l}`].tau), tot = rates.reduce((x, y) => x + y, 0);
  const i = P.pickWeighted(ls.map((_, k) => k), k => rates[k]);
  return { st: { ...a.st, l: ls[i] }, tauNs: 1 / tot, mixed: p[ls.indexOf(a.st.l)] < 0.98 };
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
// Light leaves as Maxwell's equations say it does (light.js): an atom changing level swings its
// charge like a tiny antenna, and the exact field of that swing spreads out at the speed of light,
// at the light's real wavelength. A swing along an axis (Δm = 0) sends most light out sideways
// (sin²θ); one turning in a circle (Δm = ±1) sends (1 + cos²θ)/2.
// The photon itself (pilot-wave view): a particle that rides the wave along one straight path at c,
// its direction drawn from the wave's brightness. Only where it goes can it be taken: by an atom
// whose target its path runs through, or else by the wall, where the spectrometer records it.
// When it is taken, the swing that sent it stops and the rest of the wave, now empty, runs out.
const randomDir = () => { const th = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, rr = Math.sqrt(1 - z * z); return [rr * Math.cos(th), z, rr * Math.sin(th)]; };
const lifetimeFs = tauNs => tauNs * 1e6 / P.RATE_BOOST;   // a real lifetime on the game's (sped-up) clock
// Starts a light wave. launchIn: fs until the photon leaves (0 = now, Infinity = when told to).
// tau: how long the swing lasts (fs). from: the atom sending it.
function startLight({ pos, lam, pattern = 'lin', axis = randomDir(), from = null, show = LIGHT_SHOW, tau = lam / P.C, launchIn = 0, emitter = null, gain = 1 }) {
  if (pattern === 'iso') { pattern = 'lin'; axis = randomDir(); }   // two-photon light: no single axis, a random one stands in
  const em = W.makeEmission({ src: pos, lam, pattern, axis, t0: S.simFs, tau, gain });
  const L = { em, lam, E: P.HC / lam, pattern, col: photonColor(lam), from, emitter, show, slowFlight: lightSlow(show), tLaunch: S.simFs + launchIn,
    launched: false, caught: false, age: 0, quick: show === LIGHT_QUICK, maxR: v3.len(pos) + P.SPHERE_R };
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
  if (Math.random() > P.impactChanceGame(E, rp)) return;
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
  p.m = P.MP; p.pol = null;
  addElectron(v3.add(p.pos, v3.scale(dir, r0)), vE, { freed: true, E: extra, born: S.time });
  p.vel = vP;
  S.ionized++;
  S.flashes.push({ pos: [...p.pos], col, t: 0, life: 1.2, size: 1.0 });
}
function photonColor(lam) {
  const c = P.lambdaRGB(lam), k = P.band(lam) === 'visible' ? 1 : 0.8;
  return c.map(x => x * k);
}
function capture(e, p, E) {
  // The pass's angular momentum (in units of ħ) picks the free wave's l; light changes l by one.
  const off = v3.sub(e.pos, p.pos), rel = v3.sub(e.vel, p.vel);
  const Lv = v3.scale(v3.cross(off, rel), P.ME / P.HBAR), Lh = v3.len(Lv);
  const pick = P.pickCaptureState(Math.max(E, 0.01), Lh);
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
  const atom = { p, st, axis, trans: null, fade: 0, beat: 0, waitFs: 0, hold: 0, pending: null, steps: [{ lam, kind: 'capture', from: null, to: st }] };
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
  if ((S.capSaid = (S.capSaid || 0) + 1) <= 3) log(`It swung past with angular momentum ${Lh.toFixed(1)} ħ, so its wave there was mostly l = ${pick.lIn} (${P.L_NAMES[pick.lIn]}). Light changes l by exactly one, so it could only land in ${[pick.lIn - 1, pick.lIn + 1].filter(x => x >= 0).map(x => P.L_NAMES[x]).join(' or ')} orbitals.`);
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
  const mix = shellDecay(atom);
  if (mix.st.l !== atom.st.l) {
    if ((S.mixSaid = (S.mixSaid || 0) + 1) <= 2) log(`A nearby charge's electric field is mixing ${P.stateName(atom.st)} with the rest of shell n = ${atom.st.n}, so this time it steps down from its ${P.stateName(mix.st)} part.`);
    atom.st = mix.st;
  }
  const d = P.pickDecay(atom.st);
  if (d && mix.tauNs && !d.twoPhoton) { d.delayNs = P.sampleExp(mix.tauNs); d.tauNs = mix.tauNs; }
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
  const dk = P.DECAY[`${n},1`], G = P.RATE_BOOST * 1e-6 / dk.tau;   // decays per fs on the game's clock
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
  const pos = q.members.map(a => a.p.pos), k = P.starkShift(q.up.n) / P.HBAR_NS * P.RATE_BOOST * 1e-6;
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
      L = startLight({ pos: a.p.pos, lam: q.lam, pattern: q.up.m === 0 ? 'lin' : 'circ', axis: [0, 1, 0], from: a, show: q.reex ? LIGHT_QUICK : LIGHT_SHOW, tau: Infinity, launchIn: Infinity, gain: amp });
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
  const x = q.members[xi], realNs = (S.simFs - q.since) * P.RATE_BOOST * 1e-6;
  for (const a of q.members) { a.pair = null; a.mix.fade = true; if (a !== x) a.reex = false; }
  let L = q.lights.get(x);
  for (const [a, l] of q.lights) if (l !== L) cancelLight(l);
  if (how === 'light') {
    // Where the photon goes: the atoms' waves add up in some directions and cancel in others.
    const pattern = q.up.m === 0 ? 'lin' : 'circ', sum = q.c.re.reduce((s, v, j) => s + Math.hypot(v, q.c.im[j]), 0);
    const dir = patternDir(pattern, [0, 1, 0], d => P.groupArrayFactor(M.pos, q.c, q.lam, d), sum * sum / n2);
    if (!L) { L = startLight({ pos: x.p.pos, lam: q.lam, pattern, axis: [0, 1, 0], from: x, show: q.reex ? LIGHT_QUICK : LIGHT_SHOW, tau: Infinity, launchIn: Infinity, gain: Math.hypot(q.c.re[xi], q.c.im[xi]) }); }
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
// game's sped-up clock), and when the photon is found the atom settles into the lower level.
function startEmission(a, d) {
  const lam = d.photons[0], tauNs = d.quenched ? 2 * P.DECAY['2,1'].tau : d.tauNs || P.DECAY[`${a.st.n},${a.st.l}`].tau;
  const quick = a.reex && !watched(a);
  a.emitL = startLight({ pos: a.p.pos, lam, pattern: d.dm === 0 ? 'lin' : 'circ', axis: d.axis || [0, 1, 0], from: a,
    show: quick ? LIGHT_QUICK : LIGHT_SHOW, tau: lifetimeFs(tauNs), launchIn: d.quenched ? 0 : a.waitFs,
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
  if (!a.reex || S.paired <= 3) log(`${P.stateName(a.st)} → ${P.stateName(d.to)} after ${when}${d.quenched ? ', let go by a nearby charge\'s electric field' : ''}: ${names}`, d.photons.some(l => P.lineName(l) === 'H-α') ? 'red' : '');
}
// The frequency (rad/fs) the atom's cloud beats at: the light it is sending or answering.
function cloudOmega(a) {
  if (a.emitL) return a.emitL.em.w;
  if (a.trans) return 2 * Math.PI * P.C / P.lambdaFor(a.trans.from.n, a.trans.to.n);
  return 0;
}
function updateAtoms(dt, dtFs) {
  for (const a of S.atoms) {
    a.fade = Math.min(1, a.fade + dt / FALL_DUR);
    a.p.glow = Math.max(0, a.p.glow - dt / FALL_DUR);   // the electron's field cancels the proton's outside the atom
    // The cloud's swing between two levels: at its real frequency, or at the fastest that shows
    // without flicker (SWING_HZ on screen), so it is always one wave sloshing, never a blur of two.
    const cap = capOmega(showHz());
    a.phase = (a.phase || 0) + dtFs * Math.min(cloudOmega(a), cap);
    if (a.capt) { a.capt.t += dt; a.capt.phase = (a.capt.phase || 0) + dtFs * Math.min(a.capt.w, cap); if (a.capt.t >= FALL_DUR) a.capt = null; }
    stepShell(a, dt, dtFs);
    if (a.trans) {
      a.trans.t += dt;
      if (a.trans.t >= a.trans.dur) { setPure(a, a.trans.to); a.trans = null; if (a.st.n === 1) a.reex = false; scheduleDecay(a); }
      continue;
    }
    if (a.mix && a.mix.fade) { a.mix.w *= Math.exp(-dt * 4); if (a.mix.w < 0.01) a.mix = null; }
    if (a.pair || !a.pending) continue;
    if (a.st.l === 1 && a.st.n > 1 && a.fade >= 1 && !a.pending.noShare && !(a.emitL && a.emitL.launched) && tryGroup(a)) {
      if (a.emitL) { cancelLight(a.emitL); a.emitL = null; }
      continue;
    }
    if (a.emitL) continue;                      // swinging; the photon leaves when its time comes
    if (a.pending.twoPhoton) quench2s(a, dt, dtFs);
    a.hold -= dt;
    if (a.hold > 0 || a.fade < 1) continue;
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
    if (!a.trans && !a.pending && !a.pair && a.st.n === 1 && a.fade >= 1) {
      S.cascade = null; S.autoCam = null;
      const red = a.steps.some(s => [].concat(s.lam).some(l => P.lineName(l) === 'H-α'));
      say(`You just made a hydrogen atom. The electron dropped down an energy staircase and every step came out as light${red ? ', including the red H-alpha line that makes hydrogen nebulae glow' : ''}. It stops at the bottom step, called 1s. It can't fall any further and never lands on the proton: 1s is the lowest energy an electron can have here.`);
      if (S.beat === 2 && !S.b2.nextAt) S.b2.nextAt = S.time + 7;   // time to read, then Acid Neutrality
    }
  }
  if (S.beat === 3 && !S.b3.doneAt && acidLeft() === 0 && S.atoms.every(a => !a.pending && !a.trans && !a.pair && a.fade >= 1)) {
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
  const L = P.angularL(v3.len(v3.cross(v3.sub(e.pos, p.pos), v3.sub(e.vel, p.vel))));
  const chance = P.captureChanceGame(E, L), real = P.captureChanceReal(E, L);
  const caught = Math.random() < chance;
  const who = e.freed ? 'freed electron' : `shot ${e.shot}`;
  S.passes.unshift({ who, pass: e.passes, rp, E, L, chance, real, caught });
  S.passes.length = Math.min(S.passes.length, 4);
  renderPasses();
  if (caught) { capture(e, p, E); return; }
  if (E > 3 && rp < 1.5 && !S.b2.tooFastSaid) { S.b2.tooFastSaid = true; say('Too fast to catch. Try slower and closer.'); }
}
function renderPasses() {
  $('passes').innerHTML = S.passes.length ? S.passes.map(p =>
    `<div class="${p.caught ? 'hit' : p.E > 3 ? 'fast' : 'miss'}">${p.who}${p.pass > 1 ? ` (pass ${p.pass})` : ''}: ${fmtNm(p.rp)} at ${p.E.toFixed(2)} eV, L ${p.L.toFixed(1)} ħ · ${fmtChance(p.chance)} · ${p.caught ? 'CAUGHT' : 'missed'} <span class="fine">(real ${fmtOdds(p.real)})</span></div>`).join('')
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
  if (L.launched || !L.showEmit) return 1;
  const want = (L.lam / P.C) / (EMIT_PERIOD * FS_PER_S * SPEEDS[S.speed]);
  const hold = L.quick ? 0 : EMIT_HOLD[S.emitShown < 2 ? 0 : 1];
  if (L.age > hold + 0.5 && !L.counted) { L.counted = true; S.emitShown++; }
  return Math.min(1, want * Math.exp(Math.max(0, L.age - hold) / EMIT_EASE));
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
  for (const a of S.atoms) a.p.pol = P.atomPol(a.st.n);   // how strongly fields pull on each atom
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
  updateGroups(dt, dtFs);
  // Light: c × the real time that passed. Rare events: the same real time, sped up by RATE_BOOST.
  updateLight(dt);
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
  if (e.code === 'KeyP') togglePilot();
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
function togglePilot() {
  S.pilot = !S.pilot;
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
$('startCalmBtn').addEventListener('click', () => { $('startBox').hidden = true; if (S.fieldView) toggleField(); });

function restart() {
  S = newState();
  cam.p = [0, 1.5, 24]; cam.v = [0, 0, 0]; cam.yaw = Math.PI; cam.pitch = -0.06;
  logLines.length = 0; $('logBox').innerHTML = '';
  renderPasses(); setDial(1); setSpeed(S.speed); startBeat(1);
  $('fieldBtn').setAttribute('aria-pressed', 'false');
  $('pilotBtn').setAttribute('aria-pressed', 'true');
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
    $('aimOut').innerHTML = `Aimed: closest pass ≈ ${fmtNm(a.rp)}, L ≈ ${a.L.toFixed(1)} ħ · chance ${fmtChance(a.chance)} <span class="fine">(real ${fmtOdds(a.real)})</span> · cone ±${fmtNm(a.cone)}`;
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
  const { em } = L, t = S.simFs, avg = avgShare(em.w), now = 1 - avg;
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
      if (S.fieldView && lead) magRings(L, t, now, out);
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
function magRings(L, t, k, out) {
  const { em } = L, ref = Math.hypot(...W.field({ ...em, tEnd: Infinity, t0: -1e9, tau: Infinity }, v3.add(em.src, v3.scale(em.e1, 20)), 0).B) || 1;
  for (const R of [2, 4, 8, 14, 22, 32, 45]) {
    for (const f of [0.3, 0.5, 0.7]) {
      const th = Math.PI * f, c = place0(em, R, th, 0);
      if (!inSystem(c)) continue;
      const B = Math.hypot(...W.field(em, c, t).B);
      if (!B) continue;
      const a = Math.min(1, B / ref) * 0.35 * k;
      if (a < 0.02) continue;
      let prev = null;
      for (let i = 0; i <= 32; i++) {
        const pt = place0(em, R, th, 2 * Math.PI * i / 32);
        if (prev && inSystem(pt) && inSystem(prev)) out.seg(prev, pt, [0.36, 0.95, 0.6], a);
        prev = pt;
      }
    }
  }
}
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
function photonDot(L, glows) {
  if (!S.pilot || !L.launched || L.caught) return;
  const s = P.C * (S.simFs - L.tLaunch), at = v3.add(L.em.src, v3.scale(L.dir, s));
  glows.push({ pos: at, size: 0.14, col: L.col.map(c => c * 2.6) });
  const back = v3.add(L.em.src, v3.scale(L.dir, Math.max(0, s - 5)));
  lines.seg(back, at, L.col, 0.9);
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

// The caught electron's point fades into the middle of its new cloud as its free wave becomes the
// orbital (the cloud shows the wave; the point is only where the electron was seen last).
function fallPos(f, t = f.t) {
  const x = Math.min(1, t / (0.5 * FALL_DUR)), s = x * x * (3 - 2 * x);
  return v3.add(f.atom.p.pos, v3.scale(f.off, 1 - s));
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
    const g = Math.max(0, 1 - f.t / (0.5 * FALL_DUR));
    fallGlows.push({ pos, size: 0.008 + 0.012 * g, col: [0.45 * g, 0.65 * g, g] });
  }
  const clouds = S.atoms.map(a => {
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
  const strength = L => (L.launched && !L.caught ? 2 : 0) + W.envelope(L.em, Math.min(S.simFs, L.em.tEnd));
  for (const L of [...S.light].sort((x, y) => strength(y) - strength(x)).slice(0, MAX_DRAWN_LIGHTS)) lightLines(L);
  for (const L of S.light) photonDot(L, glows);
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
  if (S.beat >= 2) coneLines(aimInfo());
  if (xr.session && xr.aim) lines.seg(xr.aim.o, v3.add(xr.aim.o, v3.scale(xr.aim.d, 3)), [0.8, 0.9, 1], 0.5);

  renderer.draw({ views, panel, time: S.time, sphereR: P.SPHERE_R, steps: 72, bohrPerUnit: 1 / P.A0, charges, clouds, glows, lines: lines.data() });
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
// Y: game speed. Left stick click: photon particle (pilot-wave view) on or off.
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
      if (edge('LS', 3)) togglePilot();   // left stick click: photon particle on/off
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
  g.fillText(`H⁺ ${$('cHp').textContent}   H ${$('cH').textContent}   free e⁻ ${$('cE').textContent}   ·   ${S.fieldView ? 'Field view' : 'Glow view'} (X)   ·   photon particle ${S.pilot ? 'on' : 'off'} (stick click)   ·   A/B electron speed   ·   ship ${$('shipOut').textContent}`, 28, H - 28);
}
for (const id of ['vrBtn', 'vrBtn2']) $(id).addEventListener('click', toggleVR);
vrSupported().then(ok => { if (!ok) for (const id of ['vrBtn', 'vrBtn2']) $(id).title = 'No VR headset found in this browser'; });

$('rateTag').textContent = `rates ×${P.RATE_BOOST.toLocaleString('en-US')}`;
restart();
// Test hook: lets automated browser checks drive the game. Harmless for players.
window.__alchem = { get state() { return S; }, cam, fire, startLight, togglePilot, lines, setSpeed, slowTarget, startBeat, setDial, toggleField, step, capture, xr, drawPanelCanvas };
requestAnimationFrame(frame);
