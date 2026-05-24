-- ─────────────────────────────────────────────────────────────
--  Migration 022 — relationship_label on family_members
--
--  Adds a free-text label so each sender can describe their
--  relationship to a family member in their own words:
--  "Dad", "My Son", "Grandma Rose", "Sister", etc.
--
--  This replaces the G1/G2/G3 adoption-order model with a
--  human-readable Family Circle model where connections are
--  named by the person who created them.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS relationship_label TEXT;

COMMENT ON COLUMN family_members.relationship_label IS
  'User-defined label describing this connection, e.g. "Dad", "My Son", "Grandma Rose"';
