-- #14 (B-68): feedback had no size or rate limits. The client (src/lib/feedback.ts) now caps
-- the message at 4000 chars and refuses more than 5 reports per 10 minutes, but a raw insert
-- through PostgREST sees neither, so the database enforces the same two bounds here.
--
-- DESIGN (mirrors guard_event_insert, Phase 10 A1):
--   * Message is TRUNCATED to 4000 chars, not rejected -- a report is never lost over length.
--   * Free-text context fields are bounded the same way.
--   * Over 20 reports from one user in a rolling hour, RAISE. Unlike events, feedback is a
--     deliberate user action with a visible result, so a refused insert surfaces as a toast
--     rather than vanishing. 20/hour is far above real use and far below a loop.
--   * Screenshot size is already capped on the client (8 MB after compression) and the
--     bucket is metered; nothing to add here.
--
-- Rollback: DROP TRIGGER IF EXISTS trg_guard_feedback_insert ON public.feedback;
--           DROP FUNCTION IF EXISTS public.guard_feedback_insert();
-- Additive + idempotent: safe to re-run.

CREATE INDEX IF NOT EXISTS feedback_submitted_by_time_idx
  ON public.feedback USING btree (submitted_by, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_feedback_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  recent_count integer;
  message_max     constant integer := 4000;
  user_hourly_cap constant integer := 20;
BEGIN
  IF NEW.message IS NOT NULL THEN NEW.message := left(NEW.message, message_max); END IF;
  IF NEW.user_agent IS NOT NULL THEN NEW.user_agent := left(NEW.user_agent, 512); END IF;
  IF NEW.viewport IS NOT NULL THEN NEW.viewport := left(NEW.viewport, 32); END IF;
  IF NEW.route IS NOT NULL THEN NEW.route := left(NEW.route, 256); END IF;

  SELECT count(*) INTO recent_count
    FROM public.feedback
   WHERE submitted_by = NEW.submitted_by
     AND created_at > now() - interval '1 hour';

  IF recent_count >= user_hourly_cap THEN
    RAISE EXCEPTION 'Too much feedback in the last hour - please try again later'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_feedback_insert ON public.feedback;
CREATE TRIGGER trg_guard_feedback_insert
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.guard_feedback_insert();
