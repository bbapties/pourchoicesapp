-- Rollback for sql/submission-hardening-migration.sql.
BEGIN;
DROP TRIGGER IF EXISTS trg_protect_feedback_update ON public.feedback;
DROP TRIGGER IF EXISTS trg_protect_suggested_edits_update ON public.suggested_edits;
DROP FUNCTION IF EXISTS public.protect_submission_update();
COMMIT;
