-- A free-text Social post (Brian, 2026-09-21). Additive.
-- Rollback: sql/activities-posted-snapshot.sql
--
-- `posted` is the one action that is not about a specific bottle: bottle_id becomes nullable but
-- a CHECK keeps it required for every other action, so nothing existing loosens. The text lives in
-- details.note, the picture in details.photo_url, the (optional) tagged bottle in bottle_id /
-- variant_id. A poster may edit (photo / text) and delete their own post like a pour.

BEGIN;

ALTER TABLE public.activities ALTER COLUMN bottle_id DROP NOT NULL;

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_bottle_required;
ALTER TABLE public.activities ADD CONSTRAINT activities_bottle_required
  CHECK (bottle_id IS NOT NULL OR action = 'posted');

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_action_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_action_check
  CHECK (action = ANY (ARRAY['drank','added_to_collection','finished','added_to_db','suggested_edit','verified','removed_from_collection','wishlisted','tasted','posted']));

DROP POLICY IF EXISTS activities_update_own ON public.activities;
CREATE POLICY activities_update_own ON public.activities
  FOR UPDATE TO authenticated
  USING (
    action IN ('drank', 'added_to_collection', 'finished', 'wishlisted', 'tasted', 'posted')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  )
  WITH CHECK (
    action IN ('drank', 'added_to_collection', 'finished', 'wishlisted', 'tasted', 'posted')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  );

DROP POLICY IF EXISTS activities_delete_own ON public.activities;
CREATE POLICY activities_delete_own ON public.activities
  FOR DELETE TO authenticated
  USING (
    action IN ('drank', 'added_to_collection', 'finished', 'posted')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  );

COMMIT;
