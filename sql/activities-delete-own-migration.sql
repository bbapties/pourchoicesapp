-- Honest Remove -> feed cascade (BOTTLE_ACTIONS.md B.4). Additive.
-- Rollback: sql/activities-delete-own-snapshot.sql
--
-- Lets a user delete their OWN hand-logged activities (a mistaken add, an empty, or a pour) so a
-- correction/hard-delete also removes the Social feed post. Scoped to those three actions only:
-- blind tastings ('tasted') and system/admin activities stay permanent and undeletable.

BEGIN;

GRANT DELETE ON public.activities TO authenticated;

DROP POLICY IF EXISTS activities_delete_own ON public.activities;
CREATE POLICY activities_delete_own ON public.activities
  FOR DELETE TO authenticated
  USING (
    action IN ('drank', 'added_to_collection', 'finished')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  );

COMMIT;
