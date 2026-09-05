-- Phase 10 D1 -- admin-published What's new
--
-- WHY. The digest used to read the coach catalog directly: every `announce: true` item that a user
-- had not seen. That has no editorial control at all -- it shows whatever the codebase happens to
-- contain, in whatever order, so a tester signing up today would be handed the accumulated 7.x/8.x
-- history as if it were news. The automatic coaches were switched off on 2026-09-05 rather than
-- ship that. This table is what turns them back on safely.
--
-- THE SPLIT. The catalog still owns the TOURS -- anchors and captions are UI, and belong in code.
-- This table owns the ANNOUNCEMENTS: what gets shown, to whom, and when. `coach_id` optionally
-- links a row to a catalog tour so "Show me" can play it; announcements without one are just text.
--
-- SEEN TRACKING reuses `users.seen_coach_ids` (text[]), which already holds `core.done` and catalog
-- ids. Announcement ids go in the same array -- one list of "things this user has been shown",
-- rather than a second mechanism that can disagree with the first.
--
-- B-74: created_by references public.users.id, like every other person-column here.
--
-- Rollback: sql/announcements-snapshot.sql
-- Additive + idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  -- Optional link to a COACH_CATALOG id. Kept as free text, not an FK: the catalog lives in code,
  -- and a renamed coach must not be able to break a published announcement.
  coach_id text,
  published boolean NOT NULL DEFAULT false,
  -- 'new'      -> only people who have not finished the core tour
  -- 'existing' -> only people who have
  -- 'all'      -> everyone
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'new', 'existing')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS announcements_published_idx
  ON public.announcements (published, published_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read PUBLISHED rows; that is what the digest reads. Drafts stay invisible,
-- so an unfinished announcement cannot leak into someone's app before it is ready.
DROP POLICY IF EXISTS "Read published announcements" ON public.announcements;
CREATE POLICY "Read published announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (published = true);

-- Admins see and manage everything, drafts included.
DROP POLICY IF EXISTS "Admin manage announcements" ON public.announcements;
CREATE POLICY "Admin manage announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin'));

COMMIT;

-- NOTE: existing catalog items are deliberately NOT seeded as rows. Seeding them published would
-- recreate the exact problem this table exists to solve; seeding them unpublished would just be
-- clutter Brian has to delete. The catalog's `announce` flag is now only a hint for the admin UI,
-- which offers those ids when composing.
