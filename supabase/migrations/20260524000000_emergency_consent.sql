-- ═══════════════════════════════════════════════════════════════
--  Migration 040 — Emergency Contact Consent Flow
--
--  Adds a two-field consent mechanism to family_members so that
--  G2 must explicitly accept before being treated as an emergency
--  contact (is_emergency_contact / is_trusted_contact).
--
--  emergency_consent_status values:
--    'none'     — not designated as emergency contact
--    'pending'  — G1 designated, consent email sent, awaiting G2
--    'accepted' — G2 explicitly accepted the role
--    'declined' — G2 declined; flags are cleared automatically
--
--  Flow:
--    G1 designates G2 → status='pending', email fires
--    G2 clicks accept  → status='accepted', is_* flags activate
--    G2 clicks decline → status='declined', is_* flags cleared
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS emergency_consent_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS emergency_consent_token  UUID DEFAULT gen_random_uuid();

-- Index for fast token lookups from the edge function
CREATE INDEX IF NOT EXISTS idx_family_members_emergency_consent_token
  ON family_members (emergency_consent_token);

-- Grandfather: any member already flagged as emergency/trusted contact
-- is treated as accepted (legacy rows — no consent email was ever sent)
UPDATE family_members
SET emergency_consent_status = 'accepted'
WHERE (is_emergency_contact = true OR is_trusted_contact = true)
  AND emergency_consent_status = 'none';
