-- ============================================================================
-- ROLLBACK for sql/catalog-update-rls-migration.sql   (#77, 2026-09-07)
--
-- Restores the two permissive UPDATE policies EXACTLY as they were, read back
-- from pg_policies before the change. Running this re-opens the hole: any
-- signed-in user can update any row in bottles and bottle_variants. Only run it
-- if the narrowed policies broke a write path and the fix cannot wait.
-- ============================================================================

DROP POLICY IF EXISTS "Own unverified update bottles"  ON public.bottles;
DROP POLICY IF EXISTS "Own unverified update variants" ON public.bottle_variants;

CREATE POLICY "Auth update bottles" ON public.bottles
  FOR UPDATE TO public
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth update variants" ON public.bottle_variants
  FOR UPDATE TO public
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
