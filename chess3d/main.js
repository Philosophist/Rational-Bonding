import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  N, SIZE, LEVELS, FILES, coords, idx, sqName, other,
  initialState, legalMovesFrom, applyMove, replay, resign, findKing, RULES_VERSION,
  DEFAULT_RULES, normalizeRules, facingChoices, facingLabel, frameUp, pawnFrame, playOnBoard, usesFacing, timeout, canMate,
} from './rules.js';
import { Link, randomCode } from './net.js';
import { newClock, punch, timeLeft, flagged, formatTime, tcKey, parseTcKey, tcLabel } from './clock.js';
import * as acct from './account.js';
import * as accountUI from './accountui.js';

const $ = (id) => document.getElementById(id);
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const glyph = (t) => GLYPH[t] + '︎';
const COLOR_NAME = { w: 'White', b: 'Black' };
const HOST_KEY = 'chess3d-host';
const RULES_KEY = 'chess3d-rules';
const DOCK_KEY = 'chess3d-level-map';
const RULE_TOGGLES = ['rookDiagonals', 'gridLines', 'pawnsAnyFacing', 'bishopFacing', 'knightFacing'];
const TC_KEY = 'chess3d-tc';

function loadTc() {
  try {
    return parseTcKey(localStorage.getItem(TC_KEY) || 'none');
  } catch {
    return parseTcKey('none');
  }
}

// New games start in Relative mode unless this browser has saved another choice.
function loadRules() {
  try {
    const saved = JSON.parse(localStorage.getItem(RULES_KEY));
    if (saved) return normalizeRules(saved);
  } catch {}
  return normalizeRules(DEFAULT_RULES.relative);
}

// ---------------------------------------------------------------- app state
const app = {
  rules: loadRules(), // what a new game here starts with
  tc: loadTc(), // the time control a new game here starts with
  game: null,
  clock: null,
  acct: null, // account game: { row, lastClaim }
  review: null, // replaying a saved game: { row, ply, title }
  preview: null, // while choosing a facing: { board } with the move played
  mode: 'local',
  myColor: 'w', // online only
  hostColor: 'w',
  selected: -1,
  targets: [], // legal moves of the selected piece
  focus: -1, // -1 = all levels
  viewColor: 'w',
  pendingAnim: null,
};
app.game = initialState(app.rules);
app.clock = newClock(app.tc, Date.now());
const freshGame = () => initialState(app.rules);
// A new game with the chosen rules and a fresh clock.
function startFresh() {
  app.clock = newClock(app.tc, Date.now());
  setGame(freshGame());
}

const THEME = {
  background: 0x161a22,
  grid: 0x7d8db0,
  frame: 0x9aa8c8,
  lightCell: 0xdfe5f2,
  darkCell: 0x6f7d9c,
  label: '#a9b4cc',
  accent: '#e04dff', // the logo's pink
  bright: 0x7fffd4, // bright aquamarine: White's pieces, the selected piece's own board
};

const link = new Link({ onMessage: onNetMessage, onStatus: (s) => ($('net-status').textContent = s) });

// ---------------------------------------------------------------- three.js
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(THEME.background);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.zoomToCursor = true; // the wheel (or a trackpad pinch) zooms toward the pointer
controls.zoomSpeed = 1.4;
controls.minDistance = 2;
controls.maxDistance = 60;

scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(6, 20, 10);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xaabbff, 0.5);
fill.position.set(-8, 5, -10);
scene.add(fill);

// An even cube grid: every cell is 1×1×1, centred on (x, level, -rank).
const worldPos = (i, lift = 0) => {
  const [x, y, z] = coords(i);
  return new THREE.Vector3(x - 3.5, z + lift, 3.5 - y);
};
const center = () => new THREE.Vector3(0, (N - 1) / 2, 0);

// Lattice lines along every cell boundary, kept faint so a piece's own board stands out.
const LATTICE_OPACITY = 0.13;
const lattice = (() => {
  const pts = [];
  const lo = -N / 2, hi = N / 2, ylo = -0.5, yhi = N - 0.5;
  for (let a = 0; a <= N; a++)
    for (let b = 0; b <= N; b++) {
      const u = lo + a, v = lo + b, w = ylo + b;
      pts.push(lo, w, u, hi, w, u); // along x
      pts.push(u, w, lo, u, w, hi); // along z (ranks)
      pts.push(u, ylo, v, u, yhi, v); // along y (levels)
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: THEME.grid, transparent: true, opacity: LATTICE_OPACITY, depthWrite: false }));
})();
scene.add(lattice);

// Cells: one instanced mesh per level, used for picking and to tint a focused level.
const cellGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
const levelMeshes = [];
for (let z = 0; z < N; z++) {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const mesh = new THREE.InstancedMesh(cellGeo, mat, N * N);
  mesh.userData.level = z;
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      c.set((x + y + z) % 2 ? THEME.lightCell : THEME.darkCell);
      mesh.setColorAt(x + N * y, c);
      m.makeTranslation(worldPos(idx(x, y, z)));
      mesh.setMatrixAt(x + N * y, m);
    }
  mesh.computeBoundingSphere();
  mesh.renderOrder = 1;
  levelMeshes.push(mesh);
  scene.add(mesh);
}

const frame = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(N, N, N)),
  new THREE.LineBasicMaterial({ color: THEME.frame, transparent: true, opacity: 0.2 }),
);
frame.position.copy(center());
scene.add(frame);

function textSprite(text, color = THEME.label, size = 0.45) {
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
  const s = textSprite(LEVELS[z], THEME.accent, 0.55);
  levelLabels.push(s);
  labels.add(s);
}
const fileLabels = [...FILES].map((f) => textSprite(f));
const rankLabels = [...'12345678'].map((r) => textSprite(r));
labels.add(...fileLabels, ...rankLabels);

function layoutLabels() {
  const v = app.viewColor === 'w' ? 1 : -1; // keep labels on the viewer's side
  levelLabels.forEach((s, z) => s.position.set(-4.6 * v, z, 4.6 * v));
  fileLabels.forEach((s, x) => s.position.set(x - 3.5, -0.9, 4.5 * v));
  rankLabels.forEach((s, y) => s.position.set(4.5 * v, -0.9, 3.5 - y));
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
  w: { color: 0x7fffd4, emissive: 0x123d33, roughness: 0.4, metalness: 0.05 },
  b: { color: 0x3d6fd6, emissive: 0x0c2a66, roughness: 0.3, metalness: 0.35 },
};
// Models are ~0.94 tall; shrink them to fit a 1×1×1 cell and centre them in it.
const PIECE_SCALE = 0.78;
const PIECE_MID = 0.47;

// Game (file, rank, level) -> world (x, up, -z).
const g2w = (d) => new THREE.Vector3(d[0], d[2], -d[1]);
const ARROW = new THREE.ConeGeometry(0.08, 0.2, 12).rotateX(-Math.PI / 2);

// The model's "up" for a facing: the frame axis square to it that points most
// upward (then most toward the enemy), so pieces lean the way they look.
// The same "up" the rules use (see frameUp), so pieces lean the way they look.
const upFor = frameUp;

function orientPiece(g, o, c) {
  const y = g2w(upFor(o, c)).normalize();
  const z = g2w(o).normalize().negate(); // models look down -Z
  const x = y.clone().cross(z);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function makePiece(p) {
  const mat = new THREE.MeshStandardMaterial({ ...PIECE_COLORS[p.c], transparent: true });
  const mats = [mat];
  const g = new THREE.Group();
  for (const part of GEO[p.t]) {
    const [geo, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1] = Array.isArray(part) ? part : [part];
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y - PIECE_MID, z);
    m.scale.set(sx, sy, sz);
    g.add(m);
  }
  g.scale.setScalar(PIECE_SCALE);
  if (p.o && app.game.rules.mode === 'relative') {
    orientPiece(g, p.o, p.c);
    if (usesFacing(p, app.game.rules)) {
      // Show the facing of pieces whose moves depend on it.
      const am = new THREE.MeshStandardMaterial({ color: 0xe04dff, emissive: 0x4a1655, transparent: true });
      const arrow = new THREE.Mesh(ARROW, am);
      arrow.position.set(0, 0, -0.42);
      g.add(arrow);
      mats.push(am);
    }
  } else if (p.c === 'b') g.rotation.y = Math.PI; // knights face the enemy
  g.userData.mats = mats;
  return g;
}

const viewBoard = () => app.preview?.board || app.game.board;
// Labelled blocks for choosing a facing (Relative mode).
const facingGroup = new THREE.Group();
const FACE_BLOCK = new THREE.BoxGeometry(0.55, 0.55, 0.55);

function labelSprite(text, color, bg) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 56;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, 152, 48, 12);
  g.fill();
  g.fillStyle = color;
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 80, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(1.15, 0.4, 1);
  sp.renderOrder = 6;
  return sp;
}
const pieceGroup = new THREE.Group();
scene.add(pieceGroup);
scene.add(facingGroup);
const pieceAt = new Map(); // square -> group

function rebuildPieces() {
  for (const g of pieceGroup.children) g.userData.mats.forEach((m) => m.dispose());
  pieceGroup.clear();
  pieceAt.clear();
  viewBoard().forEach((p, i) => {
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
  capture: new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.35, depthWrite: false }),
  preview: new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.7 }),
  last: new THREE.MeshBasicMaterial({ color: 0xe04dff, transparent: true, opacity: 0.14, depthWrite: false }),
  check: new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.45, depthWrite: false }),
};
const LINE = {
  selected: new THREE.LineBasicMaterial({ color: 0xe04dff, transparent: true, opacity: 1 }),
  hover: new THREE.LineBasicMaterial({ color: THEME.bright, transparent: true, opacity: 0.6, depthWrite: false }),
};
const DOT = new THREE.SphereGeometry(0.13, 16, 12);
const BUBBLE = new THREE.SphereGeometry(0.46, 24, 16);
const CELL = new THREE.BoxGeometry(0.96, 0.96, 0.96);
const CELL_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.98, 0.98));
const hoverTile = new THREE.LineSegments(CELL_EDGES, LINE.hover);
hoverTile.visible = false;
scene.add(hoverTile);

function addMarker(geo, mat, sq, clickable) {
  const m = mat.isLineBasicMaterial ? new THREE.LineSegments(geo, mat) : new THREE.Mesh(geo, mat);
  m.position.copy(worldPos(sq));
  m.userData.sq = sq;
  m.userData.clickable = clickable;
  markerGroup.add(m);
  return m;
}

function rebuildMarkers() {
  markerGroup.clear();
  const h = app.game.history.at(-1);
  if (h) {
    addMarker(CELL, MAT.last, h.from, false);
    addMarker(CELL, MAT.last, h.to, false);
  }
  if (app.game.status?.check && !app.game.result?.reason?.startsWith('resign')) {
    const k = findKing(app.game.board, app.game.turn);
    if (k >= 0) addMarker(BUBBLE, MAT.check, k, false);
  }
  if (app.selected >= 0) {
    addMarker(CELL_EDGES, LINE.selected, app.selected, false);
    const own = canAct() && app.game.board[app.selected]?.c === app.game.turn;
    for (const m of app.targets) {
      if (m.capture) addMarker(BUBBLE, own ? MAT.capture : MAT.preview, m.to, own);
      else addMarker(DOT, own ? MAT.move : MAT.preview, m.to, own);
    }
  }
  applyFocus();
}

// ---------------------------------------------------------------- focus / visibility
function applyFocus() {
  const f = app.focus;
  levelMeshes.forEach((m, z) => (m.material.opacity = z === f ? 0.1 : 0));
  lattice.material.opacity = f < 0 ? LATTICE_OPACITY : 0.06;
  levelLabels.forEach((s, z) => (s.material.opacity = f < 0 || z === f ? 1 : 0.25));
  for (const g of pieceGroup.children) {
    const z = coords(g.userData.sq)[2];
    const vis = f < 0 || z === f;
    for (const m of g.userData.mats) {
      m.opacity = vis ? 1 : 0.1;
      m.depthWrite = vis;
    }
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
  layoutLabels();
  const c = center();
  const s = app.viewColor === 'w' ? 1 : -1;
  camera.position.set(9.5 * s, c.y + 5, 15.5 * s);
  controls.target.copy(c);
  controls.update();
}

// Keyboard and button camera moves. Held keys move smoothly, a little each frame.
const camKeys = new Set();
const CAM_KEYS = {
  ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
  ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
  q: 'orbitLeft', e: 'orbitRight',
  '+': 'in', '=': 'in', '-': 'out', _: 'out', PageUp: 'in', PageDown: 'out',
};
function zoomBy(f) {
  const off = camera.position.clone().sub(controls.target);
  const len = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(off.setLength(len));
}
function panBy(dx, dy) {
  const dist = camera.position.distanceTo(controls.target);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const move = right.multiplyScalar(dx * dist).add(up.multiplyScalar(dy * dist));
  camera.position.add(move);
  controls.target.add(move);
}
function orbitBy(angle) {
  const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  camera.position.copy(controls.target).add(off);
}
function stepCamera(dt) {
  if (!camKeys.size) return;
  const k = Math.min(dt, 0.05); // seconds, capped so a slow frame doesn't jump
  for (const a of camKeys) {
    if (a === 'left') panBy(-0.6 * k, 0);
    else if (a === 'right') panBy(0.6 * k, 0);
    else if (a === 'up') panBy(0, 0.6 * k);
    else if (a === 'down') panBy(0, -0.6 * k);
    else if (a === 'orbitLeft') orbitBy(1.6 * k);
    else if (a === 'orbitRight') orbitBy(-1.6 * k);
    else if (a === 'in') zoomBy(Math.pow(0.25, k));
    else if (a === 'out') zoomBy(Math.pow(4, k));
  }
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
  if (moved >= 6) return;
  if (app.preview) {
    const block = pickFacing(e);
    if (block) app.preview.choose(block);
    return;
  }
  onSquareClick(pick(e));
});

function pickFacing(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(app.preview.blocks, false)[0]?.object || null;
}
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
  hoverTile.position.copy(worldPos(sq));
  const p = app.game.board[sq];
  $('hover-label').textContent = sqName(sq) + (p ? ` · ${COLOR_NAME[p.c]} ${PIECE_NAMES[p.t]}` : '');
  canvas.style.cursor = p || app.targets.some((m) => m.to === sq) ? 'pointer' : '';
}
const PIECE_NAMES = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };

// ---------------------------------------------------------------- game flow
function canAct() {
  if (app.game.result || app.mode === 'review') return false;
  if (app.mode === 'local') return true;
  if (app.mode === 'account') return app.acct?.row.status === 'active' && app.game.turn === app.myColor;
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
  if (app.preview) return; // finish choosing a facing first
  if (sq < 0) return deselect();
  const own = app.selected >= 0 && canAct() && app.game.board[app.selected]?.c === app.game.turn;
  const move = own && app.targets.find((m) => m.to === sq);
  if (move) return tryMove(move);
  if (app.game.board[sq] && sq !== app.selected) return select(sq);
  deselect();
}

async function tryMove(move) {
  let promo;
  const game = app.game;
  if (move.promotion) {
    promo = await askPromotion();
    // The game may have moved on while the dialog was open (resign, rematch, resync).
    if (!promo || !canAct() || app.game !== game) return;
  }
  let face;
  if (facingChoices(game, move.from, promo).length) {
    face = await askFacing(move, promo);
    if (face === null || !canAct() || app.game !== game) return;
  }
  const next = applyMove(game, { from: move.from, to: move.to, promo, face });
  if (!next) return;
  const ply = game.history.length;
  const punched = punch(app.clock, ply, Date.now());
  if (punched.flagged && app.mode !== 'account') return onFlag(punched.flagged); // the server judges account games
  if (punched.clock) app.clock = punched.clock;
  setGame(next, { from: move.from, to: move.to });
  if (app.mode === 'online') link.send({ type: 'move', ply, from: move.from, to: move.to, promo, face, ms: app.clock.ms[game.turn] });
  if (app.mode === 'account') sendAccountMove(next, { from: move.from, to: move.to, promo, face }, ply);
}

// ---------------------------------------------------------------- clocks
function onFlag(color) {
  if (app.game.result) return;
  if (app.mode === 'account') {
    const now = Date.now();
    if (now - (app.acct.lastClaim || 0) < 3000) return;
    app.acct.lastClaim = now;
    acct.claimTimeout(app.acct.row.id, canMate(app.game.board, other(color))).then(applyAccountRow, (e) => notify(e.message));
    return;
  }
  setGame(timeout(app.game, color));
  if (app.mode === 'online') link.send({ type: 'timeout', color });
}

function renderClocks() {
  const c = app.clock;
  const show = !!c && c.tc.type !== 'none' && app.mode !== 'review';
  $('clocks').hidden = !show;
  if (!show) return;
  const ply = app.game.history.length;
  const now = Date.now();
  for (const col of 'wb') {
    const box = $(`clock-${col}`);
    const t = timeLeft(c, col, ply, now);
    box.querySelector('.t').textContent = formatTime(t, c.tc);
    box.querySelector('.who').textContent = playerName(col);
    box.classList.toggle('running', !app.game.result && app.game.turn === col && (c.tc.type === 'daily' || ply >= 2));
    box.classList.toggle('low', c.tc.type === 'live' && t !== null && t < 20000);
  }
  // Your own clock at the bottom.
  $('clocks').style.flexDirection = app.viewColor === 'w' ? 'column' : 'column-reverse';
}

function tick() {
  renderClocks();
  if (!app.game.result && app.clock && app.mode !== 'review') {
    const f = flagged(app.clock, app.game.history.length, Date.now());
    if (f) onFlag(f);
  }
}

const playerName = (col) => {
  if (app.mode === 'account' && app.acct) return '@' + accountUI.nameOf(col === 'w' ? app.acct.row.white : app.acct.row.black);
  return COLOR_NAME[col];
};

function notify(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (t.hidden = true), 4000);
}

// ---------------------------------------------------------------- account games
const RESULT_COLOR = { white: 'w', black: 'b', draw: 'draw' };

function openAccountGame(row) {
  if (app.mode === 'online') link.close();
  app.mode = 'account';
  app.review = null;
  app.acct = { row, lastClaim: 0 };
  document.querySelectorAll('#mode .tabs button').forEach((b) => b.classList.remove('active'));
  $('online-box').hidden = true;
  $('review-bar').hidden = true;
  setMyColor(row.white === accountUI.me() ? 'w' : 'b');
  acct.syncServerClock();
  applyAccountRow(row);
}

// Show the game exactly as the server has it.
function applyAccountRow(row) {
  if (!app.acct || row.id !== app.acct.row.id) return;
  const before = app.game.history.length;
  app.acct.row = row;
  let g = replay(row.moves, row.rules);
  if (g.history.length < row.moves.length) notify('This game has a move your version of the game does not accept. Try refreshing the page.');
  if (row.status === 'finished') g = { ...g, result: { winner: RESULT_COLOR[row.result], reason: row.reason } };
  if (row.status === 'aborted') g = { ...g, result: { winner: 'draw', reason: 'aborted' } };
  if (row.status === 'declined') g = { ...g, result: { winner: 'draw', reason: 'declined' } };
  app.clock = { ...newClock(row.time_control, 0), ms: { w: row.white_ms, b: row.black_ms }, started: acct.toLocalTime(row.turn_started_at) };
  const last = g.history.at(-1);
  const anim = g.history.length === before + 1 && last ? { from: last.from, to: last.to } : null;
  setGame(g, anim);
}

async function sendAccountMove(next, move, ply) {
  const id = app.acct.row.id;
  let claim = null, reason = null;
  if (next.result) {
    claim = next.result.winner === 'draw' ? 'draw' : next.result.winner === 'w' ? 'white' : 'black';
    reason = next.result.reason;
  }
  try {
    applyAccountRow(await acct.makeMove(id, ply, move, claim, reason));
  } catch (e) {
    notify(e.message);
    acct.getGame(id).then(applyAccountRow, () => {});
  }
}

function onAccountGameUpdate(row) {
  if (app.acct && row.id === app.acct.row.id) return applyAccountRow(row);
  // A challenge I sent was accepted: open it unless I'm busy in another game.
  if (row.status === 'active' && row.created_by === accountUI.me() && row.moves.length === 0) {
    const busy = (app.mode === 'account' && !app.game.result) || (app.mode !== 'account' && app.game.history.length && !app.game.result);
    if (!busy) openAccountGame(row);
    else notify(`@${accountUI.nameOf(row.white === accountUI.me() ? row.black : row.white)} accepted your challenge. Open it from your account panel.`);
  }
}

// ---------------------------------------------------------------- replays
function reviewGame(row, title) {
  if (app.mode === 'online') link.close();
  app.mode = 'review';
  app.acct = null;
  app.review = { row, ply: row.moves.length, title };
  document.querySelectorAll('#mode .tabs button').forEach((b) => b.classList.remove('active'));
  $('online-box').hidden = true;
  $('review-bar').hidden = false;
  $('review-title').textContent = title;
  showReviewPly(row.moves.length);
}

function showReviewPly(ply) {
  const { row } = app.review;
  app.review.ply = Math.max(0, Math.min(row.moves.length, ply));
  let g = replay(row.moves.slice(0, app.review.ply), row.rules);
  if (app.review.ply === row.moves.length && row.status === 'finished')
    g = { ...g, result: { winner: RESULT_COLOR[row.result], reason: row.reason } };
  setGame(g);
  $('rv-pos').textContent = `${app.review.ply} / ${row.moves.length}`;
}

// Same-screen games are saved to a signed-in player's history when they end.
const savedGames = new WeakSet();
function maybeSaveLocal(game) {
  if (app.mode !== 'local' || !game.result || !game.history.length || savedGames.has(game) || !accountUI.signedIn()) return;
  savedGames.add(game);
  acct.saveLocalGame({
    status: 'finished',
    rules: game.rules,
    time_control: app.clock.tc,
    moves: game.history.map(({ from, to, promo, face }) => ({ from, to, promo, face })),
    result: game.result.winner === 'draw' ? 'draw' : game.result.winner === 'w' ? 'white' : 'black',
    reason: game.result.reason,
  }).then(() => notify('Game saved to your profile.'), (e) => notify(`Couldn't save the game: ${e.message}`));
}

// Relative mode: after picking a move, choose the piece's new facing.
// Resolves to the new facing, undefined to keep it, or null to take the move back.
function askFacing(move, promo) {
  const game = app.game;
  const piece = game.board[move.from];
  const current = piece.o;
  const choices = facingChoices(game, move.from, promo);
  const picker = $('facing-picker');
  const key = (o) => o.join(',');
  const dirKey = (o) => o.slice(0, 3).join(',');
  let active = choices.find((o) => key(o) === key(current)) || choices[0];
  // One labelled block per direction around the piece's new square.
  const byDir = new Map();
  for (const o of choices) {
    if (!byDir.has(dirKey(o))) byDir.set(dirKey(o), []);
    byDir.get(dirKey(o)).push(o);
  }
  const origin = worldPos(move.to);
  const blocks = [];
  for (const [dk, opts] of byDir) {
    const mesh = new THREE.Mesh(FACE_BLOCK, new THREE.MeshBasicMaterial({ color: 0x3b6dff, transparent: true, opacity: 0.25, depthTest: false, depthWrite: false }));
    mesh.position.copy(origin).add(g2w(opts[0]));
    mesh.renderOrder = 5;
    mesh.userData.opts = opts;
    facingGroup.add(mesh);
    blocks.push(mesh);
  }
  return new Promise((resolve) => {
    const paint = () => {
      for (const b of blocks) {
        const isActive = dirKey(b.userData.opts[0]) === dirKey(active);
        const o = isActive ? active : b.userData.opts.find((x) => key(x) === key(current)) || b.userData.opts[0];
        b.material.color.set(isActive ? 0xe04dff : 0x3b6dff);
        b.material.opacity = isActive ? 0.6 : 0.25;
        if (b.userData.label) {
          b.remove(b.userData.label);
          b.userData.label.material.map.dispose();
          b.userData.label.material.dispose();
        }
        const text = facingLabel(o).slice(1) + (key(o) === key(current) ? ' (now)' : '');
        const label = labelSprite(text, isActive ? '#1b1e27' : '#ffffff', isActive ? '#e04dff' : 'rgba(20,22,30,0.85)');
        b.add(label);
        b.userData.label = label;
      }
    };
    const show = (o) => {
      active = o;
      const board = playOnBoard(game.board, { ...move, promo, face: o });
      app.preview = { board, cancel: () => finish(null), choose, confirm: () => finish(key(active) === key(current) ? undefined : active), blocks };
      app.selected = move.to;
      app.targets = legalMovesFrom({ ...game, board, turn: piece.c, result: null }, move.to);
      rebuildPieces();
      refreshHighlights();
      paint();
      $('facing-confirm').textContent = `Confirm ${facingLabel(o)}`;
      $('facing-current').textContent = `Facing ${facingLabel(o)}${o[3] && o.slice(0, 3).filter(Boolean).length === 1 ? ' (turned 45°)' : ''}`;
    };
    // Clicking a block faces that way; clicking a straight one again turns it 45°.
    function choose(block) {
      const opts = block.userData.opts;
      if (dirKey(opts[0]) === dirKey(active) && opts.length > 1) show(opts[(opts.findIndex((o) => key(o) === key(active)) + 1) % opts.length]);
      else show(opts.find((o) => key(o) === key(current)) || opts[0]);
    }
    const finish = (result) => {
      picker.hidden = true;
      for (const b of blocks) {
        b.userData.label?.material.map.dispose();
        b.userData.label?.material.dispose();
        b.material.dispose();
      }
      facingGroup.clear();
      app.preview = null;
      app.selected = -1;
      app.targets = [];
      $('facing-confirm').onclick = $('facing-cancel').onclick = null;
      rebuildPieces();
      refreshHighlights();
      resolve(result);
    };
    $('facing-confirm').onclick = () => app.preview.confirm();
    $('facing-cancel').onclick = () => finish(null);
    picker.hidden = false;
    show(active);
  });
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
  app.preview?.cancel(); // a resync or new game ends any facing choice
  app.game = game;
  app.selected = -1;
  app.targets = [];
  app.pendingAnim = anim;
  rebuildPieces();
  refreshHighlights();
  renderPanel();
  saveHost();
  maybeSaveLocal(game);
}

// Bright white lines for the board a piece stands on in Relative mode: the
// plane of its facing and its left/right, through its square. Facing a flat
// diagonal, that board is tilted through the cube.
// Drawn with fat lines (plain WebGL lines are always 1 px, too thin to notice).
const pieceBoardMat = new LineMaterial({ color: THEME.bright, linewidth: 2.5, transparent: true, opacity: 0.95, depthWrite: false });
const pieceBoard = new LineSegments2(new LineSegmentsGeometry(), pieceBoardMat);
pieceBoard.renderOrder = 2;
pieceBoard.visible = false;
scene.add(pieceBoard);

// The part of the line p + t·d inside the cube (cell centres 0..7, edges at -0.5 and 7.5).
function clipToCube(p, d) {
  let t0 = -Infinity, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (d[k] === 0) {
      if (p[k] < -0.5 || p[k] > N - 0.5) return null;
      continue;
    }
    const a = (-0.5 - p[k]) / d[k], b = (N - 0.5 - p[k]) / d[k];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t1 - t0 > 1e-6 ? [t0, t1] : null;
}

function showPieceBoard(sq, o, color) {
  if (sq < 0 || !o || app.game.rules.mode !== 'relative') {
    pieceBoard.visible = false;
    lattice.material.opacity = app.focus < 0 ? LATTICE_OPACITY : 0.06;
    return;
  }
  const fwd = o.slice(0, 3);
  const { side } = pawnFrame(o, color);
  const c = coords(sq);
  const pts = [];
  const toWorld = (p) => [p[0] - 3.5, p[2], 3.5 - p[1]];
  for (const [step, along] of [[side, fwd], [fwd, side]])
    for (let j = -2 * N; j <= 2 * N; j++) {
      const p = c.map((v, k) => v + (j + 0.5) * step[k]);
      const t = clipToCube(p, along);
      if (!t) continue;
      pts.push(...toWorld(p.map((v, k) => v + t[0] * along[k])), ...toWorld(p.map((v, k) => v + t[1] * along[k])));
    }
  pieceBoard.geometry.dispose();
  pieceBoard.geometry = new LineSegmentsGeometry().setPositions(pts);
  renderer.getSize(pieceBoardMat.resolution);
  pieceBoard.visible = true;
  lattice.material.opacity = 0.06;
}

function refreshHighlights() {
  const sel = app.selected >= 0 ? viewBoard()[app.selected] : null;
  showPieceBoard(app.selected, sel?.o, sel?.c);
  rebuildMarkers();
  renderLevelMap();
}

// ---------------------------------------------------------------- panel
function statusText() {
  const g = app.game;
  if (g.result) {
    const { winner, reason } = g.result;
    if (reason === 'aborted' || reason === 'declined') return `Game ${reason}`;
    return winner === 'draw' ? `Draw — ${reason}` : `${playerName(winner)} wins — ${reason}`;
  }
  const who = playerName(g.turn);
  let s;
  if (app.mode === 'review') return `Replay: move ${app.review.ply} of ${app.review.row.moves.length}`;
  if (app.mode === 'account') s = g.turn === app.myColor ? `Your move (${COLOR_NAME[g.turn]})` : `Waiting for ${who}…`;
  else if (app.mode === 'online') {
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
  $('resign-btn').disabled = !!app.game.result || app.mode === 'review' || (app.mode === 'online' && !link.connected);
  $('new-btn').textContent = app.mode === 'account' ? 'Rematch' : 'New game';
  $('new-btn').disabled = app.mode === 'review';
  const a = app.mode === 'account' && app.acct;
  $('acct-game').hidden = !a;
  if (a) {
    const r = app.acct.row;
    $('acct-game-info').textContent = `@${accountUI.nameOf(r.white)} (White) vs @${accountUI.nameOf(r.black)} (Black) · ${tcLabel(app.clock.tc)} · ${r.rules.mode === 'relative' ? 'Relative' : 'Classic'}`;
    $('abort-btn').hidden = !(r.status === 'active' && r.moves.length < 2);
  }
  renderRules();
  renderClocks();
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
  // Same colours as the cube: green moves and red captures for your own piece, blue for a preview.
  const own = app.selected >= 0 && canAct() && viewBoard()[app.selected]?.c === g.turn;
  for (const c of cells) {
    const [x, y, z] = coords(c.sq);
    const p = viewBoard()[c.sq];
    const t = targets.get(c.sq);
    const cls = ['cell', (x + y + z) % 2 ? 'light' : 'dark'];
    if (p) cls.push(p.c === 'w' ? 'pw' : 'pb');
    if (c.sq === app.selected) cls.push('sel');
    if (last && (c.sq === last.from || c.sq === last.to)) cls.push('last');
    if (t) cls.push('target', t.capture ? 'cap' : '', own ? 'mine' : 'preview');
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
      code: link.code, hostColor: app.hostColor, result: app.game.result, clock: app.clock,
      moves: app.game.history.map(({ from, to, promo, face }) => ({ from, to, promo, face })),
      rules: app.game.rules,
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

function gameFromSaved(moves, result, rules) {
  let g = replay(moves || [], rules);
  if (result && !g.result) g = { ...g, result };
  return g;
}

function syncPayload() {
  return {
    type: 'sync',
    version: RULES_VERSION,
    guestColor: other(app.hostColor),
    moves: app.game.history.map(({ from, to, promo, face }) => ({ from, to, promo, face })),
    rules: app.game.rules,
    result: app.game.result,
    clock: { tc: app.clock.tc, ms: app.clock.ms, elapsed: Date.now() - app.clock.started },
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
  if (saved) {
    app.clock = saved.clock?.tc ? saved.clock : newClock(app.tc, Date.now());
    setGame(gameFromSaved(saved.moves, saved.result, saved.rules));
  } else startFresh();
}

function startJoining(code) {
  app.mode = 'online';
  app.myColor = null; // assigned by the host's sync
  link.join(code);
  history.replaceState(null, '', `?join=${code}`);
  showRoom(code);
  $('my-color').textContent = '…';
  startFresh();
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
        const next = gameFromSaved(msg.moves, msg.result, msg.rules);
        if (msg.clock) app.clock = { ...newClock(msg.clock.tc, 0), ms: msg.clock.ms, started: Date.now() - (msg.clock.elapsed || 0) };
        const last = next.history.at(-1);
        setGame(next, next.history.length === before + 1 && last ? { from: last.from, to: last.to } : null);
      }
      break;
    case 'move': {
      const next = msg.ply === g.history.length && applyMove(g, msg);
      if (next && g.turn !== app.myColor) {
        if (typeof msg.ms === 'number' && app.clock.tc.type === 'live') app.clock.ms = { ...app.clock.ms, [g.turn]: msg.ms };
        app.clock.started = Date.now();
        setGame(next, { from: msg.from, to: msg.to });
      }
      else if (link.role === 'host') link.send(syncPayload());
      else link.send({ type: 'sync-request' });
      break;
    }
    case 'timeout':
      if (!g.result && ['w', 'b'].includes(msg.color)) setGame(timeout(g, msg.color));
      break;
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
  startFresh();
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

// ---------------------------------------------------------------- rules panel
// Rules can change until the first move; online, only the host picks them.
function rulesEditable() {
  if (app.mode === 'account' || app.mode === 'review') return false;
  return !app.game.history.length && !app.game.result && (app.mode === 'local' || link.role === 'host');
}

function renderRules() {
  const r = app.game.rules;
  const editable = rulesEditable();
  $('rule-mode').value = r.mode;
  $('rule-mode').disabled = !editable;
  for (const k of RULE_TOGGLES) {
    $(`rule-${k}`).checked = !!r[k];
    $(`rule-${k}`).disabled = !editable;
  }
  document.querySelectorAll('#rules-box [data-for]').forEach((el) => (el.hidden = el.dataset.for !== r.mode));
  const sel = $('tc-select');
  const key = tcKey(app.clock.tc);
  if (![...sel.options].some((o) => o.value === key)) sel.add(new Option(tcLabel(app.clock.tc), key), sel.options[sel.options.length - 1]);
  if (document.activeElement !== sel && sel.value !== 'custom') sel.value = key;
  sel.disabled = !editable;
  $('tc-custom').hidden = sel.value !== 'custom' || !editable;
  $('rules-note').textContent = editable
    ? 'You can change these until the first move.'
    : app.mode === 'account'
      ? 'Set when the challenge was made.'
      : app.mode === 'online' && link.role === 'guest'
        ? 'The host chooses the rules.'
        : 'Locked once the game has started. Start a new game to change them.';
}

function onRulesChange(e) {
  if (!rulesEditable()) return renderRules();
  const mode = $('rule-mode').value;
  let r;
  if (e.target.id === 'rule-mode') r = DEFAULT_RULES[mode];
  else {
    r = { mode };
    for (const k of RULE_TOGGLES) r[k] = $(`rule-${k}`).checked;
  }
  app.rules = normalizeRules(r);
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(app.rules));
  } catch {}
  startFresh();
  if (app.mode === 'online' && link.role === 'host') link.send(syncPayload());
}

function onTcChange() {
  if (!rulesEditable()) return renderRules();
  const sel = $('tc-select');
  if (sel.value === 'custom') {
    $('tc-custom').hidden = false;
    const base = Math.round(Number($('tc-min').value) * 60), inc = Math.round(Number($('tc-inc').value));
    app.tc = parseTcKey(`live:${base}:${inc}`);
    if (app.tc.type === 'none') return notify('Custom time: 15 seconds to 180 minutes, increment up to 180 seconds.');
  } else app.tc = parseTcKey(sel.value);
  try {
    localStorage.setItem(TC_KEY, tcKey(app.tc));
  } catch {}
  startFresh();
  if (app.mode === 'online' && link.role === 'host') link.send(syncPayload());
}

// ---------------------------------------------------------------- controls
function setMode(mode) {
  document.querySelectorAll('#mode .tabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('online-box').hidden = mode !== 'online';
  const leaving = app.mode;
  if (leaving === 'account' || leaving === 'review') {
    app.acct = null;
    app.review = null;
    $('review-bar').hidden = true;
    app.mode = 'local';
    startFresh();
  }
  if (mode === 'local' && leaving === 'online') {
    link.close();
    $('online-setup').hidden = false;
    $('online-room').hidden = true;
    $('chat-box').hidden = true;
    history.replaceState(null, '', location.pathname);
    startFresh();
  }
  if (mode === 'local') app.mode = 'local';
  renderPanel();
}

function wireUI() {
  document.querySelectorAll('#mode .tabs button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
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
  $('flip-btn').onclick = () => {
    app.viewColor = other(app.viewColor);
    orientLevelMap();
    resetCamera();
  };
  $('reset-cam-btn').onclick = resetCamera;
  $('rule-mode').onchange = onRulesChange;
  for (const k of RULE_TOGGLES) $(`rule-${k}`).onchange = onRulesChange;
  accountUI.fillTcSelect($('tc-select'), false);
  $('tc-select').add(new Option('Custom…', 'custom'));
  $('tc-select').onchange = onTcChange;
  $('tc-min').onchange = $('tc-inc').onchange = onTcChange;

  $('abort-btn').onclick = () => {
    if (app.acct && confirm('Abort this game? It won’t count for anyone.')) acct.abortGame(app.acct.row.id).then(applyAccountRow, (e) => notify(e.message));
  };
  $('leave-acct-btn').onclick = () => setMode('local');
  $('rv-first').onclick = () => showReviewPly(0);
  $('rv-prev').onclick = () => showReviewPly(app.review.ply - 1);
  $('rv-next').onclick = () => showReviewPly(app.review.ply + 1);
  $('rv-last').onclick = () => showReviewPly(Infinity);
  $('rv-close').onclick = () => setMode('local');

  $('new-btn').onclick = () => {
    if (app.mode === 'account') {
      const r = app.acct.row;
      const mine = app.myColor === 'w';
      accountUI.openChallenge(mine ? r.black : r.white, { color: mine ? 'black' : 'white', rules: r.rules, timeControl: r.time_control });
    } else if (app.mode === 'local') {
      if (app.game.history.length && !app.game.result && !confirm('Start a new game?')) return;
      startFresh();
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
    if (app.mode === 'account') return acct.resign(app.acct.row.id).then(applyAccountRow, (e) => notify(e.message));
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
  // Hidden until opened; the page remembers whether it was left open.
  const showDock = (open) => {
    dock.classList.toggle('collapsed', !open);
    $('levels-toggle').textContent = open ? 'Level map ▾' : 'Level map ▴';
    syncDock();
  };
  try {
    showDock(localStorage.getItem(DOCK_KEY) === 'open');
  } catch {}
  $('levels-toggle').onclick = () => {
    const open = dock.classList.contains('collapsed');
    showDock(open);
    try {
      localStorage.setItem(DOCK_KEY, open ? 'open' : 'closed');
    } catch {}
  };
  new ResizeObserver(syncDock).observe(dock);

  $('zoom-in').onclick = () => zoomBy(0.8);
  $('zoom-out').onclick = () => zoomBy(1.25);
  window.addEventListener('keyup', (e) => camKeys.delete(CAM_KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]));
  window.addEventListener('blur', () => camKeys.clear());
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const camAct = !e.ctrlKey && !e.metaKey && !e.altKey && CAM_KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    const reviewStep = app.mode === 'review' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    if (camAct && !reviewStep) {
      camKeys.add(camAct);
      e.preventDefault(); // keep arrows and Page keys from scrolling the page
      return;
    }
    if (e.key === ']') setFocus(app.focus < 0 ? 0 : Math.min(N - 1, app.focus + 1));
    else if (e.key === '[') setFocus(app.focus < 0 ? N - 1 : Math.max(0, app.focus - 1));
    else if (e.key === '0') setFocus(-1);
    else if (e.key === 'Escape') app.preview ? app.preview.cancel() : deselect();
    else if (e.key === 'Enter' && app.preview) app.preview.confirm();
    else if (app.mode === 'review' && e.key === 'ArrowLeft') showReviewPly(app.review.ply - 1);
    else if (app.mode === 'review' && e.key === 'ArrowRight') showReviewPly(app.review.ply + 1);
  });
}

// ---------------------------------------------------------------- loop
const ANIM_MS = 380;
let lastFrame = 0;
function animate(now) {
  stepCamera(lastFrame ? (now - lastFrame) / 1000 : 0);
  lastFrame = now;
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
  LINE.selected.opacity = pulse + 0.4;
  updateHover();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------- boot
wireUI();
buildLevelMap();
layoutLabels();
resize();
resetCamera();
startFresh();
setInterval(tick, 100);
accountUI.setup({
  accountChanged: () => renderPanel(),
  gameUpdated: onAccountGameUpdate,
  openGame: openAccountGame,
  reviewGame,
  notify,
  currentRules: () => app.rules,
  currentTimeControl: () => app.tc,
});

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
window.__chess3d = { app, link, onSquareClick, idx, setFocus, camera, worldPos, acct };
