import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, allLegalMoves, legalMovesFrom, applyMove, idx, SIZE, replay, sqName,
  KNIGHT_JUMPS, BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS, pawnCaptures, inCheck, isAttacked,
  frameDirs, facingChoices, normalizeRules, allLegalMoves as allMoves, frameBishopDirs, frameKnightJumps,
} from '../rules.js';

const REL = { mode: 'relative' };
const relEmpty = (pieces, turn = 'w', rules = REL) => {
  const s = empty([], turn);
  for (const [i, t, c, o, m = true] of pieces) s.board[i] = { t, c, m, o };
  return { ...s, rules: normalizeRules(rules) };
};
const DIAG_W = [0, 1, 1, 1];

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
    [idx(0, 0, 0), 'B', 'w'], [idx(7, 7, 7), 'R', 'b'], [idx(6, 0, 2), 'K', 'w'], [idx(0, 7, 7), 'K', 'b'],
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

test('classic rook slides along planar diagonals to the edge, never a space diagonal', () => {
  const s = empty([[idx(3, 3, 3), 'R', 'w'], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 0), 'K', 'b'], [idx(5, 5, 3), 'N', 'b']]);
  const t = legalMovesFrom(s, idx(3, 3, 3)).map((m) => m.to);
  assert.ok(t.includes(idx(4, 4, 3)) && t.includes(idx(5, 5, 3)), 'slides and captures along the diagonal');
  assert.ok(!t.includes(idx(6, 6, 3)), 'stopped by the piece it captures');
  assert.ok(t.includes(idx(3, 7, 7)), 'all the way to the edge along a rank/level diagonal');
  assert.ok(t.includes(idx(0, 3, 0)));
  assert.ok(!t.includes(idx(4, 4, 4)), 'not a space diagonal');
  assert.ok(t.includes(idx(3, 3, 7)), 'still slides straight');
  assert.ok(isAttacked(s.board, idx(0, 0, 3), 'w'));
  assert.ok(!isAttacked(s.board, idx(4, 4, 4), 'w'));
});

test('classic toggle: rooks without diagonals', () => {
  const s = { ...empty([[idx(3, 3, 3), 'R', 'w'], [idx(0, 0, 0), 'K', 'w'], [idx(7, 7, 0), 'K', 'b']]), rules: { mode: 'classic', rookDiagonals: false } };
  const t = legalMovesFrom(s, idx(3, 3, 3));
  assert.equal(t.length, 21, 'straight lines only');
  assert.ok(!isAttacked(s.board, idx(4, 4, 3), 'w', s.rules));
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

// ---------------------------------------------------------------- relative mode
test('frames: square, and turned 45 degrees about one axis', () => {
  assert.deepEqual(frameDirs([0, 1, 0, 0]), ROOK_DIRS);
  const turnedX = frameDirs([0, 1, 1, 1]).map((d) => d.join(',')).sort();
  assert.deepEqual(turnedX, ['-1,0,0', '0,-1,-1', '0,-1,1', '0,1,-1', '0,1,1', '1,0,0']);
  assert.deepEqual(frameDirs([1, 0, 0, 1]).map((d) => d.join(',')).sort(), turnedX, 'axis facing, turned about that axis');
});

test('relative start: armies face each other diagonally, no captures on move one', () => {
  const s = initialState(REL);
  assert.deepEqual(s.board[idx(4, 0, 0)].o, [0, 1, 1, 1]);
  assert.deepEqual(s.board[idx(4, 7, 7)].o, [0, -1, -1, 1]);
  assert.equal(s.rules.mode, 'relative');
  assert.equal(allMoves(s).filter((m) => m.capture).length, 0);
});

test('relative rook moves along its own three axes only', () => {
  const s = relEmpty([[idx(3, 3, 3), 'R', 'w', DIAG_W], [idx(0, 0, 0), 'K', 'w', DIAG_W], [idx(7, 0, 7), 'K', 'b', [0, -1, -1, 1]]]);
  const t = legalMovesFrom(s, idx(3, 3, 3)).map((m) => m.to);
  assert.ok(t.includes(idx(7, 3, 3)) && t.includes(idx(0, 3, 3)), 'file axis');
  assert.ok(t.includes(idx(3, 7, 7)) && t.includes(idx(3, 0, 0)), 'its forward diagonal');
  assert.ok(t.includes(idx(3, 0, 6)) && t.includes(idx(3, 6, 0)), 'its up diagonal');
  assert.ok(!t.includes(idx(3, 4, 3)) && !t.includes(idx(3, 3, 4)), 'board rank/level lines are not straight for it');
  assert.ok(!t.includes(idx(4, 4, 3)), 'nor other diagonals');
  // Square facing: an ordinary rook.
  s.board[idx(3, 3, 3)].o = [0, 1, 0, 0];
  const sq = legalMovesFrom(s, idx(3, 3, 3)).map((m) => m.to);
  assert.ok(sq.includes(idx(3, 4, 3)) && !sq.includes(idx(3, 4, 4)));
  // Toggle: turned rooks keep the board's axes too.
  const g = relEmpty([[idx(3, 3, 3), 'R', 'w', DIAG_W], [idx(0, 0, 0), 'K', 'w', DIAG_W], [idx(7, 0, 7), 'K', 'b', [0, -1, -1, 1]]], 'w', { mode: 'relative', gridLines: true });
  const gt = legalMovesFrom(g, idx(3, 3, 3)).map((m) => m.to);
  assert.ok(gt.includes(idx(3, 4, 3)) && gt.includes(idx(3, 7, 7)));
});

test('relative rook gives check along its own diagonal', () => {
  const s = relEmpty([[idx(0, 0, 0), 'R', 'w', DIAG_W], [idx(7, 0, 7), 'K', 'w', DIAG_W], [idx(0, 5, 5), 'K', 'b', [0, -1, -1, 1]]], 'b');
  assert.ok(inCheck(s.board, 'b', s.rules));
  s.board[idx(0, 0, 0)].o = [0, 1, 0, 0];
  assert.ok(!inCheck(s.board, 'b', s.rules), 'a square-facing rook does not see the diagonal');
});

test('relative pawn: straight along its facing, captures ahead-and-sideways in its frame', () => {
  const s = relEmpty([[idx(4, 1, 1), 'P', 'w', DIAG_W, false], [idx(0, 0, 0), 'K', 'w', DIAG_W], [idx(7, 7, 7), 'K', 'b', [0, -1, -1, 1]]]);
  let t = legalMovesFrom(s, idx(4, 1, 1)).map((m) => m.to);
  assert.deepEqual(t.sort((a, b) => a - b), [idx(4, 2, 2), idx(4, 3, 3)].sort((a, b) => a - b), 'one or two along its diagonal facing');
  // Captures: forward + each perpendicular frame axis.
  for (const sq of [idx(5, 2, 2), idx(3, 2, 2), idx(4, 1, 3), idx(4, 3, 1)]) s.board[sq] = { t: 'N', c: 'b', m: true };
  t = legalMovesFrom(s, idx(4, 1, 1)).filter((m) => m.capture).map((m) => m.to).sort((a, b) => a - b);
  assert.deepEqual(t, [idx(5, 2, 2), idx(3, 2, 2), idx(4, 1, 3), idx(4, 3, 1)].sort((a, b) => a - b));
});

test('relative: facing is chosen with the move and changes what the piece can do next', () => {
  let s = initialState(REL);
  // a2B pawn moves, then turns to face straight up the ranks.
  s = applyMove(s, { from: idx(0, 1, 1), to: idx(0, 2, 2), face: [0, 1, 0, 0] });
  assert.ok(s);
  assert.deepEqual(s.board[idx(0, 2, 2)].o, [0, 1, 0, 0]);
  assert.ok(s.history[0].label.endsWith('→8'));
  s = applyMove(s, { from: idx(0, 6, 6), to: idx(0, 5, 5) });
  assert.deepEqual(s.board[idx(0, 5, 5)].o, [0, -1, -1, 1], 'no face given: facing unchanged');
  const t = legalMovesFrom(s, idx(0, 2, 2)).map((m) => m.to);
  assert.deepEqual(t, [idx(0, 3, 2)], 'moved pawn now steps up the rank, one square');
  // Illegal facings are rejected.
  assert.equal(applyMove(s, { from: idx(0, 2, 2), to: idx(0, 3, 2), face: [0, -1, 0, 0] }), null, 'pawns may not face backward');
  assert.equal(applyMove(s, { from: idx(0, 2, 2), to: idx(0, 3, 2), face: [1, 1, 1, 0] }), null, 'no space-diagonal facings');
});

test('relative: facing choices', () => {
  const s = initialState(REL);
  assert.equal(facingChoices(s, idx(0, 0, 0)).length, 24, 'rook: 6 axes x 2 frames + 12 diagonals');
  assert.equal(facingChoices(s, idx(0, 1, 1)).length, 9, 'pawn: only directions toward the enemy');
  assert.equal(facingChoices(s, idx(1, 0, 0)).length, 0, 'knight: facing off by default');
  assert.equal(facingChoices(s, idx(2, 0, 0)).length, 24, 'bishop: facing on by default');
  assert.equal(facingChoices(s, idx(3, 0, 0)).length, 0, 'queen: never');
  const any = initialState({ mode: 'relative', pawnsAnyFacing: true });
  assert.equal(facingChoices(any, idx(0, 1, 1)).length, 24);
  assert.equal(facingChoices(initialState(), idx(0, 0, 0)).length, 0, 'classic mode has no facings');
});

test('relative: replay with rules and facings', () => {
  const moves = [
    { from: idx(0, 1, 1), to: idx(0, 2, 2), face: [0, 0, 1, 1] },
    { from: idx(0, 6, 6), to: idx(0, 5, 5) },
  ];
  const s = replay(moves, REL);
  assert.equal(s.history.length, 2);
  assert.deepEqual(s.board[idx(0, 2, 2)].o, [0, 0, 1, 1]);
});

test('relative random playouts with random facings stay consistent', () => {
  let s = initialState(REL);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 80 && !s.result; i++) {
    const ms = allMoves(s);
    const m = ms[Math.floor(rnd() * ms.length)];
    const faces = facingChoices(s, m.from, m.promotion ? 'Q' : undefined);
    const face = faces.length ? faces[Math.floor(rnd() * faces.length)] : undefined;
    const n = applyMove(s, { ...m, face });
    assert.ok(n, `move ${i} applies`);
    s = n;
    assert.equal(s.board.filter((p) => p && p.t === 'K').length, 2);
  }
});

const key = (ds) => ds.map((d) => d.join(',')).sort();

test('relative bishop: square frame is the classic bishop, turned frame sees board axes as diagonals', () => {
  assert.deepEqual(key(frameBishopDirs([0, 1, 0, 0])), key(BISHOP_DIRS));
  const turned = frameBishopDirs([0, 1, 1, 1]);
  assert.equal(turned.length, 20);
  const k = key(turned);
  for (const d of ['0,0,2', '0,2,0', '0,0,-2', '1,1,1', '1,-1,1', '1,0,2', '1,2,0', '-1,-2,0']) assert.ok(k.includes(d), d);
  assert.ok(!k.includes('0,1,1'), 'its forward axis is not a diagonal for it');
});

test('relative bishop moves: turned bishop slides along the level axis two squares at a time', () => {
  const s = relEmpty([[idx(3, 3, 1), 'B', 'w', DIAG_W], [idx(0, 0, 0), 'K', 'w', DIAG_W], [idx(7, 7, 7), 'K', 'b', [0, -1, -1, 1]], [idx(3, 3, 5), 'P', 'b', [0, -1, -1, 1]]]);
  const t = legalMovesFrom(s, idx(3, 3, 1)).map((m) => m.to);
  assert.ok(t.includes(idx(3, 3, 3)) && t.includes(idx(3, 3, 5)), 'up the level axis by twos, capturing at the end');
  assert.ok(!t.includes(idx(3, 3, 2)) && !t.includes(idx(3, 3, 7)));
  assert.ok(t.includes(idx(4, 4, 2)), 'board space diagonal');
  assert.ok(t.includes(idx(4, 5, 1)), '(1, 2, 0) line');
  assert.ok(!t.includes(idx(4, 4, 1)), 'flat board diagonals are not diagonals for it');
  // Turning off the toggle gives the classic bishop back.
  const c = relEmpty([[idx(3, 3, 1), 'B', 'w', DIAG_W], [idx(0, 0, 0), 'K', 'w', DIAG_W], [idx(7, 7, 7), 'K', 'b', [0, -1, -1, 1]]], 'w', { mode: 'relative', bishopFacing: false });
  assert.ok(legalMovesFrom(c, idx(3, 3, 1)).some((m) => m.to === idx(4, 4, 1)));
});

test('relative knight (toggle): leaps along its own axes, diagonal legs included', () => {
  assert.deepEqual(key(frameKnightJumps([0, 1, 0, 0])), key(KNIGHT_JUMPS));
  const k = key(frameKnightJumps([0, 1, 1, 1]));
  assert.equal(k.length, 24);
  for (const d of ['2,1,1', '2,-1,1', '1,2,2', '0,1,3', '0,3,1', '0,-3,-1']) assert.ok(k.includes(d), d);
  const s = relEmpty([[idx(3, 3, 3), 'N', 'w', DIAG_W], [idx(0, 0, 0), 'K', 'w', DIAG_W], [idx(7, 7, 7), 'K', 'b', [0, -1, -1, 1]]], 'w', { mode: 'relative', knightFacing: true });
  const t = legalMovesFrom(s, idx(3, 3, 3)).map((m) => m.to);
  assert.ok(t.includes(idx(5, 4, 4)) && t.includes(idx(3, 4, 6)));
  assert.ok(!t.includes(idx(5, 4, 3)), 'board knight leap is not one for it');
});

test('relative start with every facing toggle on: still no captures on move one', () => {
  const s = initialState({ mode: 'relative', bishopFacing: true, knightFacing: true });
  assert.equal(allMoves(s).filter((m) => m.capture).length, 0);
});
