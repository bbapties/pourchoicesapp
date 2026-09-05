-- Hardening companion to sql/account-type-migration.sql.
--
-- *** NOT APPLIED. Blocked by the agent sandbox (SECURITY DEFINER replacement).
-- *** Brian must run this. Until then, account_type is user-writable -- see below.
--
-- WHY: public.users carries "Users can update their own profile" and
-- "Users update own via auth" UPDATE policies, so any signed-in user can write
-- their own users row. Without this trigger a beta tester could set their own
-- account_type and remove themselves from the Social feed, and a seeded 'data'
-- account could un-hide itself. Same shape as protect_submission_update
-- (B-58/B-59), which freezes moderation columns a submitter must not touch.
--
-- This only ADDS account_type handling to the existing B-19 protect_user_role();
-- the role logic is unchanged. auth.uid() is NULL for service-role / direct
-- psql, so admin SQL (including the flag flips) is unaffected -- same as role.
--
-- Verify after applying, as an authenticated non-admin with a simulated
-- auth.uid(): UPDATE users SET account_type='data' on own row leaves the value
-- unchanged and raises no error.

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
