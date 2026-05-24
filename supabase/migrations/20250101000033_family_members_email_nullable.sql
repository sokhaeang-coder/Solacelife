-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 033: make family_members.email nullable
--
--  Problem:
--    family_members.email is TEXT NOT NULL with a UNIQUE(user_id, email)
--    constraint. When G2 loads MemoriesScreen, the app auto-creates a
--    reciprocal G2→G1 family_members row so G2 can send memories back
--    to G1. This insert does not include an email (G1's email is not
--    accessible client-side via the Supabase auth API). The NOT NULL
--    constraint causes the insert to fail silently → G1 never appears
--    in G2's "Deliver to" picker.
--
--  Fix:
--    1. Drop the NOT NULL constraint on email so reciprocal rows can
--       be inserted without an email address.
--    2. Replace the table-level UNIQUE(user_id, email) constraint with
--       a partial unique index that only enforces uniqueness when email
--       IS NOT NULL — this preserves duplicate-invite prevention for
--       normal G1→G2 invitations while allowing multiple NULL-email rows.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- Step 1: Drop the NOT NULL constraint on email
ALTER TABLE public.family_members
  ALTER COLUMN email DROP NOT NULL;

-- Step 2: Drop the old table-level unique constraint
ALTER TABLE public.family_members
  DROP CONSTRAINT IF EXISTS family_members_user_id_email_key;

-- Step 3: Re-add as a partial unique index (only when email IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS family_members_user_id_email_key
  ON public.family_members (user_id, email)
  WHERE email IS NOT NULL;

-- ── Verify ──────────────────────────────────────────────────────
SELECT column_name, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'family_members'
  AND  column_name  = 'email';
