-- Rollback for sql/activities-posted-migration.sql (only valid while no `posted` rows exist).
BEGIN;
DELETE FROM public.activities WHERE action = 'posted';
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_bottle_required;
ALTER TABLE public.activities ALTER COLUMN bottle_id SET NOT NULL;
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_action_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_action_check
  CHECK (action = ANY (ARRAY['drank','added_to_collection','finished','added_to_db','suggested_edit','verified','removed_from_collection','wishlisted','tasted']));
-- policies: re-run sql/activities-update-own-tasted-migration.sql and sql/activities-delete-own-migration.sql
COMMIT;
