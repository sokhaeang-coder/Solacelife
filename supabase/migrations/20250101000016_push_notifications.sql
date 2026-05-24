-- ═══════════════════════════════════════════════════════════════
--  SOLACE LIFE — Migration 016: Push Notification Columns
--
--  Adds push token storage and notification preference flag to
--  the profiles table so Edge Functions can fan-out push alerts.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ─── Add push_token column ───────────────────────────────────
--  Stores the Expo push token for each device.
--  Nullable: null means the user hasn't granted permission yet
--  or is running in a simulator.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;


-- ─── Add push_notifications_enabled flag ─────────────────────
--  Lets users opt out of push reminders from within the app
--  without revoking OS-level permission.
--  Defaults to true so new users receive nudges automatically.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN DEFAULT TRUE;


-- ─── Index for fast token lookups ────────────────────────────
--  Edge Functions scan the whole profiles table for non-null
--  tokens on every cron run.  A partial index keeps that fast
--  even as the user base grows.
CREATE INDEX IF NOT EXISTS idx_profiles_push_token
  ON profiles (push_token)
  WHERE push_token IS NOT NULL;


-- ─── Verify ──────────────────────────────────────────────────
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('push_token', 'push_notifications_enabled')
ORDER BY column_name;
