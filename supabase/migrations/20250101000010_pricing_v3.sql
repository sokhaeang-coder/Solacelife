-- ============================================================
-- Solace Life — Migration 010: Pricing Model v3
-- Run in Supabase SQL Editor.
-- ============================================================
-- Changes:
--   1. Add plan_expires_at      — covers 5-year, 10-year, and
--                                  preservation plan expiry in one column
--   2. Add trial_ends_at        — 30-day free trial window
--   3. Add has_avatar_addon     — AI Avatar add-on subscription flag
--   4. Add avatar_addon_sub_id  — Stripe subscription ID for the add-on
--   5. Add 'bundle' to subscription_status CHECK constraint
--      (used for 5-year and 10-year one-time bundle plans)
-- ============================================================

-- ── 1. Drop existing status CHECK so we can extend it ────────
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

-- ── 2. Re-add status CHECK with 'bundle' included ────────────
ALTER TABLE profiles
  ADD CONSTRAINT profiles_subscription_status_check
    CHECK (subscription_status IN (
      'active',         -- active recurring subscription
      'inactive',       -- never subscribed or fully lapsed
      'cancelled',      -- user cancelled, not yet expired
      'trialing',       -- within 30-day free trial window
      'past_due',       -- payment failed, grace window open
      'preservation',   -- one-time 25-year Legacy Preservation Plan
      'bundle'          -- one-time 5-year or 10-year bundle plan
    ));

-- ── 3. Add new columns ────────────────────────────────────────

-- Unified expiry date for all one-time plans:
--   preservation → now + 25 years
--   bundle (5yr) → now + 5 years
--   bundle (10yr)→ now + 10 years
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- 30-day free trial end date.
-- Set at account creation (now + 30 days).
-- NULL means no active trial (already converted or not started).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Whether the user has an active AI Avatar add-on subscription.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_avatar_addon BOOLEAN DEFAULT FALSE;

-- Stripe subscription ID for the avatar add-on (separate from main sub).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_addon_subscription_id TEXT;

-- ── 4. Indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS profiles_plan_expires_idx
  ON profiles (plan_expires_at)
  WHERE plan_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_trial_ends_idx
  ON profiles (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

-- ── 5. Migrate existing preservation_expires_at → plan_expires_at ──
-- If migration 009 was already run and preservation_expires_at was set,
-- copy those values into the new unified column.
UPDATE profiles
  SET plan_expires_at = preservation_expires_at
  WHERE preservation_expires_at IS NOT NULL
    AND plan_expires_at IS NULL;

-- ── Done ──────────────────────────────────────────────────────
-- After running this migration:
--   1. Add STRIPE_PRICE_LEGACY_5YR to Supabase Edge Function secrets
--   2. Add STRIPE_PRICE_LEGACY_10YR to Supabase Edge Function secrets
--   3. Add STRIPE_PRICE_AVATAR_ADDON to Supabase Edge Function secrets
--   4. Deploy updated create-checkout-session and stripe-webhook functions
--   5. Update feature gating logic to check plan_expires_at > now()
--      for bundle and preservation statuses
