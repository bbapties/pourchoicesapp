-- ROLLBACK for sql/home-shelf-ready-migration.sql  (#83 / Home "The Cabinet", #82)
--
-- The migration is purely additive: one new column with a NOT NULL DEFAULT false.
-- Nothing is rewritten, nothing is dropped, no existing row changes meaning, so the
-- rollback is a single DROP and there is no data to restore.
--
-- The ONE thing this throws away is curation work: every bottle Brian has marked
-- shelf-ready. Re-running the migration afterwards resets every variant to false and
-- the whole catalogue renders as ghost bottles again. That is safe -- Home is designed
-- to work in exactly that state -- but it is hours of Brian's time, so take a copy
-- first if any variant has been marked:
--
--   COPY (SELECT id FROM public.bottle_variants WHERE shelf_ready)
--     TO STDOUT WITH CSV;   -- then re-apply with an UPDATE ... WHERE id IN (...)

ALTER TABLE public.bottle_variants DROP COLUMN IF EXISTS shelf_ready;
