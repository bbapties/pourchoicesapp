-- Additive: how many times this user has had this bottle (one row per user+bottle).
-- Existing rows become 1. Restocking an empty bottle increments this.
ALTER TABLE public.user_bottles
  ADD COLUMN IF NOT EXISTS times_had integer NOT NULL DEFAULT 1;
