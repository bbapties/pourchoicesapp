-- Feedback / bug-report channel (beta-prep).
-- Additive. Safe to re-run. No existing tables, columns, policies, or functions
-- are changed. Rollback: sql/feedback-snapshot.sql
--   (DROP TABLE IF EXISTS public.feedback CASCADE).
--
-- One row per submitted report. A user submits from Profile; admins triage in
-- the Admin > Feedback tab. Mirrors the suggested_edits RLS shape (7.8):
--   insert-own, select own+admin, update own+admin.
--
-- status lifecycle (admin-driven in the triage queue):
--   new     -> just submitted
--   triaged -> admin has read it
--   planned -> accepted, will be worked
--   done    -> shipped / closed
--
-- Auto-captured context (invisible to the user): user_agent, viewport, route.
-- Screenshot is user-attached (optional); screenshot_path is the storage object
-- path (under the shared bottle-images bucket, "feedback/<id>/..." prefix) so a
-- resolved report's image can be purged in one delete.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type text NOT NULL,
  message text NOT NULL,
  screenshot_url text,
  screenshot_path text,
  status text NOT NULL DEFAULT 'new',
  submitted_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  admin_note text,
  user_agent text,
  viewport text,
  route text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT feedback_type_check CHECK (type IN ('feature', 'bug')),
  CONSTRAINT feedback_status_check CHECK (
    status IN ('new', 'triaged', 'planned', 'done')
  )
);

CREATE INDEX IF NOT EXISTS feedback_status_idx
  ON public.feedback (status, created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_submitter_idx
  ON public.feedback (submitted_by, created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.feedback TO authenticated;

-- Read: the submitter sees their own reports; admins see everything.
DROP POLICY IF EXISTS feedback_select ON public.feedback;
CREATE POLICY feedback_select
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = submitted_by)
  );

-- Insert: only as yourself.
DROP POLICY IF EXISTS feedback_insert_own ON public.feedback;
CREATE POLICY feedback_insert_own
  ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = submitted_by)
  );

-- Update: admins triage (status/note); the submitter may touch their own row.
DROP POLICY IF EXISTS feedback_update ON public.feedback;
CREATE POLICY feedback_update
  ON public.feedback
  FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = submitted_by)
  )
  WITH CHECK (
    is_admin()
    OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = submitted_by)
  );

COMMIT;
