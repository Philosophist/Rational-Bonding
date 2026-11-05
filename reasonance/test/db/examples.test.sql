\set ON_ERROR_STOP 1
-- run after the examples migration has been applied twice
reset role; set role anon;
do $$
declare n int; c int; u text;
begin
  select username into u from profiles where lower(username) in ('claude', 'claude_ai');
  if u is null then raise exception 'no Claude profile'; end if;
  select count(*) into n from rs_posts;
  select count(*) into c from rs_posts p join profiles f on f.id = p.byline where f.username = u;
  if n < 40 then raise exception 'only % example posts', n; end if;
  if c <> n then raise exception 'not all signed by Claude: % of %', c, n; end if;
  raise notice 'ok: % example posts by @%', n, u;
end $$;
reset role;
do $$ begin
  if (select banned_until from auth.users u join profiles p on p.id = u.id where p.username in ('Claude','Claude_AI')) <> 'infinity' then raise exception 'Claude account can sign in'; end if;
end $$;
select 'ALL PASSED';
