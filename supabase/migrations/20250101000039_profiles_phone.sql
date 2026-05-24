-- ═══════════════════════════════════════════════════════════════
--  SOLACE LIFE — Migration 039: Add phone to profiles
--
--  Allows users to store their phone number in their own profile.
--  On save, the app syncs this back to any family_members rows
--  that reference them as recipient_profile_id, so contacts
--  staying in other users' Family lists always see current info.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;
