-- ═══════════════════════════════════════════════════════════════
--  Setup Nudges — one-shot onboarding notifications
--
--  Notification doctrine: setup nudges fire exactly ONCE each,
--  ever, with a max of one non-safety notification per user per
--  week. nudge_log enforces both (unique key = once-ever; the
--  edge function checks last-7-days before sending anything).
--
--  Run in Supabase SQL Editor, then deploy send-setup-nudges and
--  schedule the cron below.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Nudge log — one row per nudge ever sent ────────────────
create table if not exists nudge_log (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  nudge_key  text        not null,   -- 'first_moment' | 'first_family' | 'trusted_contact'
  sent_at    timestamptz not null default now(),

  unique (user_id, nudge_key)        -- once ever, enforced by the database
);

alter table nudge_log enable row level security;
-- Service-role only — no client policies needed; absence of policies
-- means anon/authenticated cannot read or write this table.

create index if not exists nudge_log_user_recent_idx
  on nudge_log (user_id, sent_at desc);

-- ── 2. Cron — weekdays at 17:00 UTC (≈ 9–10 AM Pacific) ───────
SELECT cron.unschedule('solace-setup-nudges')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'solace-setup-nudges'
);

SELECT cron.schedule(
  'solace-setup-nudges',
  '0 17 * * *',                 -- daily 17:00 UTC, inside 9am–8pm local for NA users
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/send-setup-nudges',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'solace-setup-nudges';
