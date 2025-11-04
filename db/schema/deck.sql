-- Create an enum for card suits
CREATE TYPE card_suit AS ENUM ('hearts', 'diamonds', 'clubs', 'spades');

-- Create an enum for card ranks
CREATE TYPE card_rank AS ENUM (
  'ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'
);

-- Create a table for game decks
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_code TEXT NOT NULL REFERENCES lobbies(code) ON DELETE CASCADE,
  cards JSONB NOT NULL, -- Array of {suit, rank, drawn: boolean} objects
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deck_cards_valid CHECK (jsonb_typeof(cards) = 'array')
);

-- Create an index for looking up decks by lobby
CREATE INDEX idx_decks_lobby_code ON decks(lobby_code);

-- Add trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();