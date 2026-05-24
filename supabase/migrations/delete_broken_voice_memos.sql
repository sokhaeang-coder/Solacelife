-- ════════════════════════════════════════════════════════════════
--  ONE-TIME CLEANUP — Delete broken voice memo records
--
--  The old fetch().blob() upload bug stored 0-byte files in storage.
--  These rows have file_size = 0 and can never be played back.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
--  Safe to run multiple times (idempotent).
-- ════════════════════════════════════════════════════════════════

-- Step 1: See what will be deleted (run this first to confirm)
SELECT id, title, file_path, file_size, created_at
FROM   public.memories
WHERE  type      = 'voice'
  AND  file_size = 0;

-- Step 2: Delete scheduled deliveries for those memories first
--         (removes FK dependency so the DELETE below won't be blocked)
DELETE FROM public.scheduled_deliveries
WHERE memory_id IN (
  SELECT id FROM public.memories
  WHERE  type = 'voice' AND file_size = 0
);

-- Step 3: Delete the broken memory rows themselves
--         (storage objects are orphaned but harmless — Supabase will
--          not serve them since the signed-URL path is gone)
DELETE FROM public.memories
WHERE  type      = 'voice'
  AND  file_size = 0;

-- Confirm: should return 0 rows
SELECT COUNT(*) AS remaining_broken
FROM   public.memories
WHERE  type = 'voice' AND file_size = 0;
