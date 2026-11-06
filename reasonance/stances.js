// The view buttons, used in the map panel and the feed: Agree (green),
// Disagree (red), and Neither, which opens I don't know, Incomprehensible
// and I don't care.
import { STANCES, NEITHER, oddsPhrase, phraseToConfidence } from './model.js';

export function stanceButtons(h, current, pick) {
  const neither = NEITHER.includes(current);
  const sub = h('div', { class: 'row neither-row', hidden: true },
    NEITHER.map((k) => h('button', { class: `neither${current === k ? ' on' : ''}`, 'aria-pressed': String(current === k), onclick: () => pick(current === k ? null : k) }, STANCES[k])));
  const side = (k) => h('button', { class: `${k}${current === k ? ' on' : ''}`, 'aria-pressed': String(current === k), onclick: () => pick(current === k ? null : k) }, STANCES[k]);
  const more = h('button', { class: `neither${neither ? ' on' : ''}`, 'aria-expanded': 'false',
    onclick: () => { sub.hidden = !sub.hidden; more.setAttribute('aria-expanded', String(!sub.hidden)); } },
  neither ? `Neither: ${STANCES[current]}` : 'Neither…');
  return h('div', { class: 'stance-buttons' }, h('div', { class: 'row' }, side('agree'), side('disagree'), more), sub);
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
  function edit() {
    const side = oddsPhrase(c)?.side ?? 'wrong';
    const ph = oddsPhrase(c);
    const input = h('input', { class: 'num odds', type: 'number', min: 1, step: 'any', value: ph && ph.n !== Infinity ? ph.n : '', 'aria-label': `Chance that I'm ${side}, 1 in` });
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      if (input.value !== '') { const v = phraseToConfidence(input.value, side); if (v != null) { c = v; set(v); } }
      show();
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { done = true; show(); } });
    input.addEventListener('blur', commit);
    el.replaceChildren('1 / ', input, ` chance that I'm ${side}`);
    input.focus(); input.select();
  }
  show();
  return { el, update: (v) => { c = v; show(); } };
}
