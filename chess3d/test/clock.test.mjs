import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newClock, punch, timeLeft, flagged, category, tcLabel, normalizeTimeControl, parseTcKey, tcKey, formatTime, PRESETS } from '../clock.js';
import { initialState, timeout, canMate, idx, SIZE } from '../rules.js';

const live = (base, inc) => ({ type: 'live', base, inc });

test('categories follow chess.com (base + 40 × increment)', () => {
  assert.equal(category(live(60, 0)), 'bullet');
  assert.equal(category(live(120, 1)), 'bullet');
  assert.equal(category(live(180, 2)), 'blitz');
  assert.equal(category(live(300, 5)), 'blitz');
  assert.equal(category(live(600, 0)), 'rapid');
  assert.equal(category(live(900, 10)), 'rapid');
  assert.equal(category({ type: 'daily', days: 3 }), 'daily');
  assert.equal(category({ type: 'none' }), 'untimed');
  // Every preset lands in the group it is listed under.
  for (const { group, controls } of PRESETS) for (const [b, i] of controls) assert.equal(category(live(b, i)), group.toLowerCase(), `${b}|${i}`);
});

test('labels, keys and validation', () => {
  assert.equal(tcLabel(live(180, 2)), '3 | 2');
  assert.equal(tcLabel(live(600, 0)), '10 min');
  assert.equal(tcLabel(live(30, 0)), '30 sec');
  assert.equal(tcLabel({ type: 'daily', days: 1 }), '1 day / move');
  assert.deepEqual(parseTcKey(tcKey(live(900, 10))), live(900, 10));
  assert.deepEqual(parseTcKey('daily:3'), { type: 'daily', days: 3 });
  assert.deepEqual(normalizeTimeControl(live(5, 0)), { type: 'none' }, 'too short');
  assert.deepEqual(normalizeTimeControl({ type: 'daily', days: 4 }), { type: 'none' });
});

test('live clock: first moves are free, then time runs and increments apply', () => {
  let c = newClock(live(60, 2), 0);
  assert.equal(timeLeft(c, 'w', 0, 50000), 60000, "white's first move is not timed");
  c = punch(c, 0, 50000).clock;
  assert.equal(c.ms.w, 60000);
  c = punch(c, 1, 90000).clock;
  assert.equal(c.ms.b, 60000, "black's first move is not timed either");
  assert.equal(timeLeft(c, 'w', 2, 100000), 50000, '10 s gone from white');
  assert.equal(timeLeft(c, 'b', 2, 100000), 60000, 'not black to move');
  c = punch(c, 2, 100000).clock;
  assert.equal(c.ms.w, 52000, 'increment added');
  assert.equal(flagged(c, 3, 100000 + 59000), null);
  assert.equal(flagged(c, 3, 100000 + 60000), 'b');
  assert.deepEqual(punch(c, 3, 100000 + 61000), { flagged: 'b' }, 'a move after the flag does not count');
});

test('daily clock: the full allowance every move', () => {
  const DAY = 86400000;
  let c = newClock({ type: 'daily', days: 2 }, 0);
  assert.equal(timeLeft(c, 'w', 0, DAY), DAY);
  c = punch(c, 0, DAY).clock;
  assert.equal(timeLeft(c, 'b', 1, DAY), 2 * DAY);
  assert.equal(flagged(c, 1, 3 * DAY + 1), 'b');
});

test('untimed games never flag', () => {
  const c = newClock({ type: 'none' }, 0);
  assert.equal(timeLeft(c, 'w', 5, 1e12), null);
  assert.equal(flagged(c, 5, 1e12), null);
  assert.ok(punch(c, 5, 1e12).clock);
});

test('formatting', () => {
  assert.equal(formatTime(65000, live(60, 0)), '1:05');
  assert.equal(formatTime(9300, live(60, 0)), '0:09.3');
  assert.equal(formatTime(3725000, live(3600, 0)), '1:02:05');
  assert.equal(formatTime(-5, live(60, 0)), '0:00.0');
  assert.equal(formatTime(90000000, { type: 'daily', days: 2 }), '1d 1h');
});

test('timeout: a loss, or a draw if the opponent cannot mate', () => {
  const s = initialState();
  assert.deepEqual(timeout(s, 'w').result, { winner: 'b', reason: 'timeout' });
  const board = new Array(SIZE).fill(null);
  board[idx(0, 0, 0)] = { t: 'K', c: 'w', m: true };
  board[idx(1, 0, 0)] = { t: 'Q', c: 'w', m: true };
  board[idx(7, 7, 7)] = { t: 'K', c: 'b', m: true };
  board[idx(6, 7, 7)] = { t: 'N', c: 'b', m: true };
  const lone = { ...s, board };
  assert.equal(canMate(board, 'b'), false);
  assert.equal(canMate(board, 'w'), true);
  assert.deepEqual(timeout(lone, 'w').result, { winner: 'draw', reason: 'timeout vs insufficient material' });
  assert.deepEqual(timeout(lone, 'b').result, { winner: 'w', reason: 'timeout' });
});
