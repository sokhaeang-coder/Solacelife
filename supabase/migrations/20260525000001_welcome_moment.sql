-- ════════════════════════════════════════════════════════════════
--  Solace Life — Migration: Welcome Moment from Sokha
--
--  Every new user who signs up receives a personal letter from
--  Sokha in their Memories tab — auto-delivered on signup.
--
--  This is the Memories-tab complement to the Family-tab founder
--  card (migration 20260524000002). Together they mean:
--    • Family tab  → Sokha's card ("From the Founder")
--    • Memories tab → Sokha's letter, already waiting for them
--
--  Implementation:
--    1. Insert Sokha's welcome memory with a fixed UUID so the
--       trigger can reference it without a lookup every time.
--    2. Update handle_new_user() to create a family_members row
--       in the Sokha→new user direction (Sokha as sender,
--       new user as recipient) and a scheduled_deliveries row
--       dated today so it appears immediately in the Memories tab.
--    3. Backfill for all existing sender/both users.
--
--  Sokha's UUID  : 4e5a42ac-3498-4816-99cf-9e8406626416
--  Welcome memory: f47a0000-0000-0000-0000-000000000001 (fixed)
--
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- ── 1. Create Sokha's welcome memory (once, idempotent) ──────────────────────
--
--  Fixed UUID means handle_new_user() can reference it as a constant —
--  no SELECT needed inside the trigger, keeping it fast and simple.
--  ON CONFLICT (id) DO NOTHING makes re-running this migration safe.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.memories (id, user_id, title, type, description, content)
VALUES (
  'f47a0000-0000-0000-0000-000000000001',
  '4e5a42ac-3498-4816-99cf-9e8406626416',
  'From Sokha, the founder',
  'letter',
  'I built this for my family first. I''m glad it found yours too. Tap to read why.',
  E'Someday my boys will be busy. Meetings, emails, a life pulling them in every direction.\n\nI want them to know that on an ordinary Tuesday, between a coffee refill and a conference call, I stopped and watched them play — and nothing else in the world existed for those few minutes.\n\nThat''s what this app is for. Telling the people you love what they meant to you, before life moves too fast to say it.\n\n— Sokha'
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Update handle_new_user() ───────────────────────────────────────────────
--
--  Preserves all logic from migration 20260524000002 (profile row +
--  Sokha founder card). Adds Steps 3 and 4:
--    3. Insert a family_members row in the Sokha→new user direction
--       so the Memories tab can surface deliveries from Sokha.
--    4. Insert a scheduled_deliveries row dated today so the letter
--       appears immediately — no edge function run needed.
--
--  ON CONFLICT (user_id, recipient_profile_id) DO NOTHING:
--    • Prevents duplicate rows if the trigger fires twice (edge case)
--    • Safe for the backfill — existing rows are silently skipped
--
--  RETURNING id INTO sokha_fm_id:
--    • Only inserts the delivery if the family_members row was
--      freshly created. Prevents duplicate deliveries on re-runs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sokha_uuid        UUID := '4e5a42ac-3498-4816-99cf-9e8406626416';
  welcome_memory_id UUID := 'f47a0000-0000-0000-0000-000000000001';
  sokha_fm_id       UUID;
BEGIN

  -- ── Step 1: create the profile row ────────────────────────────────────────
  INSERT INTO public.profiles (id, email, account_type, onboarding_type)
  VALUES (NEW.id, NEW.email, 'sender', 'sender')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
    WHERE profiles.email IS NULL;

  -- ── Step 2: auto-add Sokha as the user's first family member ──────────────
  --  (user_id = new user, Sokha is listed in THEIR family — the founder card)
  INSERT INTO public.family_members (
    user_id,
    name,
    email,
    relationship,
    relationship_label,
    is_founder_contact,
    email_confirmed
  ) VALUES (
    NEW.id,
    'Sokha Eang',
    'sokhaeang@gmail.com',
    'Other',
    'Founder',
    TRUE,
    TRUE
  )
  ON CONFLICT DO NOTHING;

  -- ── Step 3: create Sokha→new user family link ─────────────────────────────
  --  (user_id = Sokha, new user is the recipient)
  --  This is what lets loadReceivedMemories() surface Sokha's letter.
  INSERT INTO public.family_members (
    user_id,
    name,
    email,
    relationship,
    recipient_profile_id,
    email_confirmed
  ) VALUES (
    sokha_uuid,
    '',
    NEW.email,
    'Other',
    NEW.id,
    TRUE
  )
  ON CONFLICT (user_id, recipient_profile_id)
    WHERE recipient_profile_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO sokha_fm_id;

  -- ── Step 4: deliver the welcome memory ────────────────────────────────────
  --  Only fires if Step 3 created a fresh row (RETURNING id IS NOT NULL).
  --  scheduled_date = CURRENT_DATE means it appears immediately in the
  --  Memories tab — no edge function needed, no waiting.
  IF sokha_fm_id IS NOT NULL THEN
    INSERT INTO public.scheduled_deliveries (
      user_id,
      memory_id,
      family_member_id,
      scheduled_date
    ) VALUES (
      sokha_uuid,
      welcome_memory_id,
      sokha_fm_id,
      CURRENT_DATE
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Backfill — deliver the welcome moment to existing users ───────────────
--
--  Loops over every sender/both user who doesn't already have a
--  Sokha→them family_members row. Safe to re-run: ON CONFLICT DO NOTHING
--  skips any already-created rows, and the IF fm_id IS NOT NULL guard
--  prevents duplicate deliveries.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  sokha_uuid        UUID := '4e5a42ac-3498-4816-99cf-9e8406626416';
  welcome_memory_id UUID := 'f47a0000-0000-0000-0000-000000000001';
  r                 RECORD;
  fm_id             UUID;
BEGIN
  FOR r IN
    SELECT p.id, p.email
    FROM   public.profiles p
    WHERE  p.account_type IN ('sender', 'both')
      AND  p.id <> sokha_uuid
      AND  NOT EXISTS (
             SELECT 1
             FROM   public.family_members fm
             WHERE  fm.user_id             = sokha_uuid
               AND  fm.recipient_profile_id = p.id
           )
  LOOP
    INSERT INTO public.family_members (
      user_id,
      name,
      email,
      relationship,
      recipient_profile_id,
      email_confirmed
    ) VALUES (
      sokha_uuid,
      '',
      r.email,
      'Other',
      r.id,
      TRUE
    )
    ON CONFLICT (user_id, recipient_profile_id)
      WHERE recipient_profile_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO fm_id;

    IF fm_id IS NOT NULL THEN
      INSERT INTO public.scheduled_deliveries (
        user_id,
        memory_id,
        family_member_id,
        scheduled_date
      ) VALUES (
        sokha_uuid,
        welcome_memory_id,
        fm_id,
        CURRENT_DATE
      );
    END IF;
  END LOOP;
END $$;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) AS welcome_deliveries_created
FROM public.scheduled_deliveries
WHERE memory_id = 'f47a0000-0000-0000-0000-000000000001';
