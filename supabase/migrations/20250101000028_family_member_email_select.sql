-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 028: family_members email SELECT policy
--
--  Problem:
--    applySession in App.tsx looks for unlinked family_members rows
--    with .eq('email', email).is('recipient_profile_id', null)
--    For already-onboarded users (e.g. a sender who was later added
--    as a G2 by someone else), the existing SELECT policies don't
--    match — user_id ≠ auth.uid() and recipient_profile_id IS NULL.
--    The query returns nothing so the row is never linked.
--
--  Fix:
--    Add a SELECT policy using auth.email() so any authenticated user
--    can read family_members rows where their own email is stored.
--    This is safe — users only see rows containing their own email.
--    It is consistent with the existing UPDATE policy (migration 023)
--    which already uses email = auth.email() to gate updates.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users can read family_member rows with their email" ON public.family_members;

CREATE POLICY "users can read family_member rows with their email"
  ON public.family_members FOR SELECT
  USING (email = auth.email());

-- ── Verify ──────────────────────────────────────────────────────
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'family_members'
ORDER BY policyname;
