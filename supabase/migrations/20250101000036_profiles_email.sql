-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 036: add email column to profiles
--
--  Problem:
--    When G2 (recipient) opens the FamilyScreen sender detail modal
--    for G1 (sender), there is no way to display G1's email because:
--      a) auth.users is not readable by other users client-side
--      b) profiles had no email column
--
--  Fix:
--    1. Add profiles.email TEXT column (nullable, no unique constraint
--       — email uniqueness is already enforced by auth.users).
--    2. Backfill existing rows from auth.users.email.
--    3. Update handle_new_user() to write email on signup.
--    4. Add a trigger on auth.users UPDATE to keep profiles.email in
--       sync if the user ever changes their auth email.
--
--  After running this migration, G2 can read G1's email from the
--  profiles table (already publicly readable via migration 029).
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- Step 1: Add email column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Step 2: Backfill from auth.users
UPDATE public.profiles p
SET    email = u.email
FROM   auth.users u
WHERE  u.id = p.id
  AND  p.email IS NULL;

-- Step 3: Update handle_new_user() to capture email on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, account_type, onboarding_type)
  VALUES (NEW.id, NEW.email, 'sender', 'sender')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
    WHERE profiles.email IS NULL;
  RETURN NEW;
END;
$$;

-- Step 4: Keep profiles.email in sync when auth email changes
CREATE OR REPLACE FUNCTION sync_profile_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET    email = NEW.email
    WHERE  id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE sync_profile_email();

-- ── Verify ──────────────────────────────────────────────────────
SELECT id, email
FROM   public.profiles
LIMIT  5;
-- Should show email values for existing users.
