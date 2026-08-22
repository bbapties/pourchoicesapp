-- First-use / What's new coach storage.
-- Additive. Safe to re-run. Rollback: sql/coaches-snapshot.sql

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS seen_coach_ids text[] NOT NULL DEFAULT '{}';

-- Existing accounts are not brand-new. Seed core.done once so they get
-- What's new, not the first-run tour. Guard: skip if anyone already has it
-- (migration already applied, or a new user finished core).
UPDATE public.users
SET seen_coach_ids = array_append(seen_coach_ids, 'core.done')
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE 'core.done' = ANY (u.seen_coach_ids)
)
AND NOT ('core.done' = ANY (seen_coach_ids));

COMMIT;
