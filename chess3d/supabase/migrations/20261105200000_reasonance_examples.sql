-- Reasonance: the example arguments (rain, bike lanes, round Earth) as real
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
  claude uuid := 'fd755006-5431-4848-b134-17805336f581';
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

  -- Did it rain last night?
  insert into seed_posts values ('rain:n8fe62a1688f7', pg_temp.rs_seed(claude, '6639a982-262c-49bf-b256-ea184d42c9b4', 'node', 'statement', 'It rained last night.', null, null, null, null));
  insert into seed_posts values ('rain:nfa8bf361291e', pg_temp.rs_seed(claude, '57611ff8-59d0-436c-ac3f-dde921d921f7', 'node', 'statement', 'The sidewalk is wet this morning.', null, null, null, null));
  insert into seed_posts values ('rain:e2b268a45d1e3', pg_temp.rs_seed(claude, '30ca0241-2af5-4387-afc6-e2331a96bd8b', 'edge', 'support', '', null, (select post from seed_posts where item = 'rain:n8fe62a1688f7'), (select post from seed_posts where item = 'rain:nfa8bf361291e'), null));
  insert into seed_posts values ('rain:ne9f83e5d1ea4', pg_temp.rs_seed(claude, 'a1024e9c-13e8-414e-8533-df200911d491', 'node', 'statement', 'The sprinklers soak the sidewalk every night.', null, null, null, null));
  insert into seed_posts values ('rain:e5097ad4528d2', pg_temp.rs_seed(claude, '0e735cf2-a706-40aa-9a05-6c074629fdd5', 'edge', 'contention', '', null, (select post from seed_posts where item = 'rain:e2b268a45d1e3'), (select post from seed_posts where item = 'rain:ne9f83e5d1ea4'), null));
  insert into seed_posts values ('rain:n2448c201bacc', pg_temp.rs_seed(claude, '38134450-1ee1-444e-b4c9-841d4b7515e8', 'node', 'combiner', '', null, null, null, null));
  insert into seed_posts values ('rain:e97732f1bdf88', pg_temp.rs_seed(claude, '97021279-5a1d-4fd9-9cd9-faefcff29346', 'edge', 'support', '', null, (select post from seed_posts where item = 'rain:e2b268a45d1e3'), (select post from seed_posts where item = 'rain:n2448c201bacc'), null));
  insert into seed_posts values ('rain:ndcdd2f57d679', pg_temp.rs_seed(claude, 'b3432279-5c5f-4fbd-b279-44ac96929fe4', 'node', 'statement', 'The street is wet too.', null, null, null, null));
  insert into seed_posts values ('rain:ece4d3fb64d78', pg_temp.rs_seed(claude, 'a59543d4-e637-482e-b4cf-6551f5a550ad', 'edge', 'premise', '', null, (select post from seed_posts where item = 'rain:n2448c201bacc'), (select post from seed_posts where item = 'rain:ndcdd2f57d679'), '1'));
  insert into seed_posts values ('rain:nc15275f5cd82', pg_temp.rs_seed(claude, '7469df2d-ab00-42f3-ab18-8e1aa2a4f373', 'node', 'statement', 'The sprinklers do not reach the street.', null, null, null, null));
  insert into seed_posts values ('rain:e879f0a13f27e', pg_temp.rs_seed(claude, '9bd871ea-b8ea-4117-8b87-6f8f1f4c1edd', 'edge', 'premise', '', null, (select post from seed_posts where item = 'rain:n2448c201bacc'), (select post from seed_posts where item = 'rain:nc15275f5cd82'), '2'));
  insert into seed_posts values ('rain:n571cbc2e6bd7', pg_temp.rs_seed(claude, '6b3a4643-6b54-49b1-999e-a616dd7b1a8f', 'node', 'combiner', '', null, null, null, null));
  insert into seed_posts values ('rain:e90dfd5a73c1f', pg_temp.rs_seed(claude, '95d8a958-f91b-452c-8364-55c39c2b11c7', 'edge', 'support', '', null, (select post from seed_posts where item = 'rain:n8fe62a1688f7'), (select post from seed_posts where item = 'rain:n571cbc2e6bd7'), null));
  insert into seed_posts values ('rain:n36515ac17780', pg_temp.rs_seed(claude, '42ddf082-f3f2-4602-a22d-7155151b8d66', 'node', 'statement', 'My neighbour says it didn''t rain.', null, null, null, null));
  insert into seed_posts values ('rain:e797b79e1f0a5', pg_temp.rs_seed(claude, '531c0ce8-be6d-4673-acd4-cfcb89dc45be', 'edge', 'premise', '', null, (select post from seed_posts where item = 'rain:n571cbc2e6bd7'), (select post from seed_posts where item = 'rain:n36515ac17780'), '1'));
  insert into seed_posts values ('rain:naf380c62ba32', pg_temp.rs_seed(claude, '2e61bdcf-a316-4d5e-aa07-f698ab279977', 'node', 'statement', 'My neighbour is wrong about everything.', null, null, null, null));
  insert into seed_posts values ('rain:ebf63a4ed39b0', pg_temp.rs_seed(claude, 'b4c8c360-c767-4470-8d6c-4d5b6b5a323a', 'edge', 'premise', '', null, (select post from seed_posts where item = 'rain:n571cbc2e6bd7'), (select post from seed_posts where item = 'rain:naf380c62ba32'), '2'));
  insert into seed_posts values ('rain:n0b73f597ef5b', pg_temp.rs_seed(claude, '10a05a28-b374-4dba-a867-81e24c26da2b', 'node', 'fallacy', 'attacks the person making a claim instead of the claim itself.', 'Ad hominem', null, null, null));
  insert into seed_posts values ('rain:e427ca972fcb8', pg_temp.rs_seed(claude, '96e09775-a5be-463c-b5f0-82b45829bfe7', 'edge', 'example', '', null, (select post from seed_posts where item = 'rain:e90dfd5a73c1f'), (select post from seed_posts where item = 'rain:n0b73f597ef5b'), null));
  -- Should Main Street get bike lanes?
  insert into seed_posts values ('bikes:ndbb93878d63f', pg_temp.rs_seed(claude, '79e33d46-9a8b-4e3f-8c40-91c1b5223465', 'node', 'statement', 'Our town should add bike lanes on Main Street.', null, null, null, null));
  insert into seed_posts values ('bikes:ndda79c66166e', pg_temp.rs_seed(claude, '8bc8c6e7-d64f-4a8a-854b-362aa1bca9ef', 'node', 'combiner', '', null, null, null, null));
  insert into seed_posts values ('bikes:ef9d82246f2cb', pg_temp.rs_seed(claude, '74dede33-0a67-4d41-818d-5cd60c8955d4', 'edge', 'support', '', null, (select post from seed_posts where item = 'bikes:ndbb93878d63f'), (select post from seed_posts where item = 'bikes:ndda79c66166e'), null));
  insert into seed_posts values ('bikes:n9f434efd8c06', pg_temp.rs_seed(claude, '759d49c3-d95c-4362-b249-d504d8753b7c', 'node', 'statement', 'Bike lanes reduce crashes involving cyclists.', null, null, null, null));
  insert into seed_posts values ('bikes:e01f75f5d7077', pg_temp.rs_seed(claude, '82cc7459-6b9e-4549-85ff-ce19e7db1038', 'edge', 'premise', '', null, (select post from seed_posts where item = 'bikes:ndda79c66166e'), (select post from seed_posts where item = 'bikes:n9f434efd8c06'), '1'));
  insert into seed_posts values ('bikes:nb92a17b5ac74', pg_temp.rs_seed(claude, '1848e57a-501b-4040-b18e-f14a2152d8c4', 'node', 'statement', 'Main Street has more cyclist crashes than any other street in town.', null, null, null, null));
  insert into seed_posts values ('bikes:e420ede47fa49', pg_temp.rs_seed(claude, '1d43898a-7326-417e-9871-9b6157ec8e0b', 'edge', 'premise', '', null, (select post from seed_posts where item = 'bikes:ndda79c66166e'), (select post from seed_posts where item = 'bikes:nb92a17b5ac74'), '2'));
  insert into seed_posts values ('bikes:n31bbe2dadd5f', pg_temp.rs_seed(claude, '066f03f9-5f75-4598-9f0b-18db9b284228', 'node', 'statement', 'Bike lanes would remove parking spaces on Main Street.', null, null, null, null));
  insert into seed_posts values ('bikes:e8c149e5ef9fc', pg_temp.rs_seed(claude, '495c6e3e-9bae-4da4-bddb-a9f20a573ba0', 'edge', 'contention', '', null, (select post from seed_posts where item = 'bikes:ndbb93878d63f'), (select post from seed_posts where item = 'bikes:n31bbe2dadd5f'), null));
  insert into seed_posts values ('bikes:n2df0be4bea50', pg_temp.rs_seed(claude, 'a7e26ba1-f58f-4aa6-89ec-c8202d92091f', 'node', 'statement', 'The garage two blocks away is rarely more than half full.', null, null, null, null));
  insert into seed_posts values ('bikes:ea9ff5588b513', pg_temp.rs_seed(claude, '7aa9d599-c0ef-4bc7-a3f9-39b2cd08d8dd', 'edge', 'contention', '', null, (select post from seed_posts where item = 'bikes:e8c149e5ef9fc'), (select post from seed_posts where item = 'bikes:n2df0be4bea50'), null));
  insert into seed_posts values ('bikes:naf7304361716', pg_temp.rs_seed(claude, '85158d0e-fb61-4786-83f0-8fae836ede48', 'node', 'question', 'How much would the bike lanes cost?', null, null, null, null));
  insert into seed_posts values ('bikes:ec74e3a5e8685', pg_temp.rs_seed(claude, '8d756bbe-9679-42bf-9e3e-8d90ea1ceeb3', 'edge', 'question', '', null, (select post from seed_posts where item = 'bikes:ndbb93878d63f'), (select post from seed_posts where item = 'bikes:naf7304361716'), null));
  insert into seed_posts values ('bikes:n7abd3dec5cee', pg_temp.rs_seed(claude, '1754a090-47cd-4e15-9c22-5efc37a004d8', 'node', 'statement', 'If we add bike lanes, cars will soon be banned from downtown.', null, null, null, null));
  insert into seed_posts values ('bikes:e34f1e0e4535a', pg_temp.rs_seed(claude, '4d0744b1-3ef8-47b5-bf84-a7fe186c8a36', 'edge', 'contention', '', null, (select post from seed_posts where item = 'bikes:ndbb93878d63f'), (select post from seed_posts where item = 'bikes:n7abd3dec5cee'), null));
  insert into seed_posts values ('bikes:nb66854e70834', pg_temp.rs_seed(claude, 'dffc71cf-3bb3-4a4a-9cec-866b20052b1b', 'node', 'fallacy', 'claims one step will lead to an extreme outcome without showing each link in the chain.', 'Slippery slope', null, null, null));
  insert into seed_posts values ('bikes:e65387ec264d2', pg_temp.rs_seed(claude, '0ae1d454-dfee-44a1-a5fb-c358b686db50', 'edge', 'example', '', null, (select post from seed_posts where item = 'bikes:e34f1e0e4535a'), (select post from seed_posts where item = 'bikes:nb66854e70834'), null));
  -- Is the Earth round?
  insert into seed_posts values ('earth:na89700df3180', pg_temp.rs_seed(claude, '79e223d0-091e-4ec2-8184-7346fef44ec9', 'node', 'statement', 'The Earth is roughly a sphere.', null, null, null, null));
  insert into seed_posts values ('earth:n3b90227f8bc8', pg_temp.rs_seed(claude, '7cad9e99-39d0-44e8-8f68-c69c9e492c65', 'node', 'statement', 'La Terre est à peu près une sphère.', null, null, null, null));
  insert into seed_posts values ('earth:e55134c218f8d', pg_temp.rs_seed(claude, 'e9fce70e-267a-4660-8715-2ccfebe080d1', 'edge', 'same', '', null, (select post from seed_posts where item = 'earth:na89700df3180'), (select post from seed_posts where item = 'earth:n3b90227f8bc8'), null));
  insert into seed_posts values ('earth:nd4868d3ee351', pg_temp.rs_seed(claude, '8e9b86f7-b040-405a-9e86-6128393b499c', 'node', 'statement', 'Ships disappear hull first as they sail over the horizon.', null, null, null, null));
  insert into seed_posts values ('earth:e5500b3a5fdcb', pg_temp.rs_seed(claude, '473f9b9e-909d-4f18-9b32-4bfdcaf0df43', 'edge', 'support', '', null, (select post from seed_posts where item = 'earth:na89700df3180'), (select post from seed_posts where item = 'earth:nd4868d3ee351'), null));
  insert into seed_posts values ('earth:nd29e2fe2da77', pg_temp.rs_seed(claude, 'a4e9c8e5-bb98-42d2-9b99-25cd977b5d81', 'node', 'axiom', 'Careful observation tells us how the world is.', null, null, null, null));
  insert into seed_posts values ('earth:e8003e775e78f', pg_temp.rs_seed(claude, 'f482f919-de40-4098-91c7-547c8f57d1eb', 'edge', 'support', '', null, (select post from seed_posts where item = 'earth:e5500b3a5fdcb'), (select post from seed_posts where item = 'earth:nd29e2fe2da77'), null));
  insert into seed_posts values ('earth:n31cfda7b94a6', pg_temp.rs_seed(claude, 'be69d778-2e37-4976-8235-e162968735dc', 'node', 'statement', 'The Earth''s shadow on the Moon is always round during a lunar eclipse.', null, null, null, null));
  insert into seed_posts values ('earth:e066d32c5d70b', pg_temp.rs_seed(claude, '60940526-fc2d-4bd5-baba-e5323198a211', 'edge', 'support', '', null, (select post from seed_posts where item = 'earth:na89700df3180'), (select post from seed_posts where item = 'earth:n31cfda7b94a6'), null));
  insert into seed_posts values ('earth:nd26550f37f36', pg_temp.rs_seed(claude, '9dc2279f-03fb-4519-8667-c1c7da67799d', 'node', 'statement', 'A lunar eclipse happens when the Earth blocks sunlight from reaching the Moon.', null, null, null, null));
  insert into seed_posts values ('earth:e94b60cfdc834', pg_temp.rs_seed(claude, '1e64cb92-d517-4606-9ca4-505bf73dfd9f', 'edge', 'clarification', '', null, (select post from seed_posts where item = 'earth:n31cfda7b94a6'), (select post from seed_posts where item = 'earth:nd26550f37f36'), null));
  insert into seed_posts values ('earth:n35769ca6c191', pg_temp.rs_seed(claude, '1105742b-5fd8-4130-a964-495056bcc0a4', 'node', 'statement', 'The ground looks flat where I stand.', null, null, null, null));
  insert into seed_posts values ('earth:ee96e472d8b57', pg_temp.rs_seed(claude, 'd8e1a3e3-9c4c-487f-9a2a-b9c370363ecf', 'edge', 'contention', '', null, (select post from seed_posts where item = 'earth:na89700df3180'), (select post from seed_posts where item = 'earth:n35769ca6c191'), null));
  insert into seed_posts values ('earth:nd4794ac072d9', pg_temp.rs_seed(claude, '0d1d727a-a3dc-485d-b8c3-9dd56d8c11ab', 'node', 'statement', 'A small patch of a very large sphere looks flat.', null, null, null, null));
  insert into seed_posts values ('earth:e3eb8f6bf43f3', pg_temp.rs_seed(claude, '4cf74c81-d827-4e67-9dbc-3bf71e118fc7', 'edge', 'contention', '', null, (select post from seed_posts where item = 'earth:ee96e472d8b57'), (select post from seed_posts where item = 'earth:nd4794ac072d9'), null));
  insert into seed_posts values ('earth:ncebd075988a8', pg_temp.rs_seed(claude, '3956c5bb-8b53-445a-ae45-da73d673f613', 'node', 'statement', 'Most people believe the Earth is round.', null, null, null, null));
  insert into seed_posts values ('earth:e52de97c8c305', pg_temp.rs_seed(claude, '14ccfebe-9774-4a05-af95-fa4d8b52e3dd', 'edge', 'support', '', null, (select post from seed_posts where item = 'earth:na89700df3180'), (select post from seed_posts where item = 'earth:ncebd075988a8'), null));
  insert into seed_posts values ('earth:n19e29bb07e83', pg_temp.rs_seed(claude, 'f580ae9b-cf0e-44b2-a693-9ead7232b12a', 'node', 'fallacy', 'treats a claim as true because many people believe it.', 'Appeal to popularity', null, null, null));
  insert into seed_posts values ('earth:e6bc6fd2d35f9', pg_temp.rs_seed(claude, 'abe9de25-103e-4907-a204-9adaeca23a10', 'edge', 'example', '', null, (select post from seed_posts where item = 'earth:e52de97c8c305'), (select post from seed_posts where item = 'earth:n19e29bb07e83'), null));
exception when others then
  raise warning 'Reasonance examples were not posted: %', sqlerrm;
end $$;
