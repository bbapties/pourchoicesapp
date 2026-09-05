-- ROLLBACK for sql/events-session-rate-cap-migration.sql
--
-- Restores `guard_event_insert` to its pre-Phase-10 definition (the B-60 hardening from
-- sql/events-hardening-migration.sql: field/metadata bounding only, no per-session cap)
-- and drops the composite index the cap added.
--
-- Captured from the live prod DB 2026-09-05 before applying the cap.

DROP INDEX IF EXISTS public.events_session_time_idx;

CREATE OR REPLACE FUNCTION public.guard_event_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Bound identifier-ish text fields (defensive; the client already truncates).
  IF NEW.event_type IS NOT NULL THEN NEW.event_type := left(NEW.event_type, 64); END IF;
  IF NEW.surface IS NOT NULL THEN NEW.surface := left(NEW.surface, 256); END IF;
  IF NEW.target_type IS NOT NULL THEN NEW.target_type := left(NEW.target_type, 64); END IF;
  IF NEW.target_id IS NOT NULL THEN NEW.target_id := left(NEW.target_id, 256); END IF;
  IF NEW.session_id IS NOT NULL THEN NEW.session_id := left(NEW.session_id, 64); END IF;

  -- Bound the free-form metadata: replace an oversized payload with a small marker rather
  -- than reject the row (fail-open telemetry).
  IF NEW.metadata IS NOT NULL AND octet_length(NEW.metadata::text) > 4096 THEN
    NEW.metadata := jsonb_build_object('_truncated', true);
  END IF;

  RETURN NEW;
END;
$function$;
