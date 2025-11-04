-- Create a new shuffled deck for a lobby
CREATE OR REPLACE FUNCTION create_deck(p_lobby_code TEXT)
RETURNS TABLE(deck_id UUID, cards JSONB)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deck_id UUID;
  v_cards JSONB;
BEGIN
  -- Generate a full deck of 52 cards
  WITH suits AS (
    SELECT unnest(enum_range(NULL::card_suit)) as suit
  ),
  ranks AS (
    SELECT unnest(enum_range(NULL::card_rank)) as rank
  ),
  deck AS (
    SELECT 
      jsonb_build_object(
        'suit', suit,
        'rank', rank,
        'drawn', false
      ) as card
    FROM suits CROSS JOIN ranks
  )
  SELECT 
    jsonb_agg(card ORDER BY random()) -- Shuffle the deck
  INTO v_cards
  FROM deck;

  -- Insert the new deck
  INSERT INTO decks (lobby_code, cards)
  VALUES (p_lobby_code, v_cards)
  RETURNING id INTO v_deck_id;

  RETURN QUERY
  SELECT v_deck_id, v_cards;
END;
$$;