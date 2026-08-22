-- Expand activities.action with removed_from_collection.
-- suggested_edit was already in the CHECK; this migration only adds the new value.
-- Additive: drops and recreates the CHECK. No rows changed. Safe to re-run.

BEGIN;

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_action_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_action_check CHECK (
  action IN (
    'drank',
    'added_to_collection',
    'finished',
    'added_to_db',
    'suggested_edit',
    'verified',
    'removed_from_collection'
  )
);

COMMIT;
