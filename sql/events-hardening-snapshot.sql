-- Rollback for sql/events-hardening-migration.sql (B-60).
-- Removes the insert-guard trigger + function. The events table, its RLS, and all rows
-- are untouched (the migration only added a BEFORE INSERT trigger).

BEGIN;

DROP TRIGGER IF EXISTS trg_guard_event_insert ON public.events;
DROP FUNCTION IF EXISTS public.guard_event_insert();

COMMIT;
