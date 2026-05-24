-- ──────────────────────────────────────────────────────────────
--  Migration 018 — Add phone number to family_members
-- ──────────────────────────────────────────────────────────────

alter table family_members
  add column if not exists phone text;
