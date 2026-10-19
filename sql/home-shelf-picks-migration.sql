-- Home friend shelves remember their pick. Additive. Safe to re-run.
-- Rollback: sql/home-shelf-picks-snapshot.sql
--
-- My Friend's Bar and Friends' Wishlists each have a dropdown of the people you follow. The
-- choice used to live in React state only, so a refresh or a new device reset it. One row per
-- user per shelf, so the pick follows the person across devices and log-ins.
--
-- Why a table and not two columns on users (like feed_default): users is publicly readable, and
-- whose bar you keep looking at is yours alone. RLS here is owner-only.
--
--   shelf  'friendsbar' | 'friendswish' (the shelf ids in src/lib/shelves.ts)
--   pick   'all' or a public.users.id. Stored as text so 'all' fits; the client checks it
--          against who you follow on every load and falls back if they are gone, so a stale
--          id is harmless and needs no FK.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_shelf_picks (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shelf      text NOT NULL CHECK (shelf IN ('friendsbar', 'friendswish')),
  pick       text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_shelf_picks_pkey PRIMARY KEY (user_id, shelf)
);

ALTER TABLE public.user_shelf_picks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.user_shelf_picks TO authenticated;

DROP POLICY IF EXISTS user_shelf_picks_select_own ON public.user_shelf_picks;
CREATE POLICY user_shelf_picks_select_own ON public.user_shelf_picks
  FOR SELECT TO authenticated
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

DROP POLICY IF EXISTS user_shelf_picks_insert_own ON public.user_shelf_picks;
CREATE POLICY user_shelf_picks_insert_own ON public.user_shelf_picks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

DROP POLICY IF EXISTS user_shelf_picks_update_own ON public.user_shelf_picks;
CREATE POLICY user_shelf_picks_update_own ON public.user_shelf_picks
  FOR UPDATE TO authenticated
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id))
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

COMMIT;
