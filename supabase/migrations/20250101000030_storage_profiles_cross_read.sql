-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 030: cross-user profile avatar read
--
--  Problem:
--    The existing storage policy "memories_avatar_select" (migration 015) is:
--      name LIKE 'profiles/' || auth.uid()::text || '/%'
--    This is self-only — a user can only create signed URLs for their OWN
--    avatar file at profiles/{their_uid}/avatar.jpg.
--
--    When G2 loads the Family tab, loadSenders() resolves G1's avatar by
--    calling createSignedUrl('profiles/G1_UID/avatar.jpg'). The storage
--    policy blocks this → signed URL returns null → no photo shown.
--
--    This is the second half of the photo fix (migration 029 handles the
--    first half: allowing G2 to read G1's profiles table row).
--
--  Fix:
--    Add an additional SELECT policy that allows any authenticated user
--    to read (create signed URLs for) any file in the 'profiles/' prefix
--    of the memories bucket.
--
--    Profile avatars are public-facing display information — the same data
--    a user shares with anyone who has them in their family list.
--
--    The existing self-write/delete policies are unchanged; this only
--    broadens READ access for the profiles/ prefix.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "memories_profiles_cross_read" ON storage.objects;

CREATE POLICY "memories_profiles_cross_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'memories'
  AND name LIKE 'profiles/%'
);

-- ── Verify ──────────────────────────────────────────────────────
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
