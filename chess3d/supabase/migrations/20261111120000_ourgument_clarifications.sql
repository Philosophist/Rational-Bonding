-- Ourgument: clarifications (Steve, 2026-11-11).
--
-- A clarification says what a post means. It isn't a claim, so nobody gives
-- it a position, confidence or stars, and only the author of a post can
-- clarify it. Anyone can still support, contend or question the arrow between
-- a post and its clarification.

-- Only a post's author can draw a clarification arrow from it. Runs as the
-- table owner because the author column can't be read by users.
create or replace function public.rs_clarify_own() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'edge' and new.type = 'clarification'
     and (tg_op = 'INSERT' or old.type is distinct from new.type or old.from_post is distinct from new.from_post)
     and not exists (select 1 from public.rs_posts where id = new.from_post and author = new.author) then
    raise exception 'Only the author of a post can clarify it. You can support, contend or question it instead.';
  end if;
  return new;
end;
$$;
drop trigger if exists rs_posts_clarify_own on public.rs_posts;
create trigger rs_posts_clarify_own before insert or update on public.rs_posts
  for each row execute function public.rs_clarify_own();

-- No views on clarifications (statements or arrows).
create or replace function public.rs_no_views_on_clarifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.rs_posts where id = new.post_id and type = 'clarification') then
    raise exception 'A clarification takes no position, confidence or stars. Respond to its arrow instead.';
  end if;
  return new;
end;
$$;
drop trigger if exists rs_ratings_no_clarifications on public.rs_ratings;
create trigger rs_ratings_no_clarifications before insert or update on public.rs_ratings
  for each row execute function public.rs_no_views_on_clarifications();

-- Views already given on clarifications are removed (their totals recount).
delete from public.rs_ratings r using public.rs_posts p where p.id = r.post_id and p.type = 'clarification';
