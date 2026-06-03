-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration: Soft-delete for received deliveries
--
--  Philosophy:
--    G2 users (recipients) may want to "delete" a received memory
--    from their view. We NEVER delete the underlying data — the
--    memory and delivery row are preserved forever so the data
--    can always be recovered or exported.
--
--    Instead, we add dismissed_by_recipient_at TIMESTAMPTZ.
--    When set, loadReceivedMemories() filters the row out of the
--    G2's view. The row stays in the database untouched.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- Add the soft-delete column
ALTER TABLE public.scheduled_deliveries
  ADD COLUMN IF NOT EXISTS dismissed_by_recipient_at TIMESTAMPTZ;

-- Index so the IS NULL filter in loadReceivedMemories is fast
CREATE INDEX IF NOT EXISTS idx_scheduled_deliveries_not_dismissed
  ON public.scheduled_deliveries (family_member_id)
  WHERE dismissed_by_recipient_at IS NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'scheduled_deliveries'
  AND column_name = 'dismissed_by_recipient_at';
