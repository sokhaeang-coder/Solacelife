-- ──────────────────────────────────────────────────────────────
--  Migration 026 — Occasion suggestions toggle
--
--  Adds a per-user flag that controls whether the "Suggested moments"
--  bottom sheet appears after a new family member is added.
--
--  Default TRUE — most users are in proactive planning mode and benefit
--  from the prompts. Users processing active grief can disable in Settings.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_occasion_suggestions BOOLEAN NOT NULL DEFAULT true;
