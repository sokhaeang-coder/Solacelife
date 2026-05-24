-- Migration 013: Storage RLS policies for avatar uploads
-- Run this in your Supabase SQL Editor
-- Allows authenticated users to upload/update their own avatar in the memories bucket
-- under the path: profiles/{user_id}/avatar.*

-- ── INSERT (upload new file) ──────────────────────────────────────────────────
CREATE POLICY "Users can upload their own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- ── UPDATE (upsert / overwrite) ───────────────────────────────────────────────
CREATE POLICY "Users can update their own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- ── SELECT (read your own avatar) ────────────────────────────────────────────
CREATE POLICY "Users can read their own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- ── DELETE (replace avatar) ───────────────────────────────────────────────────
CREATE POLICY "Users can delete their own avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
