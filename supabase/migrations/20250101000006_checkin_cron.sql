-- ============================================================
-- Solace Life — Migration 006: Daily Check-in Cron Job
-- Run as a NEW QUERY in Supabase SQL Editor
--
-- Requires pg_cron extension (enabled by default on Supabase).
-- This schedules the process-checkins edge function to run
-- every day at 9:00 AM UTC.
-- ============================================================

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- ── Remove old job if it exists ───────────────────────────────
SELECT cron.unschedule('solace-daily-checkin')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'solace-daily-checkin'
);

-- ── Schedule: every day at 9:00 AM UTC ───────────────────────
SELECT cron.schedule(
  'solace-daily-checkin',       -- job name
  '0 9 * * *',                  -- cron: 9am UTC daily
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/process-checkins',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ── Verify the job was created ────────────────────────────────
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'solace-daily-checkin';

-- ── Note ──────────────────────────────────────────────────────
-- You must also set these Postgres settings in Supabase:
-- Dashboard → Database → Extensions → pg_net (enable)
-- Dashboard → Database → Settings → add:
--   app.supabase_url  = 'https://yfthwahxahjabfbuntys.supabase.co'
--   app.service_role_key = '<your service role key>'
--
-- Alternative: use Supabase's built-in scheduled functions
-- (Dashboard → Edge Functions → Schedule) if pg_net isn't available.
-- ============================================================
