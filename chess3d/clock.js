// Time controls and chess clocks, modelled on chess.com's options. Pure
// functions, no DOM: shared by the client, the tests, and (in spirit) the
// database functions in supabase/schema.sql, which keep the same rules.
//
// A time control is one of
//   { type: 'none' }
//   { type: 'live', base: <seconds>, inc: <seconds added after each move> }
//   { type: 'daily', days: <days allowed per move> }
// Live clocks start once each side has made its first move (as on chess.com);
// until then either player may abort.

export const PRESETS = [
  { group: 'Bullet', controls: [[30, 0], [60, 0], [60, 1], [120, 1]] },
  { group: 'Blitz', controls: [[180, 0], [180, 2], [300, 0], [300, 5]] },
  { group: 'Rapid', controls: [[600, 0], [600, 5], [900, 10], [1200, 0], [1800, 0], [3600, 0]] },
];
export const DAILY_DAYS = [1, 2, 3, 5, 7, 14];

export function normalizeTimeControl(tc) {
  if (tc?.type === 'live') {
    const base = Math.round(Number(tc.base)), inc = Math.round(Number(tc.inc) || 0);
    if (base >= 15 && base <= 10800 && inc >= 0 && inc <= 180) return { type: 'live', base, inc };
  }
  if (tc?.type === 'daily' && DAILY_DAYS.includes(Number(tc.days))) return { type: 'daily', days: Number(tc.days) };
  return { type: 'none' };
}

// chess.com-style category from the estimated game length (base + 40 × increment).
export function category(tc) {
  if (tc.type === 'daily') return 'daily';
  if (tc.type !== 'live') return 'untimed';
  const est = tc.base + 40 * tc.inc;
  return est < 180 ? 'bullet' : est < 600 ? 'blitz' : 'rapid';
}

const fmtBase = (s) => (s < 60 ? `${s} sec` : `${s / 60} min`);
export function tcLabel(tc) {
  if (tc.type === 'live') return tc.inc ? `${tc.base < 60 ? `${tc.base}s` : tc.base / 60} | ${tc.inc}` : fmtBase(tc.base);
  if (tc.type === 'daily') return `${tc.days} day${tc.days > 1 ? 's' : ''} / move`;
  return 'No clock';
}

export const tcKey = (tc) => (tc.type === 'live' ? `live:${tc.base}:${tc.inc}` : tc.type === 'daily' ? `daily:${tc.days}` : 'none');
export function parseTcKey(k) {
  const [type, a, b] = String(k).split(':');
  return normalizeTimeControl({ type, base: a, inc: b, days: a });
}

// ---------------------------------------------------------------- clock state
// { tc, ms: { w, b }, started: <epoch ms the side to move began thinking> }
export function newClock(tcIn, now) {
  const tc = normalizeTimeControl(tcIn);
  const full = tc.type === 'live' ? tc.base * 1000 : null;
  return { tc, ms: { w: full, b: full }, started: now };
}

const DAY = 86400000;

// Milliseconds `color` has left at `now`, given `ply` moves played (null = unclocked).
export function timeLeft(clock, color, ply, now) {
  const { tc } = clock;
  const toMove = ply % 2 === 0 ? 'w' : 'b';
  if (tc.type === 'live') {
    if (color !== toMove || ply < 2) return clock.ms[color];
    return clock.ms[color] - (now - clock.started);
  }
  if (tc.type === 'daily') return color === toMove ? tc.days * DAY - (now - clock.started) : tc.days * DAY;
  return null;
}

// The side to move just moved at `now` (the move being ply number `ply`).
// Returns the new clock, or { flagged } if they had already run out.
export function punch(clock, ply, now) {
  const mover = ply % 2 === 0 ? 'w' : 'b';
  const left = timeLeft(clock, mover, ply, now);
  if (left !== null && left <= 0) return { flagged: mover };
  const ms = { ...clock.ms };
  if (clock.tc.type === 'live') ms[mover] = left + (ply >= 2 ? clock.tc.inc * 1000 : 0);
  return { clock: { ...clock, ms, started: now } };
}

// Who is out of time right now, if anyone (only the side to move can be).
export function flagged(clock, ply, now) {
  const toMove = ply % 2 === 0 ? 'w' : 'b';
  const left = timeLeft(clock, toMove, ply, now);
  return left !== null && left <= 0 ? toMove : null;
}

export const canAbort = (clock, ply) => ply < 2;

export function formatTime(ms, tc) {
  if (ms === null || ms === undefined) return '';
  const t = Math.max(0, ms);
  if (tc.type === 'daily') {
    const d = Math.floor(t / DAY), h = Math.floor((t % DAY) / 3600000), m = Math.floor((t % 3600000) / 60000);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }
  const s = t / 1000;
  if (s < 10) return `0:0${s.toFixed(1)}`;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
