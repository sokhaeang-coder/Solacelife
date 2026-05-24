-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration 037: Recipient consent + abuse reports
--
--  Problem:
--    The current model is opt-out by default — G1 adds G2, and
--    deliveries fire unless G2 actively objects. This can be
--    weaponised to harass people posthumously.
--
--  Fix:
--    1. Add consent_status to family_members. Deliveries only fire
--       when consent_status = 'consented'.
--    2. Grandfather existing confirmed recipients as 'consented'
--       so their experience is uninterrupted.
--    3. New rows default to 'pending' — G2 must actively accept.
--    4. Create abuse_reports table for flagged content.
--
--  consent_status values:
--    'pending'   — invited, awaiting G2 decision
--    'consented' — G2 actively accepted
--    'declined'  — G2 said no (deliveries never fire)
--    'revoked'   — G2 accepted but later withdrew
--    'blocked'   — G2 flagged as abusive; triggers admin review
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- ── 1. Add consent columns to family_members ────────────────────
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS consent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at     TIMESTAMPTZ;

-- ── 2. Grandfather: existing confirmed rows → consented ──────────
--    Any recipient who already clicked "Yes, this email reached me"
--    is treated as having consented. Their delivery stream continues
--    without interruption.
UPDATE public.family_members
SET
  consent_status = 'consented',
  consent_at     = COALESCE(confirmed_at, now())
WHERE email_confirmed = true
  AND consent_status  = 'pending';

-- ── 3. Add a check constraint to keep values clean ───────────────
ALTER TABLE public.family_members
  DROP CONSTRAINT IF EXISTS family_members_consent_status_check;

ALTER TABLE public.family_members
  ADD CONSTRAINT family_members_consent_status_check
  CHECK (consent_status IN ('pending','consented','declined','revoked','blocked'));

-- ── 4. Create abuse_reports table ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.abuse_reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivery_id  UUID        REFERENCES public.scheduled_deliveries(id) ON DELETE SET NULL,
  reason       TEXT        NOT NULL
                           CHECK (reason IN (
                             'harassment','threatening','unwanted',
                             'defamation','abuse','other'
                           )),
  details      TEXT,
  status       TEXT        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on abuse_reports
ALTER TABLE public.abuse_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporters can insert own reports" ON public.abuse_reports;
CREATE POLICY "Reporters can insert own reports"
  ON public.abuse_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Reporters can view own reports" ON public.abuse_reports;
CREATE POLICY "Reporters can view own reports"
  ON public.abuse_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- ── 5. Index for fast consent_status lookups in delivery worker ──
CREATE INDEX IF NOT EXISTS family_members_consent_status_idx
  ON public.family_members (consent_status);

-- ── Verify ───────────────────────────────────────────────────────
SELECT
  consent_status,
  COUNT(*) AS member_count
FROM public.family_members
GROUP BY consent_status
ORDER BY consent_status;
-- Should show 'consented' rows for all previously confirmed members.
