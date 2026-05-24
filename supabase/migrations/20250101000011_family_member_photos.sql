-- Migration 011: Add photo support to family_members
-- Run this entire file in Supabase Dashboard → SQL Editor → New query

-- ── Step 1: Add photo_url column ─────────────────────────────────────────────
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN family_members.photo_url IS
  'Storage path in the memories bucket (e.g. {user_id}/family-photos/{member_id}.jpg). Signed URLs generated at runtime.';


-- ── Step 2: Storage policies for family photos ────────────────────────────────
-- The app uploads family photos to the memories bucket at path:
--   {user_id}/family-photos/{member_id}.jpg
-- The first path segment is always the user's UUID, which is what the policy checks.
-- These policies are additive — they will not break existing memories bucket policies.

-- Allow authenticated users to upload family photos to their own folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'family photos insert'
  ) THEN
    CREATE POLICY "family photos insert"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'memories'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

-- Allow authenticated users to read (sign URLs for) their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'family photos select'
  ) THEN
    CREATE POLICY "family photos select"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'memories'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

-- Allow authenticated users to overwrite (upsert) their own family photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'family photos update'
  ) THEN
    CREATE POLICY "family photos update"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'memories'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

-- Allow authenticated users to delete their own family photos (on member removal)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'family photos delete'
  ) THEN
    CREATE POLICY "family photos delete"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'memories'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;
