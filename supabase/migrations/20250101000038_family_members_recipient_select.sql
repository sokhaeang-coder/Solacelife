-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 038: family_members SELECT policy for
--                               recipient_profile_id = auth.uid()
--
--  Problem:
--    loadFamilyMembersWithPhotos() in MemoriesScreen queries:
--      family_members WHERE recipient_profile_id = auth.uid()
--    to find G1 senders who have added G2 as a recipient.
--    No existing SELECT policy covers this case — the existing
--    policies only allow reading rows where:
--      • user_id = auth.uid()   (own rows as sender)
--      • email = auth.email()   (rows containing your email)
--
--    Without this policy, senderLinks returns [] and the G2→G1
--    reciprocal row is never auto-created, so G1 never appears
--    in G2's "Deliver to" picker.
--
--  Fix:
--    Add a SELECT policy so any authenticated user can read
--    family_members rows where they are the linked recipient.
--    This is safe — users only see rows that explicitly reference
--    their own profile ID.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "recipients can read rows linked to their profile" ON public.family_members;

CREATE POLICY "recipients can read rows linked to their profile"
  ON public.family_members FOR SELECT
  USING (recipient_profile_id = auth.uid());

-- ── Verify ───────────────────────────────────────────────────────
SELECT policyname, cmd, qual
FROM   pg_policies
WHERE  tablename = 'family_members'
ORDER  BY policyname;
