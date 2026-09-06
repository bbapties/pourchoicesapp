-- ============================================================================
-- Persist pour order and glass letters on tasting_details -- board #11 (2026-09-06)
--
-- Rollback: sql/tasting-pour-order-snapshot.sql
--
-- The problem: a finished tasting recorded only its RESULT. `tasting_details`
-- had one row per glass but nothing saying which glass it was, and
-- `tasting_sessions.bottle_ids` / `variant_ids` were written in ranked order.
-- The glass letters existed only in React state (DrinkClient's `glassAssignment`
-- / `rankOrder`) and were thrown away on save. So "you had B, D and A -- you
-- ranked D first" was unreconstructable, which is what #20's session-detail
-- view needs.
--
-- Why this shape rather than a second array on tasting_sessions: there is
-- already exactly one tasting_details row per glass, so the glass identity
-- belongs on it. Arrays are also awkward to query and #20 wants per-glass rows.
--
-- `rank` is included alongside the two #11 columns so a tasting_details row is
-- self-describing -- pour position, glass label and finishing position in one
-- place, with no dependence on the ordering of an array column elsewhere.
-- (`tasting_sessions.bottle_ids` / `variant_ids` keep their ranked order and are
-- unchanged; nothing in the app reads them today, confirmed by grep.)
--
-- All three columns are nullable and additive. Existing rows stay NULL -- the
-- information to backfill them does not exist anywhere, so a reader must treat
-- NULL as "tasting recorded before 2026-09-06".
-- ============================================================================

ALTER TABLE public.tasting_details
  ADD COLUMN IF NOT EXISTS pour_index  int,   -- 0-based position in the POUR order (A=0, B=1, ...)
  ADD COLUMN IF NOT EXISTS glass_letter text, -- the label on the glass: 'A'..'J'
  ADD COLUMN IF NOT EXISTS rank        int;   -- 0-based finishing position (0 = the taster's favourite)

COMMENT ON COLUMN public.tasting_details.pour_index IS
  'Board #11. 0-based position in the order the glasses were poured. In helper mode this is the shuffled, secret-from-the-taster order; in self mode it is the order the bottles were picked. NULL when the pour order was not captured: tastings saved before 2026-09-06, and sessions written by the import-tasting skill, which supplies the result but not the pour order.';
COMMENT ON COLUMN public.tasting_details.glass_letter IS
  'Board #11. The letter physically on the glass, A-J, derived from pour_index. NULL wherever pour_index is NULL - see that column.';
COMMENT ON COLUMN public.tasting_details.rank IS
  'Board #11. 0-based finishing position, 0 = ranked best. Mirrors the order of tasting_sessions.variant_ids. NULL for tastings saved before 2026-09-06.';

-- One glass letter and one pour position per session. Partial so the NULLs on
-- pre-2026-09-06 rows do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasting_details_session_glass
  ON public.tasting_details (tasting_session_id, glass_letter)
  WHERE glass_letter IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasting_details_session_pour
  ON public.tasting_details (tasting_session_id, pour_index)
  WHERE pour_index IS NOT NULL;
