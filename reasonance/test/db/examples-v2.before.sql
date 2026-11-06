\set ON_ERROR_STOP 1
-- Someone (not Claude) rates one old example post before the new examples arrive.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'rater@example.com') on conflict do nothing;
insert into profiles (id, username) values ('00000000-0000-0000-0000-0000000000aa', 'rater') on conflict do nothing;
insert into rs_ratings (user_id, post_id, stance)
select '00000000-0000-0000-0000-0000000000aa', id, 'agree' from rs_posts where text = 'It rained last night.';
