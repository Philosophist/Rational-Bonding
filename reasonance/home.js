// The signed-in home page: a slowly turning sea of orbs (every public post is
// an orb, every arrow a line) behind a feed of statements to give your view on.
// three.js loads only when the home page first opens; without it, the feed
// still works over a plain background.
import * as cloud from './cloud.js';
import { STANCES, EDGE_TYPES, RELEVANCE, formatConfidence } from './model.js';
import { stanceButtons, oddsLine } from './stances.js';

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
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('float').hidden) closeFloat(); });
  new ResizeObserver(() => { if (floatState) drawFloat(); }).observe($('home'));
}
export const homeOpen = () => !$('home').hidden;

export async function openHome() {
  document.body.classList.add('home');
  $('home').hidden = false;
  startSea();
  await loadFeed();
}
export function closeHome() {
  closeFloat();
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
const postText = (r) => r.type === 'fallacy' ? `A ${r.fallacy} fallacy is when an argument ${r.text}` : r.text;
function countsLine(st) {
  return st ? Object.entries(STANCES).filter(([k]) => st[k]).map(([k, label]) => `${st[k]} ${label.toLowerCase()}`) : [];
}
function card(r) {
  const { h } = deps;
  const st = stats[r.id], ab = about[r.id], my = mine[r.id];
  const counts = countsLine(st);
  const by = ab?.by ? `@${ab.by}` : 'anonymous';
  // Clicking the post (anywhere but its buttons) opens it in the floating sandbox.
  return h('article', { class: 'post-card', 'data-id': r.id, tabindex: 0, title: 'Open it over the sea',
    onmouseenter: () => glow(r.id), onfocusin: () => glow(r.id),
    onclick: (ev) => { if (!ev.target.closest('button')) openFloat(r.id); },
    onkeydown: (ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) openFloat(r.id); } },
  h('p', { class: `text ${r.type}` }, postText(r)),
  h('div', { class: 'meta' }, [by, counts.length ? counts.join(' · ') : 'no views yet'].join(' · ')),
  stanceButtons(h, my?.stance ?? null, (k, other) => rateFromFeed(r.id, { stance: k, other }), my?.other),
  my?.stance ? h('div', { class: 'muted' }, my.public ? 'Your view is shared.' : 'Your view is private.') : null);
}
// A view from the feed or the floating post: a stance, or { confidence } or
// { relevance } on their own.
async function rateFromFeed(pid, change) {
  const my = mine[pid] ?? {};
  const patch = typeof change === 'object' && change ? change : { stance: change };
  const next = { stance: my.stance ?? null, confidence: my.confidence ?? null, relevance: my.relevance ?? null, other: my.other ?? null, ...patch };
  if (next.stance !== 'other') next.other = null;
  if (patch.stance === 'dontcare' && next.relevance == null) next.relevance = 1; // not caring: one star
  const share = my.stance ? !!my.public : cloud.settings.share_views;
  try {
    await cloud.rate(pid, next, share);
    mine[pid] = { ...my, ...next, public: share };
    stats = { ...stats, ...(await cloud.stats([pid])) };
    deps.rated(pid, next);
    const el = document.querySelector(`.post-card[data-id="${pid}"]`);
    const row = feedRows.find((r) => r.id === pid);
    if (el && row) el.replaceWith(card(row));
    if (floatState?.pid === pid) drawFloat();
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
  openFloat(pid);
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

// ---------------------------------------------------------------- floating sandbox
// A post floats over the sea with its questions, clarifications and
// definitions around it (up to MAX_NEAR). Its other inferences, and any past
// that limit, reach off to the edge of the screen; hover one to see the post
// at its far end, click it to go there.
const MAX_NEAR = 4;
const NEAR_TYPES = ['question', 'clarification', 'same', 'example'];
const LINE_COLORS = { support: '#4dff88', contention: '#ff4d5e', question: '#ffe94d', clarification: '#6f93ff', same: '#7dffb0', example: '#b026ff', premise: '#d9def0', contradicts: '#ff4d5e', exclusive: '#ff4d5e', necessary: '#7dffb0' };
const OUT_LABEL = { support: 'Supported by', contention: 'Contended by', question: 'Questioned by', clarification: 'Clarified by', same: 'Means the same as', example: 'An example of', premise: 'Premise', contradicts: 'Contradicts', exclusive: 'Mutually exclusive with', necessary: 'Mutually necessary with' };
const IN_LABEL = { support: 'It supports', contention: 'It contends', question: 'It questions', clarification: 'It clarifies', same: 'Means the same as', example: 'Called a fallacy:', premise: 'A premise of', contradicts: 'Contradicts', exclusive: 'Mutually exclusive with', necessary: 'Mutually necessary with' };
let floatState = null; // { pid, post, links }
export async function openFloat(pid, { keepCompose = false } = {}) {
  const compose = keepCompose ? floatState?.compose : null;
  const box = $('float');
  box.hidden = false;
  document.body.classList.add('floating');
  glow(pid);
  floatState = { pid, post: floatState?.pid === pid ? floatState.post : null, links: floatState?.pid === pid ? floatState.links : null, compose };
  drawFloat();
  try {
    const [post, links] = await Promise.all([cloud.getPost(pid), cloud.links(pid)]);
    if (floatState?.pid !== pid) return;
    if (!post) { closeFloat(); deps.toast('That post is gone.'); return; }
    // It joins your current map too, with its posted reasons.
    if (post.kind === 'node') deps.openInMap(pid);
    const ids = [pid, ...Object.keys(links.ends)];
    const [m, st, ab] = await Promise.all([cloud.myRatings([pid]), cloud.stats(ids), cloud.about([pid])]);
    Object.assign(mine, m); Object.assign(stats, st); Object.assign(about, ab);
    floatState = { pid, post, links, compose: floatState.compose };
    drawFloat();
  } catch (err) { deps.toast(`Couldn't open it: ${err.message}`); }
}
export function closeFloat() {
  floatState = null;
  if (!$('float')) return;
  $('float').hidden = true;
  document.body.classList.remove('floating');
  $('float-tip').hidden = true;
}
function drawFloat() {
  const { h } = deps;
  const box = $('float'), svg = $('float-lines'), nodes = $('float-nodes');
  const st = floatState;
  if (!st) return;
  const W = box.clientWidth, H = box.clientHeight, cx = W / 2, cy = H * 0.42;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren(); nodes.replaceChildren();
  if (!st.post) { nodes.append(h('div', { class: 'fnode center', style: `left:${cx}px;top:${cy}px` }, 'Loading…')); return; }
  const { post, links } = st;
  // The post itself, with your view of it.
  const my = mine[post.id], s0 = stats[post.id], ab = about[post.id];
  const counts = countsLine(s0);
  nodes.append(h('div', { class: `fnode center ${post.type}`, style: `left:${cx}px;top:${cy}px` },
    h('button', { class: 'fclose', 'aria-label': 'Back to the sea', title: 'Back to the sea (Esc)', onclick: closeFloat }, '×'),
    h('p', { class: 'text' }, postText(post)),
    h('div', { class: 'meta' }, [ab?.by ? `@${ab.by}` : 'anonymous', counts.length ? counts.join(' · ') : 'no views yet'].join(' · ')),
    stanceButtons(h, my?.stance ?? null, (k, other) => rateFromFeed(post.id, { stance: k, other }), my?.other),
    composeBox(post),
    ...viewDetails(post.id, my)));
  // Near: questions, clarifications, rewordings and fallacies it's called.
  const near = links.out.filter((e) => NEAR_TYPES.includes(e.type) && links.ends[e.to_post]?.kind === 'node').slice(0, MAX_NEAR);
  const nearIds = new Set(near.map((e) => e.id));
  const R = Math.min(W, H) * 0.36;
  near.forEach((e, i) => {
    const a = (Math.PI * (0.2 + 0.6 * (near.length === 1 ? 0.5 : i / (near.length - 1))));
    const x = cx + Math.cos(a) * R * 1.25, y = cy + Math.sin(a) * R;
    line(svg, cx, cy, x, y, LINE_COLORS[e.type], e.type === 'question' || e.type === 'clarification');
    const end = links.ends[e.to_post];
    nodes.append(h('button', { class: `fnode near ${end.type}`, style: `left:${x}px;top:${y}px`, onclick: () => openFloat(end.id) },
      h('span', { class: 'kind', style: `color:${LINE_COLORS[e.type]}` }, EDGE_TYPES[e.type]?.label ?? e.type), postText(end)));
  });
  // Everything else reaches off the screen, back into the sea.
  const far = [
    ...links.out.filter((e) => !nearIds.has(e.id)).map((e) => ({ e, other: links.ends[e.to_post], out: true })),
    ...links.inn.map((e) => ({ e, other: links.ends[e.from_post], out: false })),
  ].filter((f) => f.other?.kind === 'node');
  far.forEach((f, i) => {
    const a = -Math.PI * (0.08 + 0.84 * (far.length === 1 ? 0.5 : i / (far.length - 1)));
    const len = Math.hypot(W, H);
    const x = cx + Math.cos(a) * len, y = cy + Math.sin(a) * len;
    const color = LINE_COLORS[f.e.type] ?? '#d9def0';
    const g = s('g', { class: 'stub' }, svg);
    s('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: color, 'stroke-width': 2.5, opacity: 0.8 }, g);
    // Arrowheads point the way the inference runs: from the claim out to its reason.
    const hx = f.out ? cx + Math.cos(a) * R * 0.9 : cx + Math.cos(a) * R * 0.55, hy = f.out ? cy + Math.sin(a) * R * 0.9 : cy + Math.sin(a) * R * 0.55;
    const dir = f.out ? a : a + Math.PI;
    const p = (r, t) => `${hx + Math.cos(dir + t) * r},${hy + Math.sin(dir + t) * r}`;
    s('polygon', { points: `${p(9, 0)} ${p(9, 2.5)} ${p(9, -2.5)}`, fill: color }, g);
    const hit = s('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'transparent', 'stroke-width': 18, class: 'hit' }, g);
    const label = (f.out ? OUT_LABEL : IN_LABEL)[f.e.type] ?? EDGE_TYPES[f.e.type]?.label ?? f.e.type;
    hit.addEventListener('pointerenter', (ev) => tip(ev, label, postText(f.other), f.e.type));
    hit.addEventListener('pointermove', (ev) => tip(ev));
    hit.addEventListener('pointerleave', () => { $('float-tip').hidden = true; });
    hit.addEventListener('click', () => openFloat(f.other.id));
  });
  if (!near.length && !far.length) nodes.append(h('p', { class: 'float-empty', style: `left:${cx}px;top:${cy + 140}px` }, 'Nobody has posted reasons for it yet.'));
}
// Under the post: the parts of your view you haven't given yet (scroll down
// to them), then a summary of the parts you have, at the bottom left.
function viewDetails(pid, my = {}) {
  const { h } = deps;
  const out = [];
  const conf = my?.confidence ?? null, stars = my?.relevance ?? null;
  const starRow = () => h('div', { class: 'row stars' }, [1, 2, 3, 4, 5].map((v) =>
    h('button', { class: stars >= v ? 'on' : '', title: RELEVANCE[v].text, onclick: () => rateFromFeed(pid, { relevance: stars === v ? null : v }) }, '★')));
  if (conf == null || stars == null) {
    const todo = [h('div', { class: 'kind' }, 'Add to your view')];
    if (conf == null) {
      const num = h('input', { class: 'num', type: 'number', min: 0, max: 100, step: 'any', placeholder: '–', 'aria-label': 'Confidence percent',
        onchange: (ev) => ev.target.value !== '' && rateFromFeed(pid, { confidence: Math.min(100, Math.max(0, Number(ev.target.value))) }) });
      const odds = oddsLine(h, null, (v) => rateFromFeed(pid, { confidence: v }));
      num.addEventListener('input', () => odds.update(num.value === '' ? null : Number(num.value)));
      todo.push(h('label', {}, 'Confidence', num, '%'), odds.el);
    }
    if (stars == null) todo.push(h('p', { class: 'muted' }, 'How much would it matter to you if the opposite were proven?'), starRow());
    out.push(h('div', { class: 'todo' }, ...todo));
  }
  if (conf != null || stars != null) {
    out.push(h('div', { class: 'given' },
      conf != null ? h('div', {}, `${formatConfidence(conf)} · `, oddsLine(h, conf, (v) => rateFromFeed(pid, { confidence: v })).el) : null,
      stars != null ? h('div', { class: 'stars-given', title: RELEVANCE[stars].text },
        h('button', { class: 'plain', title: 'Change how much it matters', onclick: (ev) => ev.currentTarget.replaceWith(starRow()) }, '★'.repeat(stars) + '☆'.repeat(5 - stars))) : null));
  }
  return out;
}
function s(tag, attrs, parent) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.append(el);
  return el;
}
function line(svg, x1, y1, x2, y2, color, dashed) {
  s('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 2, opacity: 0.85, ...(dashed ? { 'stroke-dasharray': '6 5' } : {}) }, svg);
}
function tip(ev, label, text, type) {
  const t = $('float-tip');
  if (label !== undefined) {
    const good = ['support', 'same', 'necessary'].includes(type), bad = ['contention', 'contradicts', 'exclusive'].includes(type);
    t.className = `float-tip ${good ? 'good' : bad ? 'bad' : ''}`;
    t.replaceChildren(deps.h('div', { class: 'kind' }, label), deps.h('div', {}, text));
  }
  const r = $('float').getBoundingClientRect();
  t.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - 300)}px`;
  t.style.top = `${ev.clientY - r.top + 14}px`;
  t.hidden = false;
}

// ---------------------------------------------------------------- answering from the sea
// Support or contend the floating post: type a reason, see what's already
// posted as you go, and on Enter (or leaving the box) choose an existing
// post, add a clarification, or post your own. The arrow is yours if it's new.
const COMPOSE = { support: { label: 'Supported by', button: 'Support it', cls: 'agree' }, contention: { label: 'Contended by', button: 'Contend it', cls: 'disagree' } };
function composeBox(post) {
  const { h } = deps;
  const c = floatState.compose;
  if (!c) {
    return h('div', { class: 'row respond' }, Object.entries(COMPOSE).map(([type, t]) =>
      h('button', { class: t.cls, onclick: () => { floatState.compose = { type, text: '', clarify: '', showClarify: false, anonymous: false, checked: null, busy: false }; drawFloat(); setTimeout(() => $('float-text')?.focus(), 0); } }, t.button)));
  }
  const t = COMPOSE[c.type];
  const area = h('textarea', { id: 'float-text', rows: 2, maxlength: 2000, placeholder: 'Write one statement…', 'aria-label': t.label,
    oninput: (ev) => { c.text = ev.target.value; c.checked = null; $('float-alts')?.replaceChildren(); suggestSoon(post.id); },
    onkeydown: (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submit(post.id); } if (ev.key === 'Escape') { ev.stopPropagation(); cancel(); } },
    onblur: () => { if (c.text.trim() && !c.checked) check(post.id).then(() => drawAlts(post.id)); } }, c.text);
  return h('div', { class: `compose ${t.cls}` },
    h('div', { class: 'kind' }, `${t.label}:`),
    area,
    h('ul', { id: 'float-suggest', class: 'found', 'aria-label': 'Already posted' }),
    h('div', { id: 'float-alts', class: 'alts' }, altsParts(post.id)),
    c.showClarify ? h('textarea', { id: 'float-clarify', rows: 2, maxlength: 2000, placeholder: 'A clarification or definition, such as "By wet I mean puddles."', 'aria-label': 'Clarification',
      oninput: (ev) => { c.clarify = ev.target.value; const b = ev.target.parentElement.querySelector('.row button.accent'); if (b) b.textContent = postLabel(c); } }, c.clarify) : null,
    h('label', {}, h('input', { type: 'checkbox', checked: c.anonymous, onchange: (ev) => { c.anonymous = ev.target.checked; } }), 'Post Anonymously'),
    h('div', { class: 'row' },
      h('button', { class: 'accent', disabled: c.busy, onclick: () => submit(post.id) }, c.busy ? 'Posting…' : postLabel(c)),
      c.showClarify ? null : h('button', { onclick: () => { c.showClarify = true; drawFloat(); setTimeout(() => $('float-clarify')?.focus(), 0); } }, 'Add a clarification before posting'),
      h('button', { onclick: cancel }, 'Cancel')));
}
const postLabel = (c) => c.checked?.exact ? (c.clarify.trim() ? 'Use it, with my clarification' : 'Use the posted one') : c.checked?.near?.length && !c.forced ? 'Mine is different: post it' : 'Post';
function cancel() { floatState.compose = null; drawFloat(); }
let suggestTimer = 0;
function suggestSoon(centerId) {
  clearTimeout(suggestTimer);
  const c = floatState?.compose;
  suggestTimer = setTimeout(async () => {
    const list = $('float-suggest');
    if (!list || !c) return;
    const text = c.text;
    if (text.trim().length < 3) { list.replaceChildren(); return; }
    try {
      const rows = (await cloud.similar(text, 0.25)).filter((r) => r.id !== centerId).slice(0, 5);
      if (floatState?.compose !== c || c.text !== text) return;
      list.replaceChildren(...rows.map((r) => suggestion(centerId, r)));
    } catch { /* suggestions are a nicety */ }
  }, 300);
}
function suggestion(centerId, r) {
  const { h } = deps;
  return h('li', {}, h('span', {}, postText(r)), h('button', { onmousedown: (ev) => ev.preventDefault(), onclick: () => useExisting(centerId, r.id) }, 'Use this one'));
}
async function check(centerId) {
  const c = floatState?.compose;
  if (!c) return;
  const text = c.text;
  const exactId = await cloud.find({ kind: 'node', type: 'statement', text });
  const exact = exactId ? await cloud.getPost(exactId) : null;
  const near = (await cloud.similar(text)).filter((r) => r.id !== exactId && r.id !== centerId).slice(0, 4);
  if (floatState?.compose === c && c.text === text) c.checked = { exact, near };
}
function altsParts(centerId) {
  const { h } = deps;
  const c = floatState?.compose;
  if (!c?.checked) return [];
  const { exact, near } = c.checked;
  const out = [];
  if (exact) out.push(h('p', { class: 'note' }, h('strong', {}, 'Already posted, word for word. '), 'Use it, and add a clarification or definition if you mean something narrower.'),
    h('ul', { class: 'found' }, suggestion(centerId, exact)));
  if (near.length) out.push(h('p', { class: 'note' }, h('strong', {}, 'Is it one of these? '), 'Choose one, add a clarification, or post yours if it says something different.'),
    h('ul', { class: 'found' }, near.map((r) => suggestion(centerId, r))));
  return out;
}
function drawAlts(centerId) {
  const box = $('float-alts');
  if (!box) return;
  box.replaceChildren(...altsParts(centerId));
  if (box.childElementCount) $('float-suggest')?.replaceChildren(); // the choices replace the live suggestions
  const c = floatState.compose;
  const btn = box.parentElement.querySelector('.row button.accent');
  if (btn && c) btn.textContent = postLabel(c);
}
async function submit(centerId) {
  const c = floatState?.compose;
  if (!c || c.busy || !c.text.trim()) return;
  if (!c.checked) {
    await check(centerId);
    if (c.checked?.exact || c.checked?.near?.length) { drawAlts(centerId); return; } // choose first
  }
  if (c.checked?.exact) return post(centerId, { reasonId: c.checked.exact.id, clarify: c.clarify });
  c.forced = true;
  return post(centerId, { text: c.text, clarify: c.clarify });
}
const useExisting = (centerId, reasonId) => post(centerId, { reasonId, clarify: floatState?.compose?.clarify ?? '' });
async function post(centerId, what) {
  const c = floatState?.compose;
  if (!c) return;
  c.busy = true; drawFloat();
  try {
    const r = await cloud.respond(centerId, c.type, { ...what, anonymous: c.anonymous });
    const said = [];
    said.push(r.reason.made ? 'Posted your statement.' : 'Used the statement already posted.');
    said.push(r.arrow.made ? 'You wrote the new inference.' : 'That inference was already posted, so it joins your sandbox.');
    if (r.clarification) said.push('Your clarification is posted too.');
    deps.toast(said.join(' '));
    floatState.compose = null;
    await openFloat(centerId);
  } catch (err) {
    c.busy = false; drawFloat();
    deps.toast(`Not posted: ${err.message}`);
  }
}
