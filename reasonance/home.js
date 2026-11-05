// The signed-in home page: a slowly turning sea of orbs (every public post is
// an orb, every arrow a line) behind a feed of statements to give your view on.
// three.js loads only when the home page first opens; without it, the feed
// still works over a plain background.
import * as cloud from './cloud.js';
import { STANCES } from './model.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const NODE_COLORS = {
  statement: 0x2fe3e6, question: 0xffe94d, clarification: 0x6f93ff, combiner: 0xd9def0, axiom: 0xffe94d, fallacy: 0xb026ff,
};
const EDGE_COLORS = { support: 0x2fe3e6, contention: 0xe04dff, example: 0xb026ff };
const $ = (id) => document.getElementById(id);

let deps = null; // { h, toast, openInMap, rated }
let feedRows = [], mine = {}, stats = {}, about = {};
let sea = null;

export function initHome(d) {
  deps = d;
  $('home-sandbox').addEventListener('click', () => closeHome());
  $('feed-search').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') loadFeed(ev.target.value); });
}
export const homeOpen = () => !$('home').hidden;

export async function openHome() {
  document.body.classList.add('home');
  $('home').hidden = false;
  startSea();
  await loadFeed();
}
export function closeHome() {
  document.body.classList.remove('home');
  $('home').hidden = true;
  if (sea) cancelAnimationFrame(sea.frame), (sea.running = false);
}

// ---------------------------------------------------------------- feed
async function loadFeed(q = '') {
  const feed = $('feed');
  feed.replaceChildren(deps.h('p', { class: 'muted' }, 'Loading…'));
  try {
    feedRows = q.trim() ? await cloud.search(q) : await cloud.recent(40);
    const ids = feedRows.map((r) => r.id);
    [mine, stats, about] = await Promise.all([cloud.myRatings(ids), cloud.stats(ids), cloud.about(ids)]);
  } catch (err) {
    feed.replaceChildren(deps.h('p', { class: 'muted' }, `Couldn't load posts: ${err.message}`));
    return;
  }
  renderFeed();
}
function renderFeed() {
  const { h } = deps;
  const feed = $('feed');
  if (!feedRows.length) {
    feed.replaceChildren(h('p', { class: 'muted' }, 'Nothing here yet. Open your maps and post the first statement.'));
    return;
  }
  feed.replaceChildren(...feedRows.map(card));
}
function card(r) {
  const { h } = deps;
  const st = stats[r.id], ab = about[r.id], my = mine[r.id];
  const counts = st ? Object.entries(STANCES).filter(([k]) => st[k]).map(([k, label]) => `${st[k]} ${label.toLowerCase()}`) : [];
  const by = ab?.by ? `@${ab.by}` : 'anonymous';
  return h('article', { class: 'post-card', 'data-id': r.id,
    onmouseenter: () => glow(r.id), onfocusin: () => glow(r.id) },
  h('p', { class: `text ${r.type}` }, r.type === 'fallacy' ? `A ${r.fallacy} fallacy is when an argument ${r.text}` : r.text),
  h('div', { class: 'meta' }, [by, counts.length ? counts.join(' · ') : 'no views yet'].join(' · ')),
  h('div', { class: 'row stances' }, Object.entries(STANCES).map(([k, label]) =>
    h('button', { class: my?.stance === k ? 'on' : '', 'aria-pressed': my?.stance === k ? 'true' : 'false', onclick: () => rateFromFeed(r.id, k) }, label))),
  h('div', { class: 'row' },
    h('button', { onclick: () => { closeHome(); deps.openInMap(r.id); } }, 'Open in my map'),
    h('span', { class: 'muted' }, my?.stance ? (my.public ? 'Your view is shared.' : 'Your view is private.') : '')));
}
async function rateFromFeed(pid, stance) {
  const my = mine[pid] ?? {};
  const next = { stance: my.stance === stance ? null : stance, confidence: my.confidence ?? null, relevance: my.relevance ?? null };
  const share = my.stance ? !!my.public : cloud.settings.share_views;
  try {
    await cloud.rate(pid, next, share);
    mine[pid] = { ...my, ...next, public: share };
    stats = { ...stats, ...(await cloud.stats([pid])) };
    deps.rated(pid, next);
    const el = document.querySelector(`.post-card[data-id="${pid}"]`);
    const row = feedRows.find((r) => r.id === pid);
    if (el && row) el.replaceWith(card(row));
  } catch (err) { deps.toast(`Your view wasn't saved: ${err.message}`); }
}

// ---------------------------------------------------------------- sea of orbs
// Each post sits at a spot picked from its id, so the sea looks the same every visit.
function spot(id, r0 = 30, r1 = 110) {
  let x = 2166136261;
  for (const c of id) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) >>> 0) / 4294967296);
  const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, rad = r0 + (r1 - r0) * Math.cbrt(rnd());
  const s = Math.sqrt(1 - u * u);
  return [rad * s * Math.cos(t), rad * u * 0.6, rad * s * Math.sin(t)];
}
function dot(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
async function startSea() {
  const canvas = $('sea');
  if (sea) { if (!sea.running) { sea.running = true; tick(); } return; }
  let THREE;
  try { THREE = await import(THREE_URL); } catch { canvas.classList.add('flat'); return; }
  let rows = [];
  try { rows = await cloud.sea(); } catch { /* an empty sea */ }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07090f, 0.0035);
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 1000);
  camera.position.set(0, 20, 190);
  const group = new THREE.Group(); scene.add(group);
  const tex = dot(THREE);

  // Where each post is: statements at their own spot, arrows between their ends.
  const pos = new Map();
  for (const r of rows) if (r.kind === 'node') pos.set(r.id, spot(r.id));
  for (let pass = 0; pass < 4; pass++) {
    for (const r of rows) {
      if (r.kind !== 'edge' || pos.has(r.id)) continue;
      const a = pos.get(r.from_post), b = pos.get(r.to_post);
      if (a && b) { const j = spot(r.id, 0, 6); pos.set(r.id, [(a[0] + b[0]) / 2 + j[0], (a[1] + b[1]) / 2 + j[1], (a[2] + b[2]) / 2 + j[2]]); }
    }
  }
  // Statements with nothing posted yet still get a few drifting orbs, so it never looks empty.
  const ids = [...pos.keys()];
  const filler = ids.length < 40 ? Array.from({ length: 160 }, (_, i) => `filler-${i}`) : [];
  const points = (list, colorOf, size, opacity) => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(list.length * 3), c = new Float32Array(list.length * 3);
    const col = new THREE.Color();
    list.forEach((id, i) => { p.set(pos.get(id) ?? spot(id, 20, 160), i * 3); col.setHex(colorOf(id)); c.set([col.r, col.g, col.b], i * 3); });
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const o = new THREE.Points(g, m); group.add(o); return o;
  };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const nodeIds = ids.filter((id) => byId.get(id).kind === 'node');
  const edgeIds = ids.filter((id) => byId.get(id).kind === 'edge');
  const nodes = points(nodeIds, (id) => NODE_COLORS[byId.get(id).type] ?? 0x2fe3e6, 7, 0.95);
  points(edgeIds, (id) => EDGE_COLORS[byId.get(id).type] ?? 0xd9def0, 3.5, 0.8);
  if (filler.length) points(filler, (id) => [0x2fe3e6, 0xe04dff, 0x3b6dff, 0xffe94d][id.length % 4], 3, 0.35);
  // Lines: claim -> arrow orb -> reason.
  const seg = [];
  for (const id of edgeIds) {
    const r = byId.get(id), m = pos.get(id), a = pos.get(r.from_post), b = pos.get(r.to_post);
    if (a && b && m) seg.push(...a, ...m, ...m, ...b);
  }
  if (seg.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3b6dff, transparent: true, opacity: 0.35 })));
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffe94d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(18, 18, 1); group.add(halo);

  sea = { THREE, renderer, scene, camera, group, nodes, nodeIds, pos, halo, running: true, frame: 0, drag: null, spin: 0.0009 };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) sea.spin = 0;
  const resize = () => {
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas); resize();

  // Drag to turn the sea; click an orb to find its post.
  canvas.addEventListener('pointerdown', (ev) => { sea.drag = { x: ev.clientX, y: ev.clientY, moved: 0 }; canvas.setPointerCapture(ev.pointerId); });
  canvas.addEventListener('pointermove', (ev) => {
    if (!sea.drag) return;
    const dx = ev.clientX - sea.drag.x, dy = ev.clientY - sea.drag.y;
    sea.drag.moved += Math.abs(dx) + Math.abs(dy); sea.drag.x = ev.clientX; sea.drag.y = ev.clientY;
    group.rotation.y += dx * 0.005; group.rotation.x = Math.max(-0.8, Math.min(0.8, group.rotation.x + dy * 0.004));
  });
  canvas.addEventListener('pointerup', (ev) => {
    const d = sea.drag; sea.drag = null;
    if (d && d.moved < 6) pick(ev);
  });
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    camera.position.z = Math.max(60, Math.min(320, camera.position.z * (ev.deltaY > 0 ? 1.08 : 0.93)));
  }, { passive: false });
  tick();
}
function tick() {
  if (!sea?.running) return;
  if (!sea.drag) sea.group.rotation.y += sea.spin;
  sea.halo.material.opacity *= 0.985;
  sea.renderer.render(sea.scene, sea.camera);
  sea.frame = requestAnimationFrame(tick);
}
function glow(pid) {
  const p = sea?.pos.get(pid);
  if (!p) return;
  sea.halo.position.set(...p); sea.halo.material.opacity = 1;
}
async function pick(ev) {
  const { THREE, camera, nodes, nodeIds } = sea;
  const rect = $('sea').getBoundingClientRect();
  const ray = new THREE.Raycaster(); ray.params.Points.threshold = 3;
  ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), camera);
  const hit = ray.intersectObject(nodes)[0];
  if (!hit) return;
  const pid = nodeIds[hit.index];
  glow(pid);
  const el = document.querySelector(`.post-card[data-id="${pid}"]`);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('picked'); setTimeout(() => el.classList.remove('picked'), 1600); return; }
  // Not in the feed yet: put it at the top.
  try {
    const r = await cloud.getPost(pid);
    if (!r) return;
    feedRows = [r, ...feedRows.filter((x) => x.id !== pid)];
    Object.assign(mine, await cloud.myRatings([pid])); Object.assign(stats, await cloud.stats([pid])); Object.assign(about, await cloud.about([pid]));
    renderFeed();
    $('feed').scrollTop = 0;
  } catch { /* fine */ }
}
