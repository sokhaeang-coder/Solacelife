-- ============================================================
-- Solace Life — Migration 005: Event Trigger / Check-in System
-- Run as a NEW QUERY in Supabase SQL Editor
-- ============================================================

-- ── 1. Add check-in + vault status columns to profiles ───────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS checkin_frequency      TEXT    DEFAULT 'monthly'
    CHECK (checkin_frequency IN ('weekly', 'monthly', 'quarterly')),
  ADD COLUMN IF NOT EXISTS checkin_threshold       INT     DEFAULT 3,   -- missed check-ins before escalation
  ADD COLUMN IF NOT EXISTS last_checkin_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_checkin_due        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS missed_checkins         INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vault_status            TEXT    DEFAULT 'active'
    CHECK (vault_status IN ('active', 'escalated', 'released')),
  ADD COLUMN IF NOT EXISTS vault_released_at       TIMESTAMPTZ;

-- ── 2. Check-ins log table ────────────────────────────────────
-- Each "I'm here" tap by the owner is recorded here.
CREATE TABLE IF NOT EXISTS check_ins (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source        TEXT        DEFAULT 'app'  -- 'app' | 'email' | 'sms'
);

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "check_ins_select" ON check_ins;
CREATE POLICY "check_ins_select" ON check_ins
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "check_ins_insert" ON check_ins;
CREATE POLICY "check_ins_insert" ON check_ins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 3. Event confirmations table ─────────────────────────────
-- When a trusted contact confirms the event has occurred,
-- a row is inserted here. Vault releases after 1+ confirmation.
CREATE TABLE IF NOT EXISTS event_confirmations (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confirmed_by       TEXT        NOT NULL,  -- trusted contact email
  confirmed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmation_token TEXT        UNIQUE,    -- secure one-time token sent via email
  token_used         BOOLEAN     DEFAULT FALSE,
  notes              TEXT
);

ALTER TABLE event_confirmations ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can insert confirmations
-- Users can read their own confirmations
DROP POLICY IF EXISTS "event_confirmations_select" ON event_confirmations;
CREATE POLICY "event_confirmations_select" ON event_confirmations
  FOR SELECT USING (auth.uid() = user_id);

-- ── 4. Escalation log ─────────────────────────────────────────
-- Tracks when reminder/escalation emails were sent so we don't spam.
CREATE TABLE IF NOT EXISTS checkin_escalations (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type         TEXT        NOT NULL
    CHECK (type IN ('reminder', 'escalation', 'vault_release')),
  recipient    TEXT        NOT NULL,   -- email address notified
  missed_count INT
);

ALTER TABLE checkin_escalations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkin_escalations_select" ON checkin_escalations;
CREATE POLICY "checkin_escalations_select" ON checkin_escalations
  FOR SELECT USING (auth.uid() = user_id);

-- ── 5. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_next_checkin_idx
  ON profiles (next_checkin_due)
  WHERE vault_status = 'active';

CREATE INDEX IF NOT EXISTS profiles_vault_status_idx
  ON profiles (vault_status);

CREATE INDEX IF NOT EXISTS check_ins_user_idx
  ON check_ins (user_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS event_confirmations_token_idx
  ON event_confirmations (confirmation_token);

-- ── 6. Helper function: compute next_checkin_due ──────────────
CREATE OR REPLACE FUNCTION compute_next_checkin(frequency TEXT, from_time TIMESTAMPTZ)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  CASE frequency
    WHEN 'weekly'    THEN RETURN from_time + INTERVAL '7 days';
    WHEN 'monthly'   THEN RETURN from_time + INTERVAL '30 days';
    WHEN 'quarterly' THEN RETURN from_time + INTERVAL '90 days';
    ELSE                  RETURN from_time + INTERVAL '30 days';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 7. Trigger: auto-update next_checkin_due when frequency changes ──
CREATE OR REPLACE FUNCTION sync_next_checkin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_checkin_at IS NOT NULL AND
     (OLD.checkin_frequency IS DISTINCT FROM NEW.checkin_frequency OR
      OLD.last_checkin_at   IS DISTINCT FROM NEW.last_checkin_at) THEN
    NEW.next_checkin_due := compute_next_checkin(NEW.checkin_frequency, NEW.last_checkin_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_next_checkin_trigger ON profiles;
CREATE TRIGGER sync_next_checkin_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_next_checkin();

-- ── Done ──────────────────────────────────────────────────────
-- Next: run the process-checkins edge function + pg_cron setup (Migration 006)
