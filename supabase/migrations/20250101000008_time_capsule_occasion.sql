-- ============================================================
-- Solace Life — Migration 008: Time Capsule Occasion Field
-- Adds occasion_id to scheduled_deliveries so capsule cards
-- can show the correct icon and label.
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE scheduled_deliveries
  ADD COLUMN IF NOT EXISTS occasion_id TEXT DEFAULT 'custom'
    CHECK (occasion_id IN (
      'birthday', 'wedding', 'anniversary', 'graduation',
      'newbaby', 'holiday', 'justbecause', 'custom'
    ));

-- Index for efficient future lookups by occasion type
CREATE INDEX IF NOT EXISTS scheduled_deliveries_occasion_idx
  ON scheduled_deliveries (occasion_id);
