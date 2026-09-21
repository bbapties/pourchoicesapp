-- Rollback for sql/activities-update-own-migration.sql
BEGIN;
DROP TRIGGER IF EXISTS trig_guard_activity_edit ON public.activities;
DROP FUNCTION IF EXISTS public.guard_activity_edit();
DROP POLICY IF EXISTS activities_update_own ON public.activities;
REVOKE UPDATE ON public.activities FROM authenticated;
COMMIT;
