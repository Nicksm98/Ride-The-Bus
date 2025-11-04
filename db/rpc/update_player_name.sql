-- SQL function to atomically update a player's name in a lobby's players jsonb array
-- Usage: SELECT * FROM update_player_name('CODE123', 'player-id-123', 'NewName');

CREATE OR REPLACE FUNCTION public.update_player_name(p_code text, p_player_id text, p_name text)
RETURNS TABLE(players jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  current_players jsonb;
  v_code text;
BEGIN
  -- Normalize the code to uppercase
  v_code := UPPER(p_code);
  
  -- Lock and get the current players
  SELECT players INTO current_players 
  FROM lobbies 
  WHERE code = v_code 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found: %', v_code;
  END IF;

  IF current_players IS NULL OR jsonb_array_length(current_players) = 0 THEN
    RAISE EXCEPTION 'Lobby has no players';
  END IF;

  -- Check if player exists in lobby
  IF NOT EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(current_players) AS t(elem) 
    WHERE elem->>'id' = p_player_id
  ) THEN
    RAISE EXCEPTION 'Player not found in lobby';
  END IF;

  -- Build a new players array with the updated name for the matching player id
  current_players := (
    SELECT jsonb_agg(
      CASE 
        WHEN (elem->> 'id') = p_player_id THEN 
          jsonb_set(elem, '{name}', to_jsonb(p_name::text))
        ELSE elem 
      END
    )
    FROM jsonb_array_elements(current_players) AS t(elem)
  );

  -- Update the lobby with the new players array
  UPDATE lobbies 
  SET 
    players = current_players,
    updated_at = NOW()
  WHERE code = v_code 
  RETURNING players INTO players;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update lobby';
  END IF;

  RETURN NEXT;
END;
$$;
