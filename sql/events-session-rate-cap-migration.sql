-- Phase 10 / A1 -- server-side per-session event rate cap
--
-- WHY. The 2026-09-01/02 `/` <-> `/mybar` redirect loop put 64,560 rows into `events`
-- from five browser tabs; one session_id alone wrote 26,794. The B-60 hardening added a
-- rate limit, but only CLIENT-side (src/lib/events.ts), so a runaway client simply
-- ignored it. This adds the cap the database itself enforces.
--
-- DESIGN.
--   * Cap is per (session_id, rolling 1 hour). 200 rows/hour is far above real human use
--     -- a page_view per navigation plus clicks/searches -- and far below a loop.
--   * Over the cap we RETURN NULL, which silently drops the row in a BEFORE INSERT
--     trigger. We do NOT raise: `logEvent` is fire-and-forget and only console.errors,
--     so raising would spam the console and could feed a retry loop. Telemetry must
--     never be able to break the app.
--   * Rows with a NULL session_id are not capped (server-side/backfill inserts).
--
-- Rollback: sql/events-session-rate-cap-snapshot.sql
-- Additive + idempotent: safe to re-run.

-- Supports the cap's COUNT without a scan. `events_session_idx` is session_id only.
CREATE INDEX IF NOT EXISTS events_session_time_idx
  ON public.events USING btree (session_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_event_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  recent_count integer;
  -- Max rows one session_id may insert per rolling hour.
  session_hourly_cap constant integer := 200;
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

  -- Per-session rolling-hour cap. Silently drop past the ceiling so one runaway client
  -- cannot flood the table again (Phase 10 A1).
  IF NEW.session_id IS NOT NULL THEN
    SELECT count(*) INTO recent_count
    FROM public.events
    WHERE session_id = NEW.session_id
      AND created_at > now() - interval '1 hour';

    IF recent_count >= session_hourly_cap THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
