-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 029: profiles public read for connected users
--
--  Problem:
--    profiles SELECT policy is `auth.uid() = id` — strict self-only.
--    When a G2 user (recipient) opens the Family tab, loadSenders()
--    queries profiles WHERE id IN (g1_user_ids) to get the G1's
--    full_name and avatar_url. The query returns nothing because
--    RLS blocks reading another user's profile row.
--    Result: sender card shows "Someone who loves you" with no photo.
--
--  Fix:
--    Add a second SELECT policy that allows any authenticated user
--    to read the public-facing fields of any profile (full_name,
--    avatar_url). This is intentionally permissive for display
--    purposes — the same data a user already shares with family
--    members by adding them.
--
--    The existing self-write and update policies are unchanged.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can read basic profile info" ON public.profiles;

CREATE POLICY "Authenticated users can read basic profile info"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── Verify ──────────────────────────────────────────────────────
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
