-- Edit your own Social post (Brian, 2026-09-21). Additive.
-- Rollback: sql/activities-update-own-snapshot.sql
--
-- A user may change the `details` (today: photo_url) of their OWN hand-logged activities - the
-- "Show it off" nudge after an add / empty writes the photo onto the row after the fact, and a
-- poster can change or remove the picture on their own post. Same three actions the delete-own
-- policy covers; blind tastings and admin / system rows stay read-only.
--
-- RLS cannot see OLD, so the guard that an edit touches ONLY `details` is a trigger: anything
-- else (the bottle, the action, the date, the owner) is pinned.

BEGIN;

GRANT UPDATE ON public.activities TO authenticated;

DROP POLICY IF EXISTS activities_update_own ON public.activities;
CREATE POLICY activities_update_own ON public.activities
  FOR UPDATE TO authenticated
  USING (
    action IN ('drank', 'added_to_collection', 'finished')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  )
  WITH CHECK (
    action IN ('drank', 'added_to_collection', 'finished')
    AND auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = activities.user_id)
  );

CREATE OR REPLACE FUNCTION public.guard_activity_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- service role / SQL maintenance may edit anything; a signed-in user may only change details
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.bottle_id IS DISTINCT FROM OLD.bottle_id
     OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW.pour_type IS DISTINCT FROM OLD.pour_type
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'only details may be edited on an activity';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_guard_activity_edit ON public.activities;
CREATE TRIGGER trig_guard_activity_edit
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.guard_activity_edit();

COMMIT;
