// Reasonance and the shared Rational Bonding account: saved maps, published
// posts and ratings, in the rs_* tables
// (chess3d/supabase/migrations/20261105120000_reasonance.sql).
//
// The editor works the same signed out. Signed in, its maps are also kept in
// the account, posting an item publishes it (unless the same thing is already
// posted: then the map uses that post), and ratings of posted items are saved
// with their dated history, private unless shared.
import * as auth from '../accounts/auth.js';
import { isNode, isEdge, postOrder } from './model.js';

export { auth };
const db = () => auth.client();
const check = auth.check;
export const signedIn = () => !!(auth.state.user && auth.state.profile);
export const userId = () => auth.state.user?.id ?? null;

// Everything about a post anyone may read (the author column is private).
const COLS = 'id, kind, type, text, fallacy, from_post, to_post, premise, anonymous, byline, created_at, edited_at';
// How close a posted statement must be to count as "already out there?" (share of words).
export const SIMILAR = 0.5;

// What a map item looks like as an rs_posts row (null while an end is a draft).
export function rowFor(map, item) {
  const posts = map.posts ?? {};
  const anonymous = !!item.anonymous;
  if (isNode(item)) {
    return item.type === 'fallacy'
      ? { kind: 'node', type: 'fallacy', fallacy: item.fallacy || 'Unnamed', text: item.when ?? '', anonymous }
      : { kind: 'node', type: item.type, text: item.text ?? '', anonymous };
  }
  const from = posts[item.from], to = posts[item.to];
  if (!from || !to) return null;
  return { kind: 'edge', type: item.type, from_post: from, to_post: to, premise: item.type === 'premise' ? String(item.premise ?? '') : null, anonymous };
}
const sig = (row) => JSON.stringify([row.type, row.text ?? '', row.fallacy ?? null, row.from_post ?? null, row.to_post ?? null, row.premise ?? null, !!row.anonymous]);
const sent = new Map(); // post id -> what the server last had
export const mine = new Set(); // post ids this account wrote
const isDuplicate = (err) => err?.code === '23505';

// ---------------------------------------------------------------- maps
export async function loadMaps() {
  return check(await db().from('rs_maps').select('id, title, data, updated_at'));
}
export async function saveMap(map) {
  const data = JSON.parse(JSON.stringify({ app: 'reasonance', ...map }));
  check(await db().from('rs_maps').upsert({ owner: userId(), id: map.id, title: map.title.slice(0, 200), data }, { onConflict: 'owner,id' }));
}
export async function deleteMap(id) {
  check(await db().from('rs_maps').delete().eq('owner', userId()).eq('id', id));
}

// ---------------------------------------------------------------- finding what's already posted
// The post that already says exactly this (same words, or the same arrow).
export async function find(row) {
  const id = check(await db().rpc('rs_find', {
    k: row.kind, ty: row.type, tx: row.text ?? null, fa: row.fallacy ?? null, a: row.from_post ?? null, b: row.to_post ?? null,
  }));
  return id || null;
}
// Posted statements sharing most of the words of `text`, best first.
export async function similar(text, minScore = SIMILAR) {
  if (!String(text ?? '').trim()) return [];
  const rows = check(await db().rpc('rs_similar', { q: String(text).slice(0, 2000), min_score: minScore }));
  return (rows ?? []).filter((r) => r.score >= minScore);
}
// For the panel: an exact match, and near matches, for a draft item.
export async function lookup(map, item) {
  const row = rowFor(map, item);
  if (!row) return { exact: null, similar: [] };
  const exactId = row.kind === 'node' && row.type === 'combiner' ? null : await find(row);
  const exact = exactId ? await getPost(exactId) : null;
  const near = row.kind === 'node' && row.type !== 'combiner' ? (await similar(row.type === 'fallacy' ? `${row.fallacy} ${row.text}` : row.text)).filter((r) => r.id !== exactId && !mine.has(r.id)) : [];
  return { exact, similar: near };
}
export async function getPost(pid) {
  return check(await db().from('rs_posts').select(COLS).eq('id', pid).maybeSingle());
}
// Makes a map item stand for an existing post, taking on its words.
export function adopt(map, id, r) {
  const it = map.items[id];
  map.posts ??= {};
  map.posts[id] = r.id;
  if (isNode(it)) {
    it.type = r.type;
    if (r.type === 'fallacy') { it.fallacy = r.fallacy; it.when = r.text; } else it.text = r.text;
  } else {
    it.type = r.type;
  }
  it.anonymous = !!r.anonymous;
  sent.set(r.id, sig(r));
}
export async function link(map, id, pid) {
  const r = await getPost(pid);
  if (!r) throw new Error('That post is gone.');
  adopt(map, id, r);
  await loadMine([pid]);
}

// ---------------------------------------------------------------- posts
// Publishes the given items, and any drafts they depend on (an arrow's ends).
// Something already posted word for word isn't posted again: the map uses
// the existing post. A statement close to one already posted is held back
// (so its author can choose), unless it is in `confirmed`.
// Returns { posted, linked, held }; map.posts records each item's post id.
export async function post(map, ids, { confirmed = new Set(), share = false } = {}) {
  map.posts ??= {};
  const out = { posted: 0, linked: 0, held: [] };
  for (const id of postOrder(map, ids)) {
    if (map.posts[id]) continue;
    const it = map.items[id];
    const row = rowFor(map, it);
    if (!row) { out.held.push(id); continue; } // an end was held back
    const same = row.kind === 'node' && row.type === 'combiner' ? null : await find(row);
    if (same) { await link(map, id, same); out.linked++; continue; }
    if (row.kind === 'node' && row.type !== 'combiner' && !confirmed.has(id)) {
      const near = await similar(row.type === 'fallacy' ? `${row.fallacy} ${row.text}` : row.text);
      // Your own posts don't count: a map often holds a claim and its denial.
      if (near.some((r) => !mine.has(r.id))) { out.held.push(id); continue; }
    }
    const { data, error } = await db().from('rs_posts').insert(row).select(COLS).single();
    if (isDuplicate(error)) { // posted by someone else a moment ago
      const again = await find(row);
      if (again) { await link(map, id, again); out.linked++; continue; }
    }
    if (error) throw error;
    map.posts[id] = data.id;
    sent.set(data.id, sig(data));
    mine.add(data.id);
    out.posted++;
    const r = it.rating;
    if (r && (r.stance || r.confidence != null || r.relevance)) await rate(data.id, r, it.share ?? share);
  }
  return out;
}

// Sends edits made to your posted items since they were last sent.
export async function syncPosted(map) {
  const problems = [];
  for (const [id, pid] of Object.entries(map.posts ?? {})) {
    const it = map.items[id];
    if (!it || !mine.has(pid)) continue;
    const row = rowFor(map, it);
    if (!row || sent.get(pid) === sig(row)) continue;
    const { kind, ...change } = row;
    void kind;
    const { data, error } = await db().from('rs_posts').update(change).eq('id', pid).select(COLS);
    if (error) {
      problems.push(error.message);
      sent.set(pid, sig(row)); // say it once, not on every save
    } else if (data?.[0]) sent.set(pid, sig(data[0]));
    else sent.set(pid, sig(row));
  }
  return problems;
}

// Which of these posts this account wrote.
export async function loadMine(pids) {
  const want = pids.filter((p) => !mine.has(p));
  if (!want.length || !signedIn()) return;
  const rows = check(await db().rpc('rs_mine', { ids: want }));
  for (const r of rows ?? []) mine.add(typeof r === 'string' ? r : r.rs_mine ?? r.id);
}
export const forgetMine = () => { mine.clear(); sent.clear(); };

// Brings posted items up to date with the server (an edit made on another
// device, or by the author of a post you use), and forgets deleted posts.
export async function refresh(map) {
  const entries = Object.entries(map.posts ?? {}).filter(([id]) => map.items[id]);
  if (!entries.length) return false;
  const rows = check(await db().from('rs_posts').select(COLS).in('id', entries.map(([, pid]) => pid)));
  await loadMine(entries.map(([, pid]) => pid)).catch(() => {});
  const byId = new Map(rows.map((r) => [r.id, r]));
  let changed = false;
  for (const [id, pid] of entries) {
    const r = byId.get(pid), it = map.items[id];
    if (!r) { delete map.posts[id]; changed = true; continue; }
    const before = JSON.stringify(it);
    adopt(map, id, r);
    if (JSON.stringify(it) !== before) changed = true;
  }
  return changed;
}

export async function deletePost(pid) {
  const gone = check(await db().from('rs_posts').delete().eq('id', pid).select('id'));
  if (!gone.length) throw new Error('Someone else has rated this post, so it stays up. You can remove it from your map.');
  sent.delete(pid);
  mine.delete(pid);
}

// Public totals for posts: { id: { agree, disagree, unknown, incomprehensible, raters, confidence_avg } }.
export async function stats(pids) {
  if (!pids.length) return {};
  const rows = check(await db().from('rs_post_stats').select('*').in('post_id', pids));
  return Object.fromEntries(rows.map((r) => [r.post_id, r]));
}

// Who wrote these posts (null for anonymous ones), and the views people shared.
export async function about(pids) {
  if (!pids.length) return {};
  const posts = check(await db().from('rs_posts').select('id, byline, anonymous').in('id', pids));
  const views = check(await db().from('rs_ratings').select('user_id, post_id, stance, confidence, relevance').eq('public', true).in('post_id', pids));
  const names = await usernames([...posts.map((p) => p.byline), ...views.map((v) => v.user_id)]);
  const out = {};
  for (const p of posts) out[p.id] = { by: p.byline ? names[p.byline] ?? null : null, anonymous: p.anonymous, views: [] };
  for (const v of views) out[v.post_id]?.views.push({ ...v, name: names[v.user_id] ?? null, me: v.user_id === userId() });
  return out;
}
export async function usernames(ids) {
  const want = [...new Set(ids.filter(Boolean))];
  if (!want.length) return {};
  const rows = check(await db().from('profiles').select('id, username').in('id', want));
  return Object.fromEntries(rows.map((r) => [r.id, r.username]));
}

// ---------------------------------------------------------------- pulling public posts into a map
// A post plus the arrows leading out from it (its reasons) and the posts at
// their other ends, so a private map can be built from what's already posted.
export async function neighbourhood(pid) {
  const root = await getPost(pid);
  if (!root) throw new Error('That post is gone.');
  const out = check(await db().from('rs_posts').select(COLS).eq('from_post', pid).limit(40));
  const ends = [...new Set(out.map((e) => e.to_post))];
  const others = ends.length ? check(await db().from('rs_posts').select(COLS).in('id', ends)) : [];
  return { root, edges: out, nodes: others };
}
// Search for the panel: statements with some of these words, best first.
export async function search(text) {
  return similar(text, 0.01);
}

// ---------------------------------------------------------------- ratings and settings
export async function rate(pid, r, share = false) {
  check(await db().from('rs_ratings').upsert({
    user_id: userId(), post_id: pid,
    stance: r.stance ?? null, confidence: r.confidence ?? null, relevance: r.relevance ?? null,
    public: !!share,
  }, { onConflict: 'user_id,post_id' }));
}
export async function setShared(pid, share) {
  check(await db().from('rs_ratings').update({ public: !!share }).eq('user_id', userId()).eq('post_id', pid));
}
export const settings = { share_views: false };
export async function loadSettings() {
  const row = check(await db().from('rs_settings').select('share_views').maybeSingle());
  settings.share_views = !!row?.share_views;
  return settings;
}
export async function saveSettings(patch) {
  Object.assign(settings, patch);
  check(await db().from('rs_settings').upsert({ user_id: userId(), ...settings }, { onConflict: 'user_id' }));
}

// ---------------------------------------------------------------- the home page: feed and sea
// The newest posted statements, for the feed.
export async function recent(limit = 40) {
  return check(await db().from('rs_posts').select(COLS).eq('kind', 'node').neq('type', 'combiner')
    .order('created_at', { ascending: false }).limit(limit));
}
// Many posts and arrows at once, just enough to draw the sea of orbs.
export async function sea(limit = 600) {
  return check(await db().from('rs_posts').select('id, kind, type, from_post, to_post')
    .order('created_at', { ascending: false }).limit(limit));
}
// Your own views of these posts: { id: { stance, confidence, relevance, public } }.
export async function myRatings(pids) {
  if (!pids.length || !signedIn()) return {};
  const rows = check(await db().from('rs_ratings').select('post_id, stance, confidence, relevance, public')
    .eq('user_id', userId()).in('post_id', pids));
  return Object.fromEntries(rows.map((r) => [r.post_id, r]));
}
// Every arrow touching a post (out to its reasons, in from the claims it
// backs), with the posts at their other ends.
export async function links(pid, limit = 60) {
  const out = check(await db().from('rs_posts').select(COLS).eq('from_post', pid).limit(limit));
  const inn = check(await db().from('rs_posts').select(COLS).eq('to_post', pid).limit(limit));
  const ends = [...new Set([...out.map((e) => e.to_post), ...inn.map((e) => e.from_post)])];
  const others = ends.length ? check(await db().from('rs_posts').select(COLS).in('id', ends)) : [];
  return { out, inn, ends: Object.fromEntries(others.map((r) => [r.id, r])) };
}
