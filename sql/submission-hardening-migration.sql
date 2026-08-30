-- Make feedback + suggested_edits genuinely append-only for submitters (bug B-58).
-- Rollback: sql/submission-hardening-snapshot.sql
--
-- Today the submitter's UPDATE policy lets them change ANY column on their own row, incl.
-- status / admin_note / reviewed_by / the submitted value. A BEFORE UPDATE trigger now freezes
-- the moderation (and content) columns for non-admin callers, mirroring protect_user_role (B-19):
--   feedback:        submitter may still attach a screenshot (screenshot_url/_path) and touch
--                    updated_at, but status/admin_note/reviewed_by/type/message are frozen.
--   suggested_edits: submitter may ONLY move their own pending row to 'canceled' (the append-only
--                    supersede/cancel path); every other non-admin update is a no-op.
-- Admins and service-role (no JWT) are unaffected. RLS row-access policies are unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_submission_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW; -- service-role and admins: unrestricted
  END IF;

  IF TG_TABLE_NAME = 'feedback' THEN
    NEW.status       := OLD.status;
    NEW.admin_note   := OLD.admin_note;
    NEW.reviewed_by  := OLD.reviewed_by;
    NEW.type         := OLD.type;
    NEW.message      := OLD.message;
    NEW.submitted_by := OLD.submitted_by;
    RETURN NEW; -- allows screenshot_url/screenshot_path/updated_at only
  ELSIF TG_TABLE_NAME = 'suggested_edits' THEN
    IF OLD.status = 'pending' AND NEW.status = 'canceled' THEN
      NEW := OLD;             -- freeze all content/moderation columns
      NEW.status := 'canceled';
      RETURN NEW;
    END IF;
    RETURN OLD;              -- any other non-admin update is a no-op
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_feedback_update ON public.feedback;
CREATE TRIGGER trg_protect_feedback_update
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.protect_submission_update();

DROP TRIGGER IF EXISTS trg_protect_suggested_edits_update ON public.suggested_edits;
CREATE TRIGGER trg_protect_suggested_edits_update
  BEFORE UPDATE ON public.suggested_edits
  FOR EACH ROW EXECUTE FUNCTION public.protect_submission_update();

COMMIT;
