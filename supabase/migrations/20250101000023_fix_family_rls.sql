-- ──────────────────────────────────────────────────────────────
--  Migration 023 — Fix family_members RLS permission error
--
--  Problem:
--    Migration 021 created an UPDATE policy that subqueries
--    auth.users directly:
--      USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
--
--    The 'authenticated' role does not have SELECT on auth.users,
--    causing "permission denied for table users" whenever any
--    RLS check on family_members fires (even SELECT policies
--    re-evaluate all policies in some PG versions).
--
--  Fix:
--    Replace the subquery with auth.email() — a Supabase-provided
--    function that returns the current user's email without
--    requiring direct access to auth.users.
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "recipients can link their own row" ON public.family_members;

CREATE POLICY "recipients can link their own row"
  ON public.family_members FOR UPDATE
  USING  (email = auth.email())
  WITH CHECK (recipient_profile_id = auth.uid());
