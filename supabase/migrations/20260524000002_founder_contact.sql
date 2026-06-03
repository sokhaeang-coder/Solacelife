-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration: Founder Contact (Sokha as first family member)
--
--  Every new user who signs up gets Sokha Eang (Founder) auto-added
--  to their family_members list. This is the "Tom from MySpace" pattern:
--  Sokha is always there at the start so no one's list feels empty.
--  Users CAN remove him — it's not forced. But for non-tech-savvy users
--  the "Founder" label makes it immediately clear who he is and why.
--
--  Changes:
--    1. Add is_founder_contact BOOLEAN to family_members
--    2. Update handle_new_user() to auto-insert Sokha on every new signup
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- ── 1. Add is_founder_contact column ─────────────────────────────────────────
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS is_founder_contact BOOLEAN NOT NULL DEFAULT FALSE;

-- Index — FamilyScreen can cheaply filter/highlight the founder card
CREATE INDEX IF NOT EXISTS family_members_founder_idx
  ON public.family_members (user_id)
  WHERE is_founder_contact = TRUE;

-- ── 2. Update handle_new_user() ───────────────────────────────────────────────
--
--  Preserves everything from migration 036 (writes email to profiles).
--  Adds the Sokha auto-insert. ON CONFLICT DO NOTHING is intentional:
--    • Prevents duplicate rows if the trigger fires twice (edge case)
--    • If Sokha's email already exists for this user (e.g. testing),
--      it's silently skipped rather than throwing a 23505 error.
--
--  email_confirmed = TRUE because Sokha doesn't need an invite flow.
--  is_founder_contact = TRUE so FamilyScreen can render him specially.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- ── Step 1: create the profile row (unchanged from migration 036) ──
  INSERT INTO public.profiles (id, email, account_type, onboarding_type)
  VALUES (NEW.id, NEW.email, 'sender', 'sender')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
    WHERE profiles.email IS NULL;

  -- ── Step 2: auto-add Sokha as the user's first family member ──────
  INSERT INTO public.family_members (
    user_id,
    name,
    email,
    relationship,
    relationship_label,
    is_founder_contact,
    email_confirmed
  ) VALUES (
    NEW.id,
    'Sokha Eang',
    'sokhaeang@gmail.com',
    'Other',
    'Founder',
    TRUE,
    TRUE
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 3. Backfill — add Sokha to existing users who don't have him ─────────────
--  Safe to run: ON CONFLICT DO NOTHING skips users who already have a
--  family_members row with sokhaeang@gmail.com (unique per user_id + email).
--  Only targets real sender accounts (not recipient-only users).
INSERT INTO public.family_members (
  user_id,
  name,
  email,
  relationship,
  relationship_label,
  is_founder_contact,
  email_confirmed
)
SELECT
  p.id,
  'Sokha Eang',
  'sokhaeang@gmail.com',
  'Other',
  'Founder',
  TRUE,
  TRUE
FROM public.profiles p
WHERE p.account_type IN ('sender', 'both')
  AND NOT EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.user_id = p.id
      AND fm.email = 'sokhaeang@gmail.com'
  )
ON CONFLICT DO NOTHING;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS founder_rows_inserted
FROM   public.family_members
WHERE  is_founder_contact = TRUE;
