-- Add phone and date_of_birth to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth  DATE;
