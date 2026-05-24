-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 035: deduplicate family_members + unique
--                               constraint on (user_id, recipient_profile_id)
--
--  Problem:
--    loadFamilyMembersWithPhotos() auto-creates a G2→G1 reciprocal
--    family_members row so G2 can use G1 in the "Deliver to" picker.
--    The function runs on both mount AND tab-focus events. If both
--    fire before the first INSERT commits, both see no existing row
--    and both insert → duplicate rows for the same (user_id, recipient_profile_id).
--
--    Symptoms:
--      - 2× "Sokha Eang" entries in G2's Family Members list
--      - 2× "Sokha" entries in the "Deliver to" picker
--
--  Fix:
--    1. Delete duplicate (user_id, recipient_profile_id) rows, keeping
--       the most recent one (latest created_at).
--    2. Add a partial UNIQUE INDEX on (user_id, recipient_profile_id)
--       WHERE recipient_profile_id IS NOT NULL. This makes future
--       upserts idempotent via ON CONFLICT DO NOTHING.
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- Step 1: Remove duplicates — keep the most recent row per
--         (user_id, recipient_profile_id) pair (by created_at DESC).
--         id is UUID so MAX(id) doesn't work — use ROW_NUMBER() instead.
DELETE FROM public.family_members
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, recipient_profile_id
             ORDER BY created_at DESC
           ) AS rn
    FROM   public.family_members
    WHERE  recipient_profile_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add partial unique index to prevent future duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS family_members_user_recipient_unique
  ON public.family_members (user_id, recipient_profile_id)
  WHERE recipient_profile_id IS NOT NULL;

-- ── Verify row count and index ───────────────────────────────────
SELECT user_id, recipient_profile_id, COUNT(*) AS cnt
FROM   public.family_members
WHERE  recipient_profile_id IS NOT NULL
GROUP  BY user_id, recipient_profile_id
HAVING COUNT(*) > 1;
-- Should return 0 rows if dedup succeeded.

SELECT indexname, indexdef
FROM   pg_indexes
WHERE  tablename = 'family_members'
  AND  indexname = 'family_members_user_recipient_unique';
