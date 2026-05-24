-- ============================================================
-- Solace Life — Migration 009: Subscription Model v2
-- Run in Supabase SQL Editor.
-- ============================================================
-- Changes:
--   1. Update subscription_tier CHECK constraint to new tier names
--   2. Update subscription_status to include 'preservation' status
--   3. Add death-continuity columns:
--        preservation_expires_at — when Legacy Preservation Plan ends
--        grace_period_ends_at    — 180 days after death trigger activates
--        archive_mode_ends_at    — 5 years after grace period ends
-- ============================================================

-- ── 1. Drop existing CHECK constraints (if any) on subscription columns ──────

-- PostgreSQL doesn't let you ALTER a CHECK constraint directly;
-- drop and re-add via a new constraint name.
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

-- ── 2. Add updated CHECK constraints ─────────────────────────────────────────

ALTER TABLE profiles
  ADD CONSTRAINT profiles_subscription_tier_check
    CHECK (subscription_tier IN (
      'free',
      'essentials',
      'legacy',
      'living_legacy_plus',
      'preservation'           -- one-time Legacy Preservation Plan
    ));

ALTER TABLE profiles
  ADD CONSTRAINT profiles_subscription_status_check
    CHECK (subscription_status IN (
      'active',
      'inactive',
      'cancelled',
      'trialing',
      'past_due',
      'preservation'           -- one-time plan — never expires via billing
    ));

-- ── 3. Add death-continuity columns ──────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preservation_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_mode_ends_at     TIMESTAMPTZ;

-- ── 4. Migrate existing legacy tier names to new names ───────────────────────
-- (If any test rows exist with old tier names, convert them gracefully)

UPDATE profiles SET subscription_tier = 'essentials'         WHERE subscription_tier = 'keeper';
UPDATE profiles SET subscription_tier = 'legacy'             WHERE subscription_tier = 'guardian';
UPDATE profiles SET subscription_tier = 'living_legacy_plus' WHERE subscription_tier = 'patriarch';

-- ── 5. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS profiles_preservation_expires_idx
  ON profiles (preservation_expires_at)
  WHERE subscription_status = 'preservation';

CREATE INDEX IF NOT EXISTS profiles_grace_period_idx
  ON profiles (grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this migration:
--   1. Create new Stripe products (essentials, legacy, living_legacy_plus, preservation)
--   2. Update create-checkout-session Edge Function with new price IDs
--   3. Update webhook handler to set preservation_expires_at on one-time purchase
--   4. Test full checkout → webhook → profile update flow
