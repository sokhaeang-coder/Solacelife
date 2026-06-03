-- ════════════════════════════════════════════════════════════════
--  Migration: Fix handle_new_user — skip founder self-insert
--
--  Bug: when sokhaeang@gmail.com signs up as a new user, the trigger
--  tries to add sokhaeang@gmail.com as their own family member.
--  This is a self-referential row that can cause constraint errors.
--
--  Fix: guard Step 2 so the founder auto-insert is skipped when
--  the signing-up user IS the founder (email = sokhaeang@gmail.com).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- ── Step 1: create the profile row ────────────────────────────
  INSERT INTO public.profiles (id, email, account_type, onboarding_type)
  VALUES (NEW.id, NEW.email, 'sender', 'sender')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
    WHERE profiles.email IS NULL;

  -- ── Step 2: auto-add Sokha as first family member ─────────────
  --  Skip if the signing-up user IS Sokha (avoid self-referential row)
  IF NEW.email != 'sokhaeang@gmail.com' THEN
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
  END IF;

  RETURN NEW;
END;
$$;
