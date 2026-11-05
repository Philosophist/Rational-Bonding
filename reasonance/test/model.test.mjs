import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMap, addNode, addEdge, removeItem, flipEdge, setEdgeType, itemText, standingContention,
  rate, outline, serialize, parseMap, exampleMap, logSliderToConfidence, confidenceToLogSlider,
  splitStatements, compoundParts, splitIntoPremises, isNode,
} from '../model.js';
import { FALLACIES } from '../fallacies.js';

function twoClaims() {
  const m = createMap('t');
  const a = addNode(m, { text: 'It rained' });
  const b = addNode(m, { text: 'The sidewalk is wet' });
  return { m, a, b };
}

test('arrows read from the claim out to its reason', () => {
  const { m, a, b } = twoClaims();
  const e = addEdge(m, 'support', a.id, b.id);
  assert.equal(itemText(m, e.id), "'It rained' is supported by 'The sidewalk is wet'");
  const c = addEdge(m, 'contention', a.id, b.id);
  assert.equal(itemText(m, c.id), "'It rained' is contended by 'The sidewalk is wet'");
});

test('an inference can itself be supported or contended', () => {
  const { m, a, b } = twoClaims();
  const e = addEdge(m, 'support', a.id, b.id);
  const s = addNode(m, { text: 'Sprinklers ran' });
  const c = addEdge(m, 'contention', e.id, s.id);
  assert.equal(itemText(m, c.id), "['It rained' is supported by 'The sidewalk is wet'] is contended by 'Sprinklers ran'");
});

test('two-way relations read symmetrically', () => {
  const { m, a, b } = twoClaims();
  assert.equal(itemText(m, addEdge(m, 'exclusive', a.id, b.id).id), "'It rained' and 'The sidewalk is wet' are mutually exclusive");
  assert.equal(itemText(m, addEdge(m, 'same', a.id, b.id).id), "'It rained' means the same as 'The sidewalk is wet'");
});

test('fallacy nodes are definitions and arrows to them are examples', () => {
  const { m, a, b } = twoClaims();
  const f = addNode(m, { type: 'fallacy', fallacy: 'Straw man' });
  assert.match(itemText(m, f.id), /^A Straw man fallacy is when an argument misrepresents/);
  const e = addEdge(m, 'contention', a.id, f.id); // type is forced to "example"
  assert.equal(e.type, 'example');
  assert.equal(itemText(m, e.id), "'It rained' is an example of a Straw man fallacy");
  const inf = addEdge(m, 'support', a.id, b.id);
  const e2 = addEdge(m, 'support', inf.id, f.id);
  assert.equal(itemText(m, e2.id), "['It rained' is supported by 'The sidewalk is wet'] is an example of a Straw man fallacy");
  assert.throws(() => flipEdge(m, e.id));
  assert.throws(() => setEdgeType(m, e.id, 'support'));
  assert.throws(() => addEdge(m, 'example', a.id, b.id));
});

test('the library has 17 fallacies that all read as definitions', () => {
  assert.equal(FALLACIES.length, 17);
  for (const f of FALLACIES) assert.match(f.when, /\.$/);
});

test('unsupported claims carry a standing contention; axioms keep theirs', () => {
  const { m, a, b } = twoClaims();
  assert.equal(standingContention(m, a.id), "'It rained' is not yet supported.");
  addEdge(m, 'contention', a.id, b.id);
  assert.ok(standingContention(m, a.id), 'a contention is not support');
  addEdge(m, 'support', a.id, b.id);
  assert.equal(standingContention(m, a.id), null);
  const ax = addNode(m, { type: 'axiom', text: 'A thing is itself' });
  addEdge(m, 'support', ax.id, b.id);
  assert.equal(standingContention(m, ax.id), "'A thing is itself' is held as an axiom, with no support claimed.");
  const q = addNode(m, { type: 'question', text: 'Why?' });
  assert.equal(standingContention(m, q.id), null);
});

test('combined premises are numbered', () => {
  const m = createMap();
  const c = addNode(m, { type: 'combiner', text: 'Together' });
  const p1 = addNode(m, { text: 'All men are mortal' });
  const p2 = addNode(m, { text: 'Socrates is a man' });
  addEdge(m, 'premise', c.id, p1.id);
  const e2 = addEdge(m, 'premise', c.id, p2.id);
  assert.equal(e2.premise, '2');
  assert.equal(itemText(m, e2.id), "'Together' has premise 2: 'Socrates is a man'");
  assert.throws(() => addEdge(m, 'premise', p1.id, p2.id));
});

test('removing a post removes every arrow that depends on it', () => {
  const { m, a, b } = twoClaims();
  const e = addEdge(m, 'support', a.id, b.id);
  const s = addNode(m, { text: 's' });
  const c = addEdge(m, 'contention', e.id, s.id);
  const gone = removeItem(m, b.id);
  assert.deepEqual(new Set(gone), new Set([b.id, e.id, c.id]));
  assert.ok(m.items[s.id]);
});

test('ratings keep a dated history and reward changing your mind', () => {
  const { m, a } = twoClaims();
  rate(m, a.id, { stance: 'agree', confidence: 80 }, 1000);
  const msgs = rate(m, a.id, { stance: 'disagree' }, 2000);
  assert.match(msgs[0], /changed your mind/);
  assert.equal(m.items[a.id].rating.confidence, 80);
  assert.deepEqual(m.items[a.id].rating.history.map((h) => [h.at, h.stance]), [[1000, 'agree'], [2000, 'disagree']]);
  assert.match(rate(m, a.id, { stance: 'unknown' })[0], /don't know/);
  assert.deepEqual(rate(m, a.id, { relevance: 3 }), ['Good answer!']);
  rate(m, a.id, { confidence: 99.999 });
  assert.equal(m.items[a.id].rating.confidence, 99.999);
  rate(m, a.id, { confidence: 140 });
  assert.equal(m.items[a.id].rating.confidence, 100);
});

test('log confidence scale separates 99% from 99.999%', () => {
  assert.equal(logSliderToConfidence(0), 0);
  assert.equal(logSliderToConfidence(2), 99);
  assert.equal(logSliderToConfidence(5), 99.999);
  assert.equal(logSliderToConfidence(6), 100);
  assert.ok(Math.abs(confidenceToLogSlider(99.9) - 3) < 1e-9);
});

test('maps round-trip through export, and bad data is refused', () => {
  const m = exampleMap(5);
  const back = parseMap(serialize(m));
  assert.equal(Object.keys(back.items).length, Object.keys(m.items).length);
  for (const id of Object.keys(m.items)) assert.equal(itemText(back, id), itemText(m, id));
  assert.throws(() => parseMap('nope'));
  assert.throws(() => parseMap(JSON.stringify({ items: { x: { id: 'e1', kind: 'edge', type: 'support', from: 'a', to: 'b' } } })));
  assert.throws(() => parseMap(JSON.stringify({ items: { x: { id: 'bad id!', kind: 'node', type: 'statement' } } })));
  const loop = { items: {
    a: { id: 'a', kind: 'node', type: 'statement', text: 'a' },
    e1: { id: 'e1', kind: 'edge', type: 'support', from: 'a', to: 'e2' },
    e2: { id: 'e2', kind: 'edge', type: 'support', from: 'a', to: 'e1' },
  } };
  assert.throws(() => parseMap(JSON.stringify(loop)), /itself/);
});

test('the outline starts from conclusions and indents their reasons', () => {
  const text = outline(exampleMap());
  assert.match(text, /^# Did it rain last night\?/);
  assert.match(text, /'It rained last night\.'\n  - Support: 'The sidewalk is wet this morning\.'\n    - On that inference:\n      - Contention: 'The sprinklers soak the sidewalk every night\.'/);
  assert.match(text, /- Premise 1: 'The street is wet too\.'/);
  assert.match(text, /Fallacy: 'An Ad hominem fallacy is when an argument attacks/);
});

test('every post in the example map is a single statement', () => {
  const m = exampleMap();
  for (const n of Object.values(m.items).filter(isNode)) assert.equal(compoundParts(n), null, n.text);
});

test('compound posts are spotted and can be split into combined premises', () => {
  assert.deepEqual(splitStatements("My neighbour says it didn't rain, but he's wrong about everything."),
    ["My neighbour says it didn't rain.", "He's wrong about everything."]);
  assert.deepEqual(splitStatements('Dr. Smith is here. U.S. law agrees; so do I'), ['Dr. Smith is here.', 'U.S. law agrees.', 'So do I.']);
  assert.deepEqual(compoundParts({ kind: 'node', type: 'statement', text: 'Salt and pepper is tasty.' }), ['Salt and pepper is tasty.']);
  assert.equal(compoundParts({ kind: 'node', type: 'statement', text: 'It rained.' }), null);
  assert.equal(compoundParts({ kind: 'node', type: 'question', text: 'Why? How?' }), null);

  const m = createMap();
  const claim = addNode(m, { text: 'It rained' });
  const both = addNode(m, { text: 'The street is wet too, and the sprinklers do not reach it.' });
  const e = addEdge(m, 'support', claim.id, both.id);
  const made = splitIntoPremises(m, both.id, compoundParts(both));
  assert.equal(made.length, 2);
  assert.equal(m.items[both.id].type, 'combiner');
  assert.equal(m.items[e.id].to, both.id, 'arrows stay attached');
  assert.equal(itemText(m, e.id), "'It rained' is supported by 'These premises, taken together'");
  assert.deepEqual(made.map((id) => m.items[id].text), ['The street is wet too.', 'The sprinklers do not reach it.']);
  assert.throws(() => splitIntoPremises(m, claim.id, ['one']));
});
