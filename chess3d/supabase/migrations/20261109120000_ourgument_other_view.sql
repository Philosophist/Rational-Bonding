-- Ourgument: an "Other" view, where people say it in their own words
-- (Steve, 2026-11-09). The words are private like the rest of a view, shown
-- only when the view is shared, and kept in the dated history. The public
-- totals count "Other" without the words. Safe to run more than once.

alter table public.rs_ratings drop constraint if exists rs_ratings_stance_check;
alter table public.rs_ratings add constraint rs_ratings_stance_check
  check (stance in ('agree', 'disagree', 'unknown', 'incomprehensible', 'dontcare', 'noopinion', 'other'));

alter table public.rs_ratings add column if not exists other_text text;
alter table public.rs_ratings drop constraint if exists rs_ratings_other_text_check;
alter table public.rs_ratings add constraint rs_ratings_other_text_check
  check (other_text is null or (stance = 'other' and char_length(other_text) between 1 and 200));
alter table public.rs_rating_history add column if not exists other_text text;

alter table public.rs_post_stats add column if not exists other int not null default 0;

create or replace function public.rs_ratings_track() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p uuid := coalesce(new.post_id, old.post_id);
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or (new.stance, new.confidence, new.relevance, new.other_text) is distinct from (old.stance, old.confidence, old.relevance, old.other_text) then
      insert into public.rs_rating_history (user_id, post_id, stance, confidence, relevance, other_text)
      values (new.user_id, new.post_id, new.stance, new.confidence, new.relevance, new.other_text);
    end if;
  end if;
  if exists (select 1 from public.rs_posts where id = p) then
    insert into public.rs_post_stats as s (post_id, agree, disagree, unknown, incomprehensible, dontcare, noopinion, other, raters, confidence_avg)
    select p,
      count(*) filter (where stance = 'agree'),
      count(*) filter (where stance = 'disagree'),
      count(*) filter (where stance = 'unknown'),
      count(*) filter (where stance = 'incomprehensible'),
      count(*) filter (where stance = 'dontcare'),
      count(*) filter (where stance = 'noopinion'),
      count(*) filter (where stance = 'other'),
      count(*) filter (where stance is not null),
      avg(confidence)
    from public.rs_ratings where post_id = p
    on conflict (post_id) do update set
      agree = excluded.agree, disagree = excluded.disagree, unknown = excluded.unknown,
      incomprehensible = excluded.incomprehensible, dontcare = excluded.dontcare, noopinion = excluded.noopinion, other = excluded.other,
      raters = excluded.raters, confidence_avg = excluded.confidence_avg;
  end if;
  return null;
end;
$$;
