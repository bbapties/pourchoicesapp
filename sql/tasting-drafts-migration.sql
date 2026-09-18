-- ============================================================================
-- tasting_drafts: a blind tasting in progress survives a reload    (#134, 2026-09-17)
--
-- Brian, mid real tasting: helper mode, three glasses dealt, one swapped, five minutes of
-- pouring - and the phone reloaded /taste. The flow lived only in React state, so it was gone.
-- "If it's an app, a URL refresh shouldn't screw up the flow."
--
-- One row per user (the flow is single-tasting-at-a-time by design). `state` is the client's
-- serialised flow - picks, glass assignment, swaps, notes, rank order, step, mode - opaque to
-- the DB on purpose: it is a resume cache, not a record, and it is deleted the moment the
-- tasting is saved (which writes the real tasting_* rows) or abandoned. Supabase rather than
-- localStorage because the native shells will be webviews the OS wipes (AGENTS.md).
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.tasting_drafts (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  step       text NOT NULL,
  state      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tasting_drafts IS
  'A blind tasting in progress (#134): the client flow serialised so a reload / OS kill can offer Resume. One per user; deleted on save or Start over; older than 24h is ignored by the client.';

ALTER TABLE public.tasting_drafts ENABLE ROW LEVEL SECURITY;

-- own row only, resolved through users.auth_id (public.users.id != auth.users.id)
DROP POLICY IF EXISTS tasting_drafts_select ON public.tasting_drafts;
CREATE POLICY tasting_drafts_select ON public.tasting_drafts FOR SELECT
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = tasting_drafts.user_id));
DROP POLICY IF EXISTS tasting_drafts_insert ON public.tasting_drafts;
CREATE POLICY tasting_drafts_insert ON public.tasting_drafts FOR INSERT
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = tasting_drafts.user_id));
DROP POLICY IF EXISTS tasting_drafts_update ON public.tasting_drafts;
CREATE POLICY tasting_drafts_update ON public.tasting_drafts FOR UPDATE
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = tasting_drafts.user_id))
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = tasting_drafts.user_id));
DROP POLICY IF EXISTS tasting_drafts_delete ON public.tasting_drafts;
CREATE POLICY tasting_drafts_delete ON public.tasting_drafts FOR DELETE
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = tasting_drafts.user_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasting_drafts TO authenticated;

COMMIT;
