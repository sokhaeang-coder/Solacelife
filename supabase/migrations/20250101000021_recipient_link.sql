-- ═══════════════════════════════════════════════════════════════
--  Migration 021 — Recipient Profile Linking
--  May 2026
--
--  Problem this solves:
--    When an invited family member signs up for the app, there is no
--    connection between their auth account (profiles row) and the
--    family_members row the sender created for them. The app has no
--    way to know they were invited, so it defaults them to a sender
--    account and sends them through the wrong onboarding.
--
--  Changes:
--    1. family_members — add recipient_profile_id + linked_at
--       Links a family member's auth account back to their row.
--       Set once on their first sign-in, never changed.
--
--    2. profiles — add onboarding_type
--       Tracks which onboarding path was used:
--         'sender'    = normal new user flow
--         'invited'   = came in via family invite
--         'converted' = started as recipient, chose to also become a sender
--
--    3. profiles — update account_type constraint
--       Add 'both' as a valid value for users who receive memories
--       AND create their own memories for others.
--
--  This is the Phase 1 foundation for the multi-generational
--  memory graph. Phase 2 will add user_connections without
--  breaking anything built here.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Link family member rows to their auth accounts ─────────

ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS recipient_profile_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_at            TIMESTAMPTZ;

-- Fast lookup: "is this email already a family member?" (fires on every sign-in)
CREATE INDEX IF NOT EXISTS idx_family_members_email
  ON public.family_members(email);

-- Fast lookup: "which family_member rows belong to this profile?"
CREATE INDEX IF NOT EXISTS idx_family_members_recipient_profile_id
  ON public.family_members(recipient_profile_id);

-- ── 2. Track which onboarding path each profile used ──────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_type TEXT DEFAULT 'sender'
    CHECK (onboarding_type IN ('sender', 'invited', 'converted'));

-- ── 3. Allow 'both' account type for multi-role users ─────────
--  Drop existing constraint first (name may vary by Supabase version),
--  then re-add with 'both' included.

DO $$
BEGIN
  -- Drop any existing check constraint on account_type
  ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_account_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_type_check
    CHECK (account_type IN ('sender', 'recipient', 'both'));

-- ── 4. RLS: recipients can read their own family_member rows ──
--  A family member who has signed up needs to read their own row
--  to fetch the sender's info for the welcome screen.

DROP POLICY IF EXISTS "recipients can read own family_member row" ON public.family_members;

CREATE POLICY "recipients can read own family_member row"
  ON public.family_members FOR SELECT
  USING (recipient_profile_id = auth.uid());

-- ── 5. RLS: family members can update their own link ──────────
--  The app writes recipient_profile_id + linked_at on first sign-in.
--  Uses service role in practice (Edge Function), but belt-and-suspenders.

DROP POLICY IF EXISTS "recipients can link their own row" ON public.family_members;

CREATE POLICY "recipients can link their own row"
  ON public.family_members FOR UPDATE
  USING  (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (recipient_profile_id = auth.uid());
