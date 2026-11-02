-- Cube Chess: accounts, follows, saved games and server-kept clocks.
--
-- This is a Supabase migration: with the GitHub integration set up (see
-- ../../SETUP.md) it is applied automatically when it reaches the master
-- branch. It can also be pasted into the dashboard's SQL Editor and run by
-- hand; it is safe to run more than once. Later database changes go in new,
-- later-dated files in this folder; never edit a migration that has run.
--
-- Security model
--   * Row level security is on for every table.
--   * Profiles and follows are public to read; you can only write your own.
--   * Online games are public to read (like chess.com), but nobody can write
--     them directly: every change goes through the functions below, which
--     check that the caller is the right player and keep the clocks on the
--     server, so a client cannot fake its time or move for the other side.
--   * Local (same-screen) games are private to the account that saved them.
--   * Move legality is checked by both players' browsers, not the database.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_ci on public.profiles (lower(username));
alter table public.profiles enable row level security;

drop policy if exists "profiles: anyone can read" on public.profiles;
create policy "profiles: anyone can read" on public.profiles for select using (true);
drop policy if exists "profiles: create your own" on public.profiles;
create policy "profiles: create your own" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
drop policy if exists "profiles: rename your own" on public.profiles;
create policy "profiles: rename your own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------- follows
create table if not exists public.follows (
  follower uuid not null references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee on public.follows (followee);
alter table public.follows enable row level security;

drop policy if exists "follows: anyone can read" on public.follows;
create policy "follows: anyone can read" on public.follows for select using (true);
drop policy if exists "follows: follow as yourself" on public.follows;
create policy "follows: follow as yourself" on public.follows for insert to authenticated
  with check (follower = (select auth.uid()));
drop policy if exists "follows: unfollow as yourself" on public.follows;
create policy "follows: unfollow as yourself" on public.follows for delete to authenticated
  using (follower = (select auth.uid()));

-- ---------------------------------------------------------------- games
-- time_control: {"type":"none"} | {"type":"live","base":<s>,"inc":<s>} | {"type":"daily","days":<n>}
-- Live clocks start once each side has made its first move (as on chess.com);
-- until then either player may abort.
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('online', 'local')),
  white uuid references public.profiles (id) on delete set null,
  black uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  status text not null default 'pending' check (status in ('pending', 'active', 'finished', 'aborted', 'declined')),
  rules jsonb not null default '{"mode":"classic"}',
  time_control jsonb not null default '{"type":"none"}',
  moves jsonb not null default '[]' check (jsonb_typeof(moves) = 'array' and jsonb_array_length(moves) <= 3000),
  white_ms bigint,
  black_ms bigint,
  turn_started_at timestamptz,
  result text check (result in ('white', 'black', 'draw')),
  reason text check (char_length(reason) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists games_white on public.games (white, updated_at desc);
create index if not exists games_black on public.games (black, updated_at desc);
alter table public.games enable row level security;

drop policy if exists "games: online games are public, local ones private" on public.games;
create policy "games: online games are public, local ones private" on public.games for select
  using (kind = 'online' or created_by = (select auth.uid()));
-- Local games are a personal record: the owner may save and update them directly.
drop policy if exists "games: save your local games" on public.games;
create policy "games: save your local games" on public.games for insert to authenticated
  with check (kind = 'local' and created_by = (select auth.uid()) and white = created_by and black = created_by);
drop policy if exists "games: update your local games" on public.games;
create policy "games: update your local games" on public.games for update to authenticated
  using (kind = 'local' and created_by = (select auth.uid()))
  with check (kind = 'local' and created_by = (select auth.uid()) and white = created_by and black = created_by);
drop policy if exists "games: delete your local games" on public.games;
create policy "games: delete your local games" on public.games for delete to authenticated
  using (kind = 'local' and created_by = (select auth.uid()));

-- Live updates for players watching a game.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'games') then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.server_time() returns timestamptz
language sql stable as $$ select now() $$;

-- Validate and normalise a time control, raising on anything unexpected.
create or replace function public.cc_time_control(tc jsonb) returns jsonb
language plpgsql immutable as $$
declare
  t text := coalesce(tc ->> 'type', 'none');
  base int; inc int; days int;
begin
  if t = 'none' then
    return '{"type":"none"}';
  elsif t = 'live' then
    base := (tc ->> 'base')::int; inc := coalesce((tc ->> 'inc')::int, 0);
    if base is null or base < 15 or base > 10800 or inc < 0 or inc > 180 then
      raise exception 'invalid live time control';
    end if;
    return jsonb_build_object('type', 'live', 'base', base, 'inc', inc);
  elsif t = 'daily' then
    days := (tc ->> 'days')::int;
    if days is null or days not in (1, 2, 3, 5, 7, 14) then raise exception 'invalid daily time control'; end if;
    return jsonb_build_object('type', 'daily', 'days', days);
  end if;
  raise exception 'invalid time control';
end $$;

create or replace function public.cc_rules(r jsonb) returns jsonb
language plpgsql immutable as $$
begin
  if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'mode', 'classic') not in ('classic', 'relative') then
    raise exception 'invalid rules';
  end if;
  -- Keep the mode plus known toggles with boolean values.
  return jsonb_build_object('mode', coalesce(r ->> 'mode', 'classic')) ||
    coalesce((select jsonb_object_agg(key, value) from jsonb_each(r)
              where key in ('rookDiagonals', 'gridLines', 'pawnsAnyFacing', 'bishopFacing', 'knightFacing')
                and jsonb_typeof(value) = 'boolean'), '{}');
end $$;

-- Milliseconds the side to move has left right now (null when unclocked).
create or replace function public.cc_time_left(g public.games) returns bigint
language plpgsql stable as $$
declare
  ply int := jsonb_array_length(g.moves);
  white_to_move boolean := ply % 2 = 0;
  elapsed bigint := (extract(epoch from (now() - g.turn_started_at)) * 1000)::bigint;
begin
  if g.time_control ->> 'type' = 'live' then
    if ply < 2 then return case when white_to_move then g.white_ms else g.black_ms end; end if;
    return (case when white_to_move then g.white_ms else g.black_ms end) - elapsed;
  elsif g.time_control ->> 'type' = 'daily' then
    return (g.time_control ->> 'days')::bigint * 86400000 - elapsed;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- game functions
-- Challenge another player. my_color: 'white', 'black' or 'random'.
create or replace function public.challenge(opponent uuid, my_color text, rules jsonb, time_control jsonb)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  as_white boolean;
  g public.games;
begin
  if me is null then raise exception 'sign in first'; end if;
  if opponent = me then raise exception 'you cannot challenge yourself'; end if;
  if not exists (select 1 from profiles where id = opponent) then raise exception 'no such player'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception 'choose a username first'; end if;
  if (select count(*) from games where created_by = me and status = 'pending') >= 20 then
    raise exception 'too many open challenges';
  end if;
  as_white := case my_color when 'white' then true when 'black' then false else random() < 0.5 end;
  insert into games (kind, white, black, created_by, status, rules, time_control)
  values ('online', case when as_white then me else opponent end, case when as_white then opponent else me end,
          me, 'pending', cc_rules(rules), cc_time_control(time_control))
  returning * into g;
  return g;
end $$;

create or replace function public.answer_challenge(game_id uuid, accept boolean)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  g public.games;
begin
  select * into g from games where id = game_id for update;
  if g.id is null or g.status <> 'pending' or me not in (g.white, g.black) then raise exception 'no such challenge'; end if;
  if not accept then
    update games set status = 'declined', updated_at = now() where id = game_id returning * into g;
    return g;
  end if;
  if me = g.created_by then raise exception 'wait for your opponent to accept'; end if;
  update games set status = 'active', updated_at = now(), turn_started_at = now(),
    white_ms = case when time_control ->> 'type' = 'live' then (time_control ->> 'base')::bigint * 1000 end,
    black_ms = case when time_control ->> 'type' = 'live' then (time_control ->> 'base')::bigint * 1000 end
  where id = game_id returning * into g;
  return g;
end $$;

-- Play a move. ply must be the number of moves already played. The mover's
-- browser may also report a result its move produced (checkmate, stalemate,
-- insufficient material, 50-move rule).
create or replace function public.make_move(game_id uuid, ply int, move jsonb, claim_result text default null, claim_reason text default null)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  g public.games;
  white_moves boolean;
  mover uuid;
  left_ms bigint;
  inc_ms bigint;
begin
  select * into g from games where id = game_id for update;
  if g.id is null or g.kind <> 'online' then raise exception 'no such game'; end if;
  if g.status <> 'active' then raise exception 'game is over'; end if;
  if ply <> jsonb_array_length(g.moves) then raise exception 'out of sync'; end if;
  white_moves := ply % 2 = 0;
  mover := case when white_moves then g.white else g.black end;
  if me is null or me <> mover then raise exception 'not your turn'; end if;
  if jsonb_typeof(move) <> 'object'
     or (move ->> 'from')::int not between 0 and 511 or (move ->> 'to')::int not between 0 and 511
     or coalesce(move ->> 'promo', 'Q') not in ('Q', 'R', 'B', 'N')
     or (move ? 'face' and (jsonb_typeof(move -> 'face') <> 'array' or jsonb_array_length(move -> 'face') <> 4))
     or length(move::text) > 200 then
    raise exception 'bad move';
  end if;

  -- The server keeps the clock: out of time means the move does not count.
  left_ms := cc_time_left(g);
  if left_ms is not null and left_ms <= 0 then
    update games set status = 'finished', result = case when white_moves then 'black' else 'white' end,
      reason = 'timeout', updated_at = now() where id = game_id returning * into g;
    return g;
  end if;
  if g.time_control ->> 'type' = 'live' then
    inc_ms := coalesce((g.time_control ->> 'inc')::bigint, 0) * 1000;
    if white_moves then g.white_ms := left_ms + case when ply >= 2 then inc_ms else 0 end;
    else g.black_ms := left_ms + case when ply >= 2 then inc_ms else 0 end; end if;
  end if;

  update games set moves = moves || jsonb_build_array(move - 'label' - 'captured'),
    white_ms = g.white_ms, black_ms = g.black_ms, turn_started_at = now(), updated_at = now()
  where id = game_id returning * into g;

  if claim_result is not null then
    if claim_result = 'draw' and claim_reason in ('stalemate', 'insufficient material', '50-move rule')
       or claim_result = (case when white_moves then 'white' else 'black' end) and claim_reason = 'checkmate' then
      update games set status = 'finished', result = claim_result, reason = claim_reason
      where id = game_id returning * into g;
    else
      raise exception 'bad result claim';
    end if;
  end if;
  return g;
end $$;

create or replace function public.resign(game_id uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  select * into g from games where id = game_id for update;
  if g.id is null or g.status <> 'active' or me not in (g.white, g.black) then raise exception 'no such game'; end if;
  update games set status = 'finished', result = case when me = g.white then 'black' else 'white' end,
    reason = 'resignation', updated_at = now() where id = game_id returning * into g;
  return g;
end $$;

-- Before both sides have moved, either player may abort (not counted in stats).
create or replace function public.abort_game(game_id uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  select * into g from games where id = game_id for update;
  if g.id is null or g.status <> 'active' or me not in (g.white, g.black) then raise exception 'no such game'; end if;
  if jsonb_array_length(g.moves) >= 2 then raise exception 'too late to abort'; end if;
  update games set status = 'aborted', updated_at = now() where id = game_id returning * into g;
  return g;
end $$;

-- Either player may ask the server to end a game whose side to move is out of
-- time. As on chess.com, it is a draw if the player who still has time cannot
-- possibly checkmate (their browser reports that).
create or replace function public.claim_timeout(game_id uuid, winner_can_mate boolean default true)
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; white_flagged boolean;
begin
  select * into g from games where id = game_id for update;
  if g.id is null or g.status <> 'active' or me not in (g.white, g.black) then raise exception 'no such game'; end if;
  if coalesce(cc_time_left(g), 1) > 0 then return g; end if; -- not out of time (yet)
  white_flagged := jsonb_array_length(g.moves) % 2 = 0;
  update games set status = 'finished', updated_at = now(),
    result = case when not winner_can_mate then 'draw' when white_flagged then 'black' else 'white' end,
    reason = case when winner_can_mate then 'timeout' else 'timeout vs insufficient material' end
  where id = game_id returning * into g;
  return g;
end $$;

-- Functions are for signed-in players only.
revoke execute on function public.challenge(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.answer_challenge(uuid, boolean) from public, anon;
revoke execute on function public.make_move(uuid, int, jsonb, text, text) from public, anon;
revoke execute on function public.resign(uuid) from public, anon;
revoke execute on function public.abort_game(uuid) from public, anon;
revoke execute on function public.claim_timeout(uuid, boolean) from public, anon;
grant execute on function public.challenge(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.answer_challenge(uuid, boolean) to authenticated;
grant execute on function public.make_move(uuid, int, jsonb, text, text) to authenticated;
grant execute on function public.resign(uuid) to authenticated;
grant execute on function public.abort_game(uuid) to authenticated;
grant execute on function public.claim_timeout(uuid, boolean) to authenticated;
grant execute on function public.server_time() to anon, authenticated;
