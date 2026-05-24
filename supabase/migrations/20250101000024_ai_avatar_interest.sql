-- ──────────────────────────────────────────────────────────────
--  Migration 024 — AI Avatar interest signal
--
--  Adds a lightweight flag to profiles so we can count how many
--  users opt in to the AI Avatar waitlist from the home screen
--  interest card. No separate table needed — one boolean per user.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_avatar_interested    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_avatar_interested_at TIMESTAMPTZ;
