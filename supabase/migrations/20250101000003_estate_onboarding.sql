-- ============================================================
-- Solace Life — Migration 003: Estate Onboarding + Profiles
-- Run this in your Supabase SQL Editor as a NEW QUERY
-- (Do NOT replace your existing schema — this is additive)
-- ============================================================

-- ── 1. Profile columns added for onboarding flow ────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS track               TEXT    DEFAULT 'remembrance';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url          TEXT;

-- ── 2. Estate items table ────────────────────────────────────
-- Stores each user's estate inventory answers from onboarding
-- (and can be updated later from Settings → Estate Setup)

CREATE TABLE IF NOT EXISTS estate_items (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL CHECK (category IN ('will', 'property', 'vehicle', 'valuables')),
  has_item    BOOLEAN     NOT NULL DEFAULT FALSE,
  file_urls   JSONB       NOT NULL DEFAULT '[]',  -- [{ name: string, url: string }]
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, category)  -- one row per category per user; use UPSERT to update
);

-- ── 3. Row Level Security ────────────────────────────────────
ALTER TABLE estate_items ENABLE ROW LEVEL SECURITY;

-- Users can only read, insert, and update their own estate items
CREATE POLICY "estate_items_select" ON estate_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "estate_items_insert" ON estate_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "estate_items_update" ON estate_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "estate_items_delete" ON estate_items
  FOR DELETE USING (auth.uid() = user_id);

-- ── 4. Auto-update updated_at on change ─────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estate_items_updated_at ON estate_items;
CREATE TRIGGER estate_items_updated_at
  BEFORE UPDATE ON estate_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 5. Storage: allow estate subfolder in memories bucket ───
-- No SQL needed — estate docs upload to memories/estate/{user_id}/...
-- which is already covered by your existing memories bucket RLS policy.
-- Confirm your memories bucket policy includes: bucket_id = 'memories'

-- ── Done. ────────────────────────────────────────────────────
