-- ============================================================================
-- The replay, as a function     -- board #67 (and #68 will call it too)
--                                  (2026-09-07)
--
-- `sql/elo-replay-history.sql` was a one-off script run by hand on 2026-09-06.
-- Purging a junk bottle and merging a duplicate BOTH have to end with the same
-- replay -- Brian, 2026-09-07: "I do think we should re-run it... it should
-- re-run the global Elo fully as well as everyone's personal Elo that is
-- impacted" -- so it stops being a script and becomes the one callable
-- implementation. The script stays in the repo as the record of that day.
--
-- IT STILL DOES NOT COMPUTE ANYTHING. It resets the ratings and re-inserts the
-- surviving tasting_results one session per statement, oldest first, so
-- `trig_update_elo_after_session` scores them exactly as it would have live.
-- Computing "correct" values here instead would be a second implementation of
-- the Elo maths -- the exact failure that produced #3, where the engine and the
-- spec disagreed for months and nobody noticed. There is one implementation of
-- this maths, ever.
--
-- THREE THINGS ARE LOAD-BEARING, all inherited from the script:
--
--   ONE STATEMENT PER SESSION. The trigger is FOR EACH STATEMENT. Insert
--   everything in one go and the whole history scores as a single sitting;
--   insert row by row and a five-bottle tasting scores ten times, each pass
--   reading the last pass's ratings.
--
--   OLDEST FIRST. The K schedule depends on how many times a pair has met
--   BEFORE this meeting, and the meeting count is time-bounded on
--   (created_at, id). Replaying out of order silently rescores everything.
--
--   ORIGINAL created_at AND tasting_session_id are preserved on re-insert. Only
--   the surrogate `id` changes, and nothing in the schema references it
--   (verified 2026-09-06: zero foreign keys point at it).
--
-- The DELETE scores nothing: the trigger is AFTER INSERT only.
--
-- Callers must run this INSIDE their own transaction, together with whatever
-- destroyed or moved the history, so a failure cannot leave the ratings
-- half-rebuilt.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.replay_elo_history()
RETURNS TABLE (sessions_replayed int, pairs_replayed int)
LANGUAGE plpgsql
-- SECURITY DEFINER, deliberately and necessarily. A replay re-inserts EVERY
-- user's tastings, and the INSERT policy on tasting_results only lets you write
-- rows for your own sessions -- so an admin running this as themselves is
-- refused by RLS partway through, which is exactly what happened the first time
-- it was tried. The admin check below runs BEFORE anything else, so the elevated
-- rights are gated by the same rule RLS would have applied. search_path is
-- pinned so a caller cannot shadow `public` and have this run something else.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  s RECORD;
  n_sessions int := 0;
  n_pairs    int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.auth_id = auth.uid() AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'replay_elo_history: admins only';
  END IF;

  CREATE TEMP TABLE _replay_src ON COMMIT DROP AS
    SELECT r.tasting_session_id, r.winner_bottle_id, r.loser_bottle_id,
           r.winner_variant_id, r.loser_variant_id, r.created_at,
           s2.created_at AS session_at
      FROM public.tasting_results r
      JOIN public.tasting_sessions s2 ON s2.id = r.tasting_session_id;

  SELECT count(*) INTO n_pairs FROM _replay_src;

  -- 1500 is the schema default for both columns -- "never tasted" -- so this is
  -- a reset, not an invented value.
  UPDATE public.bottle_variants SET elo_global = 1500 WHERE COALESCE(elo_global, 1500) <> 1500;
  UPDATE public.user_bottles     SET elo        = 1500 WHERE COALESCE(elo, 1500)        <> 1500;

  DELETE FROM public.tasting_results;

  FOR s IN
    SELECT DISTINCT tasting_session_id, session_at
      FROM _replay_src
     ORDER BY session_at, tasting_session_id
  LOOP
    INSERT INTO public.tasting_results
      (tasting_session_id, winner_bottle_id, loser_bottle_id,
       winner_variant_id, loser_variant_id, created_at)
    SELECT tasting_session_id, winner_bottle_id, loser_bottle_id,
           winner_variant_id, loser_variant_id, created_at
      FROM _replay_src
     WHERE tasting_session_id = s.tasting_session_id;
    n_sessions := n_sessions + 1;
  END LOOP;

  DROP TABLE _replay_src;

  sessions_replayed := n_sessions;
  pairs_replayed    := n_pairs;
  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.replay_elo_history() IS
  'Rebuilds every global and personal Elo from the surviving tasting_results, by re-inserting them one session per statement in chronological order and letting the trigger score them (#67). Computes nothing itself. Admins only. Call inside the same transaction as whatever changed the history.';

COMMIT;
