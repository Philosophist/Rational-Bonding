// Rules engine for 8x8x8 3D chess. Pure functions, no DOM: shared by the
// browser client and the Node tests.
//
// Coordinates: x = file (a-h), y = rank (1-8), z = level (A-H).
// White's back rank lies on the edge y=0,z=0; Black's on the opposite edge
// y=7,z=7. Each pawn row sits one step diagonally toward the enemy
// (y=1,z=1 / y=6,z=6) so it shields every line out of the back rank.

// Bump whenever move rules change, so online players on different versions are warned.
export const RULES_VERSION = 5;

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
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
// Rook: any distance along one axis; in classic mode (by default) also any
// distance along a planar diagonal (two axes change, never all three).
// Bishop: any diagonal, whether within a plane (two axes change) or corner to
// corner through the cube (all three change). Queen: any line. King: one step.
export const ROOK_DIRS = ALL_DIRS.filter((d) => nonZero(d) === 1);
export const PLANAR_DIAGONALS = ALL_DIRS.filter((d) => nonZero(d) === 2);
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
// Up-forward: one rank toward the enemy and one level toward the enemy at once.
// It is both forward and diagonal, so a pawn may move OR capture along it:
// one square, or two on its first move if the square in between is empty.
export const pawnUpForward = (c) => {
  const s = pawnSign(c);
  return [0, s, s];
};
const promotionEdge = (c) => (c === 'w' ? N - 1 : 0);
export const isPromotionSquare = (c, i) => {
  const [, y, z] = coords(i);
  const e = promotionEdge(c);
  return y === e && z === e;
};

// ---------------------------------------------------------------- rule sets
// classic:  the board's own axes for everyone.
//   rookDiagonals - rooks also slide along planar diagonals.
// relative: every piece has a facing that defines its own three straight axes.
//   gridLines      - rooks turned 45° keep the board's axes as well.
//   pawnsAnyFacing - pawns may face any way, not only toward the enemy.
export const DEFAULT_RULES = {
  classic: { mode: 'classic', rookDiagonals: true },
  relative: { mode: 'relative', gridLines: false, pawnsAnyFacing: false },
};

export function normalizeRules(r) {
  const mode = r?.mode === 'relative' ? 'relative' : 'classic';
  const out = { ...DEFAULT_RULES[mode] };
  for (const k of Object.keys(out)) if (k !== 'mode' && typeof r?.[k] === 'boolean') out[k] = r[k];
  return out;
}

// ---------------------------------------------------------------- facing (relative mode)
// A piece's straight lines are three mutually perpendicular grid directions.
// On a cube grid there are exactly four such frames: the board's own axes, and
// the board turned 45° about one axis (that axis stays; the other two become
// the diagonals of the cross-section). So a facing is a forward direction
// that is either an axis or a planar diagonal, plus, for an axis, whether its
// frame is square to the board or turned 45° about that axis.
// Stored on a piece as o = [dx, dy, dz, turned].
export const FACINGS = ALL_DIRS.filter((d) => nonZero(d) <= 2);

export function normalizeFacing(f) {
  if (!Array.isArray(f) || f.length < 3) return null;
  const d = [f[0], f[1], f[2]];
  if (!FACINGS.some((g) => same(g, d))) return null;
  return [...d, nonZero(d) === 2 ? 1 : f[3] ? 1 : 0];
}

// The axis (0, 1, 2) the piece's frame is turned about, or -1 if square.
function frameAxis(o) {
  if (nonZero(o.slice(0, 3)) === 2) return [0, 1, 2].find((a) => o[a] === 0);
  return o[3] ? [0, 1, 2].find((a) => o[a] !== 0) : -1;
}

// The six straight directions of a facing's frame.
export function frameDirs(o) {
  const a = frameAxis(o);
  if (a < 0) return ROOK_DIRS;
  return ALL_DIRS.filter((d) => (nonZero(d) === 1 && d[a] !== 0) || (nonZero(d) === 2 && d[a] === 0));
}

export function facingAllowed(piece, o, rules) {
  if (piece.t !== 'P' || rules.pawnsAnyFacing) return true;
  const s = pawnSign(piece.c);
  return o[1] * s >= 0 && o[2] * s >= 0 && (o[1] !== 0 || o[2] !== 0);
}

// Which pieces' moves depend on their facing (and so get to choose it).
export const usesFacing = (piece, rules) => rules.mode === 'relative' && (piece.t === 'R' || piece.t === 'P');

export function facingLabel(o) {
  const parts = [o[0] > 0 ? 'h' : o[0] < 0 ? 'a' : '', o[1] > 0 ? '8' : o[1] < 0 ? '1' : '', o[2] > 0 ? 'H' : o[2] < 0 ? 'A' : ''];
  return '→' + parts.join('') + (nonZero(o.slice(0, 3)) === 1 && o[3] ? '◇' : '');
}

const BACK_RANK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
const homeEdge = (c) => (c === 'w' ? [0, 0] : [N - 1, N - 1]);

export function initialState(rulesIn) {
  const rules = normalizeRules(rulesIn);
  const board = new Array(SIZE).fill(null);
  // In relative mode both armies start facing each other across the diagonal.
  const face = (c) => (rules.mode === 'relative' ? { o: c === 'w' ? [0, 1, 1, 1] : [0, -1, -1, 1] } : {});
  for (let x = 0; x < N; x++) {
    board[idx(x, 0, 0)] = { t: BACK_RANK[x], c: 'w', m: false, ...face('w') };
    board[idx(x, 1, 1)] = { t: 'P', c: 'w', m: false, ...face('w') };
    board[idx(x, 7, 7)] = { t: BACK_RANK[x], c: 'b', m: false, ...face('b') };
    board[idx(x, 6, 6)] = { t: 'P', c: 'b', m: false, ...face('b') };
  }
  const state = { rules, board, turn: 'w', history: [], halfmove: 0, result: null };
  state.status = computeStatus(state);
  return state;
}

const CLASSIC = DEFAULT_RULES.classic;

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

// Is square `sq` attacked by any piece of color `by`? Worked out from each
// piece's own reach, so facings and rule toggles are always accounted for.
export function isAttacked(board, sq, by, rules = CLASSIC) {
  for (let i = 0; i < SIZE; i++) {
    const p = board[i];
    if (p && p.c === by && pieceMoves(board, i, rules, true).some((m) => m.to === sq)) return true;
  }
  return false;
}

export const inCheck = (board, c, rules = CLASSIC) => {
  const k = findKing(board, c);
  return k >= 0 && isAttacked(board, k, other(c), rules);
};

// Moves of the piece on `from`, ignoring check. With `attack`, returns every
// square the piece attacks instead (pawn capture squares even when empty).
function pieceMoves(board, from, rules, attack = false) {
  const p = board[from];
  if (!p) return [];
  const moves = [];
  const add = (to, extra) => moves.push({ from, to, ...extra });
  const land = (t) => {
    const q = board[t];
    if (!q) add(t);
    else if (q.c !== p.c) add(t, { capture: true });
    else if (attack) add(t);
  };
  const slide = (dirs) => {
    for (const d of dirs) {
      for (let k = 1; ; k++) {
        const t = step(from, d, k);
        if (t < 0) break;
        land(t);
        if (board[t]) break;
      }
    }
  };
  const jump = (dirs) => {
    for (const d of dirs) {
      const t = step(from, d);
      if (t >= 0) land(t);
    }
  };
  // Pawn capture square: only onto an enemy, but always "attacked".
  const strike = (t) => {
    if (t < 0) return;
    if (attack) add(t);
    else if (board[t] && board[t].c !== p.c) add(t, { capture: true });
  };
  const relative = rules.mode === 'relative' && p.o;
  switch (p.t) {
    case 'R':
      if (relative) {
        slide(frameDirs(p.o));
        if (rules.gridLines && frameAxis(p.o) >= 0) slide(ROOK_DIRS);
      } else {
        slide(ROOK_DIRS);
        if (rules.rookDiagonals) slide(PLANAR_DIAGONALS);
      }
      break;
    case 'B': slide(BISHOP_DIRS); break;
    case 'Q': slide(QUEEN_DIRS); break;
    case 'N': jump(KNIGHT_JUMPS); break;
    case 'K': jump(KING_DIRS); break;
    case 'P': {
      if (relative) {
        // Straight ahead along its facing (two on its first move); captures one
        // step ahead-and-sideways in its own frame.
        const f = p.o;
        if (!attack) {
          const t = step(from, f);
          if (t >= 0 && !board[t]) {
            add(t);
            const t2 = step(from, f, 2);
            if (!p.m && t2 >= 0 && !board[t2]) add(t2);
          }
        }
        for (const side of frameDirs(f)) if (dot(side, f) === 0) strike(step(from, [f[0] + side[0], f[1] + side[1], f[2] + side[2]]));
        for (const m of moves) if (isPromotionSquare(p.c, m.to)) m.promotion = true;
        break;
      }
      if (attack) {
        for (const d of pawnCaptures(p.c)) strike(step(from, d));
        const uf = pawnUpForward(p.c);
        const t1 = step(from, uf);
        if (!p.m && t1 >= 0 && !board[t1]) strike(step(from, uf, 2));
        break;
      }
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
      const uf = pawnUpForward(p.c);
      const t1 = step(from, uf);
      if (t1 >= 0 && !board[t1]) {
        add(t1); // capture on t1 is already covered by pawnCaptures
        const t2 = step(from, uf, 2);
        if (t2 >= 0 && !p.m) {
          if (!board[t2]) add(t2);
          else if (board[t2].c !== p.c) add(t2, { capture: true });
        }
      }
      for (const m of moves) if (isPromotionSquare(p.c, m.to)) m.promotion = true;
      break;
    }
  }
  return moves;
}

// Castling, the same on both sides: the rook moves two squares along the back
// rank toward the king, and the king jumps to just past it. The king may land
// in line with the rook, or one diagonal step off that line (one square up a
// rank or a level as well), as long as the landing square is empty.
// Neither piece may have moved, every square between them must be empty, and
// the king may not be in check, pass through an attacked square on the way to
// the rook's new square, or land in check.
function castlingMoves(board, from, rules) {
  const k = board[from];
  if (!k || k.t !== 'K' || k.m) return [];
  const [hy, hz] = homeEdge(k.c);
  if (from !== idx(4, hy, hz)) return [];
  const enemy = other(k.c);
  if (isAttacked(board, from, enemy, rules)) return [];
  const inward = k.c === 'w' ? 1 : -1; // off the back rank, into the board
  const moves = [];
  for (const [rookX, dir] of [[7, 1], [0, -1]]) {
    const rook = board[idx(rookX, hy, hz)];
    if (!rook || rook.t !== 'R' || rook.c !== k.c || rook.m) continue;
    let clear = true;
    for (let x = 4 + dir; x !== rookX; x += dir) if (board[idx(x, hy, hz)]) clear = false;
    if (!clear) continue;
    const rookToX = rookX - 2 * dir;
    let safe = true;
    for (let x = 4 + dir; x !== rookToX + dir; x += dir) if (isAttacked(board, idx(x, hy, hz), enemy, rules)) safe = false;
    if (!safe) continue;
    const kx = rookToX + dir;
    const castle = { rookFrom: idx(rookX, hy, hz), rookTo: idx(rookToX, hy, hz), side: dir > 0 ? 'O-O' : 'O-O-O' };
    for (const [ky, kz] of [[hy, hz], [hy + inward, hz], [hy, hz + inward]]) {
      const to = idx(kx, ky, kz);
      if (!board[to]) moves.push({ from, to, castle });
    }
  }
  return moves;
}

// Returns a new board with the move played (no legality checks).
export function playOnBoard(board, move) {
  const b = board.slice();
  const p = b[move.from];
  b[move.from] = null;
  b[move.to] = { t: move.promotion ? move.promo || 'Q' : p.t, c: p.c, m: true };
  const o = move.face || p.o;
  if (o) b[move.to].o = o;
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
  const rules = state.rules || CLASSIC;
  const moves = pieceMoves(state.board, from, rules).filter(
    (m) => !inCheck(playOnBoard(state.board, m), p.c, rules),
  );
  for (const m of castlingMoves(state.board, from, rules))
    if (!inCheck(playOnBoard(state.board, m), p.c, rules)) moves.push(m);
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
  const check = inCheck(state.board, state.turn, state.rules);
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
  if (move.castle) {
    const [, y, z] = coords(move.to);
    const [hy, hz] = homeEdge(p.c);
    return y === hy && z === hz ? move.castle.side : `${move.castle.side} K${sqName(move.to)}`;
  }
  const piece = p.t === 'P' ? '' : p.t;
  const sep = move.capture ? 'x' : '-';
  const promo = move.promotion ? `=${move.promo || 'Q'}` : '';
  return `${piece}${sqName(move.from)}${sep}${sqName(move.to)}${promo}`;
}

// Facings the piece on `from` may choose after moving (relative mode).
export function facingChoices(state, from, promo) {
  const p = state.board[from];
  if (!p) return [];
  const piece = { ...p, t: promo || p.t };
  if (!usesFacing(piece, state.rules || CLASSIC)) return [];
  const out = [];
  for (const d of FACINGS) {
    const turns = nonZero(d) === 1 ? [0, 1] : [1];
    for (const t of turns) {
      const o = [...d, t];
      if (facingAllowed(piece, o, state.rules)) out.push(o);
    }
  }
  return out;
}

// Find the legal move matching {from, to, promo, face}; null if illegal.
// In relative mode `face` is the moved piece's new facing (default: unchanged).
export function findMove(state, { from, to, promo, face }) {
  let m = legalMovesFrom(state, from).find((mv) => mv.to === to);
  if (!m) return null;
  if (m.promotion) {
    const choice = promo || 'Q';
    if (!'QRBN'.includes(choice)) return null;
    m = { ...m, promo: choice };
  }
  const rules = state.rules || CLASSIC;
  const p = state.board[from];
  const piece = { ...p, t: m.promo || p.t };
  if (face != null && usesFacing(piece, rules)) {
    const o = normalizeFacing(face);
    if (!o || !facingAllowed(piece, o, rules)) return null;
    m = { ...m, face: o };
  }
  return m;
}

// Returns the new state, or null if the move is illegal.
export function applyMove(state, input) {
  if (state.result) return null;
  const move = findMove(state, input);
  if (!move) return null;
  const mover = state.board[move.from];
  let label = moveLabel(state.board, move);
  if (move.face) label += ' ' + facingLabel(move.face);
  const captured = state.board[move.to];
  const next = {
    rules: state.rules,
    board: playOnBoard(state.board, move),
    turn: other(state.turn),
    history: [...state.history, { from: move.from, to: move.to, promo: move.promo, face: move.face, label, captured: captured ? { t: captured.t, c: captured.c } : null }],
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

// Rebuild a game from a list of {from, to, promo, face}. Stops at the first illegal move.
export function replay(moves, rules) {
  let s = initialState(rules);
  for (const m of moves) {
    const n = applyMove(s, m);
    if (!n) break;
    s = n;
  }
  return s;
}
