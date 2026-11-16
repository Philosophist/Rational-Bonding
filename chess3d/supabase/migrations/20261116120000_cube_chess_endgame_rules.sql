-- Cube Chess rules version 11: endgame rules.
-- Endgame solving showed a king with one rook, bishop or knight can never mate
-- on the 8x8x8 cube, and a lone queen forces mate from only about 1% of
-- positions. Two new rule toggles:
--   bareKing   (on by default): capturing every enemy piece but the king wins.
--   queenLeaps (off by default): queens also jump like knights.

-- Keep the new toggles when a challenge is made.
create or replace function public.cc_rules(r jsonb) returns jsonb
language plpgsql immutable as $$
begin
  if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'mode', 'classic') not in ('classic', 'relative') then
    raise exception 'invalid rules';
  end if;
  -- Keep the mode plus known toggles with boolean values.
  return jsonb_build_object('mode', coalesce(r ->> 'mode', 'classic')) ||
    coalesce((select jsonb_object_agg(key, value) from jsonb_each(r)
              where key in ('rookDiagonals', 'gridLines', 'pawnsAnyFacing', 'bishopFacing', 'knightFacing',
                             'bareKing', 'queenLeaps')
                and jsonb_typeof(value) = 'boolean'), '{}');
end $$;

-- Accept a bare-king result claimed with a move.
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
       or claim_result = (case when white_moves then 'white' else 'black' end) and claim_reason = 'checkmate'
       -- Bare king (rules version 11): the mover wins by taking the last piece, or
       -- loses by not taking back the last enemy piece while bare.
       or claim_result in ('white', 'black') and claim_reason = 'bare king' then
      update games set status = 'finished', result = claim_result, reason = claim_reason
      where id = game_id returning * into g;
    else
      raise exception 'bad result claim';
    end if;
  end if;
  return g;
end $$;

-- Games created before this change were played without the bare-king rule:
-- record that, so their replays stay as they were played.
update public.games set rules = rules || '{"bareKing": false}'::jsonb
where not (rules ? 'bareKing');
