-- Expand activities.action to include admin verify (provisional -> verified).
-- Additive: drops and recreates the CHECK with one extra value. No rows changed.
-- Safe to re-run.

BEGIN;

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_action_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_action_check CHECK (
  action IN (
    'drank',
    'added_to_collection',
    'finished',
    'added_to_db',
    'suggested_edit',
    'verified'
  )
);

COMMIT;
