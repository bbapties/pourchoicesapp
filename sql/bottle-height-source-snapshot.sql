-- ROLLBACK for sql/bottle-height-source-migration.sql
-- Additive: one column and one paired constraint. Dropping the column loses only the provenance,
-- not the heights themselves -- but that is the whole point of the column, so copy it out first
-- if anything has been marked 'measured':
--   COPY (SELECT id, bottle_height, bottle_height_source FROM public.bottle_variants
--          WHERE bottle_height_source IS NOT NULL) TO STDOUT WITH CSV HEADER;

ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_height_needs_source;
ALTER TABLE public.bottle_variants DROP COLUMN IF EXISTS bottle_height_source;
