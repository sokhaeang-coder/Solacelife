-- ═══════════════════════════════════════════════════════════════
--  SOLACE LIFE — Migration 017: Web Access Tokens + Account Type
--
--  Enables the web memory viewer flow:
--    1. web_access_token — a public UUID added to each delivery
--       so recipients can view memories at solacelife.ca/memory.html?token=xxx
--       without needing a Supabase account.
--    2. web_view_count — tracks how many times the web viewer
--       has been opened (used to prompt free account creation after 3 views).
--    3. account_type — distinguishes senders (paid) from recipients
--       (free vault-only accounts).
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. Add web_access_token to scheduled_deliveries ────────
--  Each delivery gets a unique public token generated at send time.
--  The token is included in the delivery email as a query parameter.
--  Nullable: existing deliveries won't have one until re-sent.
ALTER TABLE scheduled_deliveries
  ADD COLUMN IF NOT EXISTS web_access_token UUID DEFAULT gen_random_uuid();

-- Index for fast token lookups (web viewer calls this on every page load)
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_deliveries_web_token_idx
  ON scheduled_deliveries (web_access_token)
  WHERE web_access_token IS NOT NULL;


-- ─── 2. Add web_view_count to scheduled_deliveries ──────────
--  Incremented each time the web viewer is opened with this token.
--  After 3 views, the viewer prompts the recipient to create a free account.
ALTER TABLE scheduled_deliveries
  ADD COLUMN IF NOT EXISTS web_view_count INTEGER DEFAULT 0;


-- ─── 3. Add account_type to profiles ────────────────────────
--  'sender'    — paid subscriber, can record and schedule memories
--  'recipient' — free vault account, can receive and replay memories only
--  Defaults to 'sender' so existing accounts are unaffected.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'sender'
    CHECK (account_type IN ('sender', 'recipient'));

CREATE INDEX IF NOT EXISTS profiles_account_type_idx
  ON profiles (account_type);


-- ─── Verify ──────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'scheduled_deliveries'
  AND column_name IN ('web_access_token', 'web_view_count')
ORDER BY column_name;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name = 'account_type';
