-- ──────────────────────────────────────────────────────────────
--  Migration 019 — Family member email confirmation
--
--  Adds a one-click confirmation token so the family member
--  can verify their email is correct by clicking a link in
--  the invite email. Protects against typos sending years of
--  memories to the wrong address.
-- ──────────────────────────────────────────────────────────────

alter table family_members
  add column if not exists email_confirmed    boolean   not null default false,
  add column if not exists confirmation_token uuid      not null default gen_random_uuid(),
  add column if not exists confirmed_at       timestamptz;

-- Index so the Edge Function can look up by token quickly
create index if not exists idx_family_members_confirmation_token
  on family_members (confirmation_token);
