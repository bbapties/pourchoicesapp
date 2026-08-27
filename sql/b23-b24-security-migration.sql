-- B-23 (tier 1) + B-24. Rollback: sql/b23-b24-security-snapshot.sql

-- ── B-23: users can read + insert their OWN tasting_results, but not UPDATE/DELETE.
-- Removes the delete-reinsert Elo inflation and result tampering. The app only
-- ever INSERTs (saveTasting); admin/service-role cleanup bypasses RLS.
DROP POLICY IF EXISTS "Users can manage their own tasting results" ON public.tasting_results;
CREATE POLICY "Users read own tasting results" ON public.tasting_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tasting_sessions s
            WHERE s.id = tasting_results.tasting_session_id
              AND s.user_id = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())));
CREATE POLICY "Users insert own tasting results" ON public.tasting_results
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.tasting_sessions s
            WHERE s.id = tasting_results.tasting_session_id
              AND s.user_id = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())));

-- ── B-24: enforce store-pick privacy server-side (was UI-only). A store pick is
-- visible only to its creator (created_by may be an auth id or a public id);
-- globals (no store_pick_name) stay visible to everyone.
DROP POLICY IF EXISTS "Public read" ON public.bottle_variants;
CREATE POLICY "Public read" ON public.bottle_variants
  FOR SELECT USING (
    store_pick_name IS NULL
    OR created_by = auth.uid()
    OR created_by = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid()));

-- The old ALL "Auth insert/update" policy ALSO granted SELECT to every authenticated
-- user (an ALL policy's USING covers SELECT), which defeated the read filter above.
-- Split it into INSERT + UPDATE only so SELECT is governed solely by "Public read".
DROP POLICY IF EXISTS "Auth insert/update" ON public.bottle_variants;
CREATE POLICY "Auth insert variants" ON public.bottle_variants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update variants" ON public.bottle_variants FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Make the aggregate views honor the viewer's RLS (they ran as owner and bypassed it).
ALTER VIEW public.all_bottle_details SET (security_invoker = true);
ALTER VIEW public.all_variant_details SET (security_invoker = true);
