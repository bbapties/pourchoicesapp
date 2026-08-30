-- Rollback for sql/wishlist-migration.sql. Drops the wishlists table and restores
-- the activities action CHECK to its pre-wishlist value set.

BEGIN;

DROP TABLE IF EXISTS public.wishlists CASCADE;

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_action_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_action_check
  CHECK (action = ANY (ARRAY[
    'drank','added_to_collection','finished','added_to_db',
    'suggested_edit','verified','removed_from_collection'
  ]));

COMMIT;
