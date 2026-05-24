-- ═══════════════════════════════════════════════════════════════
--  SOLACE LIFE — Migration 007: Avatar Notes
--
--  avatar_notes: personality context the owner writes while alive
--  so their AI avatar sounds authentically like them.
--
--  Each note is a plain text entry — a favourite saying, a value,
--  a memory, something they'd want their family to hear.
--  The chat-with-avatar edge function reads these to build the
--  AI system prompt.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS avatar_notes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE avatar_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avatar_notes_owner" ON avatar_notes;
CREATE POLICY "avatar_notes_owner" ON avatar_notes
  FOR ALL USING (auth.uid() = user_id);
