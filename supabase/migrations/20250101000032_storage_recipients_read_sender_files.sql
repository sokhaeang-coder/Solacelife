-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 032: recipients can read sender memory files
--
--  Problem:
--    The existing storage policy "memories_user_select" (migration 015) is:
--      name LIKE auth.uid()::text || '/%'
--    This is self-only — a user can only create signed URLs for files they
--    own (i.e. stored under their own uid/ prefix in the memories bucket).
--
--    When G2 taps a received memory (voice/video/photo), the app resolves
--    a signed URL using mem.file_path, which points to:
--      {G1_uid}/{file}.m4a   (voice)
--      {G1_uid}/{file}.mp4   (video)
--      {G1_uid}/photos/{file}.jpg  (photo)
--
--    The storage policy blocks this — split_part(name,'/',1) = G1_uid, not G2_uid.
--    Result: createSignedUrl() returns null → media fails to play.
--
--  Fix:
--    Add a SELECT policy that allows G2 to read any file in the memories
--    bucket whose first path segment (the owner uid) is a user_id that has
--    G2 listed as a linked recipient in family_members.
--
--    This is intentionally scoped — G2 can only read files belonging to
--    users who have explicitly linked G2 as a recipient. G2 cannot read
--    arbitrary users' files.
--
--    The existing self-read policy is unchanged.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "recipients can read sender memory files" ON storage.objects;

CREATE POLICY "recipients can read sender memory files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'memories'
  AND split_part(name, '/', 1) IN (
    SELECT fm.user_id::text
    FROM   public.family_members fm
    WHERE  fm.recipient_profile_id = auth.uid()
  )
);

-- ── Verify ──────────────────────────────────────────────────────
SELECT policyname, cmd, qual
FROM   pg_policies
WHERE  schemaname = 'storage' AND tablename = 'objects'
ORDER  BY policyname;
