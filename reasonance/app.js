// Reasonance map editor: SVG board, panel and saving. The rules of the map
// live in model.js. Arrowheads are drawn as plain triangles (no SVG
// <marker> references), so they show up wherever the page is hosted.
import {
  NODE_TYPES, EDGE_TYPES, STANCES, RELEVANCE, createMap, addNode, addEdge, removeItem, flipEdge,
  setEdgeType, itemText, nodeText, standingContention, rate, outline, serialize, parseMap, exampleMap,
  isNode, isEdge, edgesFrom, edgesTo, logSliderToConfidence, confidenceToLogSlider,
  compoundParts, splitIntoPremises,
} from './model.js';
import { FALLACIES } from './fallacies.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const STORE = 'reasonance.maps.v1';
const NODE_W = 240, CHARS = 30, LINE = 18;

const EDGE_COLORS = {
  support: '#2fe3e6', contention: '#e04dff', question: '#ffe94d', clarification: '#6f93ff',
  suggestion: '#a5afc6', premise: '#d9def0', example: '#b026ff', same: '#7dffb0',
  contradicts: '#ff5c7a', exclusive: '#ff5c7a', necessary: '#7dffb0',
};
const NODE_COLORS = {
  statement: '#2fe3e6', question: '#ffe94d', clarification: '#6f93ff', combiner: '#d9def0',
  axiom: '#ffe94d', fallacy: '#b026ff',
};
// The automatic "not yet supported" posts: a loud pink, to show they're not a real argument.
const GHOST = '#ff2fb4';
const GHOST_PREFIX = 'ghost:';
const isGhost = (id) => typeof id === 'string' && id.startsWith(GHOST_PREFIX);
const ghostOwner = (id) => id.slice(GHOST_PREFIX.length);
const STANCE_COLORS = { agree: '#7dffb0', disagree: '#ff5c7a', unknown: '#ffe94d', incomprehensible: '#a5afc6' };

const $ = (id) => document.getElementById(id);
const board = $('board'), world = $('world');
const layers = { edges: $('layer-edges'), nodes: $('layer-nodes'), pills: $('layer-pills') };

// ---------- storage ----------
let store = load();
let map = store.maps[store.current];
let selected = null;      // item id
let connecting = null;    // { from, type } while picking an arrow's far end
let spotlight = null;     // item id in present mode
let logScale = false;
const view = { x: 0, y: 0, k: 1 };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    if (raw && raw.maps && raw.maps[raw.current]) {
      const maps = {};
      for (const [id, m] of Object.entries(raw.maps)) {
        try { const p = parseMap(JSON.stringify(m), m.created); p.id = id; p.created = m.created ?? p.created; p.updated = m.updated ?? p.updated; maps[id] = p; } catch { /* skip a broken map */ }
      }
      if (maps[raw.current]) return { current: raw.current, maps };
    }
  } catch { /* storage blocked or empty */ }
  const m = exampleMap();
  return { current: m.id, maps: { [m.id]: m } };
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}
function flushSave() {
  clearTimeout(saveTimer);
  record();
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { toast('This browser is not letting the page save. Use File → Download map file to keep your work.'); }
}

// ---------- undo and redo ----------
// Each save that changed the map becomes one undo step. Steps are kept per
// map while the page is open.
const history = { undo: [], redo: [], last: null, mapId: null };
const snap = () => JSON.stringify({ title: map.title, items: map.items });
function resetHistory() { history.undo = []; history.redo = []; history.last = snap(); history.mapId = map.id; updateUndoButtons(); }
function record() {
  if (history.mapId !== map.id) { resetHistory(); return; }
  const now = snap();
  if (now === history.last) return;
  history.undo.push(history.last);
  if (history.undo.length > 200) history.undo.shift();
  history.redo = [];
  history.last = now;
  updateUndoButtons();
}
function restore(json) {
  const { title, items } = JSON.parse(json);
  map.title = title; map.items = items; map.updated = Date.now();
  history.last = json;
  if (selected && !map.items[selected] && !isGhost(selected)) selected = null;
  if (isGhost(selected) && !map.items[ghostOwner(selected)]) selected = null;
  refreshMapList(); render(); updateUndoButtons();
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { /* shown on the next save */ }
}
function undo() {
  flushSave();
  if (!history.undo.length) { toast('Nothing to undo.'); return; }
  history.redo.push(history.last);
  restore(history.undo.pop());
}
function redo() {
  flushSave();
  if (!history.redo.length) { toast('Nothing to redo.'); return; }
  history.undo.push(history.last);
  restore(history.redo.pop());
}
function updateUndoButtons() {
  const u = document.getElementById('undo'), r = document.getElementById('redo');
  if (u) u.disabled = !history.undo.length;
  if (r) r.disabled = !history.redo.length;
}
function changed() { render(); save(); }

// ---------- svg helpers ----------
function s(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

function wrap(text, chars = CHARS) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (word.length > chars) {
        if (line) { out.push(line); line = ''; }
        for (let i = 0; i < word.length; i += chars) out.push(word.slice(i, i + chars));
        line = out.pop();
      } else if (!line) line = word;
      else if ((line + ' ' + word).length <= chars) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

// ---------- geometry ----------
// Every item has a box {cx, cy, w, h}. A node's comes from its text; an
// edge's is its label pill, sitting halfway between its two ends.
function nodeLayout(n) {
  const lines = wrap(nodeText(n));
  const sLines = [];
  const parts = compoundParts(n);
  if (parts && parts.length > 1) sLines.push({ compound: true, text: `This holds ${parts.length} statements. Split it?` });
  const h = 28 + lines.length * LINE + (sLines.length ? 8 + sLines.length * 16 : 0) + 10;
  return { lines, sLines, w: NODE_W, h };
}
// The automatic post sits just to the right of its claim, where reasons go,
// and stays clear of the next column that Arrange uses.
const GHOST_GAP = 110, GHOST_W = 190;
function ghostLayout(id) {
  const text = standingContention(map, id);
  if (!text) return null;
  const lines = wrap(text, 24);
  return { text, lines, w: GHOST_W, h: 18 + lines.length * 16 };
}
// Premise arrows show just a plus sign; hovering or selecting one spells it out.
function pillLabel(e) {
  return e.type === 'premise' ? '+' : EDGE_TYPES[e.type].label;
}
const pillWidth = (label) => (label === '+' ? 24 : label.length * 7 + 22);
function computeBoxes() {
  const boxes = new Map();
  for (const it of Object.values(map.items)) {
    if (isNode(it)) { const L = nodeLayout(it); boxes.set(it.id, { cx: it.x, cy: it.y, w: L.w, h: L.h, L }); }
  }
  for (const n of Object.values(map.items).filter(isNode)) {
    const G = ghostLayout(n.id);
    if (!G) continue;
    const b = boxes.get(n.id);
    boxes.set(GHOST_PREFIX + n.id, { cx: b.cx + b.w / 2 + GHOST_GAP + G.w / 2, cy: b.cy, w: G.w, h: G.h, G, ghost: true });
  }
  const pending = Object.values(map.items).filter(isEdge);
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const e = pending[i], a = boxes.get(e.from), b = boxes.get(e.to);
      if (!a || !b) continue;
      const label = pillLabel(e);
      // The pill sits halfway along the visible part of the line, so it
      // never covers an arrowhead.
      const p = exitPoint(a, b.cx, b.cy), q = exitPoint(b, a.cx, a.cy);
      const w = pillWidth(label), len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const along = Math.min(len / 2, Math.max(len - (w / 2 + 20), len * 0.3)) / len;
      boxes.set(e.id, { cx: p.x + (q.x - p.x) * along, cy: p.y + (q.y - p.y) * along, w, h: 24, label });
      pending.splice(i, 1);
    }
  }
  return boxes;
}
// Where the line from the box centre toward (tx, ty) leaves the box.
function exitPoint(b, tx, ty, pad = 3) {
  const dx = tx - b.cx, dy = ty - b.cy;
  if (!dx && !dy) return { x: b.cx, y: b.cy };
  const sx = (b.w / 2 + pad) / Math.abs(dx || 1e-9), sy = (b.h / 2 + pad) / Math.abs(dy || 1e-9);
  const t = Math.min(sx, sy, 1);
  return { x: b.cx + dx * t, y: b.cy + dy * t };
}
function head(tip, from, color, parent) {
  const dx = tip.x - from.x, dy = tip.y - from.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, L = 14, W = 7;
  const bx = tip.x - ux * L, by = tip.y - uy * L;
  s('polygon', { points: `${tip.x},${tip.y} ${bx - uy * W},${by + ux * W} ${bx + uy * W},${by - ux * W}`, fill: color }, parent);
  return { x: bx, y: by };
}

// ---------- render ----------
let boxes = new Map();
function render() {
  boxes = computeBoxes();
  for (const l of Object.values(layers)) l.replaceChildren();
  const lit = spotlight ? litSet(spotlight) : null;

  for (const e of Object.values(map.items).filter(isEdge)) {
    const a = boxes.get(e.from), b = boxes.get(e.to), p = boxes.get(e.id);
    if (!a || !b || !p) continue;
    const color = EDGE_COLORS[e.type];
    const g = s('g', { class: `edge${lit && !lit.has(e.id) ? ' dim' : ''}` }, layers.edges);
    const start = exitPoint(a, b.cx, b.cy), end = exitPoint(b, a.cx, a.cy);
    const lineEnd = head(end, start, color, g);
    const lineStart = EDGE_TYPES[e.type].twoWay ? head(start, end, color, g) : start;
    s('line', { x1: lineStart.x, y1: lineStart.y, x2: lineEnd.x, y2: lineEnd.y, stroke: color }, g);

    const pg = s('g', { class: `pill${selected === e.id ? ' sel' : ''}${lit && !lit.has(e.id) ? ' dim' : ''}${connecting && canConnect(e.id) ? ' target-ok' : ''}`, 'data-id': e.id }, layers.pills);
    s('rect', { class: 'hit', x: p.cx - p.w / 2 - 8, y: p.cy - p.h / 2 - 8, width: p.w + 16, height: p.h + 16 }, pg);
    const short = s('g', { class: e.type === 'premise' ? 'short' : '' }, pg);
    s('rect', { x: p.cx - p.w / 2, y: p.cy - p.h / 2, width: p.w, height: p.h, rx: 12, stroke: color }, short);
    const t = s('text', { x: p.cx, y: p.cy + 4, 'text-anchor': 'middle', fill: color }, short);
    t.textContent = p.label;
    if (e.type === 'premise') {
      const full = `Premise ${e.premise}`, fw = pillWidth(full);
      const long = s('g', { class: 'long' }, pg);
      s('rect', { x: p.cx - fw / 2, y: p.cy - p.h / 2, width: fw, height: p.h, rx: 12, stroke: color }, long);
      const lt = s('text', { x: p.cx, y: p.cy + 4, 'text-anchor': 'middle', fill: color }, long);
      lt.textContent = full;
    }
    if (e.rating?.stance) stanceDot(pg, p.cx + p.w / 2 - 2, p.cy - p.h / 2 + 2, e.rating.stance);
    const title = s('title', {}, pg); title.textContent = itemText(map, e.id);
  }

  for (const [gid, gb] of boxes) {
    if (!gb.ghost) continue;
    const owner = boxes.get(ghostOwner(gid)), off = lit && !lit.has(ghostOwner(gid)) ? ' dim' : '';
    const color = EDGE_COLORS.contention;
    const eg = s('g', { class: `edge${off}` }, layers.edges);
    const start = exitPoint(owner, gb.cx, gb.cy), end = exitPoint(gb, owner.cx, owner.cy);
    const lineEnd = head(end, start, color, eg);
    s('line', { x1: start.x, y1: start.y, x2: lineEnd.x, y2: lineEnd.y, stroke: color, 'stroke-dasharray': '6 4' }, eg);
    // The label rides just above the short dashed arrow, leaving it visible.
    const label = 'Contention', pw = label.length * 7 + 22, px = (start.x + lineEnd.x) / 2, py = (start.y + lineEnd.y) / 2 - 20;
    const pg = s('g', { class: `pill${off}`, 'data-id': gid }, layers.pills);
    s('rect', { x: px - pw / 2, y: py - 12, width: pw, height: 24, rx: 12, stroke: color }, pg);
    const pt = s('text', { x: px, y: py + 4, 'text-anchor': 'middle', fill: color }, pg); pt.textContent = label;

    const g = s('g', { class: `node ghost${selected === gid ? ' sel' : ''}${off}`, 'data-id': gid }, layers.nodes);
    const x0 = gb.cx - gb.w / 2, y0 = gb.cy - gb.h / 2;
    s('rect', { class: 'box', x: x0, y: y0, width: gb.w, height: gb.h, rx: 14, stroke: GHOST }, g);
    const t = s('text', { class: 'ghost-text', x: x0 + 12, y: y0 + 4 }, g);
    gb.G.lines.forEach((line, i) => { const ts = s('tspan', { x: x0 + 12, dy: i ? 16 : 18 }, t); ts.textContent = line; });
  }

  for (const n of Object.values(map.items).filter(isNode)) {
    const b = boxes.get(n.id), L = b.L, color = NODE_COLORS[n.type];
    const g = s('g', { class: `node t-${n.type}${selected === n.id ? ' sel' : ''}${lit && !lit.has(n.id) ? ' dim' : ''}${connecting && canConnect(n.id) ? ' target-ok' : ''}`, 'data-id': n.id }, layers.nodes);
    const x0 = b.cx - b.w / 2, y0 = b.cy - b.h / 2;
    s('rect', { class: 'box', x: x0, y: y0, width: b.w, height: b.h, rx: 14, stroke: color }, g);
    const kind = s('text', { class: 'kind', x: x0 + 12, y: y0 + 18 }, g);
    kind.textContent = n.type === 'fallacy' ? `Fallacy · ${n.fallacy}` : NODE_TYPES[n.type].label;
    const t = s('text', { x: x0 + 12, y: y0 + 22 }, g);
    L.lines.forEach((line, i) => { const ts = s('tspan', { x: x0 + 12, dy: i ? LINE : LINE + 2 }, t); ts.textContent = line; });
    if (L.sLines.length) {
      const st = s('text', { class: 'standing', x: x0 + 12, y: y0 + 28 + L.lines.length * LINE + 6 }, g);
      L.sLines.forEach((line, i) => {
        const ts = s('tspan', { x: x0 + 12, dy: i ? 16 : 10, class: line.compound ? 'compound' : '' }, st);
        ts.textContent = line.compound ? line.text : line;
      });
    }
    if (n.rating?.stance) stanceDot(g, x0 + b.w - 12, y0 + 12, n.rating.stance, true);
    if (!n.text && n.type !== 'fallacy' && n.type !== 'combiner') t.querySelector('tspan').textContent = 'Click to write…';
  }
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  board.classList.toggle('connecting', !!connecting);
  renderPanel();
  renderCaption();
}
function stanceDot(g, x, y, stance, label) {
  s('circle', { cx: x, cy: y, r: 6, fill: STANCE_COLORS[stance] }, g);
  if (label) { const t = s('text', { class: 'stance', x: x - 10, y: y + 4, 'text-anchor': 'end', fill: STANCE_COLORS[stance] }, g); t.textContent = STANCES[stance]; }
}

// Everything tied to an item: its arrows, their far ends, and arguments about those arrows.
function litSet(id) {
  const lit = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    const it = map.items[cur];
    if (isEdge(it)) for (const end of [it.from, it.to]) if (!lit.has(end)) { lit.add(end); if (isEdge(map.items[end])) queue.push(end); }
    for (const e of [...edgesFrom(map, cur), ...edgesTo(map, cur)]) {
      if (lit.has(e.id)) continue;
      lit.add(e.id);
      const other = e.from === cur ? e.to : e.from;
      lit.add(other);
      queue.push(e.id);
    }
    if (lit.size > 400) break;
  }
  return lit;
}

// ---------- panel ----------
let renderPanelSuppressed = false;
function renderPanel() {
  if (renderPanelSuppressed) return;
  const panel = $('panel');
  if (isGhost(selected) && boxes.get(selected)) { panel.replaceChildren(...ghostPanel(ghostOwner(selected))); return; }
  const it = selected && map.items[selected];
  if (!it) { panel.replaceChildren(...overviewPanel()); return; }
  panel.replaceChildren(...(isNode(it) ? nodePanel(it) : edgePanel(it)));
}

function ghostPanel(ownerId) {
  const owner = map.items[ownerId], axiom = owner.type === 'axiom';
  return [
    h('h2', {}, axiom ? 'Held as an axiom' : 'Not yet supported'),
    h('p', { class: 'full ghost-full' }, standingContention(map, ownerId)),
    h('p', { class: 'muted' }, axiom
      ? 'Axioms are claims held without support, so this contention stays. People can still agree or disagree with the axiom.'
      : 'Added automatically to every claim that has nothing supporting it, like "citation needed". It goes away as soon as the claim gets a Support arrow.'),
    h('div', { class: 'row' },
      axiom ? null : h('button', { class: 'accent', onclick: () => addReason(ownerId, 'support') }, 'Support the claim'),
      h('button', { onclick: () => select(ownerId) }, 'Go to the claim')),
  ];
}

function overviewPanel() {
  const counts = Object.values(map.items).reduce((c, it) => (c[it.kind]++, c), { node: 0, edge: 0 });
  return [
    h('h2', {}, map.title),
    h('p', { class: 'muted' }, `${counts.node} posts, ${counts.edge} arrows. Saved in this browser.`),
    h('p', {}, h('strong', {}, 'One post, one statement.'), ' If a thought has several parts, give each its own post and join them with Combined premises, so people can agree with one part and disagree with another.'),
    h('p', {}, 'Start with a conclusion. Arrows point from a claim out to the reasons that support or contend it, so you can follow them to see what a belief rests on.'),
    h('p', {}, 'Click the label on any arrow to argue about the inference itself, for example "the wet sidewalk doesn\'t show it rained, because the sprinklers ran".'),
    h('h3', { class: 'more' }, 'Arrows'),
    h('div', { class: 'legend more' }, Object.entries(EDGE_TYPES).map(([k, t]) =>
      h('span', {}, h('span', { class: 'swatch', style: `background:${EDGE_COLORS[k]}` }), t.label))),
    h('h3', { class: 'more' }, 'Moving around'),
    h('p', { class: 'muted more' }, 'Drag posts to move them. Drag the background to pan, and scroll or pinch to zoom. The arrow keys slide the view, and Page Up and Page Down zoom. Double-click the background to add a statement there. Delete removes the selected post.'),
  ];
}

const REASONS = [
  ['support', 'Support it'], ['contention', 'Contend it'], ['question', 'Question it'],
  ['clarification', 'Clarify it'], ['suggestion', 'Suggest'],
];
function reasonButtons(it) {
  const fallacyPick = h('select', { 'aria-label': 'Call a fallacy', onchange: (ev) => { if (ev.target.value) callFallacy(it.id, ev.target.value); } },
    h('option', { value: '' }, 'Call a fallacy…'), FALLACIES.map((f) => h('option', { value: f.name }, f.name)));
  const linkPick = h('select', { 'aria-label': 'Connect to a post already on the map', onchange: (ev) => { if (ev.target.value) startConnect(it.id, ev.target.value); } },
    h('option', { value: '' }, 'Connect to an existing post…'),
    Object.entries(EDGE_TYPES).filter(([k]) => k !== 'example' && (k !== 'premise' || it.type === 'combiner')).map(([k, t]) => h('option', { value: k }, t.label)));
  const row = h('div', { class: 'row' }, REASONS.map(([type, label]) => h('button', { onclick: () => addReason(it.id, type) }, label)));
  if (it.type === 'combiner') row.prepend(h('button', { class: 'accent', onclick: () => addReason(it.id, 'premise') }, 'Add premise'));
  return [h('h3', {}, isEdge(it) ? 'Respond to this inference' : 'Add a reason'), row, h('div', { class: 'row' }, fallacyPick, linkPick)];
}

function nodePanel(n) {
  const els = [h('h2', {}, n.type === 'fallacy' ? 'Fallacy' : NODE_TYPES[n.type].label)];
  if (n.type === 'fallacy') {
    els.push(h('label', {}, 'Name', h('input', { value: n.fallacy, maxlength: 100, oninput: (ev) => { n.fallacy = ev.target.value; quietChange(); } })));
    els.push(h('p', { class: 'muted' }, `A ${n.fallacy || '…'} fallacy is when an argument…`));
    els.push(h('textarea', { 'aria-label': 'Fallacy definition', maxlength: 2000, oninput: (ev) => { n.when = ev.target.value; quietChange(); } }, n.when));
    const examples = edgesTo(map, n.id);
    els.push(h('h3', {}, `Examples (${examples.length})`));
    els.push(examples.length
      ? h('ul', { class: 'history' }, examples.map((e) => h('li', {}, h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); select(e.from); } }, itemText(map, e.from)))))
      : h('p', { class: 'muted' }, 'Arrows pointing at this fallacy are its examples. Select a post or an arrow and use "Call a fallacy".'));
  } else {
    const typeSel = h('select', { 'aria-label': 'Kind of post', onchange: (ev) => { n.type = ev.target.value; changed(); } },
      Object.entries(NODE_TYPES).filter(([k]) => k !== 'fallacy').map(([k, t]) => h('option', { value: k, selected: k === n.type }, t.label)));
    els.push(h('div', { class: 'row' }, typeSel, h('span', { class: 'muted' }, NODE_TYPES[n.type].hint)));
    els.push(h('textarea', { id: 'edit-text', 'aria-label': 'Text', maxlength: 2000, placeholder: n.type === 'combiner' ? 'Optional: a short name for these premises together' : 'Write one statement…', oninput: (ev) => { n.text = ev.target.value; quietChange(); } }, n.text));
    els.push(compoundWarning(n));
  }
  els.push(copyButton(n.id));
  els.push(...reasonButtons(n), ...ratingBlock(n), h('div', { class: 'row' }, h('button', { class: 'danger', onclick: () => del(n.id) }, 'Delete post')));
  return els;
}

// One post, one statement, so people can agree with one part and disagree
// with another. Offers to split a post that holds several.
function compoundWarning(n) {
  const box = h('div', { id: 'compound-warn', class: 'warn' });
  const parts = compoundParts(n);
  if (!parts) { box.hidden = true; return box; }
  if (parts.length > 1) {
    box.append(
      h('p', {}, h('strong', {}, `This post holds ${parts.length} statements.`), ' Give each statement its own post, so people can agree with one part and disagree with another.'),
      h('ul', {}, parts.map((p) => h('li', {}, p))),
      h('button', { class: 'accent', onclick: () => {
        const made = splitIntoPremises(map, n.id, parts);
        // Find each new premise a clear spot to the right.
        boxes = computeBoxes();
        for (const id of made) boxes.delete(id);
        for (const id of made) {
          const p = map.items[id], pos = placeNear(n.id, 380, 0);
          p.x = Math.round(pos.x); p.y = Math.round(pos.y);
          const L = nodeLayout(p);
          boxes.set(id, { cx: p.x, cy: p.y, w: L.w, h: L.h, L });
        }
        selected = n.id; changed();
        toast(`Split into ${made.length} premises, joined by this combined-premises post. Every arrow stays attached.`);
      } }, 'Split into combined premises'),
    );
  } else {
    box.append(h('p', {}, 'Words like "and", "but" or "because" can hide two statements in one post. If this is two claims, give each its own post. Join premises with ', h('em', {}, 'Combined premises'), ', or use a Support arrow for "because".'));
  }
  return box;
}

// Copies the full statement a post stands for. Text on the board and in
// the panel can also be selected by hand.
function copyButton(id) {
  return h('div', { class: 'row' }, h('button', { onclick: async () => {
    const text = itemText(map, id);
    try { await navigator.clipboard.writeText(text); toast('Copied.'); }
    catch { toast('Your browser blocked copying. Select the text and copy it by hand.'); }
  } }, 'Copy text'));
}

function edgePanel(e) {
  const els = [h('h2', {}, 'Inference'), h('p', { class: 'full' }, itemText(map, e.id)), copyButton(e.id)];
  const fixed = e.type === 'example' || e.type === 'premise';
  if (!fixed) {
    els.push(h('div', { class: 'row' },
      h('select', { 'aria-label': 'Kind of arrow', onchange: (ev) => { try { setEdgeType(map, e.id, ev.target.value); } catch (err) { toast(err.message); } changed(); } },
        Object.entries(EDGE_TYPES).filter(([k]) => k !== 'example' && k !== 'premise').map(([k, t]) => h('option', { value: k, selected: k === e.type }, t.label))),
      h('button', { onclick: () => { try { flipEdge(map, e.id); } catch (err) { toast(err.message); } changed(); } }, 'Flip direction')));
  } else if (e.type === 'premise') {
    els.push(h('label', {}, 'Premise number', h('input', { class: 'num', value: e.premise, maxlength: 12, oninput: (ev) => { e.premise = ev.target.value; quietChange(); } })));
  }
  els.push(...reasonButtons(e), ...ratingBlock(e), h('div', { class: 'row' }, h('button', { class: 'danger', onclick: () => del(e.id) }, 'Delete arrow')));
  return els;
}

function ratingBlock(it) {
  const r = it.rating ?? {};
  const stance = h('div', { class: 'row' }, Object.entries(STANCES).map(([k, label]) =>
    h('button', { class: r.stance === k ? 'on' : '', onclick: () => doRate(it.id, { stance: r.stance === k ? null : k }) }, label)));
  const conf = r.confidence ?? 50;
  const num = h('input', { class: 'num', type: 'number', min: 0, max: 100, step: 'any', value: r.confidence ?? '', placeholder: '–', 'aria-label': 'Confidence percent',
    onchange: (ev) => doRate(it.id, { confidence: ev.target.value === '' ? null : Number(ev.target.value) }) });
  const range = h('input', { type: 'range', min: 0, max: logScale ? 6 : 100, step: logScale ? 0.01 : 1, value: logScale ? confidenceToLogSlider(conf) : conf, 'aria-label': 'Confidence slider',
    oninput: (ev) => { const v = logScale ? logSliderToConfidence(Number(ev.target.value)) : Number(ev.target.value); num.value = v; },
    onchange: (ev) => doRate(it.id, { confidence: logScale ? logSliderToConfidence(Number(ev.target.value)) : Number(ev.target.value) }) });
  const stars = h('div', { class: 'row stars' }, [1, 2, 3, 4, 5].map((v) =>
    h('button', { class: r.relevance >= v ? 'on' : '', title: RELEVANCE[v].text, onclick: () => doRate(it.id, { relevance: r.relevance === v ? null : v }) }, '★')));
  const history = (r.history ?? []).filter((x) => x.stance).slice(-6).reverse();
  return [
    h('h3', {}, 'Your view'), stance,
    h('label', {}, 'Confidence', range, num, '%'),
    h('label', {}, h('input', { type: 'checkbox', checked: logScale, onchange: (ev) => { logScale = ev.target.checked; renderPanel(); } }), 'Log scale (tells 99% from 99.999%)'),
    h('p', { class: 'muted' }, 'How much would it matter to you if the opposite were proven?'), stars,
    r.relevance ? h('p', { class: 'muted' }, RELEVANCE[r.relevance].text) : null,
    history.length ? h('ul', { class: 'history' }, history.map((x) => h('li', {}, `${STANCES[x.stance]}${x.confidence != null ? `, ${x.confidence}%` : ''} on ${new Date(x.at).toLocaleDateString()}`))) : null,
  ];
}

function renderCaption() {
  const c = $('caption');
  const id = document.body.classList.contains('present') ? spotlight : null;
  c.hidden = !id || !(map.items[id] || isGhost(id));
  if (!c.hidden) c.textContent = isGhost(id) ? standingContention(map, ghostOwner(id)) : itemText(map, id);
}

// ---------- actions ----------
let quietTimer = 0;
// Typing: redraw the board but leave the panel (and the cursor) alone.
function quietChange() {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    renderPanelSuppressed = true;
    render();
    renderPanelSuppressed = false;
    const it = map.items[selected];
    if (isNode(it)) $('compound-warn')?.replaceWith(compoundWarning(it));
    save();
  }, 120);
}

function select(id) { selected = id; spotlight = null; render(); }

function placeNear(id, dx = 330, dy = 0) {
  const b = boxes.get(id) ?? { cx: 0, cy: 0 };
  // Clear of every post and arrow label already on the board.
  const taken = (x, y) => [...boxes.values()].some((o) => Math.abs(o.cx - x) < o.w / 2 + NODE_W / 2 + 16 && Math.abs(o.cy - y) < o.h / 2 + 50);
  const x = b.cx + dx, y0 = b.cy + dy;
  for (let i = 0; i < 40; i++) {
    const y = y0 + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 60;
    if (!taken(x, y)) return { x, y };
  }
  return { x, y: y0 };
}

function addReason(fromId, type) {
  const pos = placeNear(fromId, 330, isEdge(map.items[fromId]) ? 150 : 0);
  const n = addNode(map, { text: '', ...pos });
  try { addEdge(map, type, fromId, n.id); } catch (err) { removeItem(map, n.id); toast(err.message); return; }
  selected = n.id;
  changed();
  $('edit-text')?.focus();
}

function callFallacy(fromId, name) {
  let f = Object.values(map.items).find((n) => isNode(n) && n.type === 'fallacy' && n.fallacy === name);
  if (!f) f = addNode(map, { type: 'fallacy', fallacy: name, ...placeNear(fromId, 330, 160) });
  try { addEdge(map, 'example', fromId, f.id); } catch (err) { toast(err.message); }
  changed();
  toast(itemText(map, edgesTo(map, f.id).at(-1).id));
}

function canConnect(id) {
  if (!connecting || id === connecting.from || isGhost(id)) return false;
  const it = map.items[id];
  if (isEdge(it) && (it.from === connecting.from || it.to === connecting.from)) return false;
  return true;
}
function startConnect(from, type) {
  connecting = { from, type };
  $('hint').hidden = false;
  $('hint').textContent = `Click the post or arrow label that ${EDGE_TYPES[type].label.toLowerCase()} points to. Esc cancels.`;
  render();
}
function finishConnect(to) {
  const { from, type } = connecting;
  connecting = null; $('hint').hidden = true;
  try { const e = addEdge(map, type, from, to); selected = e.id; } catch (err) { toast(err.message); }
  changed();
}
function cancelConnect() { connecting = null; $('hint').hidden = true; render(); }

function doRate(id, change) {
  try { const msgs = rate(map, id, change); if (msgs.length) toast(msgs.join(' ')); } catch (err) { toast(err.message); }
  changed();
}

function del(id) {
  const gone = removeItem(map, id);
  if (gone.length > 1) toast(`Deleted, along with ${gone.length - 1} arrow${gone.length > 2 ? 's' : ''} that depended on it.`);
  selected = null;
  changed();
}

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

// ---------- layout ----------
// A tidy tree: each conclusion on the left, its reasons in the next column to
// the right, and arguments about an inference beside that inference's reason.
function arrange() {
  const nodes = Object.values(map.items).filter(isNode);
  if (!nodes.length) return;
  const ownerNode = (id, depth = 0) => { const it = map.items[id]; return isNode(it) || !it || depth > 8 ? it : ownerNode(it.from, depth + 1); };
  const parent = new Map();
  for (const n of nodes) {
    const inc = edgesTo(map, n.id)[0];
    if (inc) { const p = ownerNode(inc.from); if (p && p !== n) parent.set(n, p); }
  }
  const kids = new Map(nodes.map((n) => [n, []]));
  // Break cycles: follow parents upward and cut the link that closes a loop.
  for (const n of nodes) {
    const seen = new Set([n]);
    for (let p = parent.get(n); p; p = parent.get(p)) { if (seen.has(p)) { parent.delete(n); break; } seen.add(p); }
  }
  for (const [n, p] of parent) kids.get(p).push(n);
  // Keep arguments about an inference right next to that inference's reason.
  const anchor = (n) => {
    const inc = edgesTo(map, n.id)[0];
    let e = inc && map.items[inc.from];
    while (isEdge(e) && isEdge(map.items[e.from])) e = map.items[e.from];
    return isEdge(e) ? map.items[e.to] : n;
  };
  for (const [p, k] of kids) {
    const order = new Map(k.map((n, i) => [n, i]));
    const key = (n) => { const a = anchor(n); return (order.get(a) ?? order.get(n)) * 2 + (a === n ? 0 : 1); };
    k.sort((a, b) => key(a) - key(b));
    void p;
  }
  let cursor = 0;
  const GAP = 36, COL = 540;
  const place = (n, depth) => {
    n.x = depth * COL;
    const k = kids.get(n);
    const G = ghostLayout(n.id), hgt = Math.max(nodeLayout(n).h, G ? G.h : 0);
    if (!k.length) { n.y = cursor + hgt / 2; cursor += hgt + GAP; return; }
    const start = cursor;
    for (const c of k) place(c, depth + 1);
    n.y = Math.max(start + hgt / 2, (k[0].y + k.at(-1).y) / 2);
    cursor = Math.max(cursor, n.y + hgt / 2 + GAP);
  };
  for (const r of nodes.filter((n) => !parent.has(n))) { place(r, 0); cursor += GAP * 2; }
  for (const n of nodes) { n.x = Math.round(n.x); n.y = Math.round(n.y); }
  changed();
  fit();
}

function fit() {
  boxes = computeBoxes();
  if (!boxes.size) { view.x = board.clientWidth / 2; view.y = board.clientHeight / 2; view.k = 1; render(); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes.values()) { x0 = Math.min(x0, b.cx - b.w / 2); y0 = Math.min(y0, b.cy - b.h / 2); x1 = Math.max(x1, b.cx + b.w / 2); y1 = Math.max(y1, b.cy + b.h / 2); }
  const panelW = document.body.classList.contains('present') || innerWidth <= 720 ? 0 : 384;
  const panelH = !document.body.classList.contains('present') && innerWidth <= 720 ? board.clientHeight * 0.48 : 0;
  const W = board.clientWidth - panelW - 40, H = board.clientHeight - panelH - 40;
  view.k = Math.min(1.4, Math.max(0.2, Math.min(W / (x1 - x0), H / (y1 - y0))));
  view.x = 20 + (W - (x1 - x0) * view.k) / 2 - x0 * view.k;
  view.y = 20 + (H - (y1 - y0) * view.k) / 2 - y0 * view.k;
  render();
}

// ---------- pointer input ----------
const pointers = new Map();
let drag = null; // { id, ox, oy, moved } | { pan, sx, sy, vx, vy } | { pinch }
function toWorld(cx, cy) {
  const r = board.getBoundingClientRect();
  return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
}
function hitId(target) { return target.closest?.('[data-id]')?.getAttribute('data-id') ?? null; }

board.addEventListener('pointerdown', (ev) => {
  // On the selected post (or arrow label), pressing on its words selects
  // text for copying instead of dragging. Drag it by its edge or header.
  const onText = ev.target.closest?.('text');
  if (onText && selected && hitId(ev.target) === selected && ev.pointerType === 'mouse' && !connecting) return;
  board.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2) {
    const [p, q] = [...pointers.values()];
    drag = { pinch: true, d: Math.hypot(p.x - q.x, p.y - q.y), k: view.k, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2, vx: view.x, vy: view.y };
    return;
  }
  const id = hitId(ev.target);
  const w = toWorld(ev.clientX, ev.clientY);
  if (id) {
    const it = map.items[id];
    drag = { id, ox: isNode(it) ? w.x - it.x : 0, oy: isNode(it) ? w.y - it.y : 0, sx: ev.clientX, sy: ev.clientY, moved: false };
  } else {
    drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, moved: false };
    board.classList.add('panning');
  }
});
board.addEventListener('pointermove', (ev) => {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!drag) return;
  if (drag.pinch && pointers.size >= 2) {
    const [p, q] = [...pointers.values()];
    const k = Math.min(3, Math.max(0.15, drag.k * Math.hypot(p.x - q.x, p.y - q.y) / drag.d));
    const r = board.getBoundingClientRect(), mx = drag.mx - r.left, my = drag.my - r.top;
    view.x = mx - (mx - drag.vx) * (k / drag.k); view.y = my - (my - drag.vy) * (k / drag.k); view.k = k;
    world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    return;
  }
  if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 4) drag.moved = true;
  if (!drag.moved) return;
  if (drag.pan) {
    view.x = drag.vx + ev.clientX - drag.sx; view.y = drag.vy + ev.clientY - drag.sy;
    world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  } else if (drag.id && isNode(map.items[drag.id]) && !connecting) {
    const w = toWorld(ev.clientX, ev.clientY), n = map.items[drag.id];
    n.x = Math.round(w.x - drag.ox); n.y = Math.round(w.y - drag.oy);
    renderPanelSuppressed = true; render(); renderPanelSuppressed = false;
  }
});
function endPointer(ev) {
  pointers.delete(ev.pointerId);
  board.classList.remove('panning');
  const d = drag;
  if (!d || pointers.size) { if (!pointers.size) drag = null; return; }
  drag = null;
  if (d.pinch) return;
  if (d.moved) { if (d.id) save(); return; }
  const present = document.body.classList.contains('present');
  if (d.id) {
    if (connecting) { if (canConnect(d.id)) finishConnect(d.id); else toast('Pick a different post or arrow.'); return; }
    if (present) { const sid = isGhost(d.id) ? ghostOwner(d.id) : d.id; spotlight = spotlight === sid ? null : sid; render(); return; }
    select(d.id);
  } else {
    if (connecting) { cancelConnect(); return; }
    if (present) { spotlight = null; render(); return; }
    if (selected) select(null);
  }
}
board.addEventListener('pointerup', endPointer);
board.addEventListener('pointercancel', endPointer);
board.addEventListener('dblclick', (ev) => {
  if (document.body.classList.contains('present') || hitId(ev.target)) return;
  const w = toWorld(ev.clientX, ev.clientY);
  const n = addNode(map, { x: Math.round(w.x), y: Math.round(w.y) });
  selected = n.id; changed(); $('edit-text')?.focus();
});
board.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const r = board.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
  const k = Math.min(3, Math.max(0.15, view.k * Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015))));
  view.x = mx - (mx - view.x) * (k / view.k); view.y = my - (my - view.y) * (k / view.k); view.k = k;
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
}, { passive: false });

// Keyboard moves, like Cube Chess: arrow keys slide the view, Page Up and
// Page Down (or + and -) zoom. Held keys move smoothly, a little each frame.
const VIEW_KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  PageUp: 'in', '+': 'in', '=': 'in', PageDown: 'out', '-': 'out', _: 'out',
};
const heldKeys = new Set();
let keyFrame = 0, keyTime = 0;
function zoomView(f) {
  const mx = board.clientWidth / 2, my = board.clientHeight / 2;
  const k = Math.min(3, Math.max(0.15, view.k * f));
  view.x = mx - (mx - view.x) * (k / view.k); view.y = my - (my - view.y) * (k / view.k); view.k = k;
}
function keyStep(now) {
  const dt = Math.min(0.05, (now - (keyTime || now)) / 1000); keyTime = now;
  const pan = 700 * dt, held = new Set([...heldKeys].map((k) => VIEW_KEYS[k]));
  if (held.has('left')) view.x += pan;
  if (held.has('right')) view.x -= pan;
  if (held.has('up')) view.y += pan;
  if (held.has('down')) view.y -= pan;
  if (held.has('in')) zoomView(Math.exp(1.6 * dt));
  if (held.has('out')) zoomView(Math.exp(-1.6 * dt));
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  keyFrame = heldKeys.size ? requestAnimationFrame(keyStep) : 0;
  if (!keyFrame) keyTime = 0;
}
document.addEventListener('keyup', (ev) => heldKeys.delete(ev.key));
window.addEventListener('blur', () => heldKeys.clear());

document.addEventListener('keydown', (ev) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (VIEW_KEYS[ev.key] && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    ev.preventDefault();
    if (!ev.repeat && !heldKeys.has(ev.key)) {
      // A quick tap still moves a little.
      const dir = VIEW_KEYS[ev.key], nudge = 60;
      if (dir === 'left') view.x += nudge; else if (dir === 'right') view.x -= nudge;
      else if (dir === 'up') view.y += nudge; else if (dir === 'down') view.y -= nudge;
      else zoomView(dir === 'in' ? 1.15 : 1 / 1.15);
      world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    }
    heldKeys.add(ev.key);
    if (!keyFrame) keyFrame = requestAnimationFrame(keyStep);
    return;
  }
  if (ev.key === 'Escape') {
    if (connecting) cancelConnect();
    else if (document.body.classList.contains('present')) togglePresent();
    else if (!typing) select(null);
  } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && !typing && selected && map.items[selected]) {
    ev.preventDefault(); del(selected);
  } else if ((ev.ctrlKey || ev.metaKey) && !typing && ev.key.toLowerCase() === 'z') {
    ev.preventDefault(); ev.shiftKey ? redo() : undo();
  } else if ((ev.ctrlKey || ev.metaKey) && !typing && ev.key.toLowerCase() === 'y') {
    ev.preventDefault(); redo();
  }
});

// ---------- toolbar ----------
function refreshMapList() {
  const sel = $('map-select');
  sel.replaceChildren(...Object.values(store.maps).sort((a, b) => b.updated - a.updated)
    .map((m) => h('option', { value: m.id, selected: m.id === map.id }, m.title || 'Untitled map')));
  $('map-title').value = map.title;
}
function openMap(id) {
  flushSave();
  store.current = id; map = store.maps[id]; selected = null; spotlight = null; connecting = null;
  resetHistory(); refreshMapList(); save(); fit();
}
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('clear').addEventListener('click', () => {
  if (!Object.keys(map.items).length) { toast('The map is already empty.'); return; }
  map.items = {}; selected = null; spotlight = null; connecting = null;
  changed(); flushSave();
  toast('Map cleared. Undo brings it back.');
});
$('map-select').addEventListener('change', (ev) => openMap(ev.target.value));
$('map-title').addEventListener('input', (ev) => { map.title = ev.target.value.slice(0, 200); refreshMapList(); renderPanel(); save(); });
$('new-map').addEventListener('click', () => {
  const m = createMap('Untitled map');
  const n = addNode(m, { text: '', x: 0, y: 0 });
  store.maps[m.id] = m; openMap(m.id); select(n.id); $('edit-text')?.focus();
});
$('add-statement').addEventListener('click', () => {
  const c = toWorld(board.getBoundingClientRect().left + board.clientWidth * 0.4, board.getBoundingClientRect().top + board.clientHeight / 2);
  const n = addNode(map, { x: Math.round(c.x), y: Math.round(c.y) });
  selected = n.id; changed(); $('edit-text')?.focus();
});
$('add-other').addEventListener('change', (ev) => {
  const type = ev.target.value; ev.target.value = '';
  if (!type) return;
  const c = toWorld(board.getBoundingClientRect().left + board.clientWidth * 0.4, board.getBoundingClientRect().top + board.clientHeight / 2);
  let n;
  if (type === 'fallacy') {
    const name = FALLACIES.at(0).name;
    n = addNode(map, { type: 'fallacy', fallacy: name, x: Math.round(c.x), y: Math.round(c.y) });
    toast('Pick the fallacy name in the panel, or write your own definition.');
  } else n = addNode(map, { type, x: Math.round(c.x), y: Math.round(c.y) });
  selected = n.id; changed();
});
$('arrange').addEventListener('click', arrange);
$('fit').addEventListener('click', fit);
function togglePresent() {
  const on = document.body.classList.toggle('present');
  $('present').textContent = on ? 'Exit present' : 'Present';
  $('present').classList.toggle('on', on);
  spotlight = null; selected = null; cancelConnect();
  fit();
  if (on) toast('Tap a post or an arrow label to spotlight what it connects to. Esc exits.');
}
$('present').addEventListener('click', togglePresent);
$('file-menu').addEventListener('change', async (ev) => {
  const what = ev.target.value; ev.target.value = '';
  if (what === 'download') {
    const blob = new Blob([serialize(map)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${(map.title || 'map').replace(/[^\w\- ]+/g, '').trim() || 'map'}.reasonance.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } else if (what === 'import') {
    $('import-file').click();
  } else if (what === 'outline') {
    const text = outline(map);
    try { await navigator.clipboard.writeText(text); toast('Outline copied. Paste it into an email or a post.'); }
    catch { downloadText(text); }
  } else if (what === 'delete') {
    if (Object.keys(store.maps).length === 1) { toast('This is your only map. Start a new one first.'); return; }
    if (!confirmInline()) return;
    delete store.maps[map.id];
    openMap(Object.values(store.maps).sort((a, b) => b.updated - a.updated)[0].id);
    toast('Map deleted.');
  }
});
// A second click within 5 seconds confirms, so no browser dialog is needed.
let armed = 0;
function confirmInline() {
  if (Date.now() - armed < 5000) { armed = 0; return true; }
  armed = Date.now();
  toast('Choose "Delete this map" again within 5 seconds to delete it for good.');
  return false;
}
function downloadText(text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'outline.txt' });
  document.body.append(a); a.click(); a.remove();
}
$('import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0]; ev.target.value = '';
  if (!file) return;
  if (file.size > 5e6) { toast('That file is too big to be a map.'); return; }
  try {
    const m = parseMap(await file.text());
    store.maps[m.id] = m; openMap(m.id); toast(`Opened "${m.title}".`);
  } catch (err) { toast(err.message); }
});

addEventListener('resize', () => render());
resetHistory();
refreshMapList();
fit();
