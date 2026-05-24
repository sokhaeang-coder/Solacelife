-- ═══════════════════════════════════════════════════════════════
--  SOLACE LIFE — Occasion Nudge Daily Cron Job
--
--  Prerequisites:
--    1. pg_cron extension enabled  (Database → Extensions → pg_cron)
--    2. pg_net extension enabled   (Database → Extensions → pg_net)
--    3. Edge Function deployed     (see deploy instructions below)
--
--  Before running this file, replace the two placeholders:
--    YOUR_PROJECT_REF      →  found in Supabase Settings → General
--    YOUR_SERVICE_ROLE_KEY →  found in Supabase Settings → API
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ─── Remove old job if re-running this script ───────────────
select cron.unschedule('send-occasion-nudge')
where exists (
  select 1 from cron.job where jobname = 'send-occasion-nudge'
);


-- ─── Schedule: runs every day at 10:00 AM UTC ───────────────
--  10 AM UTC = 3 AM PST / 6 AM EST.
--  Adjust the hour (0-23) to match your preferred timezone offset.

select cron.schedule(
  'send-occasion-nudge',             -- job name
  '0 10 * * *',                      -- every day at 10:00 UTC
  $$
  select net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-occasion-nudge',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  )
  $$
);


-- ─── Verify the job was created ─────────────────────────────
select jobid, jobname, schedule, active
from cron.job
where jobname = 'send-occasion-nudge';


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
--     supabase link --project-ref YOUR_PROJECT_REF
--
--  4. Deploy the function:
--     supabase functions deploy send-occasion-nudge
--
--  5. Test it manually (optional):
--     supabase functions invoke send-occasion-nudge --method POST
--
-- ═══════════════════════════════════════════════════════════════
