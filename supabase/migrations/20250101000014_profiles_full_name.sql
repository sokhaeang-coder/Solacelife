-- Migration 014: Add full_name column to profiles
-- Run this in your Supabase SQL Editor
-- This is the missing column that is blocking avatar_url from loading
-- on the HomeScreen (PostgREST returns a 400 for unknown columns,
-- making the entire profile select return null)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Back-fill existing rows: derive display name from auth.users email
-- (everything before the @, capitalised) so existing users see something
-- sensible until they set their own name
UPDATE profiles p
SET full_name = initcap(split_part(u.email, '@', 1))
FROM auth.users u
WHERE p.id = u.id
  AND p.full_name IS NULL
  AND u.email IS NOT NULL;
