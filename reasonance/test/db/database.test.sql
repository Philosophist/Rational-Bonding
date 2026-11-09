\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','a@x'),('00000000-0000-0000-0000-00000000000b','b@x'),('00000000-0000-0000-0000-00000000000c','c@x');
insert into profiles (id, username) values ('00000000-0000-0000-0000-00000000000a','alice'),('00000000-0000-0000-0000-00000000000b','bob');
create or replace function pg_temp.expect_fail(q text, pat text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm !~* pat then raise exception 'wrong error for %: %', q, sqlerrm; end if;
    raise notice 'ok (refused): %', sqlerrm; return; end;
  raise exception 'expected failure: %', q;
end $$;
grant execute on function pg_temp.expect_fail(text,text) to authenticated, anon;

-- alice posts
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into rs_posts (id, kind, type, text) values ('10000000-0000-0000-0000-000000000001','node','statement','It rained.');
insert into rs_posts (id, kind, type, text) values ('10000000-0000-0000-0000-000000000002','node','statement','The sidewalk is wet.');
insert into rs_posts (id, kind, type, from_post, to_post) values ('10000000-0000-0000-0000-000000000003','edge','support','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
insert into rs_posts (id, kind, type, fallacy, text) values ('10000000-0000-0000-0000-000000000004','node','fallacy','Ad hominem','attacks the person.');
-- arrow to a fallacy becomes an example, even on an arrow
insert into rs_posts (id, kind, type, from_post, to_post) values ('10000000-0000-0000-0000-000000000005','edge','contention','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, author, text) values ('node','statement','00000000-0000-0000-0000-00000000000b','fake')$q$, 'row-level|yourself');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, from_post, to_post) values ('edge','premise','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')$q$, 'combined');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, from_post, to_post) values ('edge','example','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')$q$, 'fallacy');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, text) values ('node','statement', repeat('x', 2001))$q$, 'check');
select pg_temp.expect_fail($q$update rs_posts set to_post='10000000-0000-0000-0000-000000000004' where id='10000000-0000-0000-0000-000000000003'$q$, 'moved');
-- flipping is allowed; editing own unrated post is allowed
update rs_posts set from_post='10000000-0000-0000-0000-000000000002', to_post='10000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000003';
update rs_posts set from_post='10000000-0000-0000-0000-000000000001', to_post='10000000-0000-0000-0000-000000000002' where id='10000000-0000-0000-0000-000000000003';
update rs_posts set text='It rained last night.' where id='10000000-0000-0000-0000-000000000001';
-- alice rates her own post: still editable
insert into rs_ratings (post_id, stance, confidence) values ('10000000-0000-0000-0000-000000000001','agree',90);
update rs_posts set text='It rained last night!' where id='10000000-0000-0000-0000-000000000001';
insert into rs_maps (id, title, data) values ('m1','Rain','{"items":{}}');

-- bob: can read posts and stats, not alice's ratings, history or maps; can't edit alice's posts
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from rs_posts) <> 5 then raise exception 'bob should see 5 posts'; end if;
  if (select count(*) from rs_ratings) <> 0 then raise exception 'ratings leaked'; end if;
  if (select count(*) from rs_rating_history) <> 0 then raise exception 'history leaked'; end if;
  if (select count(*) from rs_maps) <> 0 then raise exception 'maps leaked'; end if;
  if (select raters from rs_post_stats where post_id='10000000-0000-0000-0000-000000000001') <> 1 then raise exception 'stats wrong'; end if;
  if (select type from rs_posts where id='10000000-0000-0000-0000-000000000005') <> 'example' then raise exception 'fallacy arrow not example'; end if;
end $$;
update rs_posts set text='hacked' where id='10000000-0000-0000-0000-000000000001'; -- silently matches 0 rows under RLS
delete from rs_posts where id='10000000-0000-0000-0000-000000000002';
select pg_temp.expect_fail($q$insert into rs_ratings (user_id, post_id, stance) values ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000002','agree')$q$, 'row-level');
insert into rs_ratings (post_id, stance, confidence) values ('10000000-0000-0000-0000-000000000001','disagree',40);
update rs_ratings set stance='agree' where post_id='10000000-0000-0000-0000-000000000001';
update rs_ratings set stance='agree' where post_id='10000000-0000-0000-0000-000000000001'; -- no change, no new history row
do $$ begin
  if (select count(*) from rs_rating_history) <> 2 then raise exception 'bob should have 2 history rows, has %', (select count(*) from rs_rating_history); end if;
  if (select agree from rs_post_stats where post_id='10000000-0000-0000-0000-000000000001') <> 2 then raise exception 'agree count wrong'; end if;
  if (select confidence_avg from rs_post_stats where post_id='10000000-0000-0000-0000-000000000001') <> 65 then raise exception 'avg wrong'; end if;
end $$;
-- carol has no username yet: can't post
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, text) values ('node','statement','hi')$q$, 'foreign key|violates');

-- alice: frozen now that bob rated it, and can't delete it
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin if (select text from rs_posts where id='10000000-0000-0000-0000-000000000001') <> 'It rained last night!' then raise exception 'bob changed alice''s post'; end if;
  if not exists (select 1 from rs_posts where id='10000000-0000-0000-0000-000000000002') then raise exception 'bob deleted alice''s post'; end if; end $$;
select pg_temp.expect_fail($q$update rs_posts set text='changed' where id='10000000-0000-0000-0000-000000000001'$q$, 'rated');
delete from rs_posts where id='10000000-0000-0000-0000-000000000001';
do $$ begin if not exists (select 1 from rs_posts where id='10000000-0000-0000-0000-000000000001') then raise exception 'rated post was deleted'; end if; end $$;
-- unrated post with an arrow on it can't go until the arrow does
select pg_temp.expect_fail($q$delete from rs_posts where id='10000000-0000-0000-0000-000000000004'$q$, 'foreign key');
delete from rs_posts where id='10000000-0000-0000-0000-000000000005';
delete from rs_posts where id='10000000-0000-0000-0000-000000000004';
do $$ begin if exists (select 1 from rs_posts where id='10000000-0000-0000-0000-000000000004') then raise exception 'delete failed'; end if; end $$;
-- anon can read posts and stats, nothing private
reset role; set role anon; set request.jwt.claim.sub = '';
do $$ begin
  if (select count(*) from rs_posts) <> 3 then raise exception 'anon posts %', (select count(*) from rs_posts); end if;
  if (select count(*) from rs_post_stats) < 1 then raise exception 'anon stats'; end if;
end $$;
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, text) values ('node','statement','anon')$q$, 'row-level|permission|null');
reset role;
-- rate limit
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b', false); end $$;
set role authenticated;
do $$ begin
  for i in 1..300 loop insert into rs_posts (kind, type, text) values ('node','statement','p' || i); end loop;
end $$;
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, text) values ('node','statement','too many')$q$, 'lot of posting');
reset role;
-- uniqueness: the same words (any case, spacing, end punctuation) post once
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); end $$;
set role authenticated;
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, text) values ('node','statement','  the sidewalk   is WET ')$q$, 'already been posted');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, text) values ('node','axiom','“The sidewalk is wet”')$q$, 'already been posted');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, text) values ('node','statement','  ...  ')$q$, 'Write the statement');
insert into rs_posts (id, kind, type, text) values ('10000000-0000-0000-0000-000000000006','node','question','Is the sidewalk wet?');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, text) values ('node','question','is the sidewalk wet')$q$, 'already been posted');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, from_post, to_post) values ('edge','support','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')$q$, 'already been posted');
insert into rs_posts (id, kind, type, from_post, to_post) values ('10000000-0000-0000-0000-000000000007','edge','support','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
insert into rs_posts (id, kind, type, from_post, to_post) values ('10000000-0000-0000-0000-000000000008','edge','same','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000006');
select pg_temp.expect_fail($q$insert into rs_posts (kind, type, from_post, to_post) values ('edge','same','10000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000002')$q$, 'already been posted');
-- editing into a duplicate is refused too
select pg_temp.expect_fail($q$update rs_posts set text='It rained last night' where id='10000000-0000-0000-0000-000000000002'$q$, 'already been posted');
do $$ begin
  if public.rs_find('node','statement','the sidewalk is wet.',null,null,null) <> '10000000-0000-0000-0000-000000000002' then raise exception 'rs_find statement'; end if;
  if public.rs_find('edge','support',null,null,'10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002') <> '10000000-0000-0000-0000-000000000003' then raise exception 'rs_find edge'; end if;
  if public.rs_find('node','statement','The street is wet',null,null,null) is not null then raise exception 'rs_find false match'; end if;
  if (select id from public.rs_similar('The sidewalks were wet') limit 1) <> '10000000-0000-0000-0000-000000000002' then raise exception 'rs_similar %', (select array_agg(text) from public.rs_similar('The sidewalks were wet')); end if;
  if exists (select 1 from public.rs_similar('Bananas are yellow') where score >= 0.5) then raise exception 'rs_similar false match'; end if;
end $$;
-- the author column is never readable; byline is, unless anonymous
select pg_temp.expect_fail($q$select author from rs_posts$q$, 'permission');
insert into rs_posts (id, kind, type, text, anonymous) values ('10000000-0000-0000-0000-000000000009','node','statement','Nobody knows I said this.', true);
do $$ begin
  if (select byline from rs_posts where id='10000000-0000-0000-0000-000000000006') <> '00000000-0000-0000-0000-00000000000a' then raise exception 'byline missing'; end if;
  if (select byline from rs_posts where id='10000000-0000-0000-0000-000000000009') is not null then raise exception 'anonymous post shows its author'; end if;
  if (select count(*) from public.rs_mine(array['10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000002']::uuid[])) <> 2 then raise exception 'rs_mine for alice'; end if;
end $$;
update rs_posts set anonymous = false where id='10000000-0000-0000-0000-000000000009';
update rs_posts set anonymous = true where id='10000000-0000-0000-0000-000000000009';
-- views: private unless shared, history always private
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b', false); end $$;
do $$ begin
  if exists (select 1 from public.rs_mine(array['10000000-0000-0000-0000-000000000009']::uuid[])) then raise exception 'rs_mine leaked'; end if;
  if (select byline from rs_posts where id='10000000-0000-0000-0000-000000000009') is not null then raise exception 'anonymous leaked to bob'; end if;
end $$;
select pg_temp.expect_fail($q$select author from rs_posts$q$, 'permission');
update rs_ratings set public = true where post_id='10000000-0000-0000-0000-000000000001';
insert into rs_settings (share_views) values (true);
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); end $$;
do $$ begin
  if (select count(*) from rs_ratings where post_id='10000000-0000-0000-0000-000000000001' and user_id='00000000-0000-0000-0000-00000000000b') <> 1 then raise exception 'shared view not visible'; end if;
  if exists (select 1 from rs_rating_history where user_id='00000000-0000-0000-0000-00000000000b') then raise exception 'history leaked with a shared view'; end if;
  if exists (select 1 from rs_settings) then raise exception 'settings leaked'; end if;
end $$;
update rs_ratings set stance='disagree' where user_id='00000000-0000-0000-0000-00000000000b'; -- matches 0 rows under RLS
do $$ begin if (select stance from rs_ratings where user_id='00000000-0000-0000-0000-00000000000b' and post_id='10000000-0000-0000-0000-000000000001') <> 'agree' then raise exception 'alice changed bob''s shared view'; end if; end $$;
reset role; set role anon;
do $$ begin perform set_config('request.jwt.claim.sub','', false); end $$;
do $$ begin
  if (select count(*) from rs_ratings) <> 1 then raise exception 'anon should see just the one shared view'; end if;
end $$;
reset role;
-- "I don't care" counts in the totals
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); end $$;
set role authenticated;
insert into rs_ratings (post_id, stance, relevance) values ('10000000-0000-0000-0000-000000000006','dontcare',1);
select pg_temp.expect_fail($q$insert into rs_ratings (post_id, stance) values ('10000000-0000-0000-0000-000000000002','meh')$q$, 'check');
do $$ begin
  if (select dontcare from rs_post_stats where post_id='10000000-0000-0000-0000-000000000006') <> 1 then raise exception 'dontcare not counted'; end if;
end $$;
-- "No opinion" counts too
update rs_ratings set stance = 'noopinion' where post_id = '10000000-0000-0000-0000-000000000006';
do $$ begin
  if (select (dontcare, noopinion) from rs_post_stats where post_id='10000000-0000-0000-0000-000000000006') <> (0, 1) then raise exception 'noopinion not counted'; end if;
end $$;
-- "Other", in your own words: counted in the totals, words kept in history
update rs_ratings set stance = 'other', other_text = 'Depends what you mean by exists' where post_id = '10000000-0000-0000-0000-000000000006';
do $$ begin
  if (select (noopinion, other) from rs_post_stats where post_id='10000000-0000-0000-0000-000000000006') <> (0, 1) then raise exception 'other not counted'; end if;
  if not exists (select 1 from rs_rating_history where other_text = 'Depends what you mean by exists') then raise exception 'other words not in history'; end if;
end $$;
select pg_temp.expect_fail($q$update rs_ratings set stance = 'agree', other_text = 'x' where post_id = '10000000-0000-0000-0000-000000000006'$q$, 'check');
reset role;
select 'ALL PASSED';
