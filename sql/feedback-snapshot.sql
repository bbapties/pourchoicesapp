-- Snapshot / rollback for the feedback channel migration (sql/feedback-migration.sql).
-- The migration is purely additive (one new table + its RLS). To roll back,
-- drop the table; nothing else is touched.
--
--   node scripts/_psql.mjs "$(cat sql/feedback-snapshot.sql)"   (bash)
--   or run the single line below.

DROP TABLE IF EXISTS public.feedback CASCADE;
