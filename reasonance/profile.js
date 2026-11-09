// A person's profile: their username, a Follow button, the maps they shared
// and the views they shared. Opened from a username anywhere in the app, from
// "My profile", or from a link like ?u=steve.
import * as cloud from './cloud.js';
import { STANCES, formatConfidence } from './model.js';

const $ = (id) => document.getElementById(id);
let deps = null; // { h, toast, signIn, openSharedMap, openPost }

export function initProfile(d) {
  deps = d;
  $('profile').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) closeProfile(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('profile').hidden) closeProfile(); });
}
export function closeProfile() { $('profile').hidden = true; }

// "@bob agrees, 90% sure" and the like, for a shared view.
export function viewPhrase(v) {
  const said = v.stance === 'other' ? `says "${v.other ?? ''}"`
    : v.stance === 'agree' ? 'agrees' : v.stance === 'disagree' ? 'disagrees'
      : v.stance ? (STANCES[v.stance] ?? v.stance).toLowerCase() : 'gave a view';
  const sure = v.confidence != null ? `, ${formatConfidence(v.confidence)} sure` : '';
  const stars = v.relevance ? `, ${'★'.repeat(v.relevance)}` : '';
  return `${said}${sure}${stars}`;
}
export const postWords = (p) => p.kind === 'edge' ? p.label ?? 'an inference' : p.type === 'fallacy' ? `A ${p.fallacy} fallacy is when an argument ${p.text}` : p.text;
export function ago(t) {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

// A username that opens that person's profile.
export function nameLink(name) {
  const { h } = deps;
  if (!name) return h('span', {}, 'anonymous');
  return h('button', { class: 'name-link', title: `See @${name}'s profile`, onclick: (ev) => { ev.stopPropagation(); openProfile(name); } }, `@${name}`);
}

export async function openProfile(name) {
  const { h, toast } = deps;
  const box = $('profile');
  const card = box.querySelector('.card');
  box.hidden = false;
  card.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  let who, maps, views, followers, follows;
  try {
    who = await cloud.profileByName(name);
    if (!who) { card.replaceChildren(closeBtn(), h('p', {}, `There's no one called @${name}.`)); return; }
    [maps, views, followers, follows] = await Promise.all([
      cloud.publicMaps(who.id), cloud.sharedViews([who.id], 20), cloud.followerCount(who.id), cloud.following(),
    ]);
  } catch (err) { card.replaceChildren(closeBtn(), h('p', {}, `Couldn't load the profile: ${err.message}`)); return; }
  const me = who.id === cloud.userId();
  let on = follows.includes(who.id);
  const followBtn = me ? null : h('button', { class: on ? '' : 'accent', onclick: async () => {
    if (!cloud.signedIn()) { closeProfile(); deps.signIn(); return; }
    try {
      if (on) await cloud.unfollow(who.id); else await cloud.follow(who.id);
      on = !on; followers += on ? 1 : -1;
      followBtn.textContent = on ? 'Following' : 'Follow'; followBtn.className = on ? '' : 'accent';
      count.textContent = followersText(followers);
      toast(on ? `You'll see @${who.username}'s shared maps and views in your home feed.` : `Unfollowed @${who.username}.`);
    } catch (err) { toast(err.message); }
  } }, on ? 'Following' : 'Follow');
  const count = h('span', { class: 'muted' }, followersText(followers));
  const link = `${location.origin}${location.pathname}?u=${encodeURIComponent(who.username)}`;
  card.replaceChildren(
    closeBtn(),
    h('h2', {}, `@${who.username}`),
    h('div', { class: 'row' }, followBtn, count,
      h('button', { onclick: () => navigator.clipboard.writeText(link).then(() => toast('Profile link copied.'), () => toast(link)) }, 'Copy profile link')),
    h('h3', {}, me ? 'Maps you shared' : 'Shared maps'),
    maps.length
      ? h('ul', { class: 'plist' }, maps.map((m) => h('li', {},
        h('button', { class: 'link', onclick: () => { closeProfile(); deps.openSharedMap(m.owner, m.id); } }, m.title || 'Untitled map'),
        h('span', { class: 'muted' }, ` · updated ${ago(m.updated_at)}`))))
      : h('p', { class: 'muted' }, me ? 'None yet. Choose File… → Share this map publicly on any map.' : 'No shared maps yet.'),
    h('h3', {}, me ? 'Views you shared' : 'Shared views'),
    views.length
      ? h('ul', { class: 'plist' }, views.map((v) => h('li', {},
        h('span', {}, `${me ? 'You' : `@${who.username}`} ${viewPhrase(v)} on `),
        h('button', { class: 'link', onclick: () => { closeProfile(); deps.openPost(v.post); } }, `"${postWords(v.post)}"`),
        h('span', { class: 'muted' }, ` · ${ago(v.updated_at)}`))))
      : h('p', { class: 'muted' }, 'No shared views yet.'));
}
const followersText = (n) => `${n} follower${n === 1 ? '' : 's'}`;
function closeBtn() {
  return deps.h('button', { class: 'pclose', 'aria-label': 'Close', title: 'Close', onclick: closeProfile }, '×');
}
