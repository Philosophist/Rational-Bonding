\set ON_ERROR_STOP 1
do $$
declare n int; old int;
begin
  select count(*) into n from rs_posts where text = 'Every country should abolish the death penalty.';
  if n <> 1 then raise exception 'death penalty claim posted % times', n; end if;
  select count(*) into n from rs_posts where text = 'Governments should pay every adult a universal basic income.';
  if n <> 1 then raise exception 'basic income claim posted % times', n; end if;
  select count(*) into old from rs_posts where text in ('The sidewalk is wet this morning.', 'Our town should add bike lanes on Main Street.', 'The Earth is roughly a sphere.');
  if old <> 0 then raise exception '% old example posts left', old; end if;
  if not exists (select 1 from rs_posts where text = 'It rained last night.') then raise exception 'a rated old post was deleted'; end if;
  select count(*) into n from rs_posts;
  if n <> 78 then raise exception 'expected 77 new posts plus 1 kept, got %', n; end if;
  select count(*) into old from rs_posts p join profiles f on f.id = p.byline where f.username in ('Claude', 'Claude_AI');
  if old <> n then raise exception 'only % of % posts signed by Claude', old, n; end if;
  raise notice 'ok: new examples posted, old ones removed, rated one kept';
end $$;
select 'ALL PASSED';
