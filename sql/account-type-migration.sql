-- users.account_type -- classify an account as a real person, seeded ranking
-- data, or a test/QA account. Rollback: sql/account-type-snapshot.sql
--
-- Purpose: seeded ranking accounts (replayed published blind tastings) must
-- still move personal + global Elo, but must NOT appear on the Social feed.
-- The feed filter lives in src/lib/activities.ts (fetchActivityFeed), NOT in
-- RLS -- an RLS filter would also hide the rows from the account's own
-- per-variant history modal.
--
-- Additive: every existing row defaults to 'human', so behaviour is unchanged
-- until a row is flipped by hand.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'human';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('human', 'data', 'test'));

-- Freeze account_type against self-service writes, the same way role is frozen.
-- public.users carries "Users can update their own profile" / "Users update own
-- via auth" UPDATE policies, so without this any signed-in user could set their
-- own account_type and remove themselves from the feed (or a seeded account
-- could un-hide itself). Same pattern as protect_submission_update (B-58/B-59).
--
-- auth.uid() is NULL for service-role / direct psql, so admin SQL is unaffected.
CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'user';
      NEW.account_type := 'human';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        NEW.role := OLD.role;
      END IF;
      IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
        NEW.account_type := OLD.account_type;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
