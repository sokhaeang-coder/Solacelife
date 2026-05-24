-- ═══════════════════════════════════════════════════════════════
--  SOLACE LIFE — Time Capsule Daily Cron Job
--
--  Prerequisites:
--    1. pg_cron extension enabled  (Database → Extensions → pg_cron)
--    2. pg_net extension enabled   (Database → Extensions → pg_net)
--    3. Edge Function deployed     (see deploy instructions below)
--
--  Before running this file, replace the two placeholders:
--    YOUR_PROJECT_REF   →  found in Supabase Settings → General
--    YOUR_SERVICE_ROLE_KEY → found in Supabase Settings → API
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ─── Remove old job if re-running this script ───────────────
select cron.unschedule('deliver-time-capsules')
where exists (
  select 1 from cron.job where jobname = 'deliver-time-capsules'
);


-- ─── Schedule: runs every day at 9:00 AM UTC ────────────────
--  9 AM UTC = 2 AM PST / 5 AM EST — quiet hours, arrives in
--  recipient inboxes first thing in the morning their time.
--  Adjust the hour (0-23) to match your preferred timezone.

select cron.schedule(
  'deliver-time-capsules',          -- job name
  '0 9 * * *',                      -- every day at 09:00 UTC
  $$
  select net.http_post(
    url     := 'https://yfthwahxahjabfbuntys.supabase.co/functions/v1/deliver-time-capsules',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdGh3YWh4YWhqYWJmYnVudHlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYxMTgzMCwiZXhwIjoyMDk0MTg3ODMwfQ.lHMDYmBH3TCeOsX-4sQqNEQzwufjSqbb7NZKVsGOnIY'
    ),
    body    := '{}'::jsonb
  )
  $$
);


-- ─── Verify the job was created ─────────────────────────────
select jobid, jobname, schedule, active
from cron.job
where jobname = 'deliver-time-capsules';


-- ═══════════════════════════════════════════════════════════════
--  HOW TO DEPLOY THE EDGE FUNCTION
--  Run these commands in your terminal from the Solace-Life folder:
--
--  1. Install Supabase CLI (if not already):
--     npm install -g supabase
--
--  2. Login:
--     supabase login
--
--  3. Link your project (one-time):
--     supabase link --project-ref yfthwahxahjabfbuntys
--
--  4. Deploy the function:
--     supabase functions deploy deliver-time-capsules
--
--  5. Test it manually (optional):
--     supabase functions invoke deliver-time-capsules --method POST
--
-- ═══════════════════════════════════════════════════════════════
