-- Snapshot / rollback for the generic events table (sql/events-migration.sql).
-- The migration is purely additive (one new table + its RLS). Roll back by
-- dropping the table; nothing else is touched.

DROP TABLE IF EXISTS public.events CASCADE;
