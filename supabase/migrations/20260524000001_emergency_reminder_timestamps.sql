-- ═══════════════════════════════════════════════════════════════
--  Migration 041 — Emergency Consent Reminder Timestamps
--
--  Adds three timestamp columns to family_members:
--    emergency_consent_requested_at — set when consent email is sent
--    emergency_reminder_7d_sent_at  — set after 7-day nudge fires
--    emergency_reminder_30d_sent_at — set after 30-day final nudge
--
--  The send-emergency-reminders edge function reads these to
--  decide which wave to send, ensuring each fires exactly once.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS emergency_consent_requested_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emergency_reminder_7d_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emergency_reminder_30d_sent_at  TIMESTAMPTZ;

-- Backfill: any row currently 'pending' gets now() as the request date
-- so reminders don't immediately fire for existing pending rows.
UPDATE family_members
SET emergency_consent_requested_at = NOW()
WHERE emergency_consent_status = 'pending'
  AND emergency_consent_requested_at IS NULL;

-- ── pg_cron: run reminder check daily at 09:00 UTC ────────────
-- Requires the pg_cron extension (enabled in Supabase by default).
-- The job hits the edge function via the Supabase internal invoker.
-- NOTE: Replace <SUPABASE_SERVICE_ROLE_KEY> with your actual key
--       in the Supabase Dashboard → SQL Editor before running.
SELECT cron.schedule(
  'emergency-consent-reminders',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url    := 'https://yfthwahxahjabfbuntys.supabase.co/functions/v1/send-emergency-reminders',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}'::jsonb,
      body   := '{}'::jsonb
    ) AS request_id;
  $$
);
