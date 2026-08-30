-- Rollback for sql/variant-guess-avg-migration.sql.
BEGIN;
DROP FUNCTION IF EXISTS public.variant_guess_avg(uuid[]);
COMMIT;
