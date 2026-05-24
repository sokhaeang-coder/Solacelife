-- Migration 015: Clean-slate avatar storage RLS
-- Run this in your Supabase SQL Editor
-- Step 1 drops ALL existing policies on storage.objects for the memories bucket,
-- then Step 2 rebuilds them cleanly so there are no conflicts.

-- ── Step 1: Drop every known policy on memories storage ───────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- ── Step 2: Recreate with simple LIKE path check ──────────────────────────────

-- Allow any authenticated user to upload/overwrite their own avatar
CREATE POLICY "memories_avatar_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'memories'
  AND name LIKE 'profiles/' || auth.uid()::text || '/%'
);

CREATE POLICY "memories_avatar_update"
ON storage.objects FOR UPDATE TO authenticated
USING   (bucket_id = 'memories' AND name LIKE 'profiles/' || auth.uid()::text || '/%')
WITH CHECK (bucket_id = 'memories' AND name LIKE 'profiles/' || auth.uid()::text || '/%');

CREATE POLICY "memories_avatar_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'memories'
  AND name LIKE 'profiles/' || auth.uid()::text || '/%'
);

CREATE POLICY "memories_avatar_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'memories'
  AND name LIKE 'profiles/' || auth.uid()::text || '/%'
);

-- Allow authenticated users to manage everything else in the memories bucket
-- (their own memories, family photos, etc. — scoped to their user ID folder)
CREATE POLICY "memories_user_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'memories'
  AND name LIKE auth.uid()::text || '/%'
);

CREATE POLICY "memories_user_update"
ON storage.objects FOR UPDATE TO authenticated
USING   (bucket_id = 'memories' AND name LIKE auth.uid()::text || '/%')
WITH CHECK (bucket_id = 'memories' AND name LIKE auth.uid()::text || '/%');

CREATE POLICY "memories_user_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'memories' AND name LIKE auth.uid()::text || '/%');

CREATE POLICY "memories_user_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'memories' AND name LIKE auth.uid()::text || '/%');
