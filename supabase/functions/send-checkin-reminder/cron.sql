-- ═══════════════════════════════════════════════════════════════
--  SOLACE LIFE — Check-in Reminder Cron Job
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
select cron.unschedule('send-checkin-reminder')
where exists (
  select 1 from cron.job where jobname = 'send-checkin-reminder'
);


-- ─── Schedule: runs every 6 hours ───────────────────────────
--  Fires at 00:00, 06:00, 12:00, and 18:00 UTC.
--  Running 4× per day ensures a user whose check-in window opens
--  at any time of day still receives a timely reminder.

select cron.schedule(
  'send-checkin-reminder',           -- job name
  '0 */6 * * *',                     -- every 6 hours
  $$
  select net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-checkin-reminder',
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
where jobname = 'send-checkin-reminder';


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
--     supabase functions deploy send-checkin-reminder
--
--  5. Test it manually (optional):
--     supabase functions invoke send-checkin-reminder --method POST
--
-- ═══════════════════════════════════════════════════════════════
