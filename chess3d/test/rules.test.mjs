import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, allLegalMoves, legalMovesFrom, applyMove, idx, SIZE, replay, sqName,
  KNIGHT_JUMPS, BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS,
} from '../rules.js';

const empty = (pieces, turn = 'w') => {
  const board = new Array(SIZE).fill(null);
  for (const [i, t, c, m = true] of pieces) board[i] = { t, c, m };
  return { board, turn, history: [], halfmove: 0, result: null };
};

test('direction sets', () => {
  assert.equal(ROOK_DIRS.length, 6);
  assert.equal(BISHOP_DIRS.length, 12);
  assert.equal(QUEEN_DIRS.length, 26);
  assert.equal(KNIGHT_JUMPS.length, 24);
});

test('initial position', () => {
  const s = initialState();
  assert.equal(s.board.filter(Boolean).length, 32);
  assert.equal(sqName(idx(4, 0, 0)), 'e1A');
  assert.equal(s.board[idx(4, 0, 0)].t, 'K');
  assert.equal(s.board[idx(4, 7, 7)].t, 'K');
  assert.equal(s.board[idx(4, 7, 7)].c, 'b');
  const moves = allLegalMoves(s);
  assert.ok(moves.length > 20, `got ${moves.length}`);
  // Each pawn: one/two steps up a rank, one/two steps up a level.
  assert.equal(legalMovesFrom(s, idx(0, 1, 1)).length, 4);
  assert.equal(moves.filter((m) => m.capture).length, 0, 'no captures on move one');
});

test('knight and king pieces start with moves into the next level', () => {
  const s = initialState();
  const knight = legalMovesFrom(s, idx(1, 0, 0)).map((m) => sqName(m.to)).sort();
  assert.ok(knight.includes('c3A'));
  assert.ok(knight.includes('b2C'));
});

test('illegal move rejected, turn alternates', () => {
  const s = initialState();
  assert.equal(applyMove(s, { from: idx(0, 6, 6), to: idx(0, 5, 6) }), null);
  const s2 = applyMove(s, { from: idx(0, 1, 1), to: idx(0, 3, 1) });
  assert.equal(s2.turn, 'b');
  assert.equal(s2.history[0].label, 'a2B-a4B');
});

test('pinned piece cannot expose king', () => {
  const s = empty([
    [idx(0, 0, 0), 'K', 'w'], [idx(0, 0, 3), 'R', 'w'], [idx(0, 0, 7), 'Q', 'b'], [idx(7, 7, 7), 'K', 'b'],
  ]);
  for (const m of legalMovesFrom(s, idx(0, 0, 3))) {
    const [x, y] = [m.to % 8, Math.floor(m.to / 8) % 8];
    assert.ok(x === 0 && y === 0, 'rook must stay on the pin line');
  }
});

test('checkmate is detected', () => {
  // Black king cornered at h8H, white queens deliver mate.
  const s = empty([
    [idx(7, 7, 7), 'K', 'b'], [idx(0, 0, 0), 'K', 'w'],
    [idx(5, 5, 5), 'Q', 'w'], [idx(5, 7, 5), 'Q', 'w'], [idx(7, 5, 5), 'Q', 'w'],
  ]);
  const n = applyMove(s, { from: idx(5, 5, 5), to: idx(6, 6, 6) });
  assert.ok(n);
  assert.equal(n.result?.winner, 'w');
  assert.equal(n.result?.reason, 'checkmate');
  assert.ok(n.history[0].label.endsWith('#'));
});

test('castling both sides', () => {
  const s = empty([
    [idx(4, 0, 0), 'K', 'w', false], [idx(7, 0, 0), 'R', 'w', false], [idx(0, 0, 0), 'R', 'w', false],
    [idx(4, 7, 7), 'K', 'b'],
  ]);
  const ks = applyMove(s, { from: idx(4, 0, 0), to: idx(6, 0, 0) });
  assert.equal(ks.board[idx(5, 0, 0)].t, 'R');
  assert.equal(ks.history[0].label, 'O-O');
  const qs = applyMove(s, { from: idx(4, 0, 0), to: idx(2, 0, 0) });
  assert.equal(qs.board[idx(3, 0, 0)].t, 'R');
  // Not through check: black rook covering f1A.
  const blocked = empty([
    [idx(4, 0, 0), 'K', 'w', false], [idx(7, 0, 0), 'R', 'w', false],
    [idx(5, 0, 5), 'R', 'b'], [idx(0, 7, 7), 'K', 'b'],
  ]);
  assert.equal(applyMove(blocked, { from: idx(4, 0, 0), to: idx(6, 0, 0) }), null);
});

test('pawn promotes on the far edge', () => {
  const s = empty([
    [idx(0, 6, 7), 'P', 'w'], [idx(4, 0, 0), 'K', 'w'], [idx(4, 3, 3), 'K', 'b'],
  ]);
  const n = applyMove(s, { from: idx(0, 6, 7), to: idx(0, 7, 7), promo: 'N' });
  assert.equal(n.board[idx(0, 7, 7)].t, 'N');
});

test('replay reproduces a game', () => {
  const moves = [
    { from: idx(4, 1, 1), to: idx(4, 1, 3) },
    { from: idx(4, 6, 6), to: idx(4, 6, 4) },
  ];
  const s = replay(moves);
  assert.equal(s.history.length, 2);
  assert.equal(s.turn, 'w');
});

test('random playouts stay consistent', () => {
  let s = initialState();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 120 && !s.result; i++) {
    const ms = allLegalMoves(s);
    const m = ms[Math.floor(rnd() * ms.length)];
    s = applyMove(s, m);
    assert.ok(s);
    assert.equal(s.board.filter((p) => p && p.t === 'K').length, 2);
  }
});
