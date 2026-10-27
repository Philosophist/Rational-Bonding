import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  N, SIZE, LEVELS, FILES, coords, idx, sqName, other,
  initialState, legalMovesFrom, applyMove, replay, resign, findKing, RULES_VERSION,
} from './rules.js';
import { Link, randomCode } from './net.js';

const $ = (id) => document.getElementById(id);
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const glyph = (t) => GLYPH[t] + '︎';
const COLOR_NAME = { w: 'White', b: 'Black' };
const HOST_KEY = 'chess3d-host';

// ---------------------------------------------------------------- app state
const app = {
  game: initialState(),
  mode: 'local',
  myColor: 'w', // online only
  hostColor: 'w',
  selected: -1,
  targets: [], // legal moves of the selected piece
  focus: -1, // -1 = all levels
  spacing: 1.6,
  viewColor: 'w',
  pendingAnim: null,
};

const link = new Link({ onMessage: onNetMessage, onStatus: (s) => ($('net-status').textContent = s) });

// ---------------------------------------------------------------- three.js
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12141a);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;

scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(6, 20, 10);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xaabbff, 0.5);
fill.position.set(-8, 5, -10);
scene.add(fill);

const worldPos = (i, lift = 0) => {
  const [x, y, z] = coords(i);
  return new THREE.Vector3(x - 3.5, z * app.spacing + lift, 3.5 - y);
};
const center = () => new THREE.Vector3(0, ((N - 1) * app.spacing) / 2, 0);

// Tiles: one instanced mesh per level so each level can fade independently.
const tileGeo = new THREE.BoxGeometry(0.94, 0.04, 0.94);
const levelMeshes = [];
for (let z = 0; z < N; z++) {
  const mat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.35, roughness: 0.8, depthWrite: false });
  const mesh = new THREE.InstancedMesh(tileGeo, mat, N * N);
  mesh.userData.level = z;
  const c = new THREE.Color();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      c.set((x + y + z) % 2 ? 0xd9c7a3 : 0x8a6a4a);
      mesh.setColorAt(x + N * y, c);
    }
  mesh.renderOrder = 1;
  levelMeshes.push(mesh);
  scene.add(mesh);
}

const frame = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0x4a5068, transparent: true, opacity: 0.7 }),
);
scene.add(frame);

function textSprite(text, color = '#9aa0ad', size = 0.45) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

const labels = new THREE.Group();
scene.add(labels);
const levelLabels = [];
for (let z = 0; z < N; z++) {
  const s = textSprite(LEVELS[z], '#e0b44c', 0.55);
  levelLabels.push(s);
  labels.add(s);
}
const fileLabels = [...FILES].map((f) => textSprite(f));
const rankLabels = [...'12345678'].map((r) => textSprite(r));
labels.add(...fileLabels, ...rankLabels);

function layoutStatic() {
  const m = new THREE.Matrix4();
  const v = app.viewColor === 'w' ? 1 : -1; // keep labels on the viewer's side
  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        m.makeTranslation(worldPos(idx(x, y, z), -0.02));
        levelMeshes[z].setMatrixAt(x + N * y, m);
      }
    levelMeshes[z].instanceMatrix.needsUpdate = true;
    levelMeshes[z].computeBoundingSphere();
    levelLabels[z].position.set(-4.6 * v, z * app.spacing + 0.1, 4.2 * v);
  }
  const h = (N - 1) * app.spacing;
  frame.scale.set(N, h + 1, N);
  frame.position.set(0, h / 2 + 0.2, 0);
  fileLabels.forEach((s, x) => s.position.set(x - 3.5, -0.35, 4.4 * v));
  rankLabels.forEach((s, y) => s.position.set(4.4 * v, -0.35, 3.5 - y));
}

// ---------------------------------------------------------------- pieces
const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 24);
const BASE = [[0, 0], [0.3, 0], [0.3, 0.05], [0.24, 0.09], [0.18, 0.12]];
const GEO = {
  P: [lathe([...BASE, [0.1, 0.18], [0.08, 0.3], [0.14, 0.32], [0.14, 0.34], [0, 0.34]]), [new THREE.SphereGeometry(0.12, 20, 14), 0, 0.44, 0]],
  R: [lathe([...BASE, [0.17, 0.16], [0.17, 0.46], [0.23, 0.5], [0.23, 0.62], [0, 0.62]])],
  B: [lathe([...BASE, [0.1, 0.22], [0.08, 0.42], [0.15, 0.44], [0.15, 0.46], [0, 0.46]]), [new THREE.SphereGeometry(0.13, 20, 14), 0, 0.58, 0, 1, 1.4, 1], [new THREE.SphereGeometry(0.04, 10, 8), 0, 0.79, 0]],
  N: [lathe([...BASE, [0.16, 0.2], [0.16, 0.3], [0, 0.3]]), [new THREE.BoxGeometry(0.2, 0.42, 0.26), 0, 0.48, 0.02], [new THREE.BoxGeometry(0.18, 0.15, 0.3), 0, 0.6, -0.18], [new THREE.BoxGeometry(0.05, 0.1, 0.05), 0.06, 0.74, 0.06], [new THREE.BoxGeometry(0.05, 0.1, 0.05), -0.06, 0.74, 0.06]],
  Q: [lathe([...BASE, [0.1, 0.24], [0.08, 0.52], [0.16, 0.66], [0.17, 0.7], [0, 0.66]]), [new THREE.SphereGeometry(0.06, 12, 10), 0, 0.76, 0]],
  K: [lathe([...BASE, [0.11, 0.24], [0.09, 0.54], [0.17, 0.66], [0.17, 0.7], [0, 0.7]]), [new THREE.BoxGeometry(0.06, 0.24, 0.06), 0, 0.82, 0], [new THREE.BoxGeometry(0.18, 0.06, 0.06), 0, 0.84, 0]],
};
// Queen's crown points and rook's battlements.
const crownBall = new THREE.SphereGeometry(0.035, 8, 6);
for (let k = 0; k < 8; k++) {
  const a = (k / 8) * Math.PI * 2;
  GEO.Q.push([crownBall, Math.cos(a) * 0.16, 0.72, Math.sin(a) * 0.16]);
}
const crenel = new THREE.BoxGeometry(0.09, 0.08, 0.09);
for (let k = 0; k < 4; k++) {
  const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
  GEO.R.push([crenel, Math.cos(a) * 0.17, 0.66, Math.sin(a) * 0.17]);
}

const PIECE_COLORS = {
  w: { color: 0xf3ecdc, roughness: 0.45, metalness: 0.05 },
  b: { color: 0x2b2b33, roughness: 0.3, metalness: 0.25 },
};
const PIECE_SCALE = 0.85;

function makePiece(p) {
  const mat = new THREE.MeshStandardMaterial({ ...PIECE_COLORS[p.c], transparent: true });
  const g = new THREE.Group();
  for (const part of GEO[p.t]) {
    const [geo, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1] = Array.isArray(part) ? part : [part];
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    g.add(m);
  }
  g.scale.setScalar(PIECE_SCALE);
  if (p.c === 'b') g.rotation.y = Math.PI; // knights face the enemy
  g.userData.mat = mat;
  return g;
}

const pieceGroup = new THREE.Group();
scene.add(pieceGroup);
const pieceAt = new Map(); // square -> group

function rebuildPieces() {
  for (const g of pieceGroup.children) g.userData.mat.dispose();
  pieceGroup.clear();
  pieceAt.clear();
  app.game.board.forEach((p, i) => {
    if (!p) return;
    const g = makePiece(p);
    g.position.copy(worldPos(i));
    g.userData.sq = i;
    pieceGroup.add(g);
    pieceAt.set(i, g);
  });
  if (app.pendingAnim) {
    const { from, to } = app.pendingAnim;
    const g = pieceAt.get(to);
    if (g) g.userData.anim = { from: worldPos(from), to: worldPos(to), t0: performance.now() };
    app.pendingAnim = null;
  }
}

// ---------------------------------------------------------------- markers
const markerGroup = new THREE.Group();
scene.add(markerGroup);
const MAT = {
  move: new THREE.MeshBasicMaterial({ color: 0x4fd18b, transparent: true, opacity: 0.85 }),
  capture: new THREE.MeshBasicMaterial({ color: 0xef5d5d, transparent: true, opacity: 0.35, depthWrite: false }),
  preview: new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.7 }),
  selected: new THREE.MeshBasicMaterial({ color: 0xe0b44c, transparent: true, opacity: 0.9 }),
  last: new THREE.MeshBasicMaterial({ color: 0xe0b44c, transparent: true, opacity: 0.35, depthWrite: false }),
  check: new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.45, depthWrite: false }),
  hover: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }),
};
const DOT = new THREE.SphereGeometry(0.14, 16, 12);
const BUBBLE = new THREE.SphereGeometry(0.5, 24, 16);
const RING = new THREE.TorusGeometry(0.42, 0.04, 8, 40).rotateX(Math.PI / 2);
const FLAT = new THREE.BoxGeometry(0.96, 0.05, 0.96);
const hoverTile = new THREE.Mesh(FLAT, MAT.hover);
hoverTile.visible = false;
scene.add(hoverTile);

function addMarker(geo, mat, sq, lift, clickable) {
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(worldPos(sq, lift));
  m.userData.sq = sq;
  m.userData.clickable = clickable;
  markerGroup.add(m);
  return m;
}

function rebuildMarkers() {
  markerGroup.clear();
  const h = app.game.history.at(-1);
  if (h) {
    addMarker(FLAT, MAT.last, h.from, -0.01, false);
    addMarker(FLAT, MAT.last, h.to, -0.01, false);
  }
  if (app.game.status?.check && !app.game.result?.reason?.startsWith('resign')) {
    const k = findKing(app.game.board, app.game.turn);
    if (k >= 0) addMarker(BUBBLE, MAT.check, k, 0.35, false);
  }
  if (app.selected >= 0) {
    addMarker(RING, MAT.selected, app.selected, 0.03, false);
    const own = canAct() && app.game.board[app.selected]?.c === app.game.turn;
    for (const m of app.targets) {
      if (m.capture) addMarker(BUBBLE, own ? MAT.capture : MAT.preview, m.to, 0.35, own);
      else addMarker(DOT, own ? MAT.move : MAT.preview, m.to, 0.2, own);
    }
  }
  applyFocus();
}

// ---------------------------------------------------------------- focus / visibility
function applyFocus() {
  const f = app.focus;
  levelMeshes.forEach((m, z) => (m.material.opacity = f < 0 ? 0.35 : z === f ? 0.7 : 0.04));
  levelLabels.forEach((s, z) => (s.material.opacity = f < 0 || z === f ? 1 : 0.25));
  for (const g of pieceGroup.children) {
    const z = coords(g.userData.sq)[2];
    const vis = f < 0 || z === f;
    g.userData.mat.opacity = vis ? 1 : 0.1;
    g.userData.mat.depthWrite = vis;
    g.userData.dim = !vis;
  }
  for (const m of markerGroup.children) {
    const z = coords(m.userData.sq)[2];
    m.visible = f < 0 || z === f || m.userData.clickable || m.material === MAT.preview;
  }
  document.querySelectorAll('.level').forEach((el, z) => el.classList.toggle('focused', z === f));
  $('level-select').value = String(f);
}

function setFocus(f) {
  app.focus = Math.max(-1, Math.min(N - 1, f));
  applyFocus();
}

// ---------------------------------------------------------------- camera
function resetCamera() {
  layoutStatic();
  const c = center();
  const s = app.viewColor === 'w' ? 1 : -1;
  camera.position.set(9 * s, c.y + 7, 15 * s);
  controls.target.copy(c);
  controls.update();
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const markers = markerGroup.children.filter((m) => m.visible && m.userData.clickable);
  let hit = raycaster.intersectObjects(markers, false)[0];
  if (hit) return hit.object.userData.sq;
  const pieces = pieceGroup.children.filter((g) => !g.userData.dim);
  hit = raycaster.intersectObjects(pieces, true)[0];
  if (hit) {
    let o = hit.object;
    while (o.userData.sq === undefined) o = o.parent;
    return o.userData.sq;
  }
  const tiles = app.focus < 0 ? levelMeshes : [levelMeshes[app.focus]];
  hit = raycaster.intersectObjects(tiles, false)[0];
  if (hit) return hit.instanceId + N * N * hit.object.userData.level;
  return -1;
}

let down = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved < 6) onSquareClick(pick(e));
});
let hoverEv = null;
canvas.addEventListener('pointermove', (e) => (hoverEv = e));
canvas.addEventListener('pointerleave', () => {
  hoverEv = null;
  hoverTile.visible = false;
  $('hover-label').textContent = '';
});

function updateHover() {
  if (!hoverEv) return;
  const sq = pick(hoverEv);
  hoverEv = null;
  if (sq < 0) {
    hoverTile.visible = false;
    $('hover-label').textContent = '';
    canvas.style.cursor = '';
    return;
  }
  hoverTile.visible = true;
  hoverTile.position.copy(worldPos(sq, -0.005));
  const p = app.game.board[sq];
  $('hover-label').textContent = sqName(sq) + (p ? ` · ${COLOR_NAME[p.c]} ${PIECE_NAMES[p.t]}` : '');
  canvas.style.cursor = p || app.targets.some((m) => m.to === sq) ? 'pointer' : '';
}
const PIECE_NAMES = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };

// ---------------------------------------------------------------- game flow
function canAct() {
  if (app.game.result) return false;
  if (app.mode === 'local') return true;
  return link.connected && app.game.turn === app.myColor;
}

function select(sq) {
  const p = app.game.board[sq];
  app.selected = sq;
  // Opponent pieces (or pieces you can't move right now) show their moves as a preview.
  app.targets = p ? legalMovesFrom({ ...app.game, turn: p.c, result: null }, sq) : [];
  refreshHighlights();
}

function deselect() {
  app.selected = -1;
  app.targets = [];
  refreshHighlights();
}

function onSquareClick(sq) {
  if (sq < 0) return deselect();
  const own = app.selected >= 0 && canAct() && app.game.board[app.selected]?.c === app.game.turn;
  const move = own && app.targets.find((m) => m.to === sq);
  if (move) return tryMove(move);
  if (app.game.board[sq] && sq !== app.selected) return select(sq);
  deselect();
}

async function tryMove(move) {
  let promo;
  if (move.promotion) {
    promo = await askPromotion();
    // The game may have moved on while the dialog was open (resign, rematch, resync).
    if (!promo || !canAct()) return;
  }
  const next = applyMove(app.game, { from: move.from, to: move.to, promo });
  if (!next) return;
  const ply = app.game.history.length;
  setGame(next, { from: move.from, to: move.to });
  if (app.mode === 'online') link.send({ type: 'move', ply, from: move.from, to: move.to, promo });
}

function askPromotion() {
  const d = $('promo-dialog');
  return new Promise((resolve) => {
    const done = (v) => {
      d.close();
      d.querySelectorAll('button').forEach((b) => (b.onclick = null));
      d.oncancel = null;
      resolve(v);
    };
    d.querySelectorAll('button').forEach((b) => (b.onclick = () => done(b.value)));
    d.oncancel = () => done(null);
    d.showModal();
  });
}

function setGame(game, anim = null) {
  app.game = game;
  app.selected = -1;
  app.targets = [];
  app.pendingAnim = anim;
  rebuildPieces();
  refreshHighlights();
  renderPanel();
  saveHost();
}

function refreshHighlights() {
  rebuildMarkers();
  renderLevelMap();
}

// ---------------------------------------------------------------- panel
function statusText() {
  const g = app.game;
  if (g.result) {
    const { winner, reason } = g.result;
    return winner === 'draw' ? `Draw — ${reason}` : `${COLOR_NAME[winner]} wins — ${reason}`;
  }
  const who = COLOR_NAME[g.turn];
  let s;
  if (app.mode === 'online') {
    if (!link.connected) s = `${who} to move (opponent offline)`;
    else s = g.turn === app.myColor ? `Your move (${who})` : `Waiting for ${who}…`;
  } else s = `${who} to move`;
  return g.status.check ? `${s} — check!` : s;
}

function renderPanel() {
  const st = statusText();
  $('status').textContent = st;
  $('status').className = app.game.status.check && !app.game.result ? 'check' : '';
  $('turn-banner').textContent = st;
  const caps = { w: [], b: [] };
  for (const h of app.game.history) if (h.captured) caps[other(h.captured.c)].push(h.captured);
  const order = 'QRBNP';
  for (const c of 'wb') {
    const list = caps[c].sort((a, b) => order.indexOf(a.t) - order.indexOf(b.t)).map((p) => glyph(p.t)).join('');
    $(`cap-${c}`).textContent = list ? `${COLOR_NAME[c]} took: ${list}` : '';
  }
  const ol = $('moves');
  ol.innerHTML = '';
  const hist = app.game.history;
  for (let i = 0; i < hist.length; i += 2) {
    const li = document.createElement('li');
    li.textContent = hist[i].label + (hist[i + 1] ? '   ' + hist[i + 1].label : '');
    li.style.whiteSpace = 'pre';
    ol.appendChild(li);
  }
  ol.scrollTop = ol.scrollHeight;
  $('resign-btn').disabled = !!app.game.result || (app.mode === 'online' && !link.connected);
}

// ---------------------------------------------------------------- 2D level map
const cells = [];
function buildLevelMap() {
  const root = $('levels');
  for (let z = 0; z < N; z++) {
    const wrap = document.createElement('div');
    wrap.className = 'level';
    const title = document.createElement('div');
    title.className = 'level-title';
    title.textContent = `Level ${LEVELS[z]}`;
    title.title = 'Click to focus this level in 3D (click again for all)';
    title.onclick = () => setFocus(app.focus === z ? -1 : z);
    const grid = document.createElement('div');
    grid.className = 'level-grid';
    wrap.append(title, grid);
    root.appendChild(wrap);
    for (let k = 0; k < N * N; k++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.addEventListener('click', () => onSquareClick(Number(el.dataset.sq)));
      grid.appendChild(el);
      cells.push({ el, z, k });
    }
  }
  orientLevelMap();
}

// Rank 8 at the top for White, rank 1 at the top for Black.
function orientLevelMap() {
  for (const c of cells) {
    const row = Math.floor(c.k / N), col = c.k % N;
    const [x, y] = app.viewColor === 'w' ? [col, N - 1 - row] : [N - 1 - col, row];
    const sq = idx(x, y, c.z);
    c.sq = sq;
    c.el.dataset.sq = sq;
    c.el.title = sqName(sq);
  }
  renderLevelMap();
}

function renderLevelMap() {
  if (!cells.length) return;
  const g = app.game;
  const last = g.history.at(-1);
  const targets = new Map(app.targets.map((m) => [m.to, m]));
  const checkK = g.status.check && !g.result?.reason?.startsWith('resign') ? findKing(g.board, g.turn) : -1;
  for (const c of cells) {
    const [x, y, z] = coords(c.sq);
    const p = g.board[c.sq];
    const t = targets.get(c.sq);
    const cls = ['cell', (x + y + z) % 2 ? 'light' : 'dark'];
    if (p) cls.push(p.c === 'w' ? 'pw' : 'pb');
    if (c.sq === app.selected) cls.push('sel');
    if (last && (c.sq === last.from || c.sq === last.to)) cls.push('last');
    if (t) cls.push('target', t.capture ? 'cap' : '');
    if (c.sq === checkK) cls.push('incheck');
    c.el.className = cls.join(' ');
    c.el.textContent = p ? glyph(p.t) : '';
  }
}

// ---------------------------------------------------------------- online
function saveHost() {
  if (app.mode !== 'online' || link.role !== 'host') return;
  try {
    localStorage.setItem(HOST_KEY, JSON.stringify({
      code: link.code, hostColor: app.hostColor, result: app.game.result,
      moves: app.game.history.map(({ from, to, promo }) => ({ from, to, promo })),
    }));
  } catch {}
}

function loadHost(code) {
  try {
    const s = JSON.parse(localStorage.getItem(HOST_KEY));
    return s && s.code === code ? s : null;
  } catch {
    return null;
  }
}

function gameFromSaved(moves, result) {
  let g = replay(moves || []);
  if (result && !g.result) g = { ...g, result };
  return g;
}

function syncPayload() {
  return {
    type: 'sync',
    version: RULES_VERSION,
    guestColor: other(app.hostColor),
    moves: app.game.history.map(({ from, to, promo }) => ({ from, to, promo })),
    result: app.game.result,
  };
}

function setMyColor(c) {
  app.myColor = c;
  $('my-color').textContent = COLOR_NAME[c];
  if (app.viewColor !== c) {
    app.viewColor = c;
    orientLevelMap();
    resetCamera();
  }
}

function startHosting(code, saved) {
  app.mode = 'online';
  app.hostColor = saved?.hostColor || 'w';
  setMyColor(app.hostColor);
  link.host(code);
  history.replaceState(null, '', `?host=${code}`);
  showRoom(code);
  setGame(saved ? gameFromSaved(saved.moves, saved.result) : initialState());
}

function startJoining(code) {
  app.mode = 'online';
  app.myColor = null; // assigned by the host's sync
  link.join(code);
  history.replaceState(null, '', `?join=${code}`);
  showRoom(code);
  $('my-color').textContent = '…';
  setGame(initialState());
}

function showRoom(code) {
  $('online-setup').hidden = true;
  $('online-room').hidden = false;
  $('chat-box').hidden = false;
  $('room-code').textContent = code;
  $('invite-link').value = `${location.origin}${location.pathname}?join=${code}`;
}

function leaveRoom() {
  link.close();
  $('online-setup').hidden = false;
  $('online-room').hidden = true;
  $('chat-box').hidden = true;
  $('net-status').textContent = '';
  history.replaceState(null, '', location.pathname);
  setMode('local');
}

function onNetMessage(msg) {
  const g = app.game;
  switch (msg.type) {
    case 'connected':
      if (link.role === 'host') link.send(syncPayload());
      addChat('system', 'Opponent connected.');
      break;
    case 'disconnected':
      addChat('system', 'Opponent disconnected.');
      break;
    case 'full':
      $('net-status').textContent = 'That room already has two players.';
      link.close();
      break;
    case 'sync':
      if (link.role !== 'guest' || !['w', 'b'].includes(msg.guestColor)) break;
      if (msg.version !== RULES_VERSION) {
        addChat('system', VERSION_WARNING);
        link.send({ type: 'version-mismatch' });
      }
      setMyColor(msg.guestColor);
      {
        const before = g.history.length;
        const next = gameFromSaved(msg.moves, msg.result);
        const last = next.history.at(-1);
        setGame(next, next.history.length === before + 1 && last ? { from: last.from, to: last.to } : null);
      }
      break;
    case 'move': {
      const next = msg.ply === g.history.length && applyMove(g, msg);
      if (next && g.turn !== app.myColor) setGame(next, { from: msg.from, to: msg.to });
      else if (link.role === 'host') link.send(syncPayload());
      else link.send({ type: 'sync-request' });
      break;
    }
    case 'version-mismatch':
      addChat('system', VERSION_WARNING);
      break;
    case 'sync-request':
      if (link.role === 'host') link.send(syncPayload());
      break;
    case 'resign':
      if (!g.result && msg.color === other(app.myColor)) setGame(resign(g, msg.color));
      break;
    case 'rematch-request':
      if (link.role === 'host' && confirm('Your friend wants a new game (colours swap). Start it?')) rematch();
      break;
    case 'chat':
      addChat('them', String(msg.text).slice(0, 200));
      break;
  }
  renderPanel();
}

const VERSION_WARNING = 'You and your friend are running different versions of the game. Both of you should refresh the page.';

function rematch() {
  app.hostColor = other(app.hostColor);
  setMyColor(app.hostColor);
  setGame(initialState());
  link.send(syncPayload());
}

function addChat(who, text) {
  const log = $('chat-log');
  const div = document.createElement('div');
  if (who === 'system') {
    div.style.color = 'var(--muted)';
    div.textContent = text;
  } else {
    const b = document.createElement('b');
    b.className = who === 'me' ? 'me' : '';
    b.textContent = who === 'me' ? 'You: ' : 'Friend: ';
    div.append(b, document.createTextNode(text));
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ---------------------------------------------------------------- controls
function setMode(mode) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('online-box').hidden = mode !== 'online';
  if (mode === 'local' && app.mode === 'online') {
    link.close();
    $('online-setup').hidden = false;
    $('online-room').hidden = true;
    $('chat-box').hidden = true;
    history.replaceState(null, '', location.pathname);
    setGame(initialState());
  }
  if (mode === 'local') app.mode = 'local';
  renderPanel();
}

function wireUI() {
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('host-btn').onclick = () => startHosting(randomCode(), null);
  $('join-btn').onclick = () => {
    const code = $('join-code').value.trim().toUpperCase();
    if (code) startJoining(code);
  };
  $('join-code').onkeydown = (e) => e.key === 'Enter' && $('join-btn').click();
  $('copy-btn').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('invite-link').value);
      $('copy-btn').textContent = 'Copied!';
    } catch {
      $('invite-link').select();
    }
    setTimeout(() => ($('copy-btn').textContent = 'Copy link'), 1500);
  };
  $('leave-btn').onclick = leaveRoom;

  const sel = $('level-select');
  sel.add(new Option('All levels', '-1'));
  for (let z = 0; z < N; z++) sel.add(new Option(`Level ${LEVELS[z]}`, String(z)));
  sel.onchange = () => setFocus(Number(sel.value));
  $('spacing').oninput = (e) => {
    app.spacing = Number(e.target.value);
    layoutStatic();
    rebuildPieces();
    rebuildMarkers();
    controls.target.copy(center());
  };
  $('flip-btn').onclick = () => {
    app.viewColor = other(app.viewColor);
    orientLevelMap();
    resetCamera();
  };
  $('reset-cam-btn').onclick = resetCamera;

  $('new-btn').onclick = () => {
    if (app.mode === 'local') {
      if (app.game.history.length && !app.game.result && !confirm('Start a new game?')) return;
      setGame(initialState());
    } else if (link.role === 'host') {
      if (app.game.history.length && !app.game.result && !confirm('Start a new game? Colours will swap.')) return;
      rematch();
    } else if (link.connected) {
      link.send({ type: 'rematch-request' });
      addChat('system', 'Asked the host for a new game.');
    } else {
      addChat('system', 'Not connected to the host, so a new game can’t be requested yet.');
    }
  };
  $('resign-btn').onclick = () => {
    if (app.game.result || !confirm('Resign this game?')) return;
    const color = app.mode === 'online' ? app.myColor : app.game.turn;
    setGame(resign(app.game, color));
    if (app.mode === 'online') link.send({ type: 'resign', color });
  };
  $('chat-form').onsubmit = (e) => {
    e.preventDefault();
    const text = $('chat-input').value.trim();
    if (!text || !link.connected) return;
    link.send({ type: 'chat', text });
    addChat('me', text);
    $('chat-input').value = '';
  };

  const dock = $('levels-dock');
  const syncDock = () => document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
  $('levels-toggle').onclick = () => {
    dock.classList.toggle('collapsed');
    $('levels-toggle').textContent = dock.classList.contains('collapsed') ? 'Level map ▴' : 'Level map ▾';
    syncDock();
  };
  new ResizeObserver(syncDock).observe(dock);

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === ']') setFocus(app.focus < 0 ? 0 : Math.min(N - 1, app.focus + 1));
    else if (e.key === '[') setFocus(app.focus < 0 ? N - 1 : Math.max(0, app.focus - 1));
    else if (e.key === '0') setFocus(-1);
    else if (e.key === 'Escape') deselect();
  });
}

// ---------------------------------------------------------------- loop
const ANIM_MS = 380;
function animate(now) {
  for (const g of pieceGroup.children) {
    const a = g.userData.anim;
    if (!a) continue;
    const t = Math.min(1, (now - a.t0) / ANIM_MS);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    g.position.lerpVectors(a.from, a.to, e);
    g.position.y += Math.sin(Math.PI * t) * 0.6;
    if (t >= 1) g.userData.anim = null;
  }
  const pulse = 0.6 + 0.3 * Math.sin(now / 250);
  MAT.move.opacity = pulse;
  MAT.selected.opacity = pulse + 0.1;
  updateHover();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------- boot
wireUI();
buildLevelMap();
layoutStatic();
resize();
resetCamera();
setGame(initialState());

const params = new URLSearchParams(location.search);
if (params.get('host')) {
  const code = params.get('host').toUpperCase();
  setMode('online');
  startHosting(code, loadHost(code));
} else if (params.get('join')) {
  const code = params.get('join').toUpperCase();
  setMode('online');
  $('join-code').value = code;
  startJoining(code);
}

requestAnimationFrame(animate);
// Debug/test hook.
window.__chess3d = { app, link, onSquareClick, idx, setFocus, camera, worldPos };
