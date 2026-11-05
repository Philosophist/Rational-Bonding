// Writes a migration that posts the built-in example arguments as real public
// posts, authored by a "Claude" account, so the public system isn't empty.
//   node reasonance/tools/seed-examples.mjs > chess3d/supabase/migrations/<date>_reasonance_examples.sql
// Ids are fixed when the file is written, so running the migration twice is safe.
import { randomUUID } from 'node:crypto';
import { EXAMPLES, exampleMap, postOrder, isNode } from '../model.js';

const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const CLAUDE = randomUUID();
const lines = [];
for (const ex of EXAMPLES) {
  const m = exampleMap(0, ex.key);
  lines.push(`  -- ${ex.title}`);
  for (const id of postOrder(m, Object.keys(m.items))) {
    const it = m.items[id];
    const key = `${ex.key}:${id}`;
    const end = (x) => `(select post from seed_posts where item = ${q(`${ex.key}:${x}`)})`;
    const args = isNode(it)
      ? it.type === 'fallacy'
        ? [q(randomUUID()), "'node'", "'fallacy'", q(it.when), q(it.fallacy), 'null', 'null', 'null']
        : [q(randomUUID()), "'node'", q(it.type), q(it.text), 'null', 'null', 'null', 'null']
      : [q(randomUUID()), "'edge'", q(it.type), "''", 'null', end(it.from), end(it.to), it.type === 'premise' ? q(it.premise) : 'null'];
    lines.push(`  insert into seed_posts values (${q(key)}, pg_temp.rs_seed(claude, ${args.join(', ')}));`);
  }
}

console.log(`-- Reasonance: the example arguments (rain, bike lanes, round Earth) as real
-- public posts, authored by a "Claude" account, so the public system has
-- something in it from the start. Written by reasonance/tools/seed-examples.mjs.
--
-- The Claude account is a plain row with no email, phone or password and is
-- banned from signing in, so nobody can use it; it only signs these posts.
-- A post someone already made with the same words is reused, not copied.
-- Safe to run more than once. If anything goes wrong, it skips seeding with a
-- warning rather than stopping later migrations.

create or replace function pg_temp.rs_seed(who uuid, pid uuid, k text, ty text, tx text, fa text, a uuid, b uuid, pr text)
returns uuid language plpgsql as $$
declare got uuid;
begin
  if exists (select 1 from public.rs_posts where id = pid) then return pid; end if;
  if not (k = 'node' and ty = 'combiner') then
    got := public.rs_find(k, ty, tx, fa, a, b);
    if got is not null then return got; end if;
  end if;
  insert into public.rs_posts (id, author, kind, type, text, fallacy, from_post, to_post, premise)
  values (pid, who, k, ty, coalesce(tx, ''), fa, a, b, pr);
  return pid;
end $$;

create temp table if not exists seed_posts (item text primary key, post uuid);

do $$
declare
  claude uuid := ${q(CLAUDE)};
begin
  if not exists (select 1 from auth.users where id = claude) then
    insert into auth.users (id, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until)
    values (claude, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      '{"provider":"none","note":"Signs the example posts. Cannot sign in."}', '{}', now(), now(), 'infinity');
  end if;
  if not exists (select 1 from public.profiles where id = claude) then
    insert into public.profiles (id, username)
    values (claude, case when exists (select 1 from public.profiles where lower(username) = 'claude') then 'Claude_AI' else 'Claude' end);
  end if;

${lines.join('\n')}
exception when others then
  raise warning 'Reasonance examples were not posted: %', sqlerrm;
end $$;`);
