-- SQL function to atomically append a player to a lobby's players jsonb array
-- Usage: SELECT * FROM add_player_to_lobby('CODE123', 'PlayerName');

CREATE OR REPLACE FUNCTION public.add_player_to_lobby(p_code text, p_name text)
RETURNS TABLE(player_id text, all_players jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  new_id text := concat(EXTRACT(epoch FROM now())::bigint, '-', floor(random()*10000)::int);
  v_players jsonb;
BEGIN
  UPDATE lobbies
  SET players = (CASE
      WHEN lobbies.players IS NULL THEN jsonb_build_array(jsonb_build_object('id', new_id, 'name', p_name))
      ELSE lobbies.players || jsonb_build_array(jsonb_build_object('id', new_id, 'name', p_name))
    END)
  WHERE code = p_code
  RETURNING lobbies.players INTO v_players;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found';
  END IF;

  player_id := new_id;
  all_players := v_players;
  RETURN NEXT;
END;
$$;
