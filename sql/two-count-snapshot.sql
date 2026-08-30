-- Rollback for sql/two-count-migration.sql. Drops the additive columns.
-- currently_owned / times_had are untouched by the migration, so dropping these restores
-- the prior schema exactly.

BEGIN;

ALTER TABLE public.user_bottles DROP COLUMN IF EXISTS owned_count;
ALTER TABLE public.user_bottles DROP COLUMN IF EXISTS emptied_count;

COMMIT;
