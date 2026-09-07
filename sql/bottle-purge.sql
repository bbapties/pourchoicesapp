-- ============================================================================
-- Purge: delete a junk bottle AND its history, on purpose   -- board #67
--                                                              (2026-09-07)
--
-- Brian's two kinds of admin delete, 2026-09-07:
--   MERGE   the same whiskey entered twice. The interactions belong on the other
--           row, so they move. That is #68.
--   PURGE   test rows and data that should not exist at all. The interactions
--           are junk too, so they go with it.
--
-- This is the second one. It is the ONLY path that deliberately destroys other
-- people's history, so it is deliberately awkward: the caller must pass the
-- bottle's exact name, which the UI makes the admin type.
--
-- IT ENDS IN A REPLAY, IN THE SAME TRANSACTION. Purging removes head-to-head
-- results while every other bottle keeps the points it won from them, so without
-- a rebuild the scoreboard would show scores that its own history can no longer
-- produce. Brian: "I do think we should re-run it... it should re-run the global
-- Elo fully as well as everyone's personal Elo that is impacted."
--
-- That rebuild is only trustworthy because of #79. Until 2026-09-07 a replay did
-- not reproduce the numbers it replaced -- a session's score depended on the
-- order its pairs happened to be stored in -- so a purge would have quietly
-- reshuffled bottles that had nothing to do with it. Now a replay of unchanged
-- history is a no-op, and the only movement a purge causes is the movement it
-- actually caused. DO NOT wire any other destructive operation to a replay
-- without checking that property still holds.
--
-- Users are told nothing (Brian's call). Their personal Elo can move.
--
-- The delete itself is left to the foreign keys: bottles CASCADEs to activities,
-- bottle_variants, suggested_edits, tasting_details, tasting_results,
-- user_bottles, user_ratings and wishlists. Spelling those out here would be a
-- second definition of the same thing, drifting the moment a table is added.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_bottle(p_bottle uuid, p_confirm_name text)
RETURNS jsonb
LANGUAGE plpgsql
-- Definer: the cascade reaches rows belonging to other users, and the replay
-- re-inserts everyone's tastings. Admin-gated first, search_path pinned.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_name    text;
  v_impact  jsonb;
  v_replay  RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.auth_id = auth.uid() AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'purge_bottle: admins only';
  END IF;

  SELECT name INTO v_name FROM public.bottles WHERE id = p_bottle;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'purge_bottle: no such bottle %', p_bottle;
  END IF;

  -- The name has to be typed. A purge is not undoable and the impact function
  -- exists precisely because the damage is invisible from the bottle row itself.
  IF p_confirm_name IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'purge_bottle: name confirmation does not match';
  END IF;

  -- Record what is about to be destroyed, and return it, so the admin sees what
  -- happened rather than what they were warned about.
  v_impact := public.bottle_delete_impact(p_bottle);

  DELETE FROM public.bottles WHERE id = p_bottle;

  SELECT * INTO v_replay FROM public.replay_elo_history();

  RETURN jsonb_build_object(
    'bottle', v_name,
    'destroyed', v_impact,
    'sessions_replayed', v_replay.sessions_replayed,
    'pairs_replayed', v_replay.pairs_replayed
  );
END;
$fn$;

COMMENT ON FUNCTION public.purge_bottle(uuid, text) IS
  'Deletes a junk bottle and everything attached to it, then rebuilds every Elo from the surviving history in the same transaction (#67). Requires the bottle name to be retyped. Admins only. For a duplicate, merge instead (#68).';

GRANT EXECUTE ON FUNCTION public.purge_bottle(uuid, text) TO authenticated;

COMMIT;
