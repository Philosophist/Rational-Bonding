// Ourgument map model: no DOM code, so it can be tested in Node.
//
// Every node and every edge is an item ("a post"). An edge connects any two
// items, including other edges, which is how people support or contend an
// inference itself. Arrows point from a claim OUT to its reasons:
//   "It rained" --Support--> "The sidewalk is wet", read as
//   "'It rained' is supported by 'The sidewalk is wet'"
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
  support: { label: 'Support', phrase: 'is supported by' },
  contention: { label: 'Contention', phrase: 'is contended by' },
  question: { label: 'Question', phrase: 'is questioned by' },
  clarification: { label: 'Clarification', phrase: 'is clarified by' },
  premise: { label: 'Premise', phrase: 'has the premise' },
  example: { label: 'Fallacy', phrase: 'is an example of' },
  // note: a line of flavour text shown wherever the type is explained.
  same: { label: 'Means the same', phrase: 'means the same thing as', twoWay: true, note: 'IOW = translation = means the same thing.' },
  contradicts: { label: 'Contradicts', phrase: 'contradicts', twoWay: true },
  exclusive: { label: 'Mutually exclusive', twoWay: true },
  necessary: { label: 'Mutually necessary', twoWay: true },
};

export const STANCES = {
  agree: 'Agree',
  disagree: 'Disagree',
  unknown: "I don't know",
  noopinion: 'No opinion',
  incomprehensible: 'Incomprehensible',
  dontcare: "I don't care",
};
// Agree and Disagree are the two sides; the rest are "Neither".
export const NEITHER = ['unknown', 'noopinion', 'incomprehensible', 'dontcare'];

// Relevance: how important it would be to know if the opposite of your
// stance were proven true, to your own satisfaction.
export const RELEVANCE = [
  null,
  { text: "I don't care if I'm wrong. Don't bother telling me.", cheer: "Fair enough. Whether you'd rather not know or just don't care, saying so honestly is a good start." },
  { text: "I wouldn't care much if I'm wrong", cheer: 'Indifferent' },
  { text: "I don't know how I'd react if I'm wrong", cheer: 'Good answer!' },
  { text: "I would want to know if I'm wrong", cheer: 'Interested' },
  { text: "I'd have to know if I'm wrong!", cheer: 'Game changing' },
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
    throw new Error('"Fallacy" arrows must point at a fallacy.');
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
  if (type === 'example' && !(isNode(to) && to.type === 'fallacy')) throw new Error('"Fallacy" arrows must point at a fallacy.');
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
  if (node.type === 'combiner' && !node.text?.trim()) return 'These premises, taken together';
  return node.text?.trim() || '(empty)';
}

// One post, one statement. These spot a post that holds several, so it can
// be split into premises joined by a combined-premises node.
const ABBREV = /(?:\b(?:Dr|Mr|Mrs|Ms|Prof|St|Jr|Sr|vs|etc|No|Mt|e\.g|i\.e)|\b[A-Z](?:\.[A-Z])*)\.$/;
const JOINERS = /\b(and|but|because|so|although|however|therefore)\b/i;
export function splitStatements(text) {
  const t = String(text ?? '').trim();
  if (!t) return [];
  return t
    .split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])|;\s*|,\s+(?:but|and|so|yet)\s+/)
    .reduce((out, p) => {
      // "Dr. Smith" and "U.S. law" are one statement, not two.
      if (out.length && ABBREV.test(out.at(-1))) out[out.length - 1] += ' ' + p;
      else out.push(p);
      return out;
    }, [])
    .map((p) => p.trim().replace(/[,;]+$/, ''))
    .filter((p) => /[a-z0-9]/i.test(p))
    .map((p) => (p[0].toUpperCase() + p.slice(1)).replace(/([^.!?])$/, '$1.'));
}
// null when the text reads as one statement; otherwise the parts it could be
// split into (just one part when a joining word is the only sign).
export function compoundParts(node) {
  if (!isNode(node) || !['statement', 'axiom', 'clarification'].includes(node.type)) return null;
  const parts = splitStatements(node.text);
  if (parts.length > 1) return parts;
  return JOINERS.test(node.text ?? '') ? parts : null;
}
// Turns a post into a combined-premises node with one premise per part. The
// post keeps its id, so every arrow attached to it stays attached.
export function splitIntoPremises(map, id, parts) {
  const n = map.items[id];
  if (!isNode(n) || parts.length < 2) throw new Error('Give at least two statements to split into.');
  n.type = 'combiner';
  n.text = '';
  const made = parts.map((text, i) => {
    const p = addNode(map, { text, x: n.x + 380, y: n.y + (i - (parts.length - 1) / 2) * 140 });
    addEdge(map, 'premise', n.id, p.id);
    return p.id;
  });
  touch(map);
  return made;
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

// The automatic contention on a claim with nothing supporting it, like a
// "citation needed". It is shown as its own post, joined by a Contention
// arrow, and disappears once a support is added. Axioms carry it for good,
// reworded. Returns null when none applies. (In the social app it should
// appear only when no support exists anywhere, not just in one sandbox.)
export function standingContention(map, id) {
  const n = map.items[id];
  if (!isNode(n)) return null;
  const said = n.text?.trim() || '(empty)';
  if (n.type === 'axiom') return `'${said}' is held as an axiom, with no support claimed.`;
  if (n.type !== 'statement') return null;
  // A rewording or translation shares the support of what it means the same as.
  const hasSupport = (nid) => edgesFrom(map, nid).some((e) => e.type === 'support');
  const same = [...edgesFrom(map, id), ...edgesTo(map, id)].filter((e) => e.type === 'same').map((e) => (e.from === id ? e.to : e.from));
  const supported = hasSupport(id) || same.some(hasSupport);
  return supported ? null : `'${said}' is not yet supported.`;
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
  // Not caring about a claim means it matters little to you: one star, unless you've said otherwise.
  if (next.stance === 'dontcare' && stance !== undefined && next.relevance == null) next.relevance = 1;
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

// Confidence as odds of being wrong: 90% is a 1 in 10 chance, 99.9% is 1 in
// 1,000. n is Infinity at 100% (never wrong) and 1 at 0%.
export function confidenceToOdds(c) {
  if (c == null) return null;
  if (c >= 100) return Infinity;
  const n = 100 / (100 - Math.max(0, c));
  return n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
}
export function oddsToConfidence(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return v === Infinity ? 100 : null;
  if (v <= 1) return 0;
  return +(100 - 100 / v).toPrecision(8);
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
export function parseMap(text, now = Date.now(), { keepPosts = false } = {}) {
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
      keepChoices(n, it);
      map.items[n.id] = n;
    }
  }
  for (const it of items) {
    if (it.kind !== 'edge') continue;
    // "Suggests" arrows were dropped (Steve, 2026-11-05); older maps keep them as questions.
    const type = it.type === 'suggestion' ? 'question' : it.type;
    if (!EDGE_TYPES[type]) throw new Error(`Unknown arrow type: ${it.type}`);
    const e = { id: it.id, kind: 'edge', type, from: String(it.from), to: String(it.to) };
    if (it.premise !== undefined) e.premise = String(it.premise).slice(0, 12);
    if (it.rating) e.rating = cleanRating(it.rating);
    keepChoices(e, it);
    map.items[e.id] = e;
  }
  for (const e of Object.values(map.items).filter(isEdge)) {
    if (!map.items[e.from] || !map.items[e.to] || e.from === e.to) throw new Error('An arrow in that map points at a missing post.');
  }
  for (const e of Object.values(map.items).filter(isEdge)) {
    if (dependsOn(map, e.from, e.id) || dependsOn(map, e.to, e.id)) throw new Error('An arrow in that map points at itself.');
  }
  // Which items are published posts, by their id on the server. Kept only for
  // a map's own saved copy; an opened file starts as drafts (keepPosts false).
  if (keepPosts && raw.posts && typeof raw.posts === 'object') {
    const posts = {};
    for (const [id, pid] of Object.entries(raw.posts)) if (map.items[id] && UUID.test(String(pid))) posts[id] = String(pid).toLowerCase();
    if (Object.keys(posts).length) map.posts = posts;
  }
  return map;
}
// Posting choices: post without a name, and share (or not) your view of it.
function keepChoices(to, from) {
  if (from.anonymous === true) to.anonymous = true;
  if (typeof from.share === 'boolean') to.share = from.share;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Items in the order they must be posted: an arrow after both its ends.
export function postOrder(map, ids) {
  const out = [], seen = new Set();
  const visit = (id) => {
    if (seen.has(id) || !map.items[id]) return;
    seen.add(id);
    const it = map.items[id];
    if (isEdge(it)) { visit(it.from); visit(it.to); }
    out.push(id);
  };
  for (const id of ids) visit(id);
  return out;
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

// Ready-made example arguments on questions people really disagree about.
// Every post is a single statement that stands on its own, with no "here",
// "today" or "our town" that needs outside context. Positions are rough; the
// editor tidies them with Arrange on load.
export const EXAMPLES = [
  { key: 'death-penalty', title: 'Should the death penalty be abolished?' },
  { key: 'meat', title: 'Is it wrong to raise animals for meat?' },
  { key: 'basic-income', title: 'Should every adult get a basic income?' },
];
export function exampleMap(now = Date.now(), key = EXAMPLES[0].key) {
  const build = { 'death-penalty': deathPenaltyExample, meat: meatExample, 'basic-income': basicIncomeExample }[key] || deathPenaltyExample;
  const m = build(now);
  m.updated = now;
  return m;
}
// Small helpers so each example reads like the argument it is.
function builder(title, now) {
  const m = createMap(title, now);
  let row = 0;
  const node = (text, type) => addNode(m, { text, x: 0, y: 140 * row++, ...(type ? { type } : {}) });
  const arrow = (type, from, to) => addEdge(m, type, from.id, to.id);
  const together = (from, type, ...premises) => {
    const c = addNode(m, { type: 'combiner', x: 0, y: 140 * row++ });
    const e = arrow(type, from, c);
    premises.forEach((t) => arrow('premise', c, node(t)));
    return e;
  };
  const fallacy = (inference, name) => arrow('example', inference, addNode(m, { type: 'fallacy', fallacy: name, x: 0, y: 140 * row++ }));
  return { m, node, arrow, together, fallacy };
}

function deathPenaltyExample(now) {
  const { m, node, arrow, together, fallacy } = builder('Should the death penalty be abolished?', now);
  const claim = node('Every country should abolish the death penalty.');
  arrow('clarification', claim, node('Abolishing the death penalty means no crime can be punished by execution.', 'clarification'));
  const innocent = together(claim, 'support',
    'Courts sometimes convict innocent people.',
    'An execution cannot be undone.');
  const standards = node('Stricter standards of proof could make wrongful executions extremely rare.');
  const fix = arrow('contention', innocent, standards);
  arrow('contention', fix, node('People have been freed from death row after years of appeals had upheld their convictions.'));
  const deter = arrow('support', claim, node('No reliable study has shown that executions deter murder better than life imprisonment.'));
  arrow('contention', deter, node('A lack of proof that executions deter murder is not proof that they do not.'));
  const desert = node('Death is the only just punishment for the cruelest murders.');
  arrow('contention', claim, desert);
  arrow('question', desert, node('Who should decide which crimes deserve death?', 'question'));
  arrow('support', desert, node('Punishment should be in proportion to the harm a crime does.', 'axiom'));
  fallacy(arrow('contention', claim, node('Many voters support the death penalty.')), 'Appeal to popularity');
  return m;
}

function meatExample(now) {
  const { m, node, arrow, together, fallacy } = builder('Is it wrong to raise animals for meat?', now);
  const claim = node('Raising animals to eat them is morally wrong.');
  arrow('clarification', claim, node('Morally wrong means something a person should not do even where the law allows it.', 'clarification'));
  const pain = together(claim, 'support',
    'Farm animals can feel pain.',
    'Causing pain that is not needed is wrong.',
    'Most people with access to a modern grocery store can eat well without meat.');
  arrow('contention', pain, node('Animals on well-run farms can live lives worth living.'));
  const poor = node('Meat is an important source of nutrition for many people living in poverty.');
  const need = arrow('contention', claim, poor);
  arrow('contention', need, node('A need for meat in poverty would excuse only the people who have no other choice.'));
  fallacy(arrow('contention', claim, node('Eating meat is natural for humans.')), 'Appeal to nature');
  arrow('question', claim, node('Does it matter whether an animal was farmed or hunted?', 'question'));
  arrow('support', claim, node('Suffering matters no matter which species feels it.', 'axiom'));
  return m;
}

function basicIncomeExample(now) {
  const { m, node, arrow, together, fallacy } = builder('Should every adult get a basic income?', now);
  const claim = node('Governments should pay every adult a universal basic income.');
  arrow('clarification', claim, node('A universal basic income is a regular cash payment to every adult with no work requirement.', 'clarification'));
  arrow('support', claim, node('Cash paid to everyone reaches poor people who never apply for means-tested benefits.'));
  together(claim, 'support',
    'Automation may replace many jobs in the coming decades.',
    'A basic income would protect people whose jobs disappear.');
  const cost = node('A basic income large enough to live on would require much higher taxes.');
  const tax = arrow('contention', claim, cost);
  arrow('contention', tax, node('Replacing existing welfare programs would pay for part of a basic income.'));
  const idle = node('People who are paid without working will stop working.');
  arrow('contention', claim, idle);
  arrow('contention', idle, node('Basic income trials have found only small changes in how much people work.'));
  fallacy(arrow('contention', claim, node('Free money will soon mean that nobody works at all.')), 'Slippery slope');
  arrow('question', claim, node('Should the payment be the same everywhere, whatever local living costs are?', 'question'));
  return m;
}
