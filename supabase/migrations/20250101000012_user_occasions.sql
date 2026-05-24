-- Migration 012: user_occasions
-- Stores which occasions/holidays each user has selected during onboarding
-- (or updated in Settings). No religion column — occasion keys only.
-- A user who selects both Diwali and Christmas is NOT classified by religion;
-- these are personal lifestyle/celebration preferences.

CREATE TABLE IF NOT EXISTS user_occasions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occasion_key  text        NOT NULL,
  custom_label  text,                         -- for 'other' / user-defined occasions
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- One row per occasion per user
  UNIQUE (user_id, occasion_key)
);

-- Row-level security: users can only see/modify their own occasion rows
ALTER TABLE user_occasions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_occasions: owner full access"
  ON user_occasions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS user_occasions_user_idx
  ON user_occasions (user_id);

-- ── Comments ──────────────────────────────────────────────────────────────────
-- occasion_key values used by the app (not enforced via CHECK to stay flexible
-- as the list grows):
--   anniversary, baisakhi, birthday, christmas, dia_muertos, diwali, dussehra,
--   easter, eid_adha, eid_fitr, fathers_day, graduation, hanukkah, just_because,
--   kwanzaa, lohri, lunar_new_year, midsummer, mothers_day, navratri, new_baby,
--   new_year, nowruz, obon, passover, personal, pongal, raksha_bandhan,
--   retirement, rosh_hashanah, st_patricks, sukkot, thanksgiving, valentines,
--   vesak, yom_kippur, other
