-- Blind-tasting social presence (BOTTLE_ACTIONS.md D.1, bug B-51). Additive (values-only).
-- Rollback: sql/tasted-activity-snapshot.sql
--
-- Completing a blind tasting now posts a `tasted` activity so it appears on the Social feed
-- (and the per-variant history modal). 'tasted' has no pour_type (action<>'drank').

BEGIN;

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_action_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_action_check
  CHECK (action = ANY (ARRAY[
    'drank','added_to_collection','finished','added_to_db',
    'suggested_edit','verified','removed_from_collection','wishlisted','tasted'
  ]));

COMMIT;
