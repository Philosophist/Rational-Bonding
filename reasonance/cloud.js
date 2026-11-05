// Reasonance and the shared Rational Bonding account: saved maps, published
// posts and private ratings, in the rs_* tables
// (chess3d/supabase/migrations/20261105120000_reasonance.sql).
//
// The editor works the same signed out. Signed in, its maps are also kept in
// the account, posting an item publishes it, and ratings of posted items are
// saved (privately) with their dated history.
import * as auth from '../accounts/auth.js';
import { isNode, isEdge, postOrder } from './model.js';

export { auth };
const db = () => auth.client();
const check = auth.check;
export const signedIn = () => !!(auth.state.user && auth.state.profile);
export const userId = () => auth.state.user?.id ?? null;

// What a map item looks like as an rs_posts row (null while an end is a draft).
export function rowFor(map, item) {
  const posts = map.posts ?? {};
  if (isNode(item)) {
    return item.type === 'fallacy'
      ? { kind: 'node', type: 'fallacy', fallacy: item.fallacy || 'Unnamed', text: item.when ?? '' }
      : { kind: 'node', type: item.type, text: item.text ?? '' };
  }
  const from = posts[item.from], to = posts[item.to];
  if (!from || !to) return null;
  return { kind: 'edge', type: item.type, from_post: from, to_post: to, premise: item.type === 'premise' ? String(item.premise ?? '') : null };
}
const sig = (row) => JSON.stringify([row.type, row.text ?? '', row.fallacy ?? null, row.from_post ?? null, row.to_post ?? null, row.premise ?? null]);
const sent = new Map(); // post id -> what the server last had

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

// ---------------------------------------------------------------- posts
// Publishes the given items, and any drafts they depend on (an arrow's ends).
// Returns how many were posted. map.posts records each item's post id.
export async function post(map, ids) {
  map.posts ??= {};
  let made = 0;
  for (const id of postOrder(map, ids)) {
    if (map.posts[id]) continue;
    const row = rowFor(map, map.items[id]);
    if (!row) throw new Error('Post both ends of that arrow first.');
    const out = check(await db().from('rs_posts').insert(row).select('*').single());
    map.posts[id] = out.id;
    sent.set(out.id, sig(out));
    made++;
    const r = map.items[id].rating;
    if (r && (r.stance || r.confidence != null || r.relevance)) await rate(out.id, r);
  }
  return made;
}

// Sends edits made to posted items since they were last sent.
export async function syncPosted(map) {
  const problems = [];
  for (const [id, pid] of Object.entries(map.posts ?? {})) {
    const it = map.items[id];
    if (!it) continue;
    const row = rowFor(map, it);
    if (!row || sent.get(pid) === sig(row)) continue;
    const { kind, ...change } = row;
    void kind;
    const { data, error } = await db().from('rs_posts').update(change).eq('id', pid).select('*');
    if (error) problems.push(error.message);
    else if (data?.[0]) sent.set(pid, sig(data[0]));
    else sent.set(pid, sig(row)); // not ours (an imported post id): don't keep retrying
  }
  return problems;
}

// Brings posted items up to date with the server (an edit made on another
// device), and forgets posts that were deleted.
export async function refresh(map) {
  const entries = Object.entries(map.posts ?? {}).filter(([id]) => map.items[id]);
  if (!entries.length) return false;
  const rows = check(await db().from('rs_posts').select('*').in('id', entries.map(([, pid]) => pid)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  let changed = false;
  for (const [id, pid] of entries) {
    const r = byId.get(pid), it = map.items[id];
    if (!r) { delete map.posts[id]; changed = true; continue; }
    sent.set(pid, sig(r));
    if (r.kind === 'node') {
      if (r.type === 'fallacy') {
        if (it.when !== r.text || it.fallacy !== r.fallacy) { it.when = r.text; it.fallacy = r.fallacy; changed = true; }
      } else if (it.text !== r.text || it.type !== r.type) { it.text = r.text; it.type = r.type; changed = true; }
    } else if (it.type !== r.type) { it.type = r.type; changed = true; }
  }
  return changed;
}

export async function deletePost(pid) {
  const gone = check(await db().from('rs_posts').delete().eq('id', pid).select('id'));
  if (!gone.length) throw new Error('Someone else has rated this post, so it stays up. You can remove it from your map.');
  sent.delete(pid);
}

// Public totals for posts: { id: { agree, disagree, unknown, incomprehensible, raters, confidence_avg } }.
export async function stats(pids) {
  if (!pids.length) return {};
  const rows = check(await db().from('rs_post_stats').select('*').in('post_id', pids));
  return Object.fromEntries(rows.map((r) => [r.post_id, r]));
}

// ---------------------------------------------------------------- ratings
export async function rate(pid, r) {
  check(await db().from('rs_ratings').upsert({
    user_id: userId(), post_id: pid,
    stance: r.stance ?? null, confidence: r.confidence ?? null, relevance: r.relevance ?? null,
  }, { onConflict: 'user_id,post_id' }));
}
