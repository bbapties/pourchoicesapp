-- ============================================================================
-- ROLLBACK for sql/variant-private-until-verified.sql   (#73, 2026-09-07)
--
-- Restores the pre-#73 read rule: every non-store-pick variant is public the
-- moment it is created, verified or not. Read back from pg_policies before the
-- change. Re-run sql/variant-scores-views.sql afterwards to put variant_scores'
-- WHERE clause back in step with it -- the two must always agree.
-- ============================================================================

DROP POLICY IF EXISTS "Public read" ON public.bottle_variants;

CREATE POLICY "Public read" ON public.bottle_variants
  FOR SELECT TO public
  USING (
    (store_pick_name IS NULL)
    OR (created_by = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid()))
  );
