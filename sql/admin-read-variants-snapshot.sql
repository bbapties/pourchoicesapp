-- ROLLBACK for sql/admin-read-variants-migration.sql (#93)
-- Additive: one SELECT policy. Dropping it restores the previous behaviour exactly, in which an
-- admin could UPDATE and DELETE variant rows they were not permitted to SELECT.
DROP POLICY IF EXISTS "admins read variants" ON public.bottle_variants;
