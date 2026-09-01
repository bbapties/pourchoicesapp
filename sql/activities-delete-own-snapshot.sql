-- Rollback for sql/activities-delete-own-migration.sql.
BEGIN;
DROP POLICY IF EXISTS activities_delete_own ON public.activities;
REVOKE DELETE ON public.activities FROM authenticated;
COMMIT;
