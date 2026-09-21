-- Wishlists get a photo exactly like adds (Brian, 2026-09-21). Additive: widens the
-- activities_update_own policy from sql/activities-update-own-migration.sql to `wishlisted` rows.
-- Rollback: re-run sql/activities-update-own-migration.sql (the three-action list).
BEGIN;
DROP POLICY IF EXISTS activities_update_own ON public.activities;
CREATE POLICY activities_update_own ON public.activities
  FOR UPDATE TO authenticated
  USING (
    action IN ('drank', 'added_to_collection', 'finished', 'wishlisted')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  )
  WITH CHECK (
    action IN ('drank', 'added_to_collection', 'finished', 'wishlisted')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  );
COMMIT;
