-- ── Migration 027: Service Inquiries (Trusted Partners) ─────────────────────
-- Creates the service_inquiries table with PIPEDA-compliant data retention.
-- Per A Team advisory (May 2026):
--   - Inquiry message content is NOT retained after delivery confirmation.
--   - A delivered_at timestamp is recorded; message is nulled on delivery.
--   - RLS ensures users can only see their own inquiries.

create table if not exists service_inquiries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,

  -- Service metadata (retained for operational reporting)
  service_type    text not null,
  service_label   text not null,
  status          text not null default 'pending',   -- pending | delivered | closed

  -- Contact info (retained to support follow-up if needed)
  contact_name    text,
  contact_email   text not null,
  contact_phone   text,

  -- Inquiry message — PIPEDA: nulled after delivery, not retained permanently
  message         text,

  -- Timestamps
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,    -- set when message is successfully routed to partner
  message_purged_at timestamptz   -- set when message column is nulled post-delivery
);

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table service_inquiries enable row level security;

-- Users can insert their own inquiries
create policy "Users can insert own inquiries"
  on service_inquiries for insert
  with check (auth.uid() = user_id or user_id is null);

-- Users can read their own inquiries
create policy "Users can read own inquiries"
  on service_inquiries for select
  using (auth.uid() = user_id);

-- ── Auto-purge function ───────────────────────────────────────────────────────
-- Call this function (or trigger via edge function / cron) to null the message
-- column after delivery, in compliance with PIPEDA limiting-retention principle.
create or replace function purge_delivered_inquiry_messages()
returns void
language plpgsql
security definer
as $$
begin
  update service_inquiries
  set
    message           = null,
    message_purged_at = now()
  where
    status            = 'delivered'
    and delivered_at  is not null
    and message       is not null
    and delivered_at  < now() - interval '48 hours';
end;
$$;

-- ── Index for operational queries ────────────────────────────────────────────
create index if not exists idx_service_inquiries_user_id    on service_inquiries(user_id);
create index if not exists idx_service_inquiries_status     on service_inquiries(status);
create index if not exists idx_service_inquiries_created_at on service_inquiries(created_at desc);
