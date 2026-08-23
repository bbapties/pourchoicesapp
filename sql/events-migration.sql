-- Generic usage/interaction telemetry (beta-prep). See TELEMETRY.md.
-- Additive. Safe to re-run. No existing tables, columns, policies, or functions
-- are changed. Rollback: sql/events-snapshot.sql (DROP TABLE ... events).
--
-- One wide, append-only table for usage events that are NOT already first-class
-- domain actions (those live in `activities`). event_type is the "what kind"
-- filter column; metadata jsonb holds the long tail so new event shapes need no
-- migration. Captured now so future features (badges, discovery, analytics) have
-- historical data from day one of the beta.
--
-- event_type vocabulary (v1): 'page_view', 'search', 'click', 'error'.
-- Logged-out visitors are captured too (user_id NULL + a client session_id),
-- so the pre-login funnel is visible.

BEGIN;

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE, -- NULL for logged-out
  session_id text,
  event_type text NOT NULL,
  surface text,        -- route / screen, e.g. '/search'
  target_type text,    -- what was acted on: 'bottle_open', 'add_to_bar', 'have_a_drink', ...
  target_id text,
  metadata jsonb,      -- long tail: { query, result_count, mode, message, ... }
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_user_time_idx ON public.events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_type_time_idx ON public.events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS events_session_idx ON public.events (session_id);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.events TO anon, authenticated;
GRANT SELECT ON public.events TO authenticated;

-- Insert (append-only): anon may write only anonymous rows; a signed-in user may
-- write anonymous rows or rows stamped with their own public users.id.
DROP POLICY IF EXISTS events_insert_anon ON public.events;
CREATE POLICY events_insert_anon
  ON public.events
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS events_insert_auth ON public.events;
CREATE POLICY events_insert_auth
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL
    OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id)
  );

-- Read: admins only. No UPDATE/DELETE policies -> the table is append-only for
-- everyone but the service role.
DROP POLICY IF EXISTS events_select_admin ON public.events;
CREATE POLICY events_select_admin
  ON public.events
  FOR SELECT
  TO authenticated
  USING (is_admin());

COMMIT;
