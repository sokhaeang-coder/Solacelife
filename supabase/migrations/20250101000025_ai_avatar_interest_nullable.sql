-- ──────────────────────────────────────────────────────────────
--  Migration 025 — Make ai_avatar_interested nullable
--
--  NULL  = user has not yet seen / responded to the prompt
--  TRUE  = user said Yes  (interested — count these for the build decision)
--  FALSE = user said No   (not interested — card disappears, still useful data)
--
--  Migration 024 added it as NOT NULL DEFAULT FALSE which conflates
--  "no answer" with "said no". This corrects that.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ALTER COLUMN ai_avatar_interested DROP NOT NULL,
  ALTER COLUMN ai_avatar_interested DROP DEFAULT;
