// Reasonance map model: no DOM code, so it can be tested in Node.
//
// Every node and every edge is an item ("a post"). An edge connects any two
// items, including other edges, which is how people support or contend an
// inference itself. Arrows point from a claim OUT to its reasons:
//   "It rained" --supported by--> "The sidewalk is wet"
// so a user starts from a conclusion and follows the arrows to what backs it.
import { FALLACIES, fallacyText, article } from './fallacies.js';

export const MAP_VERSION = 1;

export const NODE_TYPES = {
  statement: { label: 'Statement', hint: 'A claim that can be true or false.' },
  question: { label: 'Question', hint: 'Something asked rather than claimed.' },
  clarification: { label: 'Clarification', hint: 'Says what another post means.' },
  combiner: { label: 'Combined premises', hint: 'Joins several premises that only work together.' },
  axiom: { label: 'Axiom', hint: 'A claim held without support.' },
  fallacy: { label: 'Fallacy', hint: 'A definition of a fallacy. Arrows to it are examples.' },
};

// phrase: how the edge reads between its two ends ("A <phrase> B").
// twoWay edges draw a head at both ends.
export const EDGE_TYPES = {
  support: { label: 'Supported by', phrase: 'is supported by' },
  contention: { label: 'Contended by', phrase: 'is contended by' },
  question: { label: 'Questioned by', phrase: 'is questioned by' },
  clarification: { label: 'Clarified by', phrase: 'is clarified by' },
  suggestion: { label: 'Suggests', phrase: 'prompts the suggestion' },
  premise: { label: 'Premise', phrase: 'has the premise' },
  example: { label: 'Example of', phrase: 'is an example of' },
  same: { label: 'Same as', phrase: 'means the same as', twoWay: true },
  contradicts: { label: 'Contradicts', phrase: 'contradicts', twoWay: true },
  exclusive: { label: 'Mutually exclusive', twoWay: true },
  necessary: { label: 'Mutually necessary', twoWay: true },
};

export const STANCES = {
  agree: 'Agree',
  disagree: 'Disagree',
  unknown: "I don't know",
  incomprehensible: 'Incomprehensible',
};

// Relevance: how important it would be to know if the opposite of your
// stance were proven true, to your own satisfaction.
export const RELEVANCE = [
  null,
  { text: "I don't care. Don't bother telling me.", cheer: "Fair enough. Whether you'd rather not know or just don't care, saying so honestly is a good start." },
  { text: "I wouldn't care", cheer: 'Indifferent' },
  { text: "I don't know how I'd react", cheer: 'Good answer!' },
  { text: 'I would want to know', cheer: 'Interested' },
  { text: "I'd have to know!", cheer: 'Game changing' },
];

const MAX_TEXT = 2000;

export function newId(prefix = 'i') {
  const r = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9]/gi, '');
  return `${prefix}${r.slice(0, 12)}`;
}

export function createMap(title = 'Untitled map', now = Date.now()) {
  return { version: MAP_VERSION, id: newId('m'), title, created: now, updated: now, items: {} };
}

export function isNode(item) { return item?.kind === 'node'; }
export function isEdge(item) { return item?.kind === 'edge'; }

export function addNode(map, { type = 'statement', text = '', x = 0, y = 0, fallacy } = {}) {
  if (!NODE_TYPES[type]) throw new Error(`Unknown node type: ${type}`);
  const node = { id: newId('n'), kind: 'node', type, text: String(text).slice(0, MAX_TEXT), x, y };
  if (type === 'fallacy') {
    const f = FALLACIES.find((f) => f.name === fallacy);
    node.fallacy = f ? f.name : String(fallacy || 'Unnamed');
    node.when = f ? f.when : node.text || 'does something that still needs describing.';
    node.text = '';
  }
  map.items[node.id] = node;
  touch(map);
  return node;
}

// Does `id` depend on `target` through edge ends? (Used to stop an edge
// from pointing at itself through a chain.)
function dependsOn(map, id, target, seen = new Set()) {
  if (id === target) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  const it = map.items[id];
  if (!isEdge(it)) return false;
  return dependsOn(map, it.from, target, seen) || dependsOn(map, it.to, target, seen);
}

export function addEdge(map, type, from, to, { premise } = {}) {
  const a = map.items[from], b = map.items[to];
  if (!a || !b) throw new Error('Both ends must exist.');
  if (from === to) throw new Error('An arrow needs two different ends.');
  if (b.type === 'fallacy' && isNode(b)) type = 'example';
  if (!EDGE_TYPES[type]) throw new Error(`Unknown arrow type: ${type}`);
  if (type === 'example' && !(isNode(b) && b.type === 'fallacy')) {
    throw new Error('"Example of" arrows must point at a fallacy.');
  }
  if (type === 'premise' && !(isNode(a) && a.type === 'combiner')) {
    throw new Error('Premise arrows start at a combined-premises node.');
  }
  const edge = { id: newId('e'), kind: 'edge', type, from, to };
  if (type === 'premise') edge.premise = String(premise ?? nextPremiseNumber(map, from));
  map.items[edge.id] = edge;
  touch(map);
  return edge;
}

export function nextPremiseNumber(map, combinerId) {
  return String(edgesFrom(map, combinerId).filter((e) => e.type === 'premise').length + 1);
}

export function edgesFrom(map, id) { return Object.values(map.items).filter((e) => isEdge(e) && e.from === id); }
export function edgesTo(map, id) { return Object.values(map.items).filter((e) => isEdge(e) && e.to === id); }

export function flipEdge(map, id) {
  const e = map.items[id];
  if (!isEdge(e)) return;
  const back = map.items[e.from];
  if (e.type === 'example' || e.type === 'premise') throw new Error('This arrow only makes sense one way.');
  if (isNode(back) && back.type === 'fallacy') throw new Error('Arrows can only point at a fallacy.');
  [e.from, e.to] = [e.to, e.from];
  touch(map);
}

export function setEdgeType(map, id, type) {
  const e = map.items[id];
  if (!isEdge(e) || !EDGE_TYPES[type]) return;
  const to = map.items[e.to], from = map.items[e.from];
  if (type === 'example' && !(isNode(to) && to.type === 'fallacy')) throw new Error('"Example of" arrows must point at a fallacy.');
  if (e.type === 'example' && type !== 'example') throw new Error('Arrows to a fallacy are always examples of it.');
  if (type === 'premise' && !(isNode(from) && from.type === 'combiner')) throw new Error('Premise arrows start at a combined-premises node.');
  e.type = type;
  if (type === 'premise' && !e.premise) e.premise = nextPremiseNumber(map, e.from);
  touch(map);
}

// Removes an item and every edge that depends on it, however deep.
export function removeItem(map, id) {
  const gone = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const it of Object.values(map.items)) {
      if (isEdge(it) && !gone.has(it.id) && (gone.has(it.from) || gone.has(it.to))) { gone.add(it.id); grew = true; }
    }
  }
  for (const g of gone) delete map.items[g];
  touch(map);
  return [...gone];
}

// The full statement an item stands for.
export function itemText(map, id, depth = 0) {
  const it = map.items[id];
  if (!it) return '(missing)';
  if (isNode(it)) return nodeText(it);
  if (depth > 4) return '[…]';
  return edgeSentence(map, it, depth);
}

export function nodeText(node) {
  if (node.type === 'fallacy') return fallacyText({ name: node.fallacy, when: node.when });
  return node.text?.trim() || '(empty)';
}

function quote(map, id, depth) {
  const it = map.items[id];
  return isEdge(it) ? `[${itemText(map, id, depth + 1)}]` : `'${itemText(map, id, depth + 1)}'`;
}

export function edgeSentence(map, e, depth = 0) {
  const A = quote(map, e.from, depth), B = quote(map, e.to, depth);
  switch (e.type) {
    case 'example': { const name = map.items[e.to]?.fallacy ?? '?'; return `${A} is an example of ${article(name)} ${name} fallacy`; }
    case 'premise': return `${A} has premise ${e.premise ?? '?'}: ${B}`;
    case 'exclusive': return `${A} and ${B} are mutually exclusive`;
    case 'necessary': return `${A} and ${B} are mutually necessary`;
    default: return `${A} ${EDGE_TYPES[e.type].phrase} ${B}`;
  }
}

// The standing contention shown on a claim with nothing supporting it, like a
// "citation needed". Axioms carry it permanently, reworded. Returns null when
// none applies.
export function standingContention(map, id) {
  const n = map.items[id];
  if (!isNode(n)) return null;
  if (n.type === 'axiom') return 'Held as an axiom: no support is claimed.';
  if (n.type !== 'statement') return null;
  const supported = edgesFrom(map, id).some((e) => e.type === 'support');
  return supported ? null : 'No support has been given for this claim.';
}

// Ratings. Every change is kept with its time, so a map remembers when and
// what you believed. Returns the flavor text to show, if any.
export function rate(map, id, { stance, confidence, relevance } = {}, now = Date.now()) {
  const it = map.items[id];
  if (!it) return [];
  const prev = it.rating ?? { history: [] };
  const next = {
    stance: stance === undefined ? prev.stance ?? null : stance,
    confidence: confidence === undefined ? prev.confidence ?? null : clampConfidence(confidence),
    relevance: relevance === undefined ? prev.relevance ?? null : clampRelevance(relevance),
  };
  if (next.stance !== null && !STANCES[next.stance]) throw new Error(`Unknown stance: ${next.stance}`);
  const history = [...(prev.history ?? []), { at: now, ...next }];
  it.rating = { ...next, history };
  touch(map, now);
  return flavor(prev, next);
}

function clampConfidence(c) {
  if (c === null || c === '') return null;
  const v = Number(c);
  if (!Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, v));
}
function clampRelevance(r) {
  if (r === null) return null;
  const v = Math.round(Number(r));
  return v >= 1 && v <= 5 ? v : null;
}

export function flavor(prev, next) {
  const out = [];
  const opposite = { agree: 'disagree', disagree: 'agree' };
  if (prev.stance && next.stance && opposite[prev.stance] === next.stance) {
    out.push('You changed your mind. Following the reasons where they lead takes nerve.');
  } else if (next.stance === 'unknown' && prev.stance !== 'unknown') {
    out.push("Admitting you don't know is where learning starts.");
  }
  if (next.relevance && next.relevance !== prev.relevance) out.push(RELEVANCE[next.relevance].cheer);
  return out;
}

// Confidence slider in log mode tells 99% from 99.999% apart.
// Position p runs 0..6: confidence = 100 - 10^(2 - p); p = 6 snaps to 100.
export function logSliderToConfidence(p) {
  if (p >= 6) return 100;
  if (p <= 0) return 0;
  return +(100 - 10 ** (2 - p)).toPrecision(8);
}
export function confidenceToLogSlider(c) {
  if (c >= 100) return 6;
  if (c <= 0) return 0;
  return Math.min(6, Math.max(0, 2 - Math.log10(100 - c)));
}

// A plain-text outline, claim first, then its reasons, indented.
export function outline(map) {
  const lines = [`# ${map.title}`, ''];
  const seen = new Set();
  const nodes = Object.values(map.items).filter(isNode);
  const roots = nodes.filter((n) => edgesTo(map, n.id).length === 0);
  const walk = (id, depth) => {
    for (const e of edgesFrom(map, id)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const label = e.type === 'premise' ? `Premise ${e.premise}` : EDGE_TYPES[e.type].label;
      lines.push(`${'  '.repeat(depth)}- ${label}: ${quote(map, e.to, 0)}`);
      walkResponses(e.id, depth + 1);
      if (!seen.has(e.to)) { seen.add(e.to); walk(e.to, depth + 1); }
    }
  };
  const walkResponses = (edgeId, depth) => {
    if (edgesFrom(map, edgeId).length === 0) return;
    lines.push(`${'  '.repeat(depth)}- On that inference:`);
    walk(edgeId, depth + 1);
  };
  for (const r of roots.length ? roots : nodes) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    lines.push(`${quote(map, r.id, 0)}`);
    const sc = standingContention(map, r.id);
    if (sc) lines.push(`  (${sc})`);
    walk(r.id, 1);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function serialize(map) {
  return JSON.stringify({ app: 'reasonance', ...map });
}

// Parses an exported map and checks every field, so a pasted file can't
// smuggle in anything unexpected.
export function parseMap(text, now = Date.now()) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('That is not valid map data.'); }
  if (!raw || typeof raw !== 'object' || typeof raw.items !== 'object') throw new Error('That is not valid map data.');
  const map = createMap(String(raw.title ?? 'Imported map').slice(0, 200), now);
  const items = Object.values(raw.items);
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || !/^[a-z0-9]{1,40}$/i.test(it.id)) throw new Error('A post in that map has a bad id.');
    if (it.kind === 'node') {
      if (!NODE_TYPES[it.type]) throw new Error(`Unknown node type: ${it.type}`);
      const n = { id: it.id, kind: 'node', type: it.type, text: String(it.text ?? '').slice(0, MAX_TEXT), x: num(it.x), y: num(it.y) };
      if (it.type === 'fallacy') { n.fallacy = String(it.fallacy ?? 'Unnamed').slice(0, 100); n.when = String(it.when ?? '').slice(0, MAX_TEXT); }
      if (it.rating) n.rating = cleanRating(it.rating);
      map.items[n.id] = n;
    }
  }
  for (const it of items) {
    if (it.kind !== 'edge') continue;
    if (!EDGE_TYPES[it.type]) throw new Error(`Unknown arrow type: ${it.type}`);
    const e = { id: it.id, kind: 'edge', type: it.type, from: String(it.from), to: String(it.to) };
    if (it.premise !== undefined) e.premise = String(it.premise).slice(0, 12);
    if (it.rating) e.rating = cleanRating(it.rating);
    map.items[e.id] = e;
  }
  for (const e of Object.values(map.items).filter(isEdge)) {
    if (!map.items[e.from] || !map.items[e.to] || e.from === e.to) throw new Error('An arrow in that map points at a missing post.');
  }
  for (const e of Object.values(map.items).filter(isEdge)) {
    if (dependsOn(map, e.from, e.id) || dependsOn(map, e.to, e.id)) throw new Error('An arrow in that map points at itself.');
  }
  return map;
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function cleanRating(r) {
  const one = (x) => ({
    at: num(x?.at),
    stance: STANCES[x?.stance] ? x.stance : null,
    confidence: clampConfidence(x?.confidence ?? null),
    relevance: clampRelevance(x?.relevance ?? null),
  });
  const { at, ...cur } = one(r);
  return { ...cur, history: Array.isArray(r.history) ? r.history.slice(-500).map(one) : [] };
}

function touch(map, now = Date.now()) { map.updated = now; }

// The example map: a claim, its reason, and a debate about the inference
// itself rather than the facts.
export function exampleMap(now = Date.now()) {
  const m = createMap('Did it rain last night?', now);
  const rain = addNode(m, { text: 'It rained last night.', x: -200, y: 0 });
  const wet = addNode(m, { text: 'The sidewalk is wet this morning.', x: 260, y: 0 });
  const inf = addEdge(m, 'support', rain.id, wet.id);
  const sprink = addNode(m, { text: 'The sprinklers run every night and soak the sidewalk.', x: 130, y: 230 });
  addEdge(m, 'contention', inf.id, sprink.id);
  const street = addNode(m, { text: 'The street is wet too, and the sprinklers do not reach it.', x: 130, y: -230 });
  addEdge(m, 'support', inf.id, street.id);
  const neighbour = addNode(m, { text: "My neighbour says it didn't rain, but he's wrong about everything.", x: -330, y: 290 });
  const doubt = addEdge(m, 'contention', rain.id, neighbour.id);
  const fal = addNode(m, { type: 'fallacy', fallacy: 'Ad hominem', x: -640, y: 145 });
  addEdge(m, 'example', doubt.id, fal.id);
  m.updated = now;
  return m;
}
