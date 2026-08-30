-- Two-count ownership (BOTTLE_ACTIONS.md B.1/B.2, bug B-32). Additive + backward-compatible.
-- Rollback: sql/two-count-snapshot.sql
--
-- Adds a current-quantity (owned_count) and a lifetime-finished (emptied_count) per
-- (user, variant). A variant can now be In My Bar (owned_count>0) AND Empty (emptied_count>0)
-- at once. currently_owned is KEPT in sync (= owned_count>0) so every existing read that still
-- uses the bool keeps working unchanged. Backfill preserves today's exact tab membership:
--   owned_count   = 1 when currently_owned else 0
--   emptied_count = 1 when finished (not owned AND times_had>=1) else 0
-- (times_had stays as the lifetime add/restock counter; it is a different concept.)

BEGIN;

ALTER TABLE public.user_bottles ADD COLUMN IF NOT EXISTS owned_count   integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_bottles ADD COLUMN IF NOT EXISTS emptied_count integer NOT NULL DEFAULT 0;

UPDATE public.user_bottles SET
  owned_count   = CASE WHEN currently_owned THEN 1 ELSE 0 END,
  emptied_count = CASE WHEN (NOT currently_owned) AND COALESCE(times_had, 0) >= 1 THEN 1 ELSE 0 END;

COMMIT;
