-- ════════════════════════════════════════════════════════════════
--  SOLACE LIFE — Full Database Wipe for Fresh Testing
--
--  DELETES: ALL auth users + ALL data + ALL storage objects
--
--  Use this when you want a completely clean slate to test the
--  full G1 → G2 invite & consent flow from scratch.
--  Schema / table structures are NOT touched — only rows.
--
--  ⚠️  IRREVERSIBLE — development / test use only
--
--  How to run:
--    Supabase Dashboard → SQL Editor → New Query
--    Paste the WHOLE file and run. Or run each step separately.
-- ════════════════════════════════════════════════════════════════


-- ── STEP 0: Preview ─────────────────────────────────────────────
--  Run this first to see who will be deleted.
SELECT
  u.id,
  u.email,
  p.full_name,
  p.account_type,
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.created_at;


-- ── STEP 1: Full Wipe ───────────────────────────────────────────
--  Deletes all rows. Schema stays intact.
DO $$
BEGIN

  -- ── Storage objects (avatars, voice memos, photos) ──────────
  DELETE FROM storage.objects WHERE bucket_id = 'memories';
  RAISE NOTICE 'Cleared: storage.objects (memories bucket)';

  -- ── Abuse reports ────────────────────────────────────────────
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'abuse_reports'
  ) THEN
    DELETE FROM public.abuse_reports;
    RAISE NOTICE 'Cleared: abuse_reports';
  END IF;

  -- ── Service inquiries ────────────────────────────────────────
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_inquiries'
  ) THEN
    DELETE FROM public.service_inquiries;
    RAISE NOTICE 'Cleared: service_inquiries';
  END IF;

  -- ── Scheduled deliveries ─────────────────────────────────────
  --    Must go before memories (FK dependency)
  DELETE FROM public.scheduled_deliveries;
  RAISE NOTICE 'Cleared: scheduled_deliveries';

  -- ── Memories ─────────────────────────────────────────────────
  DELETE FROM public.memories;
  RAISE NOTICE 'Cleared: memories';

  -- ── Family members (includes all emergency consent state) ────
  DELETE FROM public.family_members;
  RAISE NOTICE 'Cleared: family_members';

  -- ── User occasions ───────────────────────────────────────────
  DELETE FROM public.user_occasions;
  RAISE NOTICE 'Cleared: user_occasions';

  -- ── Emergency contacts (legacy table, if exists) ─────────────
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'emergency_contacts'
  ) THEN
    DELETE FROM public.emergency_contacts;
    RAISE NOTICE 'Cleared: emergency_contacts';
  END IF;

  -- ── Profiles ─────────────────────────────────────────────────
  DELETE FROM public.profiles;
  RAISE NOTICE 'Cleared: profiles';

  -- ── Auth users (sign-in credentials for everyone) ────────────
  --    SQL Editor runs as service_role — this is allowed.
  DELETE FROM auth.users;
  RAISE NOTICE 'Cleared: auth.users';

  RAISE NOTICE '✅ Full wipe complete — ready for fresh G1/G2 test.';

END $$;


-- ── STEP 2: Verify ──────────────────────────────────────────────
--  All counts should be 0.
SELECT 'auth.users'          AS tbl, COUNT(*) AS remaining FROM auth.users
UNION ALL
SELECT 'profiles',                   COUNT(*) FROM public.profiles
UNION ALL
SELECT 'memories',                   COUNT(*) FROM public.memories
UNION ALL
SELECT 'family_members',             COUNT(*) FROM public.family_members
UNION ALL
SELECT 'scheduled_deliveries',       COUNT(*) FROM public.scheduled_deliveries
UNION ALL
SELECT 'storage (memories)',         COUNT(*) FROM storage.objects WHERE bucket_id = 'memories'
ORDER BY tbl;
-- ↑ Expected: all rows = 0
