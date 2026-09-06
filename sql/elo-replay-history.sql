-- ============================================================================
-- Replay every recorded tasting through the CURRENT Elo engine   (2026-09-06)
--
-- WHY THIS EXISTS
-- Every tasting in the database was scored while the `win_rate` multiplier was
-- in the engine. That multiplier defaulted to 0.5 for a pair that had never met
-- -- and no pair in this database has ever met twice -- so the entire recorded
-- history was scored at EXACTLY HALF STRENGTH. The fix (board #3, commit
-- 0a0e01a) only changes future swings, which would leave the scores permanently
-- half-formed and mixed: old sessions at K=16-equivalent, new ones at K=32.
--
-- HOW, AND WHY NOT OFFLINE
-- This does NOT recompute the ratings itself. It resets them and re-inserts the
-- existing tasting_results one session at a time, in chronological order, so
-- `trig_update_elo_after_session` scores them exactly as it would have live.
-- Computing the "correct" values in a script instead would mean a second
-- implementation of the same maths -- which is precisely the failure that
-- created #3, where the engine and the design spec disagreed for months and
-- nobody noticed. There is only ever one implementation of this maths.
--
-- SAFETY
--   * One transaction. Swap COMMIT for ROLLBACK to rehearse; the comparison
--     output still prints, so a dry run shows the full before/after.
--   * tasting_results rows are re-inserted with their ORIGINAL created_at and
--     tasting_session_id. Only the surrogate `id` changes, and nothing in the
--     schema references it (verified: zero foreign keys point at it).
--   * No tasting_sessions, tasting_details, activities or user_ratings rows are
--     touched. Ownership on user_bottles (currently_owned, times_had) is
--     untouched -- only the `elo` column is reset.
--   * The trigger is AFTER INSERT only, so the DELETE does not score anything.
--
-- Requires the time-bounded meeting count from
-- sql/elo-meeting-count-time-bounded-migration.sql. Without it, replaying an
-- early session would count later sessions as its own prior history.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Remember where we started, so the run can show its own diff.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _before_global ON COMMIT DROP AS
  SELECT id AS variant_id, COALESCE(elo_global, 1500) AS elo FROM public.bottle_variants;

CREATE TEMP TABLE _before_user ON COMMIT DROP AS
  SELECT user_id, variant_id, COALESCE(elo, 1500) AS elo FROM public.user_bottles;

-- Full copy of the history, in the order it happened.
CREATE TEMP TABLE _results ON COMMIT DROP AS
  SELECT r.tasting_session_id, r.winner_bottle_id, r.loser_bottle_id,
         r.winner_variant_id, r.loser_variant_id, r.created_at,
         s.created_at AS session_at
    FROM public.tasting_results r
    JOIN public.tasting_sessions s ON s.id = r.tasting_session_id;

SELECT 'history to replay' AS step,
       count(*) AS pairs,
       count(DISTINCT tasting_session_id) AS sessions
  FROM _results;

-- ---------------------------------------------------------------------------
-- 1. Back to a clean slate. 1500 is the schema default for both columns, i.e.
--    "never tasted", so this is a reset rather than an invented value.
-- ---------------------------------------------------------------------------
UPDATE public.bottle_variants SET elo_global = 1500 WHERE COALESCE(elo_global, 1500) <> 1500;
UPDATE public.user_bottles     SET elo        = 1500 WHERE COALESCE(elo, 1500)        <> 1500;

DELETE FROM public.tasting_results;

-- ---------------------------------------------------------------------------
-- 2. Re-insert one session per statement, oldest first.
--    One statement per session is not a detail -- trig_update_elo_after_session
--    is FOR EACH STATEMENT, so this is what makes each session score as a
--    single sitting instead of 45 separate ones.
-- ---------------------------------------------------------------------------
DO $replay$
DECLARE
  s RECORD;
  n int := 0;
BEGIN
  FOR s IN
    SELECT DISTINCT tasting_session_id, session_at
      FROM _results
     ORDER BY session_at, tasting_session_id
  LOOP
    INSERT INTO public.tasting_results
      (tasting_session_id, winner_bottle_id, loser_bottle_id,
       winner_variant_id, loser_variant_id, created_at)
    SELECT tasting_session_id, winner_bottle_id, loser_bottle_id,
           winner_variant_id, loser_variant_id, created_at
      FROM _results
     WHERE tasting_session_id = s.tasting_session_id;
    n := n + 1;
    RAISE NOTICE 'replayed session % (%)', n, s.tasting_session_id;
  END LOOP;
END
$replay$;

-- ---------------------------------------------------------------------------
-- 3. Sanity: nothing lost.
-- ---------------------------------------------------------------------------
SELECT 'row count check' AS step,
       (SELECT count(*) FROM _results)               AS before,
       (SELECT count(*) FROM public.tasting_results) AS after;

-- ---------------------------------------------------------------------------
-- 4. What actually changed.
-- ---------------------------------------------------------------------------
SELECT 'GLOBAL' AS scope,
       b.name AS bottle,
       CASE WHEN v.store_pick_name IS NOT NULL THEN v.store_pick_name ELSE '' END AS pick,
       bf.elo AS before,
       ROUND(COALESCE(v.elo_global, 1500), 2) AS after,
       ROUND(COALESCE(v.elo_global, 1500) - bf.elo, 2) AS delta
  FROM public.bottle_variants v
  JOIN _before_global bf ON bf.variant_id = v.id
  JOIN public.bottles b ON b.id = v.bottles_id
 WHERE bf.elo <> 1500 OR COALESCE(v.elo_global, 1500) <> 1500
 ORDER BY COALESCE(v.elo_global, 1500) DESC;

SELECT 'PERSONAL' AS scope,
       u.username,
       b.name AS bottle,
       bf.elo AS before,
       ROUND(COALESCE(ub.elo, 1500), 2) AS after,
       ROUND(COALESCE(ub.elo, 1500) - bf.elo, 2) AS delta
  FROM public.user_bottles ub
  JOIN _before_user bf ON bf.user_id = ub.user_id AND bf.variant_id = ub.variant_id
  JOIN public.bottles b ON b.id = ub.bottle_id
  JOIN public.users u ON u.id = ub.user_id
 WHERE bf.elo <> 1500 OR COALESCE(ub.elo, 1500) <> 1500
 ORDER BY u.username, COALESCE(ub.elo, 1500) DESC;

-- Did the ORDER change, or only the spread? This is the question that decides
-- whether the replay is cosmetic or actually corrects somebody's ranking.
SELECT 'ORDERING' AS step,
       count(*) FILTER (WHERE rank_before <> rank_after) AS bottles_that_moved_rank,
       count(*) AS bottles_ranked
  FROM (
    SELECT v.id,
           rank() OVER (ORDER BY bf.elo DESC, v.id)                        AS rank_before,
           rank() OVER (ORDER BY COALESCE(v.elo_global, 1500) DESC, v.id)  AS rank_after
      FROM public.bottle_variants v
      JOIN _before_global bf ON bf.variant_id = v.id
     WHERE bf.elo <> 1500 OR COALESCE(v.elo_global, 1500) <> 1500
  ) x;

-- Applied for real 2026-09-06. Undo with sql/elo-replay-history-snapshot.sql.
COMMIT;
