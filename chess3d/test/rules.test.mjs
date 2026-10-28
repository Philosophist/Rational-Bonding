import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, allLegalMoves, legalMovesFrom, applyMove, idx, SIZE, replay, sqName,
  KNIGHT_JUMPS, BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS, pawnCaptures, inCheck, isAttacked,
} from '../rules.js';

const empty = (pieces, turn = 'w') => {
  const board = new Array(SIZE).fill(null);
  for (const [i, t, c, m = true] of pieces) board[i] = { t, c, m };
  return { board, turn, history: [], halfmove: 0, result: null };
};

test('direction sets', () => {
  assert.equal(ROOK_DIRS.length, 6);
  assert.equal(BISHOP_DIRS.length, 20); // 12 planar diagonals + 8 corner-to-corner
  assert.equal(pawnCaptures('w').length, 13);
  assert.equal(pawnCaptures('b').length, 13);
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
  assert.equal(legalMovesFrom(s, idx(0, 1, 1)).length, 6); // 2 up the ranks, 2 up the levels, 2 up-forward
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

test('bishop crosses the cube corner to corner', () => {
  const s = empty([
    [idx(0, 0, 0), 'B', 'w'], [idx(7, 7, 7), 'R', 'b'], [idx(7, 0, 0), 'K', 'w'], [idx(0, 7, 7), 'K', 'b'],
  ]);
  const targets = legalMovesFrom(s, idx(0, 0, 0)).map((m) => m.to);
  assert.ok(targets.includes(idx(7, 7, 7)), 'a1A to h8H');
  assert.ok(targets.includes(idx(3, 3, 3)));
  // Planar diagonals across levels still work: a1A to a8H through the rank/level plane.
  assert.ok(targets.includes(idx(0, 6, 6)));
  // A blocker stops the long diagonal.
  s.board[idx(4, 4, 4)] = { t: 'P', c: 'w', m: true };
  assert.ok(!legalMovesFrom(s, idx(0, 0, 0)).some((m) => m.to === idx(7, 7, 7)));
});

test('bishop attack along a space diagonal gives check', () => {
  const s = empty([[idx(0, 0, 0), 'K', 'w'], [idx(5, 5, 5), 'B', 'b'], [idx(7, 7, 0), 'K', 'b']]);
  const moves = legalMovesFrom(s, idx(0, 0, 0)).map((m) => m.to);
  assert.ok(!moves.includes(idx(1, 1, 1)), 'king may not step onto the diagonal');
});

test('pawns capture forward-and-down diagonally, both ways', () => {
  // White pawn heading up the ranks meets a black pawn one rank ahead, one level lower.
  const s = empty([
    [idx(4, 3, 3), 'P', 'w'], [idx(4, 4, 2), 'P', 'b'], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 7), 'K', 'b'],
  ]);
  assert.ok(legalMovesFrom(s, idx(4, 3, 3)).some((m) => m.to === idx(4, 4, 2) && m.capture));
  const b = { ...s, turn: 'b' };
  assert.ok(legalMovesFrom(b, idx(4, 4, 2)).some((m) => m.to === idx(4, 3, 3) && m.capture));
  // A corner-to-corner forward step is also a capture.
  s.board[idx(5, 4, 4)] = { t: 'N', c: 'b', m: true };
  assert.ok(legalMovesFrom(s, idx(4, 3, 3)).some((m) => m.to === idx(5, 4, 4) && m.capture));
  // But never straight ahead, and never purely backwards.
  s.board[idx(4, 4, 3)] = { t: 'N', c: 'b', m: true };
  s.board[idx(4, 2, 2)] = { t: 'N', c: 'b', m: true };
  const t = legalMovesFrom(s, idx(4, 3, 3)).map((m) => m.to);
  assert.ok(!t.includes(idx(4, 4, 3)));
  assert.ok(!t.includes(idx(4, 2, 2)));
});

test('no en passant', () => {
  const s = empty([
    [idx(3, 3, 1), 'P', 'w'], [idx(4, 5, 1), 'P', 'b', false], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 7), 'K', 'b'],
  ], 'b');
  const n = applyMove(s, { from: idx(4, 5, 1), to: idx(4, 3, 1) }); // double step lands beside the white pawn
  assert.ok(n);
  assert.ok(!legalMovesFrom(n, idx(3, 3, 1)).some((m) => m.to === idx(4, 4, 1)));
});


test('castling: rook moves two, king lands just past it (in line or one diagonal off)', () => {
  const setup = () => empty([
    [idx(4, 0, 0), 'K', 'w', false], [idx(7, 0, 0), 'R', 'w', false], [idx(0, 0, 0), 'R', 'w', false],
    [idx(4, 7, 7), 'K', 'b'],
  ]);
  const s = setup();
  const dests = legalMovesFrom(s, idx(4, 0, 0)).filter((m) => m.castle).map((m) => sqName(m.to)).sort();
  // King side: rook h1A->f1A, king g1A / g2A / g1B. Queen side: rook a1A->c1A, king b1A / b2A / b1B.
  assert.deepEqual(dests, ['b1A', 'b1B', 'b2A', 'g1A', 'g1B', 'g2A']);
  const ks = applyMove(s, { from: idx(4, 0, 0), to: idx(6, 0, 0) });
  assert.equal(ks.board[idx(5, 0, 0)].t, 'R');
  assert.equal(ks.board[idx(7, 0, 0)], null);
  assert.equal(ks.history[0].label, 'O-O');
  const qs = applyMove(setup(), { from: idx(4, 0, 0), to: idx(1, 0, 1) });
  assert.equal(qs.board[idx(2, 0, 0)].t, 'R');
  assert.equal(qs.board[idx(1, 0, 1)].t, 'K');
  assert.equal(qs.history[0].label, 'O-O-O Kb1B');
});

test('castling is blocked by pieces between, attacked squares, or an occupied landing square', () => {
  const base = (extra) => empty([
    [idx(4, 0, 0), 'K', 'w', false], [idx(7, 0, 0), 'R', 'w', false], [idx(0, 0, 0), 'R', 'w', false],
    [idx(4, 7, 7), 'K', 'b'], ...extra,
  ]);
  const castles = (s) => legalMovesFrom(s, idx(4, 0, 0)).filter((m) => m.castle).map((m) => sqName(m.to));
  // Knight on b1A blocks the queen side completely (every square between must be empty).
  assert.ok(!castles(base([[idx(1, 0, 0), 'N', 'w']])).some((n) => n.startsWith('b')));
  // f1A attacked: king would pass through check on the king side.
  assert.ok(!castles(base([[idx(5, 0, 5), 'R', 'b']])).some((n) => n.startsWith('g')));
  // Only the occupied landing square drops out.
  const c = castles(base([[idx(6, 1, 0), 'P', 'w']]));
  assert.ok(c.includes('g1A') && c.includes('g1B') && !c.includes('g2A'));
  // Moved rook: no castling that side.
  const moved = base([]);
  moved.board[idx(7, 0, 0)].m = true;
  assert.ok(!castles(moved).some((n) => n.startsWith('g')));
  // Black mirrors it on its own edge, stepping off the line toward the board.
  const b = empty([
    [idx(4, 7, 7), 'K', 'b', false], [idx(7, 7, 7), 'R', 'b', false], [idx(0, 0, 0), 'K', 'w'],
  ], 'b');
  assert.deepEqual(legalMovesFrom(b, idx(4, 7, 7)).filter((m) => m.castle).map((m) => sqName(m.to)).sort(), ['g7H', 'g8G', 'g8H']);
});

test('rook steps one square along a planar diagonal, never a space diagonal', () => {
  const s = empty([[idx(3, 3, 3), 'R', 'w'], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 0), 'K', 'b'], [idx(4, 4, 3), 'N', 'b']]);
  const t = legalMovesFrom(s, idx(3, 3, 3));
  assert.ok(t.some((m) => m.to === idx(4, 4, 3) && m.capture), 'captures one diagonal step');
  assert.ok(t.some((m) => m.to === idx(3, 4, 4)));
  assert.ok(t.some((m) => m.to === idx(2, 3, 2)));
  assert.ok(!t.some((m) => m.to === idx(5, 5, 3)), 'not two diagonal steps');
  assert.ok(!t.some((m) => m.to === idx(4, 4, 4)), 'not a space diagonal');
  assert.ok(t.some((m) => m.to === idx(3, 3, 7)), 'still slides straight');
  assert.ok(isAttacked(s.board, idx(2, 2, 3), 'w'));
  assert.ok(!isAttacked(s.board, idx(4, 4, 4), 'w'));
});

test('pawn moves up-forward one square, or two only on its first move', () => {
  const fresh = empty([[idx(4, 1, 1), 'P', 'w', false], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 0), 'K', 'b']]);
  let t = legalMovesFrom(fresh, idx(4, 1, 1));
  assert.ok(t.some((m) => m.to === idx(4, 2, 2) && !m.capture));
  assert.ok(t.some((m) => m.to === idx(4, 3, 3) && !m.capture), 'two on the first move');
  assert.ok(!t.some((m) => m.to === idx(4, 4, 4)), 'never three');
  const moved = empty([[idx(4, 2, 2), 'P', 'w', true], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 0), 'K', 'b']]);
  t = legalMovesFrom(moved, idx(4, 2, 2));
  assert.ok(t.some((m) => m.to === idx(4, 3, 3)));
  assert.ok(!t.some((m) => m.to === idx(4, 4, 4)), 'no double step after moving');
  // Black's is down-forward.
  const b = empty([[idx(4, 6, 6), 'P', 'b', false], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 0), 'K', 'b']], 'b');
  assert.ok(legalMovesFrom(b, idx(4, 6, 6)).some((m) => m.to === idx(4, 4, 4)));
});

test('pawn captures up-forward one square, or two on its first move with a clear path', () => {
  const s = empty([
    [idx(4, 1, 1), 'P', 'w', false], [idx(4, 3, 3), 'R', 'b'], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 0), 'K', 'b'],
  ]);
  assert.ok(legalMovesFrom(s, idx(4, 1, 1)).some((m) => m.to === idx(4, 3, 3) && m.capture));
  s.board[idx(4, 2, 2)] = { t: 'N', c: 'b', m: true };
  const t = legalMovesFrom(s, idx(4, 1, 1));
  assert.ok(t.some((m) => m.to === idx(4, 2, 2) && m.capture), 'takes the nearer piece');
  assert.ok(!t.some((m) => m.to === idx(4, 3, 3)), 'cannot jump over it');
  const moved = empty([
    [idx(4, 1, 1), 'P', 'w', true], [idx(4, 3, 3), 'R', 'b'], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 0), 'K', 'b'],
  ]);
  assert.ok(!legalMovesFrom(moved, idx(4, 1, 1)).some((m) => m.to === idx(4, 3, 3)), 'no two-square capture after moving');
});

test('two-square up-forward pawn attack gives check only from an unmoved pawn', () => {
  const s = empty([[idx(4, 1, 1), 'P', 'w', false], [idx(0, 0, 0), 'K', 'w'], [idx(4, 3, 3), 'K', 'b']], 'b');
  assert.ok(inCheck(s.board, 'b'));
  s.board[idx(4, 2, 2)] = { t: 'N', c: 'b', m: true };
  assert.ok(!inCheck(s.board, 'b'), 'blocked line is no attack');
  s.board[idx(4, 2, 2)] = null;
  s.board[idx(4, 1, 1)].m = true;
  assert.ok(!inCheck(s.board, 'b'), 'a moved pawn only reaches one square');
});
