-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 031: recipients can read their deliveries
--
--  Problem:
--    scheduled_deliveries SELECT policy is:
--      using (auth.uid() = user_id)
--    This is sender-only. user_id = G1 (the sender).
--    G2 (the recipient) is NOT the user_id — G2 is linked via
--    family_members.recipient_profile_id.
--
--    When G2's Memories tab calls loadReceivedMemories(), it queries:
--      scheduled_deliveries WHERE family_member_id IN [memberIds]
--    RLS blocks every row because G2.uid ≠ user_id → returns nothing.
--    Result: G2 sees no sender cards and no received memories at all.
--
--  Fix:
--    Add a second SELECT policy that allows a user to read any
--    scheduled_deliveries row whose family_member_id points to a
--    family_members row where they are the linked recipient.
--
--    The existing sender-only policy is unchanged — G1 still reads
--    their own rows via user_id = auth.uid().
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "recipients can read their own deliveries" ON public.scheduled_deliveries;

CREATE POLICY "recipients can read their own deliveries"
  ON public.scheduled_deliveries FOR SELECT
  USING (
    family_member_id IN (
      SELECT id
      FROM   public.family_members
      WHERE  recipient_profile_id = auth.uid()
    )
  );

-- ── Verify ──────────────────────────────────────────────────────
SELECT policyname, cmd, qual
FROM   pg_policies
WHERE  tablename = 'scheduled_deliveries'
ORDER  BY policyname;
