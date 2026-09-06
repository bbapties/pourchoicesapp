-- ROLLBACK for sql/account-type-trigger-migration.sql (board #18).
--
-- Captured from prod with pg_get_functiondef() immediately before the migration was applied
-- on 2026-09-05. This is the B-19 role-only version of protect_user_role(): it freezes `role`
-- against self-service escalation but leaves `account_type` client-writable, which is the very
-- gap the migration closes.
--
-- The trigger itself is NOT touched by either file -- trg_protect_user_role (BEFORE INSERT OR
-- UPDATE ON public.users) already existed and keeps pointing at whichever body is installed.
-- Running this restores the old behaviour without dropping anything.

CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
