-- ════════════════════════════════════════════════════════════════
--  SOLACE LIFE — Full Database Wipe for Fresh Testing
--
--  KEEPS:   sokha@reeltors.ca (Sokha Eang) — auth account + profile
--  DELETES: All other auth users + their data
--           ALL memories (including Sokha's) — fresh start for testing
--           ALL family_members, scheduled_deliveries, abuse_reports
--           ALL zero-byte broken voice blobs (already covered above)
--
--  ⚠️  IRREVERSIBLE — run this only in development / test environment
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
--  Paste the whole file. Run STEP 0 SELECT first to confirm ID,
--  then run the DO $$ block to perform the wipe.
-- ════════════════════════════════════════════════════════════════


-- ── STEP 0: Preview — confirm which account will be KEPT ────────
--  Run just this block first. You should see Sokha Eang's row.
SELECT
  u.id,
  u.email,
  p.full_name,
  p.account_type
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'sokha@reeltors.ca';
-- ↑ Verify this returns exactly one row before continuing.


-- ── STEP 1: Wipe ────────────────────────────────────────────────
--  Run this block to perform the full cleanup.
DO $$
DECLARE
  keep_id UUID;
BEGIN

  -- Identify the account to keep
  SELECT id INTO keep_id
  FROM auth.users
  WHERE email = 'sokha@reeltors.ca';

  IF keep_id IS NULL THEN
    RAISE EXCEPTION 'sokha@reeltors.ca not found — aborting wipe.';
  END IF;

  RAISE NOTICE 'Keeping user ID: %', keep_id;

  -- ── Abuse reports — only if the table exists (migration 037) ─
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'abuse_reports'
  ) THEN
    DELETE FROM public.abuse_reports;
    RAISE NOTICE 'Cleared: abuse_reports';
  ELSE
    RAISE NOTICE 'Skipped: abuse_reports (table not yet created — run migration 037 after this wipe)';
  END IF;

  -- ── Service inquiries — only if the table exists ────────────
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_inquiries'
  ) THEN
    DELETE FROM public.service_inquiries;
    RAISE NOTICE 'Cleared: service_inquiries';
  ELSE
    RAISE NOTICE 'Skipped: service_inquiries (table not found)';
  END IF;

  -- ── Scheduled deliveries — ALL users ────────────────────────
  --    (FK dependency: must go before memories + family_members)
  DELETE FROM public.scheduled_deliveries;
  RAISE NOTICE 'Cleared: scheduled_deliveries';

  -- ── Memories — ALL users (Sokha included, for a clean test) ─
  DELETE FROM public.memories;
  RAISE NOTICE 'Cleared: memories';

  -- ── Family members — ALL ────────────────────────────────────
  DELETE FROM public.family_members;
  RAISE NOTICE 'Cleared: family_members';

  -- ── User occasions — other users only (keep Sokha's prefs) ─
  DELETE FROM public.user_occasions
  WHERE user_id <> keep_id;
  RAISE NOTICE 'Cleared: user_occasions (other users)';

  -- ── Emergency contacts — other users only (if table exists) ─
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'emergency_contacts'
  ) THEN
    DELETE FROM public.emergency_contacts WHERE user_id <> keep_id;
    RAISE NOTICE 'Cleared: emergency_contacts (other users)';
  ELSE
    RAISE NOTICE 'Skipped: emergency_contacts (table not found)';
  END IF;

  -- ── Profiles — other users ──────────────────────────────────
  DELETE FROM public.profiles
  WHERE id <> keep_id;
  RAISE NOTICE 'Cleared: profiles (other users)';

  -- ── Auth users — other users ─────────────────────────────────
  --    This deletes the actual sign-in credentials for everyone
  --    except Sokha. Requires service_role (SQL Editor has this).
  DELETE FROM auth.users
  WHERE id <> keep_id;
  RAISE NOTICE 'Cleared: auth.users (other users)';

  RAISE NOTICE '✅ Wipe complete. Kept: sokha@reeltors.ca (ID: %)', keep_id;

END $$;


-- ── STEP 2: Verify ──────────────────────────────────────────────
--  Run these after the DO block to confirm the state.

SELECT 'auth.users'          AS tbl, COUNT(*) AS remaining FROM auth.users
UNION ALL
SELECT 'profiles',                   COUNT(*) FROM public.profiles
UNION ALL
SELECT 'memories',                   COUNT(*) FROM public.memories
UNION ALL
SELECT 'family_members',             COUNT(*) FROM public.family_members
UNION ALL
SELECT 'scheduled_deliveries',       COUNT(*) FROM public.scheduled_deliveries
ORDER BY tbl;
-- Expected: auth.users = 1, profiles = 1, everything else = 0
-- Note: abuse_reports doesn't exist yet — run migration 037 next to create it.
