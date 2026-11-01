import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, outcomeFor } from '../stats.js';

const ME = 'me', A = 'ann', B = 'ben';
let t = 0;
const g = (white, black, result, extra = {}) => ({
  kind: 'online', status: 'finished', white, black, result, reason: 'checkmate',
  rules: { mode: 'classic' }, time_control: { type: 'live', base: 180, inc: 2 }, moves: new Array(40).fill({}),
  updated_at: new Date(2026, 0, 1, 0, t++).toISOString(), ...extra,
});

test('outcomes from either colour', () => {
  assert.equal(outcomeFor(g(ME, A, 'white'), ME), 'win');
  assert.equal(outcomeFor(g(A, ME, 'white'), ME), 'loss');
  assert.equal(outcomeFor(g(A, ME, 'draw'), ME), 'draw');
});

test('stats: totals, categories, modes, colours, streaks, opponents', () => {
  const games = [
    g(ME, A, 'white'),
    g(B, ME, 'black', { time_control: { type: 'live', base: 60, inc: 0 }, reason: 'timeout' }),
    g(ME, B, 'black', { rules: { mode: 'relative' }, reason: 'resignation' }),
    g(A, ME, 'draw', { reason: 'stalemate', time_control: { type: 'daily', days: 3 } }),
    g(ME, A, 'white', { moves: new Array(101).fill({}) }),
    g(ME, A, 'white'),
    // Not counted:
    g(ME, A, null, { status: 'active' }),
    g(ME, A, null, { status: 'aborted' }),
    g(ME, ME, 'white', { kind: 'local' }),
  ];
  const s = computeStats(games, ME);
  assert.deepEqual(s.total, { played: 6, wins: 4, losses: 1, draws: 1 });
  assert.equal(s.winRate, 67);
  assert.equal(s.byCategory.blitz.played, 4);
  assert.equal(s.byCategory.bullet.wins, 1);
  assert.equal(s.byCategory.daily.draws, 1);
  assert.equal(s.byMode.relative.losses, 1);
  assert.equal(s.byColor.white.played, 4);
  assert.equal(s.byColor.black.wins, 1);
  assert.deepEqual(s.winsBy, { checkmate: 3, timeout: 1 });
  assert.deepEqual(s.lossesBy, { resignation: 1 });
  assert.equal(s.streak.best, 2);
  assert.equal(s.streak.current, 2);
  assert.equal(s.longest, 51);
  assert.equal(s.opponents[A].played, 4);
  assert.equal(s.opponents[B].wins, 1);
});

test('stats: nothing played', () => {
  const s = computeStats([], ME);
  assert.equal(s.total.played, 0);
  assert.equal(s.winRate, 0);
});
