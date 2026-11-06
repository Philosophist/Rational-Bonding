// Alchem Fighter, Level 1 "A Lone Proton": beats 1 and 2 of docs/levels/01-hydrogen-tutorial.md.
// Beat 1: meet the proton (its field glow, a stray electron swinging past).
// Beat 2: catch an electron with the electron gun, then watch the cascade of light down to 1s.
import * as P from './physics.js';
import { waveDesc, extentBohr } from './orbitals.js';
import { createRenderer, Lines } from './render.js';

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

// Time: while particles fly, one screen second is FS_PER_S femtoseconds. During a cascade the
// clock switches to nanoseconds and the free particles wait (shown as "paused" in the HUD).
const FS_PER_S = 40;
const NS_PER_S = 50;
const LIGHT_SPEED = 28;          // nm per screen second: light is drawn slowed down so you can see it
const DIAL = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];   // eV, the electron's energy far from the proton
const PROTON_SMEAR = 0.05;       // nm, keeps the glow's centre finite (log scale, capped)
// Missed electrons stay in the sphere (matter can't leave), so the gun allows a few loose at once.
// Fly close to a loose electron and the ship scoops it back into the gun.
const MAX_LOOSE = 3, SCOOP_R = 3;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const cam = { p: [0, 1.5, 24], yaw: Math.PI, pitch: -0.06, fov: 62 * Math.PI / 180 };
let S;
let nextId = 1;
function newState() {
  const proton = { id: 'p1', kind: 'proton', q: 1, m: P.MP, pos: [0, 0, 0], vel: [0, 0, 0], active: true, glow: 1 };
  return {
    time: 0, simFs: 0, beat: 1, ps: [proton], enc: new Map(), atoms: [], photons: [], flashes: [], spectrum: [],
    shots: 0, passes: [], fieldView: false, dial: 1, cooldown: 0, cascade: null, autoCam: null,
    b1: { start: null, maxAngle: 0, toggled: false, moved: false, strayAt: 3, stray: null, strayPassed: false },
    b2: { tooFastSaid: false, captured: false, doneShown: false }, ended: false, said: '',
  };
}
function camBasis() {
  const cp = Math.cos(cam.pitch);
  const f = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp];
  const r = v3.norm(v3.cross(f, [0, 1, 0])), u = v3.cross(r, f);
  return { p: cam.p, f, r, u, fovT: Math.tan(cam.fov / 2) };
}
const bareProtons = () => S.ps.filter(p => p.kind === 'proton' && p.q === 1 && p.active);
const freeElectrons = () => S.ps.filter(p => p.kind === 'electron' && p.active);
const looseShots = () => freeElectrons().filter(e => !e.stray);

// ---------------------------------------------------------------------------
// Tutor and beats
// ---------------------------------------------------------------------------
const BEATS = {
  1: {
    title: 'Meet the proton',
    say: 'This is a proton. It\'s also a hydrogen ion, written H⁺: a hydrogen atom that has lost its only electron. It carries one unit of positive charge, and that charge reaches out into space as an electric field. Turn on Field view to see it.',
  },
  2: {
    title: 'First capture',
    say: 'Your gun fires electrons. Electrons are negative, so the proton pulls them in. But an electron can only stay if it gets rid of its energy, and it does that by giving off light. Fire a slow electron at the proton.',
  },
};
function say(text) {
  if (S.said === text) return;
  S.said = text; $('tutorText').textContent = text;
}
function goals() {
  if (S.beat === 1) {
    return [
      ['Fly around the proton (W A S D)', S.b1.moved],
      ['Look at it from two sides', S.b1.maxAngle > 1.3],
      ['Toggle Field view (V)', S.b1.toggled],
    ];
  }
  return [
    ['Fire electrons at the proton', S.shots > 0],
    ['Catch one: make a neutral hydrogen atom', S.b2.captured],
  ];
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
  $('beatNum').textContent = `Beat ${n}`;
  $('beatTitle').textContent = BEATS[n].title;
  say(BEATS[n].say);
  $('fireBtn').disabled = n < 2;
  $('skipBtn').hidden = n >= 2;
  lastGoals = '';
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
function addElectron(pos, vel, extra) {
  const e = { id: `e${nextId++}`, kind: 'electron', q: -1, m: P.ME, pos, vel, active: true, trail: [], trailT: 0, passes: 0, ...extra };
  S.ps.push(e);
  return e;
}
// The stray in beat 1: drifts in, curves round the proton, swings past and leaves.
function launchStray() {
  const E = 1.0, start = [-36, 3.2, -6], target = [0, 3.2, -0.5];
  const d = v3.norm(v3.sub(target, start));
  const KEl = E + P.KE / v3.len(start);
  S.b1.stray = addElectron(start, v3.scale(d, P.electronSpeed(KEl)), { stray: true, E });
}

// Where the crosshair points, and what the gun would do from here.
function aimInfo() {
  const B = camBasis(), muzzle = v3.add(B.p, v3.add(v3.scale(B.u, -0.45), v3.scale(B.r, 0.3)));
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
  const info = { B, muzzle, aimPoint, cone, E, target: best && best.miss < 6 ? best : null };
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
  if (S.beat < 2 || S.cooldown > 0 || S.cascade) return;
  if (looseShots().length >= MAX_LOOSE) {
    say(`${MAX_LOOSE} of your electrons are loose in the sphere, and matter can't leave it. Fly close to one (its blue glow and trail) and the ship scoops it back into the gun.`);
    S.cooldown = 0.5;
    return;
  }
  const a = aimInfo();
  const ax = v3.norm(v3.sub(a.aimPoint, a.muzzle));
  const e1 = v3.norm(v3.cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = v3.cross(ax, e1);
  const off = v3.add(v3.scale(e1, P.gaussian() * a.cone), v3.scale(e2, P.gaussian() * a.cone));
  const dir = v3.norm(v3.sub(v3.add(a.aimPoint, off), a.muzzle));
  const near = bareProtons()[0];
  const KEl = launchKE(a.E, near ? v3.len(v3.sub(a.muzzle, near.pos)) : 99);
  S.shots++;
  addElectron([...a.muzzle], v3.scale(dir, P.electronSpeed(KEl)), { shot: S.shots, E: a.E, born: S.time });
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
function emitPhoton(pos, lam, weight) {
  let dir;
  for (;;) {   // random direction, optionally weighted by the dipole's radiation pattern
    const th = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, rr = Math.sqrt(1 - z * z);
    dir = [rr * Math.cos(th), z, rr * Math.sin(th)];
    if (!weight || Math.random() < weight(dir)) break;
  }
  S.photons.push({ pos: [...pos], dir, lam, age: 0, escaped: false, col: photonColor(lam) });
  S.flashes.push({ pos: [...pos], col: photonColor(lam), t: 0, life: 0.7, size: 0.9 });
  return dir;
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
  const atom = { p, st, trans: null, fade: 0, beat: 0, wait: 0, pending: null, steps: [{ lam, kind: 'capture', to: st }] };
  S.atoms.push(atom);
  emitPhoton(p.pos, lam);
  S.flashes.push({ pos: [...p.pos], col: [1, 1, 1], t: 0, life: 1.0, size: 1.6 });
  log(`Captured into ${P.stateName(st)}: one ${lam.toFixed(1)} nm photon (${P.band(lam)}) carries off ${(P.HC / lam).toFixed(2)} eV.`, 'hit');
  if (st.n === 1) log('Straight to 1s! That happens: a single ultraviolet photon, shorter than 91.2 nm, takes all the energy at once.', 'hit');
  scheduleDecay(atom);
  S.cascade = { atom, start: S.time };
  S.autoCam = { atom, t: 0 };
  S.b2.captured = true;
  say(st.n === 1
    ? 'Caught! This one went straight to the bottom step in one go, so a single ultraviolet flash carried off all the energy.'
    : `Caught! It landed on step n = ${st.n}. Now watch it step down, giving off light at each step.`);
}
function scheduleDecay(atom) {
  const d = P.pickDecay(atom.st);
  atom.pending = d;
  if (!d) return;
  atom.wait = d.twoPhoton ? 3.0 : Math.min(6, Math.max(0.35, d.delayNs / NS_PER_S));
  if (d.twoPhoton) log('2s can\'t give off a single photon. Skipping ahead about 0.12 s…');
}
function updateAtoms(dt) {
  for (const a of S.atoms) {
    a.fade = Math.min(1, a.fade + dt / 0.6);
    a.p.glow = Math.max(0, a.p.glow - dt / 1.2);   // the electron's field cancels the proton's outside the atom
    a.beat += dt * 2 * Math.PI * 2.5;
    if (a.trans) {
      a.trans.t += dt;
      if (a.trans.t >= a.trans.dur) { a.st = a.trans.to; a.trans = null; scheduleDecay(a); }
      continue;
    }
    if (!a.pending) continue;
    a.wait -= dt;
    if (a.wait > 0) continue;
    const d = a.pending; a.pending = null;
    const pattern = d.dm === 0 ? dir => 1 - dir[1] * dir[1] : dir => 0.5 * (1 + dir[1] * dir[1]);
    for (const lam of d.photons) {
      const dir = emitPhoton(a.p.pos, lam, d.twoPhoton ? null : pattern);
      // Each photon carries momentum hν/c, so the atom recoils (about 3 m/s for Lyman-α).
      a.p.vel = v3.sub(a.p.vel, v3.scale(dir, (P.HC / lam) / P.C / P.MP));
    }
    a.steps.push({ lam: d.photons, to: d.to, delayNs: d.delayNs, twoPhoton: d.twoPhoton });
    const names = d.photons.map(l => `${l.toFixed(1)} nm${P.lineName(l) ? ` (${P.lineName(l)})` : ''}`).join(' + ');
    const when = d.twoPhoton ? `${(d.delayNs / 1e9).toFixed(2)} s` : `${d.delayNs.toFixed(1)} ns`;
    log(`${P.stateName(a.st)} → ${P.stateName(d.to)} after ${when}: ${names}`, d.photons.some(l => P.lineName(l) === 'H-α') ? 'red' : '');
    a.trans = { from: a.st, to: d.to, t: 0, dur: 0.45 };
  }
  if (S.cascade) {
    const a = S.cascade.atom;
    if (!a.trans && !a.pending && a.st.n === 1) {
      S.cascade = null; S.autoCam = null;
      const red = a.steps.some(s => [].concat(s.lam).some(l => P.lineName(l) === 'H-α'));
      say(`You just made a hydrogen atom. The electron dropped down an energy staircase and every step came out as light${red ? ', including the red H-alpha line that makes hydrogen nebulae glow' : ''}. It stops at the bottom step, called 1s. It can't fall any further and never lands on the proton: 1s is the lowest energy an electron can have here.`);
      if (!S.b2.doneShown) { S.b2.doneShown = true; setTimeout(showDone, 2500); }
    }
  }
}
function showDone() {
  const a = S.atoms[0];
  const photons = a.steps.flatMap(s => [].concat(s.lam));
  $('doneText').textContent = `It took ${S.shots} shot${S.shots === 1 ? '' : 's'}. The atom gave off ${photons.length} photon${photons.length === 1 ? '' : 's'} on the way down: ${photons.map(l => `${l.toFixed(1)} nm`).join(', ')}.`;
  $('doneBox').hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
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
  const who = e.stray ? 'stray' : `shot ${e.shot}`;
  S.passes.unshift({ who, pass: e.passes, rp, E, chance, real, caught });
  S.passes.length = Math.min(S.passes.length, 4);
  renderPasses();
  if (e.stray && !S.b1.strayPassed && !caught) {
    S.b1.strayPassed = true;
    if (S.beat === 1) log('The stray swung round the proton and kept going: attracted, but too fast to be caught.');
  }
  if (caught) { capture(e, p, E); return; }
  if (!e.stray && E > 3 && rp < 1.5 && !S.b2.tooFastSaid) { S.b2.tooFastSaid = true; say('Too fast to catch. Try slower and closer.'); }
}
function renderPasses() {
  $('passes').innerHTML = S.passes.length ? S.passes.map(p =>
    `<div class="${p.caught ? 'hit' : p.E > 3 ? 'fast' : 'miss'}">${p.who}${p.pass > 1 ? ` (pass ${p.pass})` : ''}: ${fmtNm(p.rp)} at ${p.E.toFixed(2)} eV · ${fmtChance(p.chance)} · ${p.caught ? 'CAUGHT' : 'missed'} <span class="fine">(real ${fmtOdds(p.real)})</span></div>`).join('')
    : '<div class="miss">No passes yet.</div>';
}

function step(dt) {
  S.time += dt;
  S.cooldown = Math.max(0, S.cooldown - dt);
  if (S.beat === 1 && !S.b1.stray && S.time > S.b1.strayAt) launchStray();
  if (!S.cascade) {
    const dtFs = dt * FS_PER_S;
    S.simFs += dtFs;
    const res = P.stepCharges(S.ps, dtFs, S.enc);
    for (const ev of res.events) { onPass(ev); if (S.cascade) break; }
    for (const e of freeElectrons()) {
      e.trailT -= dt;
      if (e.trailT <= 0) { e.trailT = 0.04; e.trail.push([...e.pos]); if (e.trail.length > 90) e.trail.shift(); }
    }
    for (const a of S.atoms) a.p.pos = v3.add(a.p.pos, v3.scale(a.p.vel, dtFs));
    // The ship scoops up loose electrons that come close (not ones it has only just fired).
    for (const e of freeElectrons()) {
      if (e.born !== undefined && S.time - e.born < 1.5) continue;
      if (v3.len(v3.sub(e.pos, cam.p)) < SCOOP_R) {
        e.active = false;
        S.flashes.push({ pos: [...e.pos], col: [0.3, 0.5, 1], t: 0, life: 0.5, size: 0.8 });
        log(`Scooped ${e.stray ? 'the stray electron' : `shot ${e.shot}'s electron`} back into the gun.`);
      }
    }
    S.ps = S.ps.filter(x => x.active);
  }
  updateAtoms(dt);
  for (const ph of S.photons) {
    ph.age += dt;
    ph.pos = v3.add(ph.pos, v3.scale(ph.dir, LIGHT_SPEED * dt));
    if (!ph.escaped && v3.len(ph.pos) >= P.SPHERE_R) {
      ph.escaped = true;
      S.spectrum.push({ lam: ph.lam, t: S.time });
      S.flashes.push({ pos: [...ph.pos], col: ph.col, t: 0, life: 0.8, size: 1.6 });
    }
  }
  S.photons = S.photons.filter(ph => v3.len(ph.pos) < P.SPHERE_R + 12);
  for (const f of S.flashes) f.t += dt;
  S.flashes = S.flashes.filter(f => f.t < f.life);

  // Beat 1 goals
  if (S.beat === 1) {
    const p = S.ps[0];
    const d = v3.norm(v3.sub(cam.p, p.pos));
    if (!S.b1.start) S.b1.start = d;
    S.b1.maxAngle = Math.max(S.b1.maxAngle, Math.acos(Math.max(-1, Math.min(1, v3.dot(d, S.b1.start)))));
    if (S.b1.moved && S.b1.maxAngle > 1.3 && S.b1.toggled) {
      log('Beat 1 done: you have seen the field from two sides.');
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
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const look = (dx, dy) => {
  cam.yaw -= dx * 0.0025;
  cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - dy * 0.0025));
  if (S.autoCam) S.autoCam = null;
};
canvas.addEventListener('pointerdown', e => {
  if (!$('startBox').hidden || !$('doneBox').hidden) return;
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement === canvas) { fire(); return; }
    if (canvas.requestPointerLock) { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); }
    dragging = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  } else dragging = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
});
addEventListener('pointermove', e => {
  if (document.pointerLockElement === canvas) { look(e.movementX, e.movementY); return; }
  if (!dragging || e.pointerId !== dragging.id) return;
  const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
  dragging.x = e.clientX; dragging.y = e.clientY; dragging.moved += Math.abs(dx) + Math.abs(dy);
  look(dx * 1.6, dy * 1.6);
});
addEventListener('pointerup', e => { if (dragging && e.pointerId === dragging.id) dragging = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); setDial(S.dial + (e.deltaY > 0 ? -1 : 1)); }, { passive: false });
const hold = (btn, code) => {
  btn.addEventListener('pointerdown', () => keys.add(code));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => keys.delete(code));
};
hold($('fwdBtn'), 'KeyW'); hold($('backBtn'), 'KeyS');

function fly(dt) {
  const B = camBasis(), sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 24 : 8) * dt;
  let m = [0, 0, 0];
  if (keys.has('KeyW') || keys.has('ArrowUp')) m = v3.add(m, B.f);
  if (keys.has('KeyS') || keys.has('ArrowDown')) m = v3.sub(m, B.f);
  if (keys.has('KeyD') || keys.has('ArrowRight')) m = v3.add(m, B.r);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) m = v3.sub(m, B.r);
  if (keys.has('KeyR')) m = v3.add(m, [0, 1, 0]);
  if (keys.has('KeyF')) m = v3.sub(m, [0, 1, 0]);
  if (v3.len(m) > 0) {
    cam.p = v3.add(cam.p, v3.scale(v3.norm(m), sp));
    S.b1.moved = true; S.autoCam = null;
  }
  const r = v3.len(cam.p);
  if (r > P.SPHERE_R - 1) cam.p = v3.scale(cam.p, (P.SPHERE_R - 1) / r);
  // On a capture, glide in to watch the cascade (any flying or looking hands control back).
  if (S.autoCam) {
    const c = S.autoCam.atom.p.pos, off = v3.sub(cam.p, c), d = v3.len(off);
    const want = 6, k = 1 - Math.exp(-dt * 1.8);
    if (d > want) cam.p = v3.add(c, v3.scale(off, (d + (want - d) * k) / d));
    const f = v3.norm(v3.sub(c, cam.p));
    const yaw = Math.atan2(f[0], f[2]), pitch = Math.asin(f[1]);
    let dy = yaw - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.yaw += dy * k; cam.pitch += (pitch - cam.pitch) * k;
  }
}

function toggleField() {
  S.fieldView = !S.fieldView;
  $('fieldBtn').setAttribute('aria-pressed', String(S.fieldView));
  if (S.fieldView) S.b1.toggled = true;
}
function setDial(i) {
  S.dial = Math.max(0, Math.min(DIAL.length - 1, i));
  const E = DIAL[S.dial];
  $('dialOut').textContent = `${E} eV`;
  $('speedOut').textContent = `${Math.round(P.electronSpeed(E) * 1e6).toLocaleString('en-US')} km/s · ${E <= 0.2 ? 'slow' : E < 2 ? 'medium' : 'fast'}`;
}
$('fieldBtn').addEventListener('click', toggleField);
$('dialDown').addEventListener('click', () => setDial(S.dial - 1));
$('dialUp').addEventListener('click', () => setDial(S.dial + 1));
$('fireBtn').addEventListener('click', fire);
$('skipBtn').addEventListener('click', () => startBeat(2));
$('restartBtn').addEventListener('click', restart);
$('againBtn').addEventListener('click', () => { $('doneBox').hidden = true; restart(); });
$('keepBtn').addEventListener('click', () => { $('doneBox').hidden = true; });
$('startBtn').addEventListener('click', () => { $('startBox').hidden = true; });

function restart() {
  S = newState();
  cam.p = [0, 1.5, 24]; cam.yaw = Math.PI; cam.pitch = -0.06;
  logLines.length = 0; $('logBox').innerHTML = '';
  renderPasses(); setDial(1); startBeat(1);
  $('fieldBtn').setAttribute('aria-pressed', 'false');
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
  sctx.font = '20px ui-monospace, monospace'; sctx.fillStyle = 'rgba(214,226,238,.5)';
  sctx.fillText('UV', 8, 24); sctx.fillText('visible', x380 + 8, 24); sctx.fillText('IR', x750 + 8, 24);
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
    if (name && !seen.has(name)) { seen.set(name, 1); sctx.fillStyle = 'rgba(255,255,255,.85)'; sctx.fillText(name, x + 6, 52); }
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
  const a = S.atoms[0], cur = a ? (a.trans ? a.trans.to : a.st) : null;
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
  $('timeOut').textContent = S.cascade ? `1 s = ${NS_PER_S} ns · others paused` : `1 s = ${FS_PER_S} fs`;
  renderGoals();
  const a = aimInfo();
  const ch = $('crosshair');
  if (S.beat < 2) { $('aimOut').textContent = 'The gun unlocks in beat 2.'; ch.classList.remove('on'); return; }
  if (S.cascade) { $('aimOut').textContent = 'Watching the cascade…'; return; }
  const nl = looseShots().length, loose = nl ? ` · <span class="${nl >= MAX_LOOSE ? 'fast' : 'fine'}">loose ${nl}/${MAX_LOOSE}</span>` : '';
  if (a.target && a.rp !== undefined) {
    ch.classList.toggle('on', a.chance > 0.05);
    $('aimOut').innerHTML = `Aimed: closest pass ≈ ${fmtNm(a.rp)} · chance ${fmtChance(a.chance)} <span class="fine">(real ${fmtOdds(a.real)})</span> · cone ±${fmtNm(a.cone)}${loose}`;
  } else {
    ch.classList.remove('on');
    $('aimOut').innerHTML = `Not aimed at a proton · cone ±${fmtNm(a.cone)}${loose}`;
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
const SEEDS_P = fib(40), SEEDS_E = fib(14);
function fieldLines() {
  for (const p of S.ps) {
    if (!p.active || !p.q) continue;
    const pos = p.kind === 'proton', strength = pos ? p.glow : 1;
    if (strength < 0.05) continue;
    for (const s of pos ? SEEDS_P : SEEDS_E) {
      let x = v3.add(p.pos, v3.scale(s, 0.12)), prev = x;
      for (let i = 0; i < 140; i++) {
        let F = fieldAt(x);
        const mag = v3.len(F);
        if (mag < 1e-9) break;
        F = v3.scale(F, (pos ? 1 : -1) / mag);
        const r = v3.len(v3.sub(x, p.pos)), ds = 0.04 + 0.12 * r;
        x = v3.add(x, v3.scale(F, ds));
        if (v3.len(x) > P.SPHERE_R) break;
        const a = 0.55 * strength / (1 + 0.08 * r);
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
const drawnWavelength = lam => 0.25 + 1.2 * Math.log(lam / LMIN) / Math.log(LMAX / LMIN);
function photonLines(ph) {
  const lw = drawnWavelength(ph.lam), L = 8 * lw, N = 96, A = 0.35, d = ph.dir;
  const e1 = v3.norm(v3.cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const k = Math.min(1, ph.age * 5);
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const s = -L / 2 + L * i / N, env = Math.cos(Math.PI * s / L) ** 2 * A;
    const pt = v3.add(v3.add(ph.pos, v3.scale(d, s - L / 2)), v3.scale(e1, Math.cos(2 * Math.PI * s / lw) * env));
    if (prev) lines.seg(prev, pt, ph.col, k);
    prev = pt;
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

function draw() {
  if (!renderer) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const B = camBasis();
  const charges = [];
  for (const p of S.ps) {
    if (!p.active) continue;
    if (p.kind === 'proton' && p.glow > 0.001) charges.push({ pos: p.pos, q: p.glow, smear: PROTON_SMEAR });
    if (p.kind === 'electron') charges.push({ pos: p.pos, q: -1, smear: Math.max(0.05, P.reducedWavelength(Math.max(0.01, p.E || 1))) });
  }
  const clouds = S.atoms.map(a => {
    const A = desc(a.st);
    if (a.trans) {
      const x = Math.min(1, a.trans.t / a.trans.dur), s = x * x * (3 - 2 * x), Bd = desc(a.trans.to);
      const pk = Math.max(A.peak, Bd.peak), cb = Math.sin(s * Math.PI / 2);
      return { pos: a.p.pos, radius: extentBohr(Math.max(a.st.n, a.trans.to.n), 1) * P.A0, A, B: Bd, cA: [Math.cos(s * Math.PI / 2), 0],
        cB: [cb * Math.cos(-a.beat), cb * Math.sin(-a.beat)], invMax: 1 / pk, iso: ((1 - s) * A.iso + s * Bd.iso) / pk, fade: a.fade };
    }
    return { pos: a.p.pos, radius: extentBohr(a.st.n, 1) * P.A0, A, B: A, cA: [1, 0], cB: [0, 0], invMax: 1 / A.peak, iso: A.iso / A.peak, fade: a.fade };
  });
  const glows = [];
  for (const p of S.ps) if (p.kind === 'proton' && p.active) glows.push({ pos: p.pos, size: 0.012, col: [1, 0.85, 0.6] });
  for (const e of freeElectrons()) glows.push({ pos: e.pos, size: 0.03, col: [0.45, 0.65, 1] });
  for (const f of S.flashes) {
    const x = f.t / f.life;
    glows.push({ pos: f.pos, size: f.size * (0.3 + Math.sqrt(x)) * 0.4, col: f.col.map(c => c * (1 - x) * 1.4) });
  }
  for (const ph of S.photons) glows.push({ pos: v3.add(ph.pos, v3.scale(ph.dir, 0)), size: 0.08, col: ph.col.map(c => c * 0.9) });

  lines.begin(B);
  if (S.fieldView) fieldLines();
  for (const e of freeElectrons()) {
    for (let i = 1; i < e.trail.length; i++) lines.seg(e.trail[i - 1], e.trail[i], [0.3, 0.5, 1], 0.08 + 0.4 * i / e.trail.length);
    if (e.trail.length) lines.seg(e.trail[e.trail.length - 1], e.pos, [0.3, 0.5, 1], 0.5);
  }
  for (const ph of S.photons) photonLines(ph);
  if (S.beat >= 2 && !S.cascade) coneLines(aimInfo());

  renderer.draw({ cam: B, time: S.time, sphereR: P.SPHERE_R, steps: 72, bohrPerUnit: 1 / P.A0, charges, clouds, glows, lines: lines.data() });
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  const paused = !$('startBox').hidden || !$('doneBox').hidden;
  fly(paused ? 0 : dt);
  if (!paused) step(dt);
  updateHud(); drawSpectro(); drawLadder();
  draw();
  requestAnimationFrame(frame);
}

$('rateTag').textContent = `rates ×${P.RATE_BOOST.toLocaleString('en-US')}`;
restart();
// Test hook: lets automated browser checks drive the game. Harmless for players.
window.__alchem = { get state() { return S; }, cam, fire, startBeat, setDial, toggleField, step, capture };
requestAnimationFrame(frame);
