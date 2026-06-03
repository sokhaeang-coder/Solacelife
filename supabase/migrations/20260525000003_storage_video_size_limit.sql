-- Migration: Raise memories bucket file size limit to 500 MB
-- The default Supabase limit (~50 MB) is too small for 5-minute iPhone videos.
-- 524288000 bytes = 500 MB

UPDATE storage.buckets
SET    file_size_limit = 524288000   -- 500 MB
WHERE  id = 'memories';
