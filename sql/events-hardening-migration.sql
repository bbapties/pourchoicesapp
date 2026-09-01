-- B-60: harden the events insert path (beta-prep). See TELEMETRY.md.
-- Additive + safe to re-run. Adds a BEFORE INSERT trigger that bounds the size of the
-- text fields and the free-form metadata jsonb, so a raw anon insert (anyone holding the
-- public anon key) can't bloat a row past sane limits. RLS/append-only rules are unchanged.
-- Rollback: sql/events-hardening-snapshot.sql.
--
-- Note: burst/volume rate-limiting is done client-side (src/lib/events.ts). True anon-abuse
-- protection (per-IP) belongs at the gateway and is out of scope for this additive trigger.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_event_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_guard_event_insert ON public.events;
CREATE TRIGGER trg_guard_event_insert
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_insert();

COMMIT;
