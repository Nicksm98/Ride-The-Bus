-- Draw a card from a deck
CREATE OR REPLACE FUNCTION draw_card(p_deck_id UUID)
RETURNS TABLE(card JSONB, remaining_cards INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cards JSONB;
  v_drawn_card JSONB;
BEGIN
  -- Lock the deck row and get current cards
  SELECT cards INTO v_cards
  FROM decks
  WHERE id = p_deck_id
  FOR UPDATE;

  IF v_cards IS NULL THEN
    RAISE EXCEPTION 'Deck not found';
  END IF;

  -- Find first undrawn card
  WITH numbered_cards AS (
    SELECT 
      row_number() OVER () as idx,
      value as card
    FROM jsonb_array_elements(v_cards)
    WHERE value->>'drawn' = 'false'
    LIMIT 1
  )
  SELECT 
    jsonb_set(card, '{drawn}', 'true'::jsonb)
  INTO v_drawn_card
  FROM numbered_cards;

  IF v_drawn_card IS NULL THEN
    RAISE EXCEPTION 'No cards left in deck';
  END IF;

  -- Update the deck with the drawn card
  WITH card_array AS (
    SELECT jsonb_agg(
      CASE
        WHEN value->>'suit' = v_drawn_card->>'suit' 
        AND value->>'rank' = v_drawn_card->>'rank'
        THEN v_drawn_card
        ELSE value
      END
    ) as new_cards
    FROM jsonb_array_elements(v_cards)
  )
  UPDATE decks 
  SET cards = new_cards
  FROM card_array
  WHERE id = p_deck_id;

  RETURN QUERY
  SELECT 
    v_drawn_card,
    (
      SELECT count(*)
      FROM jsonb_array_elements(v_cards)
      WHERE value->>'drawn' = 'false'
    )::INTEGER - 1;
END;
$$;