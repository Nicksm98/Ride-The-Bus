-- Supabase / Postgres schema for lobbies
-- Run this in your Supabase SQL editor or migration pipeline

-- Enable extension for gen_random_uuid() if not present
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  host_name text NOT NULL,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'waiting',
  game_state jsonb,
  deck jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
