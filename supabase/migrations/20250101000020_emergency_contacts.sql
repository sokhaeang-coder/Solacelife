-- Migration 020: Emergency contact designation on family_members
-- Allows users to flag up to 3 family members as emergency contacts
-- with a priority order (1 = primary, 2 = secondary, 3 = tertiary).

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS is_emergency_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_priority   integer CHECK (emergency_priority BETWEEN 1 AND 3);

-- Only one member per user can hold each priority level.
-- A partial unique index enforces this without blocking non-emergency rows.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_emergency_priority
  ON family_members (user_id, emergency_priority)
  WHERE is_emergency_contact = true;

-- Handy view for the app: returns emergency contacts in priority order
-- alongside the phone number needed for the lock-screen notification.
CREATE OR REPLACE VIEW emergency_contacts_ordered AS
SELECT
  id,
  user_id,
  name,
  phone,
  email,
  relationship,
  photo_url,
  emergency_priority
FROM family_members
WHERE is_emergency_contact = true
ORDER BY user_id, emergency_priority ASC;

GRANT SELECT ON emergency_contacts_ordered TO authenticated;
