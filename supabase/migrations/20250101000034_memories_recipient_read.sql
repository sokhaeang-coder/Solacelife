-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 034: recipients can read delivered memories
--
--  Problem:
--    Migration 031 gave G2 SELECT on scheduled_deliveries rows where they
--    are the recipient. But the join in loadReceivedMemories() is:
--      .select('*, memories(*)')
--    Supabase evaluates RLS on the joined 'memories' table separately.
--    The existing memories SELECT policy is sender-only:
--      user_id = auth.uid()
--    G1's memories have user_id = G1_uid. G2 (recipient) is not G1_uid,
--    so RLS blocks the join → delivery.memories = null → the modal
--    shows the profile card but renders nothing in the ScrollView.
--
--  Fix:
--    Add a SELECT policy on memories that allows a user to read any
--    memory that has been scheduled for delivery to them (i.e. a
--    scheduled_deliveries row exists linking that memory to a
--    family_members row where they are the listed recipient).
--
--    This is intentionally scoped — G2 can only read memories that
--    G1 explicitly scheduled for G2, not all of G1's memories.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "recipients can read delivered memories" ON public.memories;

CREATE POLICY "recipients can read delivered memories"
  ON public.memories FOR SELECT
  USING (
    id IN (
      SELECT sd.memory_id
      FROM   public.scheduled_deliveries sd
      JOIN   public.family_members fm ON fm.id = sd.family_member_id
      WHERE  fm.recipient_profile_id = auth.uid()
    )
  );

-- ── Verify ──────────────────────────────────────────────────────
SELECT policyname, cmd, qual
FROM   pg_policies
WHERE  tablename = 'memories'
ORDER  BY policyname;
