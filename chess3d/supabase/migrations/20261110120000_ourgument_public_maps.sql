-- Ourgument: maps you choose to share publicly.
--
-- Your own maps (rs_maps) stay private: they hold your views and their
-- history. Sharing a map writes a separate public copy here with only its
-- posts, arrows and layout (the app strips your views before sending it).
-- Anyone can read the copies; only the owner can write or remove theirs.
-- They show on the owner's profile and in followers' home feeds.

create table if not exists public.rs_public_maps (
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9]{1,40}$'),
  title text not null default '' check (char_length(title) <= 200),
  data jsonb not null check (octet_length(data::text) <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);
create index if not exists rs_public_maps_recent on public.rs_public_maps (owner, updated_at desc);
alter table public.rs_public_maps enable row level security;

-- A copy can't carry anyone's views: the app never sends them, and this
-- refuses any that slip through.
alter table public.rs_public_maps drop constraint if exists rs_public_maps_no_views;
alter table public.rs_public_maps add constraint rs_public_maps_no_views
  check (position('"rating"' in data::text) = 0 and position('"history"' in data::text) = 0);

drop trigger if exists rs_public_maps_stamp on public.rs_public_maps;
create trigger rs_public_maps_stamp before insert or update on public.rs_public_maps
  for each row execute function public.rs_ratings_stamp();

drop policy if exists "rs_public_maps: anyone can read" on public.rs_public_maps;
create policy "rs_public_maps: anyone can read" on public.rs_public_maps for select using (true);
drop policy if exists "rs_public_maps: share your own" on public.rs_public_maps;
create policy "rs_public_maps: share your own" on public.rs_public_maps for insert to authenticated
  with check (owner = (select auth.uid()));
drop policy if exists "rs_public_maps: update your own" on public.rs_public_maps;
create policy "rs_public_maps: update your own" on public.rs_public_maps for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "rs_public_maps: unshare your own" on public.rs_public_maps;
create policy "rs_public_maps: unshare your own" on public.rs_public_maps for delete to authenticated
  using (owner = (select auth.uid()));

grant select on public.rs_public_maps to anon, authenticated;
grant insert, update, delete on public.rs_public_maps to authenticated;

-- The home feed lists shared views by the people you follow, newest first.
create index if not exists rs_ratings_shared_recent on public.rs_ratings (user_id, updated_at desc) where public;
