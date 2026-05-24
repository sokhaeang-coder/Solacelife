-- ============================================================
-- Solace Life — Migration 004: Stripe Subscription Columns
-- Run as a NEW QUERY in Supabase SQL Editor
-- ============================================================

-- ── Stripe & subscription columns on profiles ────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS subscription_tier        TEXT    DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'keeper', 'guardian', 'patriarch')),
  ADD COLUMN IF NOT EXISTS subscription_status      TEXT    DEFAULT 'inactive'
    CHECK (subscription_status IN ('active', 'inactive', 'past_due', 'cancelled', 'trialing')),
  ADD COLUMN IF NOT EXISTS subscription_billing     TEXT    DEFAULT 'monthly'
    CHECK (subscription_billing IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS subscription_updated_at  TIMESTAMPTZ;

-- ── Index for webhook lookups ─────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_idx
  ON profiles (stripe_customer_id);

CREATE INDEX IF NOT EXISTS profiles_stripe_subscription_idx
  ON profiles (stripe_subscription_id);

-- ── Done ──────────────────────────────────────────────────────
