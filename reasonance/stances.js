// The view buttons, used in the map panel and the feed: Agree (green),
// Disagree (red), and Neither, which opens I don't know, Incomprehensible
// and I don't care.
import { STANCES, NEITHER } from './model.js';

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
