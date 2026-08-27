-- Rollback for b23-b24-security-migration.sql
ALTER VIEW public.all_bottle_details SET (security_invoker = false);
ALTER VIEW public.all_variant_details SET (security_invoker = false);

DROP POLICY IF EXISTS "Auth insert variants" ON public.bottle_variants;
DROP POLICY IF EXISTS "Auth update variants" ON public.bottle_variants;
CREATE POLICY "Auth insert/update" ON public.bottle_variants FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Public read" ON public.bottle_variants;
CREATE POLICY "Public read" ON public.bottle_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users read own tasting results" ON public.tasting_results;
DROP POLICY IF EXISTS "Users insert own tasting results" ON public.tasting_results;
CREATE POLICY "Users can manage their own tasting results" ON public.tasting_results
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.tasting_sessions s
            WHERE s.id = tasting_results.tasting_session_id
              AND s.user_id = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tasting_sessions s
            WHERE s.id = tasting_results.tasting_session_id
              AND s.user_id = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())));
