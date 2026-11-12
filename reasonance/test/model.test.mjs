import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMap, addNode, addEdge, removeItem, flipEdge, setEdgeType, itemText, standingContention,
  rate, outline, serialize, parseMap, exampleMap, logSliderToConfidence, confidenceToLogSlider,
  splitStatements, compoundParts, splitIntoPremises, isNode, EXAMPLES, postOrder, publicCopy, untitledName, takesViews,
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
  assert.equal(itemText(m, addEdge(m, 'same', a.id, b.id).id), "'It rained' means the same thing as 'The sidewalk is wet'");
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

test('confidence reads as a 1 in n chance of being wrong', async () => {
  const { confidenceToOdds, oddsToConfidence } = await import('../model.js');
  assert.equal(confidenceToOdds(90), 10);
  assert.equal(confidenceToOdds(50), 2);
  assert.equal(confidenceToOdds(99.9), 1000);
  assert.equal(confidenceToOdds(75), 4);
  assert.equal(confidenceToOdds(100), Infinity);
  assert.equal(confidenceToOdds(0), 1);
  assert.equal(confidenceToOdds(null), null);
  assert.equal(oddsToConfidence(10), 90);
  assert.equal(oddsToConfidence(1000), 99.9);
  assert.equal(oddsToConfidence(1), 0);
  assert.equal(oddsToConfidence('x'), null);
});

test('below 50% the odds read as a chance of being right', async () => {
  const { oddsPhrase, phraseToConfidence } = await import('../model.js');
  assert.deepEqual(oddsPhrase(90), { n: 10, side: 'wrong' });
  assert.deepEqual(oddsPhrase(50), { n: 2, side: 'wrong' });
  assert.deepEqual(oddsPhrase(25), { n: 4, side: 'right' });
  assert.deepEqual(oddsPhrase(0), { n: Infinity, side: 'right' });
  assert.equal(oddsPhrase(null), null);
  // someone types 1.5 as their chance of being wrong: that's 33%, shown as right
  const c = phraseToConfidence(1.5, 'wrong');
  assert.ok(Math.abs(c - 33.333333) < 1e-4);
  assert.deepEqual(oddsPhrase(c), { n: 3, side: 'right' });
  assert.equal(phraseToConfidence(4, 'right'), 25);
});

test('"Other" keeps your own words, only while it is your view', async () => {
  const { createMap, addNode, rate, parseMap, serialize } = await import('../model.js');
  const m = createMap('t'); const a = addNode(m, { text: 'A God exists.' });
  rate(m, a.id, { stance: 'other', other: '  Depends what you mean by God  ' });
  assert.equal(m.items[a.id].rating.other, 'Depends what you mean by God');
  assert.equal(parseMap(serialize(m)).items[a.id].rating.other, 'Depends what you mean by God');
  rate(m, a.id, { stance: 'agree' });
  assert.equal(m.items[a.id].rating.other, null);
});

test('a million to one reads as nearly certain', async () => {
  const { oddsToConfidence, oddsPhrase, formatConfidence } = await import('../model.js');
  const c = oddsToConfidence(1e6);
  assert.equal(c, 99.9999);
  assert.deepEqual(oddsPhrase(c), { n: 1e6, side: 'wrong' });
  assert.equal(formatConfidence(c), '99.9999%');
  assert.equal(formatConfidence(oddsToConfidence(1e8)), '99.999999%');
  assert.equal(formatConfidence(33.3333), '33.3%');
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
  const old = parseMap(JSON.stringify({ items: {
    a: { id: 'a', kind: 'node', type: 'statement', text: 'a' }, b: { id: 'b', kind: 'node', type: 'statement', text: 'b' },
    e1: { id: 'e1', kind: 'edge', type: 'suggestion', from: 'a', to: 'b' },
  } }));
  assert.equal(old.items.e1.type, 'question', 'old "Suggests" arrows load as questions');
});

test('the outline starts from conclusions and indents their reasons', () => {
  const text = outline(exampleMap());
  assert.match(text, /^# Should the death penalty be abolished\?/);
  assert.match(text, /'Every country should abolish the death penalty\.'\n  - Clarification: /);
  assert.match(text, /    - On that inference:\n      - Contention: 'Stricter standards of proof/);
  assert.match(text, /- Premise 2: 'An execution cannot be undone\.'/);
  assert.match(text, /Fallacy: 'An Appeal to popularity fallacy is when/);
});

test('every post in every example is a single statement', () => {
  assert.ok(EXAMPLES.length >= 3);
  for (const ex of EXAMPLES) {
    const m = exampleMap(1, ex.key);
    assert.equal(m.title, ex.title);
    for (const n of Object.values(m.items).filter(isNode)) assert.equal(compoundParts(n), null, n.text);
    const back = parseMap(serialize(m));
    for (const id of Object.keys(m.items)) assert.equal(itemText(back, id), itemText(m, id));
  }
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

test('posted items keep their server ids only in a map\'s own saved copy', () => {
  const { m, a, b } = twoClaims();
  const e = addEdge(m, 'support', a.id, b.id);
  m.posts = { [a.id]: '11111111-2222-4333-8444-555555555555', [e.id]: 'not-a-uuid', nope: '11111111-2222-4333-8444-555555555555' };
  assert.deepEqual(parseMap(serialize(m), 1, { keepPosts: true }).posts, { [a.id]: '11111111-2222-4333-8444-555555555555' });
  assert.equal(parseMap(serialize(m)).posts, undefined, 'an opened file starts as drafts');
  assert.deepEqual(postOrder(m, [e.id]), [a.id, b.id, e.id], 'ends are posted before their arrow');
});

test('posting choices (anonymous, share) survive saving and loading', () => {
  const m = createMap('t', 1);
  const a = addNode(m, { text: 'A.' });
  a.anonymous = true; a.share = false;
  const back = parseMap(serialize(m));
  assert.equal(back.items[a.id].anonymous, true);
  assert.equal(back.items[a.id].share, false);
});

test("I don't care is a Neither view that gives one star by default", async () => {
  const { NEITHER } = await import('../model.js');
  assert.ok(NEITHER.includes('dontcare'));
  assert.ok(NEITHER.includes('noopinion'));
  const m = createMap('t', 1);
  const a = addNode(m, { text: 'A.' });
  rate(m, a.id, { stance: 'dontcare' });
  assert.equal(m.items[a.id].rating.relevance, 1);
  rate(m, a.id, { relevance: 4 });
  rate(m, a.id, { stance: 'dontcare' });
  assert.equal(m.items[a.id].rating.relevance, 4);
});

test('a shared map leaves out your views, their history and anonymous links', () => {
  const m = createMap('Mine');
  const a = addNode(m, { text: 'A God exists' });
  const b = addNode(m, { text: 'Life exists' });
  const e = addEdge(m, 'support', a.id, b.id);
  rate(m, a.id, { stance: 'agree', confidence: 90 });
  rate(m, e.id, { stance: 'other', other: 'secret words' });
  m.items[a.id].share = true;
  m.items[b.id].anonymous = true;
  m.posts = { [a.id]: '11111111-1111-1111-1111-111111111111', [b.id]: '22222222-2222-2222-2222-222222222222' };
  m.public = true;
  const pub = publicCopy(m);
  const text = JSON.stringify(pub);
  assert.ok(!text.includes('rating') && !text.includes('secret') && !text.includes('history') && !text.includes('share'));
  assert.deepEqual(Object.keys(pub.posts), [a.id]);
  assert.equal(pub.items[e.id].from, a.id);
  // It reads back as a normal map, and your own copy remembers it's shared.
  assert.equal(Object.keys(parseMap(text).items).length, 3);
  assert.equal(parseMap(serialize(m), Date.now(), { keepPosts: true }).public, true);
  assert.equal(parseMap(serialize(m)).public, undefined);
});

test('untitled maps count up from 1', () => {
  assert.equal(untitledName([]), 'Untitled map 1');
  assert.equal(untitledName(['Rain', 'Untitled map 1']), 'Untitled map 2');
  assert.equal(untitledName(['Untitled map', 'untitled map 3', 'My map 9']), 'Untitled map 4');
});

test('clarifications take no views', () => {
  const m = createMap('C');
  const a = addNode(m, { text: 'It rained.' });
  const c = addNode(m, { type: 'clarification', text: 'By rained I mean more than a drizzle.' });
  const e = addEdge(m, 'clarification', a.id, c.id);
  assert.equal(takesViews(c), false);
  assert.equal(takesViews(e), false);
  assert.equal(takesViews(a), true);
  rate(m, c.id, { stance: 'agree', confidence: 90 });
  rate(m, e.id, { stance: 'disagree' });
  assert.equal(m.items[c.id].rating, undefined);
  assert.equal(m.items[e.id].rating, undefined);
});
