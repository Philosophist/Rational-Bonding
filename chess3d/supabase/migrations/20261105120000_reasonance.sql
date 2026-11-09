-- Reasonance (rationalbonding.com/reasonance): shared posts, private ratings
-- with a dated belief history, public totals, and private saved maps.
--
-- Applied automatically when it reaches master (see ../../SETUP.md), or paste
-- it into the dashboard's SQL Editor. Safe to run more than once. Later
-- changes go in new, later-dated files; never edit this one after it has run.
--
-- Security model
--   * Row level security is on for every table.
--   * Posts (statements and the arrows between them) are public to read, like
--     any social post. Only the author can change or delete one, and its words
--     and arrow type freeze as soon as anyone else has rated it, so nobody can
--     change what people agreed or disagreed with.
--   * Every post is unique: the same statement (ignoring case, spacing and
--     end punctuation), or the same arrow between the same two posts, can be
--     posted only once. Later posters reuse it, or say something different.
--   * Posts show their author's username unless the author chose to post
--     anonymously. The author column itself can't be read by anyone; the
--     public `byline` column holds it only for posts that aren't anonymous.
--   * A post can't be deleted while someone else has rated it, and an arrow
--     pointing at it keeps it alive (the arrow must go first).
--   * Ratings are private unless the rater shares that one (`public`), or
--     sets sharing as their default (rs_settings). Rating history is always
--     private. The totals per post (rs_post_stats) are public, kept by the
--     database itself.
--   * Saved maps (a person's sandbox, including unposted drafts) are private.
--   * A light limit stops any one account posting more than 300 posts an hour.

-- ---------------------------------------------------------------- posts
create table if not exists public.rs_posts (
  id uuid primary key default gen_random_uuid(),
  -- The account that wrote it. If the account is deleted, the post stays,
  -- unsigned, because other people's arguments may rest on it.
  author uuid references public.profiles (id) on delete set null default auth.uid(),
  kind text not null check (kind in ('node', 'edge')),
  type text not null,
  -- A statement's words, or a fallacy's definition ("...is when an argument ...").
  text text not null default '' check (char_length(text) <= 2000),
  fallacy text check (fallacy is null or char_length(fallacy) <= 100),
  -- An arrow runs from a claim (from_post) out to its reason (to_post).
  -- Either end may itself be an arrow.
  from_post uuid references public.rs_posts (id) on delete restrict,
  to_post uuid references public.rs_posts (id) on delete restrict,
  premise text check (premise is null or char_length(premise) <= 12),
  -- Posted without a name: byline stays empty.
  anonymous boolean not null default false,
  -- The author, shown publicly; null for anonymous posts. Set by the database.
  byline uuid,
  -- What makes the post unique (see rs_post_key). Set by the database.
  ukey text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  check (
    (kind = 'node' and from_post is null and to_post is null
      and type in ('statement', 'question', 'clarification', 'combiner', 'axiom', 'fallacy'))
    or
    (kind = 'edge' and from_post is not null and to_post is not null and from_post <> to_post
      and type in ('support', 'contention', 'question', 'clarification', 'premise', 'example',
                   'same', 'contradicts', 'exclusive', 'necessary'))
  )
);
create index if not exists rs_posts_author on public.rs_posts (author, created_at desc);
create index if not exists rs_posts_from on public.rs_posts (from_post);
create index if not exists rs_posts_to on public.rs_posts (to_post);
create unique index if not exists rs_posts_ukey on public.rs_posts (ukey);
create index if not exists rs_posts_words on public.rs_posts using gin (to_tsvector('english', text));
alter table public.rs_posts enable row level security;
-- Everything but the author column is public to read.
revoke select on public.rs_posts from anon, authenticated;
grant select (id, kind, type, text, fallacy, from_post, to_post, premise, anonymous, byline, ukey, created_at, edited_at)
  on public.rs_posts to anon, authenticated;

-- ---------------------------------------------------------------- ratings
create table if not exists public.rs_ratings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.rs_posts (id) on delete cascade,
  stance text check (stance in ('agree', 'disagree', 'unknown', 'incomprehensible')),
  confidence numeric check (confidence between 0 and 100),
  relevance smallint check (relevance between 1 and 5),
  -- Shared publicly by the rater (off unless they choose it).
  public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists rs_ratings_post on public.rs_ratings (post_id);
alter table public.rs_ratings enable row level security;

-- Every change to a rating, with its time: "you agreed on 3 Mar, then disagreed on 9 Nov".
create table if not exists public.rs_rating_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.rs_posts (id) on delete cascade,
  stance text,
  confidence numeric,
  relevance smallint,
  at timestamptz not null default now()
);
create index if not exists rs_rating_history_mine on public.rs_rating_history (user_id, post_id, at);
alter table public.rs_rating_history enable row level security;

-- Public totals per post.
create table if not exists public.rs_post_stats (
  post_id uuid primary key references public.rs_posts (id) on delete cascade,
  agree int not null default 0,
  disagree int not null default 0,
  unknown int not null default 0,
  incomprehensible int not null default 0,
  raters int not null default 0,
  confidence_avg numeric
);
alter table public.rs_post_stats enable row level security;

-- A person's Reasonance settings.
create table if not exists public.rs_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Share new ratings publicly unless turned off on the post.
  share_views boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.rs_settings enable row level security;

-- ---------------------------------------------------------------- maps
-- A person's saved sandbox, in the editor's own format. Posted items carry
-- the id of their rs_posts row; drafts live only here.
create table if not exists public.rs_maps (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9]{1,40}$'),
  title text not null default '' check (char_length(title) <= 200),
  data jsonb not null check (octet_length(data::text) <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);
alter table public.rs_maps enable row level security;

-- ---------------------------------------------------------------- helpers
-- A statement's words in a standard form: lower case, single spaces, curly
-- quotes made straight, and no quotes or end punctuation around it.
create or replace function public.rs_norm(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(
    regexp_replace(lower(translate(coalesce(t, ''), '‘’“”', '''''""')), '\s+', ' ', 'g'),
    '^[ "'']+|[ "''.!?;:,…]+$', '', 'g');
$$;

-- What makes a post unique. Statements, axioms and clarifications share words
-- (the same words are the same statement); questions are their own; a
-- fallacy is its name plus its definition; combined-premises nodes are
-- defined by their premises, so they aren't compared. An arrow is its type
-- and its two ends, in either order for the two-way types.
create or replace function public.rs_post_key(k text, ty text, tx text, fa text, a uuid, b uuid) returns text
language sql immutable set search_path = public as $$
  select case
    when k = 'node' and ty = 'fallacy' then 'f:' || public.rs_norm(fa) || '|' || public.rs_norm(tx)
    when k = 'node' and ty = 'combiner' then null
    when k = 'node' then (case when ty = 'question' then 'q:' else 's:' end) || public.rs_norm(tx)
    when ty in ('same', 'contradicts', 'exclusive', 'necessary')
      then 'e:' || ty || ':' || least(a::text, b::text) || ':' || greatest(a::text, b::text)
    else 'e:' || ty || ':' || a::text || ':' || b::text
  end;
$$;

-- The post that already says this, if any (an arrow to a fallacy counts as
-- an example, as it would be posted).
create or replace function public.rs_find(k text, ty text, tx text, fa text, a uuid, b uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.rs_posts where ukey = public.rs_post_key(k,
    case when k = 'edge' and exists (select 1 from public.rs_posts f where f.id = b and f.kind = 'node' and f.type = 'fallacy')
      then 'example' else ty end, tx, fa, a, b);
$$;

-- Posted statements that share most of their words with q, best first, for
-- "is this what you mean?" suggestions and for search.
create or replace function public.rs_similar(q text, min_score real default 0.5, lim int default 8)
returns table (id uuid, type text, text text, fallacy text, byline uuid, score real)
language sql stable security definer set search_path = public as $$
  with w as (
    select array(select distinct unnest(tsvector_to_array(to_tsvector('english', q)))) as ql
  ), c as (
    select p.*, array(select distinct unnest(tsvector_to_array(to_tsvector('english', p.text)))) as pl
    from public.rs_posts p, w
    where p.kind = 'node' and cardinality(w.ql) > 0
      and to_tsvector('english', p.text) @@ array_to_string(array(select quote_literal(x) from unnest(w.ql) x), ' | ')::tsquery
  )
  select c.id, c.type, c.text, c.fallacy, c.byline,
    ((select count(*) from unnest(c.pl) x where x = any(w.ql))::real / greatest(cardinality(w.ql), cardinality(c.pl), 1)) as score
  from c, w
  order by score desc, c.created_at
  limit least(greatest(lim, 1), 50);
$$;

-- Which of these posts are yours (the author column itself isn't readable).
create or replace function public.rs_mine(ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.rs_posts where id = any(ids) and author = auth.uid();
$$;

-- Whether anyone other than the author has rated a post. Security definer,
-- because ratings are private and a plain query would only see your own.
create or replace function public.rs_rated_by_others(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rs_ratings r join public.rs_posts x on x.id = r.post_id
    where r.post_id = p and r.user_id is distinct from x.author
  );
$$;

-- Checks every post written or changed.
create or replace function public.rs_posts_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a public.rs_posts;
  b public.rs_posts;
begin
  if tg_op = 'INSERT' then
    if new.author is distinct from auth.uid() and auth.uid() is not null then
      raise exception 'You can only post as yourself.';
    end if;
    if auth.uid() is not null and (
      select count(*) from public.rs_posts where author = auth.uid() and created_at > now() - interval '1 hour'
    ) >= 300 then
      raise exception 'That is a lot of posting. Please wait a while before posting more.';
    end if;
    new.created_at := now();
    new.edited_at := null;
    new.anonymous := coalesce(new.anonymous, false);
  else
    if new.id <> old.id or new.author is distinct from old.author or new.kind <> old.kind
       or new.created_at <> old.created_at then
      raise exception 'A post''s id, author, kind and time can''t change.';
    end if;
    -- Flipping an arrow is fine; pointing it at different posts is not.
    if new.kind = 'edge' and not (
      (new.from_post = old.from_post and new.to_post = old.to_post) or
      (new.from_post = old.to_post and new.to_post = old.from_post)
    ) then
      raise exception 'An arrow can''t be moved to different posts. Delete it and draw a new one.';
    end if;
    if (new.text, new.type, new.fallacy, new.premise, new.from_post) is distinct from
       (old.text, old.type, old.fallacy, old.premise, old.from_post) then
      if public.rs_rated_by_others(old.id) then
        raise exception 'Someone else has rated this post, so it can''t change now. Post a revision instead.';
      end if;
      new.edited_at := now();
    end if;
  end if;

  if new.kind = 'node' then
    if new.type = 'fallacy' and coalesce(new.fallacy, '') = '' then
      raise exception 'A fallacy needs a name.';
    end if;
    if new.type <> 'fallacy' then new.fallacy := null; end if;
    new.premise := null;
  else
    select * into a from public.rs_posts where id = new.from_post;
    select * into b from public.rs_posts where id = new.to_post;
    if a.id is null or b.id is null then raise exception 'Both ends of an arrow must be posted first.'; end if;
    if b.kind = 'node' and b.type = 'fallacy' then new.type := 'example'; end if;
    if new.type = 'example' and not (b.kind = 'node' and b.type = 'fallacy') then
      raise exception '"Fallacy" arrows must point at a fallacy.';
    end if;
    if new.type = 'premise' and not (a.kind = 'node' and a.type = 'combiner') then
      raise exception 'Premise arrows start at a combined-premises node.';
    end if;
    if new.type <> 'premise' then new.premise := null; end if;
    new.text := '';
    new.fallacy := null;
  end if;

  if new.kind = 'node' and new.type not in ('combiner', 'fallacy') and public.rs_norm(new.text) = '' then
    raise exception 'Write the statement before posting it.';
  end if;
  new.byline := case when new.anonymous then null else new.author end;
  new.ukey := public.rs_post_key(new.kind, new.type, new.text, new.fallacy, new.from_post, new.to_post);
  if new.ukey is not null and exists (select 1 from public.rs_posts where ukey = new.ukey and id <> new.id) then
    raise exception 'That has already been posted. Use the existing post, or clarify how yours is different.'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists rs_posts_check on public.rs_posts;
create trigger rs_posts_check before insert or update on public.rs_posts
  for each row execute function public.rs_posts_check();

-- Keeps the history and the public totals up to date.
create or replace function public.rs_ratings_track() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p uuid := coalesce(new.post_id, old.post_id);
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or (new.stance, new.confidence, new.relevance) is distinct from (old.stance, old.confidence, old.relevance) then
      insert into public.rs_rating_history (user_id, post_id, stance, confidence, relevance)
      values (new.user_id, new.post_id, new.stance, new.confidence, new.relevance);
    end if;
  end if;
  if exists (select 1 from public.rs_posts where id = p) then
    insert into public.rs_post_stats as s (post_id, agree, disagree, unknown, incomprehensible, raters, confidence_avg)
    select p,
      count(*) filter (where stance = 'agree'),
      count(*) filter (where stance = 'disagree'),
      count(*) filter (where stance = 'unknown'),
      count(*) filter (where stance = 'incomprehensible'),
      count(*) filter (where stance is not null),
      avg(confidence)
    from public.rs_ratings where post_id = p
    on conflict (post_id) do update set
      agree = excluded.agree, disagree = excluded.disagree, unknown = excluded.unknown,
      incomprehensible = excluded.incomprehensible, raters = excluded.raters,
      confidence_avg = excluded.confidence_avg;
  end if;
  return null;
end;
$$;
drop trigger if exists rs_ratings_track on public.rs_ratings;
create trigger rs_ratings_track after insert or update or delete on public.rs_ratings
  for each row execute function public.rs_ratings_track();

create or replace function public.rs_ratings_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists rs_ratings_stamp on public.rs_ratings;
create trigger rs_ratings_stamp before insert or update on public.rs_ratings
  for each row execute function public.rs_ratings_stamp();

drop trigger if exists rs_settings_stamp on public.rs_settings;
create trigger rs_settings_stamp before insert or update on public.rs_settings
  for each row execute function public.rs_ratings_stamp();

drop trigger if exists rs_maps_stamp on public.rs_maps;
create trigger rs_maps_stamp before insert or update on public.rs_maps
  for each row execute function public.rs_ratings_stamp();

-- ---------------------------------------------------------------- policies
drop policy if exists "rs_posts: anyone can read" on public.rs_posts;
create policy "rs_posts: anyone can read" on public.rs_posts for select using (true);
drop policy if exists "rs_posts: post as yourself" on public.rs_posts;
create policy "rs_posts: post as yourself" on public.rs_posts for insert to authenticated
  with check (author = (select auth.uid()));
drop policy if exists "rs_posts: edit your own" on public.rs_posts;
create policy "rs_posts: edit your own" on public.rs_posts for update to authenticated
  using (author = (select auth.uid())) with check (author = (select auth.uid()));
drop policy if exists "rs_posts: delete your own until others rate it" on public.rs_posts;
create policy "rs_posts: delete your own until others rate it" on public.rs_posts for delete to authenticated
  using (author = (select auth.uid()) and not public.rs_rated_by_others(id));

drop policy if exists "rs_ratings: your own only" on public.rs_ratings;
create policy "rs_ratings: your own only" on public.rs_ratings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "rs_ratings: anyone can read shared ones" on public.rs_ratings;
create policy "rs_ratings: anyone can read shared ones" on public.rs_ratings for select
  using (public);

drop policy if exists "rs_settings: your own only" on public.rs_settings;
create policy "rs_settings: your own only" on public.rs_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "rs_rating_history: read your own" on public.rs_rating_history;
create policy "rs_rating_history: read your own" on public.rs_rating_history for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "rs_rating_history: delete your own" on public.rs_rating_history;
create policy "rs_rating_history: delete your own" on public.rs_rating_history for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "rs_post_stats: anyone can read" on public.rs_post_stats;
create policy "rs_post_stats: anyone can read" on public.rs_post_stats for select using (true);

drop policy if exists "rs_maps: your own only" on public.rs_maps;
create policy "rs_maps: your own only" on public.rs_maps for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
