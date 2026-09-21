-- A photo on a blind tasting's post (Brian, 2026-09-21). Additive: widens activities_update_own
-- to `tasted` rows. Blind tastings stay undeletable (activities_delete_own is untouched) and the
-- guard trigger still pins every column but details, so the only thing a taster can change on a
-- tasting is its photo.
-- Rollback: re-run sql/activities-update-own-wishlisted-migration.sql.
BEGIN;
DROP POLICY IF EXISTS activities_update_own ON public.activities;
CREATE POLICY activities_update_own ON public.activities
  FOR UPDATE TO authenticated
  USING (
    action IN ('drank', 'added_to_collection', 'finished', 'wishlisted', 'tasted')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  )
  WITH CHECK (
    action IN ('drank', 'added_to_collection', 'finished', 'wishlisted', 'tasted')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  );
COMMIT;
