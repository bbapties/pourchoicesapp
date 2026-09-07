-- ============================================================================
-- The settling replay for #79      (2026-09-07)
--
-- Every score in the database was produced by the OLD pair-by-pair engine, where
-- a session's result depended on the order its pairs happened to be stored in.
-- sql/elo-simultaneous-migration.sql replaced that engine; this re-scores the
-- existing history through the new one, once, so the stored numbers and the
-- recorded history finally agree.
--
-- Without it the scoreboard stays mixed: old sessions scored one way, every
-- future session scored another, and a replay (which every purge and merge ends
-- with) would silently shift bottles that had nothing to do with the change.
--
-- WHY THIS FILE RATHER THAN replay_elo_history(). That function is SECURITY
-- DEFINER and gated on `users.role = 'admin'` via auth.uid(), which does not
-- exist in a psql session -- correct for an RPC the app exposes, useless for a
-- migration. The logic here is identical and deliberately duplicated ONCE, for
-- this one-off, rather than weakening the guard on the callable version.
--
-- SAFETY
--   * One transaction. Swap COMMIT for ROLLBACK to rehearse; the diff still
--     prints, so a dry run shows exactly what would change.
--   * Values before this run are captured in
--     sql/elo-simultaneous-replay-snapshot.sql (74 UPDATEs, generated the same
--     day). That restores the numbers; sql/elo-simultaneous-snapshot.sql covers
--     restoring the engine.
--   * One statement per session, oldest first -- the trigger is FOR EACH
--     STATEMENT, and the K schedule depends on how many times a pair has met
--     BEFORE the session being scored.
--   * Original created_at and tasting_session_id are preserved. Only the
--     surrogate id changes, and nothing references it.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _before_global ON COMMIT DROP AS
  SELECT id AS variant_id, COALESCE(elo_global, 1500) AS elo FROM public.bottle_variants;
CREATE TEMP TABLE _before_user ON COMMIT DROP AS
  SELECT id AS ub_id, COALESCE(elo, 1500) AS elo FROM public.user_bottles;

CREATE TEMP TABLE _results ON COMMIT DROP AS
  SELECT r.tasting_session_id, r.winner_bottle_id, r.loser_bottle_id,
         r.winner_variant_id, r.loser_variant_id, r.created_at,
         s.created_at AS session_at
    FROM public.tasting_results r
    JOIN public.tasting_sessions s ON s.id = r.tasting_session_id;

SELECT 'history to replay' AS step, count(*) AS pairs,
       count(DISTINCT tasting_session_id) AS sessions FROM _results;

UPDATE public.bottle_variants SET elo_global = 1500 WHERE COALESCE(elo_global, 1500) <> 1500;
UPDATE public.user_bottles     SET elo        = 1500 WHERE COALESCE(elo, 1500)        <> 1500;

DELETE FROM public.tasting_results;

DO $replay$
DECLARE s RECORD; n int := 0;
BEGIN
  FOR s IN SELECT DISTINCT tasting_session_id, session_at FROM _results
            ORDER BY session_at, tasting_session_id
  LOOP
    INSERT INTO public.tasting_results
      (tasting_session_id, winner_bottle_id, loser_bottle_id,
       winner_variant_id, loser_variant_id, created_at)
    SELECT tasting_session_id, winner_bottle_id, loser_bottle_id,
           winner_variant_id, loser_variant_id, created_at
      FROM _results WHERE tasting_session_id = s.tasting_session_id;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'replayed % sessions', n;
END
$replay$;

SELECT 'row count check' AS step,
       (SELECT count(*) FROM _results)               AS before,
       (SELECT count(*) FROM public.tasting_results) AS after;

SELECT 'GLOBAL' AS scope, b.name AS bottle,
       bf.elo AS before,
       ROUND(COALESCE(v.elo_global, 1500), 2) AS after,
       ROUND(COALESCE(v.elo_global, 1500) - bf.elo, 2) AS delta
  FROM public.bottle_variants v
  JOIN _before_global bf ON bf.variant_id = v.id
  JOIN public.bottles b ON b.id = v.bottles_id
 WHERE ROUND(bf.elo, 2) <> ROUND(COALESCE(v.elo_global, 1500), 2)
 ORDER BY COALESCE(v.elo_global, 1500) DESC;

SELECT 'personal rows changed' AS step, count(*) AS n
  FROM public.user_bottles ub JOIN _before_user bf ON bf.ub_id = ub.id
 WHERE ROUND(bf.elo, 2) <> ROUND(COALESCE(ub.elo, 1500), 2);

-- The question that decides whether this was cosmetic or actually reordered
-- somebody's ranking.
SELECT 'ORDERING' AS step,
       count(*) FILTER (WHERE rank_before <> rank_after) AS bottles_that_moved_rank,
       count(*) AS bottles_ranked
  FROM (
    SELECT v.id,
           rank() OVER (ORDER BY bf.elo DESC, v.id)                       AS rank_before,
           rank() OVER (ORDER BY COALESCE(v.elo_global, 1500) DESC, v.id) AS rank_after
      FROM public.bottle_variants v
      JOIN _before_global bf ON bf.variant_id = v.id
     WHERE bf.elo <> 1500 OR COALESCE(v.elo_global, 1500) <> 1500
  ) x;

COMMIT;
