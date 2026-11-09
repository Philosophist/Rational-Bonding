// The view buttons, used in the map panel and the feed: Agree (green),
// Disagree (red), and Neither, which opens I don't know, Incomprehensible
// and I don't care.
import { STANCES, NEITHER, OTHER_MAX, oddsPhrase, confidenceToOdds, oddsToConfidence, formatConfidence } from './model.js';

// Agree, then a "Neither" dropdown, then Disagree. Picking "Other…" asks for
// the person's own words. pick(stance, other) gets the words for Other.
export function stanceButtons(h, current, pick, otherText = null) {
  const side = (k) => h('button', { class: `${k}${current === k ? ' on' : ''}`, 'aria-pressed': String(current === k), onclick: () => pick(current === k ? null : k) }, STANCES[k]);
  const neither = NEITHER.includes(current);
  const words = h('input', { class: 'other-text', type: 'text', maxlength: OTHER_MAX, placeholder: 'In your own words…', value: otherText ?? '', 'aria-label': 'Your own view, in your words', hidden: current !== 'other' });
  let saved = otherText ?? '';
  const saveWords = () => { const t = words.value.trim(); if (t && t !== saved) { saved = t; pick('other', t); } };
  words.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') saveWords(); });
  words.addEventListener('blur', saveWords);
  const select = h('select', { class: `neither-select${neither ? ' on' : ''}`, 'aria-label': 'Neither agree nor disagree',
    onchange: (ev) => {
      const k = ev.target.value;
      if (k === 'other') { words.hidden = false; words.focus(); if (words.value.trim()) saveWords(); return; }
      words.hidden = true;
      pick(k || null);
    } },
  h('option', { value: '', selected: !neither }, neither ? 'Neither (clear)' : 'Neither…'),
  NEITHER.map((k) => h('option', { value: k, selected: current === k }, k === 'other' ? 'Other…' : STANCES[k])));
  return h('div', { class: 'stance-buttons' }, h('div', { class: 'row' }, side('agree'), select, side('disagree')), words);
}

// "1 / n chance that I'm wrong" (or "right", below 50%). Click n to type a
// number; Enter or leaving the box sets the confidence from it.
// Returns { el, update(confidence) } so a slider can keep it in step.
export function oddsLine(h, confidence, set) {
  const el = h('span', { class: 'odds-line' });
  let c = confidence;
  const show = () => {
    const ph = oddsPhrase(c);
    if (!ph) { el.replaceChildren(h('button', { class: 'odds-n', title: 'Click to type how likely you are to be wrong', onclick: edit }, '1 / n'), " chance that I'm wrong"); return; }
    const n = ph.n === Infinity ? '∞' : ph.n.toLocaleString();
    el.replaceChildren('1 / ', h('button', { class: 'odds-n', title: 'Click to type a number', onclick: edit }, n), ` chance that I'm ${ph.side}`);
  };
  // Typing always gives the chance of being wrong, whatever the line shows:
  // 1,000,000 means "1 in a million chance that I'm wrong", nearly 100%.
  function edit() {
    const n = confidenceToOdds(c);
    const input = h('input', { class: 'num odds', type: 'number', min: 1, step: 'any', value: n != null && n !== Infinity ? n : '', 'aria-label': "Chance that I'm wrong, 1 in" });
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      if (input.value !== '') { const v = oddsToConfidence(input.value); if (v != null) { c = v; set(v); } }
      show();
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { done = true; show(); } });
    input.addEventListener('blur', commit);
    el.replaceChildren('1 / ', input, " chance that I'm wrong");
    input.focus(); input.select();
  }
  show();
  return { el, update: (v) => { c = v; show(); } };
}
