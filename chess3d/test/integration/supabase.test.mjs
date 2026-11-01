// Integration tests for supabase/schema.sql against a running Supabase stack.
// Skipped unless SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY are set
// (e.g. from `supabase start`). Run: npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_KEY: SERVICE } = process.env;
const skip = !(URL && ANON && SERVICE) && 'set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY to run';

let createClient, admin;
const users = {};
const stamp = Date.now().toString(36);

async function player(name) {
  const email = `${name}-${stamp}@example.test`;
  const password = `pw-${stamp}-${name}!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, c, name: `${name}_${stamp}`.slice(0, 20) };
}

after(async () => {
  for (const u of Object.values(users)) await u.c.removeAllChannels();
});

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
const fails = async (p, pattern) => {
  const { error } = await p;
  assert.ok(error, 'expected an error');
  if (pattern) assert.match(error.message, pattern);
};

before(async () => {
  if (skip) return;
  ({ createClient } = await import('@supabase/supabase-js'));
  admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const n of ['alice', 'bob', 'carol']) users[n] = await player(n);
});

test('profiles: create your own only, usernames unique ignoring case', { skip }, async () => {
  const { alice, bob, carol } = users;
  ok(await alice.c.from('profiles').insert({ id: alice.id, username: alice.name }));
  ok(await bob.c.from('profiles').insert({ id: bob.id, username: bob.name }));
  await fails(carol.c.from('profiles').insert({ id: bob.id, username: 'imposter' }));
  await fails(carol.c.from('profiles').insert({ id: carol.id, username: alice.name.toUpperCase() }));
  await fails(carol.c.from('profiles').insert({ id: carol.id, username: 'no spaces!' }));
  ok(await carol.c.from('profiles').insert({ id: carol.id, username: carol.name }));
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ok(ok(await anon.from('profiles').select('username').eq('id', alice.id)).length === 1, 'profiles are public');
});

test('follows: only as yourself', { skip }, async () => {
  const { alice, bob, carol } = users;
  ok(await alice.c.from('follows').insert({ follower: alice.id, followee: bob.id }));
  await fails(carol.c.from('follows').insert({ follower: bob.id, followee: carol.id }));
  await fails(alice.c.from('follows').insert({ follower: alice.id, followee: alice.id }));
  // Deleting someone else's follow silently affects nothing.
  ok(await carol.c.from('follows').delete().eq('follower', alice.id));
  assert.equal(ok(await bob.c.from('follows').select('*').eq('follower', alice.id)).length, 1);
});

let gameId;
test('challenge, accept, and move only on your turn', { skip }, async () => {
  const { alice, bob, carol } = users;
  const g = ok(await alice.c.rpc('challenge', { opponent: bob.id, my_color: 'white', rules: { mode: 'relative', bishopFacing: true, hack: 'x' }, time_control: { type: 'live', base: 60, inc: 1 } }));
  gameId = g.id;
  assert.equal(g.status, 'pending');
  assert.deepEqual(g.rules, { mode: 'relative', bishopFacing: true }, 'unknown rule keys are dropped');
  await fails(alice.c.rpc('challenge', { opponent: bob.id, my_color: 'white', rules: {}, time_control: { type: 'live', base: 5, inc: 0 } }), /time control/);
  await fails(alice.c.rpc('answer_challenge', { game_id: gameId, accept: true }), /opponent/);
  await fails(carol.c.rpc('answer_challenge', { game_id: gameId, accept: true }), /no such/);
  const a = ok(await bob.c.rpc('answer_challenge', { game_id: gameId, accept: true }));
  assert.equal(a.status, 'active');
  assert.equal(a.white_ms, 60000);

  await fails(bob.c.rpc('make_move', { game_id: gameId, ply: 0, move: { from: 12, to: 20 } }), /not your turn/);
  await fails(carol.c.rpc('make_move', { game_id: gameId, ply: 0, move: { from: 12, to: 20 } }), /not your turn/);
  await fails(alice.c.rpc('make_move', { game_id: gameId, ply: 1, move: { from: 12, to: 20 } }), /out of sync/);
  await fails(alice.c.rpc('make_move', { game_id: gameId, ply: 0, move: { from: 999, to: 20 } }), /bad move/);
  const m1 = ok(await alice.c.rpc('make_move', { game_id: gameId, ply: 0, move: { from: 76, to: 148, face: [0, 1, 0, 0] } }));
  assert.equal(m1.moves.length, 1);
  assert.equal(m1.white_ms, 60000, 'no time used before both sides have moved');
  // White may not claim a win it did not earn on someone else's move, nor odd reasons.
  await fails(bob.c.rpc('make_move', { game_id: gameId, ply: 1, move: { from: 460, to: 388 }, claim_result: 'white', claim_reason: 'checkmate' }), /claim/);
  ok(await bob.c.rpc('make_move', { game_id: gameId, ply: 1, move: { from: 460, to: 388 } }));
});

test('nobody can edit an online game directly', { skip }, async () => {
  const { alice, bob } = users;
  ok(await alice.c.from('games').update({ result: 'white', status: 'finished' }).eq('id', gameId));
  ok(await bob.c.from('games').delete().eq('id', gameId));
  const g = ok(await admin.from('games').select('*').eq('id', gameId).single());
  assert.equal(g.status, 'active', 'update had no effect');
});

test('server keeps the clock: increments, and timeouts claimed by either player', { skip }, async () => {
  const { alice, bob } = users;
  // Two moves played, so the clock is running for white. Pretend 30 s passed.
  ok(await admin.from('games').update({ turn_started_at: new Date(Date.now() - 30000).toISOString() }).eq('id', gameId));
  const g = ok(await alice.c.rpc('make_move', { game_id: gameId, ply: 2, move: { from: 84, to: 156 } }));
  assert.ok(g.white_ms > 30000 && g.white_ms < 31500, `30 s used, 1 s increment back: ${g.white_ms}`);
  // Black's flag falls (pretend 2 minutes passed): a claim ends the game.
  ok(await admin.from('games').update({ turn_started_at: new Date(Date.now() - 120000).toISOString() }).eq('id', gameId));
  const early = ok(await bob.c.rpc('make_move', { game_id: gameId, ply: 3, move: { from: 468, to: 396 } }));
  assert.equal(early.status, 'finished', 'a move after the flag does not count');
  assert.equal(early.result, 'white');
  assert.equal(early.reason, 'timeout');
  assert.equal(early.moves.length, 3);
});

test('claim_timeout: no effect while time remains; draw when the winner cannot mate', { skip }, async () => {
  const { alice, bob } = users;
  let g = ok(await alice.c.rpc('challenge', { opponent: bob.id, my_color: 'black', rules: {}, time_control: { type: 'daily', days: 1 } }));
  ok(await bob.c.rpc('answer_challenge', { game_id: g.id, accept: true }));
  g = ok(await alice.c.rpc('claim_timeout', { game_id: g.id }));
  assert.equal(g.status, 'active');
  ok(await admin.from('games').update({ turn_started_at: new Date(Date.now() - 2 * 86400000).toISOString() }).eq('id', g.id));
  g = ok(await alice.c.rpc('claim_timeout', { game_id: g.id, winner_can_mate: false }));
  assert.equal(g.result, 'draw');
  assert.equal(g.reason, 'timeout vs insufficient material');
});

test('resign, abort and decline', { skip }, async () => {
  const { alice, bob, carol } = users;
  let g = ok(await alice.c.rpc('challenge', { opponent: bob.id, my_color: 'random', rules: {}, time_control: { type: 'none' } }));
  ok(await bob.c.rpc('answer_challenge', { game_id: g.id, accept: true }));
  await fails(carol.c.rpc('abort_game', { game_id: g.id }));
  g = ok(await bob.c.rpc('abort_game', { game_id: g.id }));
  assert.equal(g.status, 'aborted');
  g = ok(await alice.c.rpc('challenge', { opponent: bob.id, my_color: 'white', rules: {}, time_control: { type: 'none' } }));
  g = ok(await bob.c.rpc('answer_challenge', { game_id: g.id, accept: false }));
  assert.equal(g.status, 'declined');
  g = ok(await alice.c.rpc('challenge', { opponent: bob.id, my_color: 'white', rules: {}, time_control: { type: 'none' } }));
  ok(await bob.c.rpc('answer_challenge', { game_id: g.id, accept: true }));
  ok(await alice.c.rpc('make_move', { game_id: g.id, ply: 0, move: { from: 76, to: 148 } }));
  ok(await bob.c.rpc('make_move', { game_id: g.id, ply: 1, move: { from: 460, to: 388 } }));
  await fails(alice.c.rpc('abort_game', { game_id: g.id }), /too late/);
  g = ok(await alice.c.rpc('resign', { game_id: g.id }));
  assert.equal(g.result, 'black');
  assert.equal(g.reason, 'resignation');
});

test('local games are private and only saved as your own', { skip }, async () => {
  const { alice, bob, carol } = users;
  const row = { kind: 'local', white: alice.id, black: alice.id, created_by: alice.id, status: 'finished', moves: [{ from: 76, to: 148 }], result: 'white', reason: 'resignation' };
  const g = ok(await alice.c.from('games').insert(row).select().single());
  await fails(carol.c.from('games').insert({ ...row, created_by: carol.id }));
  await fails(alice.c.from('games').insert({ ...row, white: bob.id }));
  await fails(alice.c.from('games').insert({ ...row, kind: 'online' }));
  assert.equal(ok(await carol.c.from('games').select('id').eq('id', g.id)).length, 0, 'not visible to others');
  assert.equal(ok(await alice.c.from('games').select('id').eq('id', g.id)).length, 1);
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal(ok(await anon.from('games').select('id').eq('id', gameId)).length, 1, 'online games are public');
  await fails(anon.rpc('challenge', { opponent: bob.id, my_color: 'white', rules: {}, time_control: { type: 'none' } }));
});

test('realtime: the opponent hears about moves', { skip }, async () => {
  const { alice, bob } = users;
  let g = ok(await alice.c.rpc('challenge', { opponent: bob.id, my_color: 'white', rules: {}, time_control: { type: 'none' } }));
  ok(await bob.c.rpc('answer_challenge', { game_id: g.id, accept: true }));
  const heard = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no realtime event')), 15000);
    const ch = bob.c.channel(`g-${g.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${g.id}` }, (p) => {
        if (p.new.moves?.length === 1) {
          clearTimeout(t);
          bob.c.removeChannel(ch);
          resolve(p.new);
        }
      })
      .subscribe(async (status) => {
        // Give a freshly started realtime server a moment before sending the move.
        if (status === 'SUBSCRIBED') setTimeout(async () => ok(await alice.c.rpc('make_move', { game_id: g.id, ply: 0, move: { from: 76, to: 148 } })), 1000);
      });
  });
  const row = await heard;
  assert.equal(row.moves[0].to, 148);
});
