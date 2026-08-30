-- Rollback for sql/tasted-activity-migration.sql. Restores the activities action CHECK to the
-- wishlist-era value set (without 'tasted').

BEGIN;

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_action_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_action_check
  CHECK (action = ANY (ARRAY[
    'drank','added_to_collection','finished','added_to_db',
    'suggested_edit','verified','removed_from_collection','wishlisted'
  ]));

COMMIT;
