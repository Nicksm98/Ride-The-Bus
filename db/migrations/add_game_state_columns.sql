-- Add game_state and deck columns to lobbies table
-- Run this in your Supabase SQL Editor

ALTER TABLE lobbies 
ADD COLUMN IF NOT EXISTS game_state jsonb,
ADD COLUMN IF NOT EXISTS deck jsonb;
