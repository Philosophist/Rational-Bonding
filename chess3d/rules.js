// Rules engine for 8x8x8 3D chess. Pure functions, no DOM: shared by the
// browser client and the Node tests.
//
// Coordinates: x = file (a-h), y = rank (1-8), z = level (A-H).
// White's back rank lies on the edge y=0,z=0; Black's on the opposite edge
// y=7,z=7. Each pawn row sits one step diagonally toward the enemy
// (y=1,z=1 / y=6,z=6) so it shields every line out of the back rank.

// Bump whenever move rules change, so online players on different versions are warned.
export const RULES_VERSION = 2;

export const N = 8;
export const SIZE = N * N * N;
export const FILES = 'abcdefgh';
export const LEVELS = 'ABCDEFGH';

export const idx = (x, y, z) => x + N * y + N * N * z;
export const coords = (i) => [i % N, Math.floor(i / N) % N, Math.floor(i / (N * N))];
export const inBounds = (x, y, z) => x >= 0 && x < N && y >= 0 && y < N && z >= 0 && z < N;
export const sqName = (i) => {
  const [x, y, z] = coords(i);
  return `${FILES[x]}${y + 1}${LEVELS[z]}`;
};
export const other = (c) => (c === 'w' ? 'b' : 'w');

const ALL_DIRS = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++)
      if (dx || dy || dz) ALL_DIRS.push([dx, dy, dz]);

const nonZero = (d) => d.filter((v) => v !== 0).length;
// Rook: along one axis. Bishop: any diagonal, whether within a plane (two
// axes change) or corner to corner through the cube (all three change).
// Queen: rook + bishop. King: one step any way.
export const ROOK_DIRS = ALL_DIRS.filter((d) => nonZero(d) === 1);
export const BISHOP_DIRS = ALL_DIRS.filter((d) => nonZero(d) >= 2);
export const QUEEN_DIRS = ALL_DIRS;
export const KING_DIRS = ALL_DIRS;

// Knight: 2 along one axis and 1 along another.
export const KNIGHT_JUMPS = [];
for (const a of [-2, -1, 1, 2])
  for (const b of [-2, -1, 1, 2]) {
    if (Math.abs(a) === Math.abs(b)) continue;
    KNIGHT_JUMPS.push([a, b, 0], [a, 0, b], [0, a, b]);
  }

// Pawns have two "forward" axes: rank and level, both pointing at the enemy edge.
const pawnSign = (c) => (c === 'w' ? 1 : -1);
export const pawnForward = (c) => {
  const s = pawnSign(c);
  return [[0, s, 0], [0, 0, s]];
};
// A pawn captures one diagonal step (any bishop direction) that moves it forward
// on at least one of its forward axes, e.g. forward a rank while dropping a level.
export const pawnCaptures = (c) => {
  const s = pawnSign(c);
  return BISHOP_DIRS.filter((d) => d[1] === s || d[2] === s);
};
const promotionEdge = (c) => (c === 'w' ? N - 1 : 0);
export const isPromotionSquare = (c, i) => {
  const [, y, z] = coords(i);
  const e = promotionEdge(c);
  return y === e && z === e;
};

const BACK_RANK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
const homeEdge = (c) => (c === 'w' ? [0, 0] : [N - 1, N - 1]);

export function initialState() {
  const board = new Array(SIZE).fill(null);
  for (let x = 0; x < N; x++) {
    board[idx(x, 0, 0)] = { t: BACK_RANK[x], c: 'w', m: false };
    board[idx(x, 1, 1)] = { t: 'P', c: 'w', m: false };
    board[idx(x, 7, 7)] = { t: BACK_RANK[x], c: 'b', m: false };
    board[idx(x, 6, 6)] = { t: 'P', c: 'b', m: false };
  }
  const state = { board, turn: 'w', history: [], halfmove: 0, result: null };
  state.status = computeStatus(state);
  return state;
}

function step(i, d, k = 1) {
  const [x, y, z] = coords(i);
  const nx = x + d[0] * k, ny = y + d[1] * k, nz = z + d[2] * k;
  return inBounds(nx, ny, nz) ? idx(nx, ny, nz) : -1;
}

export function findKing(board, c) {
  for (let i = 0; i < SIZE; i++) {
    const p = board[i];
    if (p && p.t === 'K' && p.c === c) return i;
  }
  return -1;
}

// Is square `sq` attacked by any piece of color `by`?
export function isAttacked(board, sq, by) {
  const hit = (i, types) => {
    const p = board[i];
    return p && p.c === by && types.includes(p.t);
  };
  const ray = (dirs, types) => {
    for (const d of dirs) {
      for (let k = 1; ; k++) {
        const t = step(sq, d, k);
        if (t < 0) break;
        if (board[t]) {
          if (hit(t, types)) return true;
          break;
        }
      }
    }
    return false;
  };
  if (ray(ROOK_DIRS, 'RQ') || ray(BISHOP_DIRS, 'BQ')) return true;
  for (const d of KNIGHT_JUMPS) {
    const t = step(sq, d);
    if (t >= 0 && hit(t, 'N')) return true;
  }
  for (const d of KING_DIRS) {
    const t = step(sq, d);
    if (t >= 0 && hit(t, 'K')) return true;
  }
  // A pawn of `by` standing at sq - capture attacks sq.
  for (const d of pawnCaptures(by)) {
    const t = step(sq, [-d[0], -d[1], -d[2]]);
    if (t >= 0 && hit(t, 'P')) return true;
  }
  return false;
}

export const inCheck = (board, c) => {
  const k = findKing(board, c);
  return k >= 0 && isAttacked(board, k, other(c));
};

function pseudoMoves(board, from) {
  const p = board[from];
  if (!p) return [];
  const moves = [];
  const add = (to, extra) => moves.push({ from, to, ...extra });
  const slide = (dirs) => {
    for (const d of dirs) {
      for (let k = 1; ; k++) {
        const t = step(from, d, k);
        if (t < 0) break;
        const q = board[t];
        if (!q) add(t);
        else {
          if (q.c !== p.c) add(t, { capture: true });
          break;
        }
      }
    }
  };
  const jump = (dirs) => {
    for (const d of dirs) {
      const t = step(from, d);
      if (t < 0) continue;
      const q = board[t];
      if (!q) add(t);
      else if (q.c !== p.c) add(t, { capture: true });
    }
  };
  switch (p.t) {
    case 'R': slide(ROOK_DIRS); break;
    case 'B': slide(BISHOP_DIRS); break;
    case 'Q': slide(QUEEN_DIRS); break;
    case 'N': jump(KNIGHT_JUMPS); break;
    case 'K': jump(KING_DIRS); break;
    case 'P': {
      for (const d of pawnForward(p.c)) {
        const t = step(from, d);
        if (t < 0 || board[t]) continue;
        add(t);
        if (!p.m) {
          const t2 = step(from, d, 2);
          if (t2 >= 0 && !board[t2]) add(t2);
        }
      }
      for (const d of pawnCaptures(p.c)) {
        const t = step(from, d);
        if (t >= 0 && board[t] && board[t].c !== p.c) add(t, { capture: true });
      }
      for (const m of moves) if (isPromotionSquare(p.c, m.to)) m.promotion = true;
      break;
    }
  }
  return moves;
}

function castlingMoves(board, from) {
  const k = board[from];
  if (!k || k.t !== 'K' || k.m) return [];
  const [hy, hz] = homeEdge(k.c);
  if (from !== idx(4, hy, hz)) return [];
  const enemy = other(k.c);
  if (isAttacked(board, from, enemy)) return [];
  const moves = [];
  for (const [rookX, dir] of [[7, 1], [0, -1]]) {
    const rook = board[idx(rookX, hy, hz)];
    if (!rook || rook.t !== 'R' || rook.c !== k.c || rook.m) continue;
    let clear = true;
    for (let x = 4 + dir; x !== rookX; x += dir) if (board[idx(x, hy, hz)]) clear = false;
    if (!clear) continue;
    // King may not pass through or land on an attacked square.
    if (isAttacked(board, idx(4 + dir, hy, hz), enemy)) continue;
    moves.push({
      from,
      to: idx(4 + 2 * dir, hy, hz),
      castle: { rookFrom: idx(rookX, hy, hz), rookTo: idx(4 + dir, hy, hz) },
    });
  }
  return moves;
}

// Returns a new board with the move played (no legality checks).
export function playOnBoard(board, move) {
  const b = board.slice();
  const p = b[move.from];
  b[move.from] = null;
  b[move.to] = { t: move.promotion ? move.promo || 'Q' : p.t, c: p.c, m: true };
  if (move.castle) {
    const r = b[move.castle.rookFrom];
    b[move.castle.rookFrom] = null;
    b[move.castle.rookTo] = { ...r, m: true };
  }
  return b;
}

export function legalMovesFrom(state, from) {
  const p = state.board[from];
  if (!p || p.c !== state.turn || state.result) return [];
  const moves = pseudoMoves(state.board, from).filter(
    (m) => !inCheck(playOnBoard(state.board, m), p.c),
  );
  for (const m of castlingMoves(state.board, from))
    if (!inCheck(playOnBoard(state.board, m), p.c)) moves.push(m);
  return moves;
}

export function allLegalMoves(state) {
  const out = [];
  for (let i = 0; i < SIZE; i++) {
    const p = state.board[i];
    if (p && p.c === state.turn) out.push(...legalMovesFrom({ ...state, result: null }, i));
  }
  return out;
}

function insufficientMaterial(board) {
  const rest = board.filter((p) => p && p.t !== 'K');
  return rest.length === 0 || (rest.length === 1 && 'BN'.includes(rest[0].t));
}

function computeStatus(state) {
  const check = inCheck(state.board, state.turn);
  const anyMove = allLegalMoves(state).length > 0;
  if (!anyMove) {
    return check
      ? { check, over: true, result: other(state.turn), reason: 'checkmate' }
      : { check, over: true, result: 'draw', reason: 'stalemate' };
  }
  if (insufficientMaterial(state.board))
    return { check, over: true, result: 'draw', reason: 'insufficient material' };
  if (state.halfmove >= 100) return { check, over: true, result: 'draw', reason: '50-move rule' };
  return { check, over: false };
}

export function moveLabel(board, move) {
  const p = board[move.from];
  if (move.castle) return move.to % N === 6 ? 'O-O' : 'O-O-O';
  const piece = p.t === 'P' ? '' : p.t;
  const sep = move.capture ? 'x' : '-';
  const promo = move.promotion ? `=${move.promo || 'Q'}` : '';
  return `${piece}${sqName(move.from)}${sep}${sqName(move.to)}${promo}`;
}

// Find the legal move matching {from, to, promo}; null if illegal.
export function findMove(state, { from, to, promo }) {
  const m = legalMovesFrom(state, from).find((mv) => mv.to === to);
  if (!m) return null;
  if (m.promotion) {
    const choice = promo || 'Q';
    if (!'QRBN'.includes(choice)) return null;
    return { ...m, promo: choice };
  }
  return m;
}

// Returns the new state, or null if the move is illegal.
export function applyMove(state, input) {
  if (state.result) return null;
  const move = findMove(state, input);
  if (!move) return null;
  const mover = state.board[move.from];
  const label = moveLabel(state.board, move);
  const captured = state.board[move.to];
  const next = {
    board: playOnBoard(state.board, move),
    turn: other(state.turn),
    history: [...state.history, { from: move.from, to: move.to, promo: move.promo, label, captured: captured ? { t: captured.t, c: captured.c } : null }],
    halfmove: mover.t === 'P' || captured ? 0 : state.halfmove + 1,
    result: null,
  };
  next.status = computeStatus(next);
  if (next.status.check) next.history[next.history.length - 1].label += next.status.over ? '#' : '+';
  if (next.status.over) next.result = { winner: next.status.result, reason: next.status.reason };
  return next;
}

export function resign(state, color) {
  return { ...state, result: { winner: other(color), reason: 'resignation' } };
}

// Rebuild a game from a list of {from, to, promo}. Stops at the first illegal move.
export function replay(moves) {
  let s = initialState();
  for (const m of moves) {
    const n = applyMove(s, m);
    if (!n) break;
    s = n;
  }
  return s;
}
