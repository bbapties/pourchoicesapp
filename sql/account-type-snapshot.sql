-- Rollback for sql/account-type-migration.sql,
-- sql/account-type-trigger-migration.sql and sql/account-type-rls-migration.sql.
--
-- Restores protect_user_role() to its B-19 body (role only) -- captured from the
-- live prod DB before the migration -- and drops users.account_type.
-- Safe to run even if the trigger migration was never applied.

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
    ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Restore the unrestricted authenticated read (the pre-2026-09-05 state).
-- Must run BEFORE the column is dropped: the policy references account_type.
ALTER POLICY "Public read users" ON public.users USING (true);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE public.users DROP COLUMN IF EXISTS account_type;
