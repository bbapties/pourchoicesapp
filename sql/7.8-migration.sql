-- Phase 7.8 - Suggest-an-edit correction pipeline.
-- Additive. Safe to re-run. No existing tables, columns, policies, or
-- functions are changed. Rollback: sql/7.8-snapshot.sql
--   (DROP TABLE IF EXISTS public.suggested_edits CASCADE).
--
-- Append-only audit trail of proposed corrections to the golden record.
-- One row per (field change). status lifecycle:
--   pending  -> submitted, awaiting admin review
--   approved -> admin applied it to the golden row
--   rejected -> admin declined it
--   canceled -> superseded by a newer submission on the same field
--   applied  -> self-edit on the submitter's own still-unverified record
--              (applied immediately, no admin needed)
-- The mine-and-unverified vs pending gate is enforced in the app.

BEGIN;

CREATE TABLE IF NOT EXISTS public.suggested_edits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bottle_id uuid NOT NULL REFERENCES public.bottles(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.bottle_variants(id) ON DELETE SET NULL,
  target_table text NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  status text NOT NULL DEFAULT 'pending',
  submitted_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_note text,
  submission_group uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  CONSTRAINT suggested_edits_target_table_check CHECK (
    target_table IN ('bottles', 'bottle_variants')
  ),
  CONSTRAINT suggested_edits_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'canceled', 'applied')
  )
);

CREATE INDEX IF NOT EXISTS suggested_edits_bottle_status_idx
  ON public.suggested_edits (bottle_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS suggested_edits_submitter_idx
  ON public.suggested_edits (submitted_by, status, created_at DESC);

CREATE INDEX IF NOT EXISTS suggested_edits_group_idx
  ON public.suggested_edits (submission_group);

ALTER TABLE public.suggested_edits ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.suggested_edits TO authenticated;

-- Read: the submitter sees their own rows; admins see everything.
DROP POLICY IF EXISTS suggested_edits_select ON public.suggested_edits;
CREATE POLICY suggested_edits_select
  ON public.suggested_edits
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = submitted_by)
  );

-- Insert: only as yourself.
DROP POLICY IF EXISTS suggested_edits_insert_own ON public.suggested_edits;
CREATE POLICY suggested_edits_insert_own
  ON public.suggested_edits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = submitted_by)
  );

-- Update: the submitter may cancel/supersede their own row; admins may
-- approve/reject any. Content columns are never rewritten (app-enforced;
-- supersede = cancel + insert).
DROP POLICY IF EXISTS suggested_edits_update ON public.suggested_edits;
CREATE POLICY suggested_edits_update
  ON public.suggested_edits
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
