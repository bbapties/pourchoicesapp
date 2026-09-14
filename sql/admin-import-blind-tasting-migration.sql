-- ============================================================================
-- Admin: enter a past blind tasting for any user, dated, and re-run the Elos
-- (board #129, 2026-09-14)
--
-- The form in Admin > Blinds calls this once per tasting. It is the
-- import-tasting skill's SQL template (build_tasting_sql.mjs) as ONE function,
-- plus the replay, so the whole thing is a single transaction: session +
-- details + every pair, dated the day Brian picked, then replay_elo_history()
-- so the backdated sitting scores in chronological order with everything
-- around it.
--
-- WHY A FUNCTION, NOT CLIENT INSERTS: RLS only lets you write tasting rows
-- for YOUR OWN sessions, and the whole point is an admin writing someone
-- else's. SECURITY DEFINER with the same admin gate replay_elo_history uses.
--
-- DATE ONLY, STORED AS NOON (Brian, 2026-09-14). The replay orders sessions by
-- (created_at, id), and ids are uuids, so two same-day entries would replay in
-- an arbitrary order. To keep "the order you saved them", each entry lands at
-- noon + N seconds where N = how many sessions already sit in that day's noon
-- hour. Local noon is taken as America/Chicago (Brian's clock).
--
-- WHAT THE TRIGGERS DO FOR US (so it is not repeated here):
--   trig_update_elo_after_session     scores the pairs (FOR EACH STATEMENT,
--                                     hence ONE insert for all pairs)
--   trig_zz_stamp_tasted_after_session stamps user_bottles.blind_tasted_at
--                                     from the SESSION's created_at, so the
--                                     backdate flows into "ranked".
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_import_blind_tasting(
  p_user_id     uuid,
  p_tasted_on   date,
  p_variant_ids uuid[],       -- finishing order, winner first
  p_name        text DEFAULT NULL
)
RETURNS TABLE (session_id uuid, tasted_at timestamptz, pairs int,
               sessions_replayed int, pairs_replayed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_admin      uuid;
  v_at         timestamptz;
  v_noon       timestamptz;
  v_same_day   int;
  v_n          int;
  v_bottle_ids uuid[];
  v_session    uuid;
  v_pairs      int := 0;
  r            RECORD;
BEGIN
  SELECT u.id INTO v_admin
    FROM public.users u
   WHERE u.auth_id = auth.uid() AND u.role = 'admin';
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'admin_import_blind_tasting: admins only';
  END IF;

  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'admin_import_blind_tasting: unknown user';
  END IF;
  IF p_tasted_on IS NULL OR p_tasted_on > current_date THEN
    RAISE EXCEPTION 'admin_import_blind_tasting: date must be today or earlier';
  END IF;

  -- No upper cap (Brian, 2026-09-14): the app's MAX_PICKS is a UI number; YouTubers run 15-20
  -- bottle blinds and those are exactly what this form exists to enter.
  v_n := COALESCE(array_length(p_variant_ids, 1), 0);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'admin_import_blind_tasting: need at least 2 bottles, got %', v_n;
  END IF;
  IF (SELECT count(DISTINCT v) FROM unnest(p_variant_ids) v) <> v_n THEN
    RAISE EXCEPTION 'admin_import_blind_tasting: the same bottle appears twice';
  END IF;

  -- variant -> bottle, in the same order as the input
  SELECT array_agg(bv.bottles_id ORDER BY x.ord) INTO v_bottle_ids
    FROM unnest(p_variant_ids) WITH ORDINALITY AS x(vid, ord)
    JOIN public.bottle_variants bv ON bv.id = x.vid;
  IF COALESCE(array_length(v_bottle_ids, 1), 0) <> v_n THEN
    RAISE EXCEPTION 'admin_import_blind_tasting: a variant id does not exist';
  END IF;

  -- noon that day, then +N seconds so same-day entries keep save order
  v_noon := (p_tasted_on::text || ' 12:00')::timestamp AT TIME ZONE 'America/Chicago';

  -- Duplicate guard (Brian, 2026-09-14): the same user, the same day, the same bottles in the
  -- same finishing order is the same blind entered twice, whether the first copy came from this
  -- form or from the app. Whole calendar day in Chicago, not just the noon window.
  IF EXISTS (
    SELECT 1 FROM public.tasting_sessions s
     WHERE s.user_id = p_user_id
       AND s.created_at >= v_noon - interval '12 hours'
       AND s.created_at <  v_noon + interval '12 hours'
       AND s.variant_ids = p_variant_ids
  ) THEN
    RAISE EXCEPTION 'That blind has already been submitted.';
  END IF;
  SELECT count(*) INTO v_same_day
    FROM public.tasting_sessions s
   WHERE s.created_at >= v_noon AND s.created_at < v_noon + interval '1 hour';
  v_at := v_noon + make_interval(secs => v_same_day);

  -- 1. the session (mode 'self', as the import skill does; provenance is the events row)
  INSERT INTO public.tasting_sessions
    (user_id, is_blind, mode, name, bottle_ids, variant_ids, created_at)
  VALUES (p_user_id, true, 'self', NULLIF(btrim(p_name), ''), v_bottle_ids, p_variant_ids, v_at)
  RETURNING id INTO v_session;

  -- 2. one detail row per place; no glass letters (we know the RESULT, not the pour order)
  INSERT INTO public.tasting_details
    (tasting_session_id, bottle_id, variant_id, rank, glass_letter, pour_index, created_at)
  SELECT v_session, v_bottle_ids[i], p_variant_ids[i], i - 1, NULL, NULL, v_at
    FROM generate_series(1, v_n) i;

  -- 3. every pair in ONE statement (i beats j for i < j)
  INSERT INTO public.tasting_results
    (tasting_session_id, winner_bottle_id, loser_bottle_id, winner_variant_id, loser_variant_id, created_at)
  SELECT v_session, v_bottle_ids[i], v_bottle_ids[j], p_variant_ids[i], p_variant_ids[j], v_at
    FROM generate_series(1, v_n) i
    JOIN generate_series(1, v_n) j ON j > i;
  GET DIAGNOSTICS v_pairs = ROW_COUNT;

  -- 4. B-47: a real blind supersedes a manual star guess
  DELETE FROM public.user_ratings
   WHERE user_id = p_user_id AND variant_id = ANY (p_variant_ids);

  -- 5. B-51: exactly one 'tasted' activity, anchored on the winner, dated the same
  INSERT INTO public.activities (user_id, bottle_id, variant_id, action, pour_type, session_id, details, created_at)
  VALUES (p_user_id, v_bottle_ids[1], p_variant_ids[1], 'tasted', NULL, v_session,
          jsonb_build_object('count', v_n, 'backdated', true), v_at);

  -- 6. provenance (event_type registered in TELEMETRY.md)
  INSERT INTO public.events (user_id, event_type, surface, target_type, target_id, metadata, created_at)
  VALUES (p_user_id, 'tasting_imported', 'admin_blinds', 'tasting_session', v_session::text,
          jsonb_build_object('source', 'admin_blinds_form', 'by_admin', v_admin,
                             'bottles', v_n, 'pairs', v_pairs, 'backdated', true,
                             'tasted_on', p_tasted_on),
          now());

  -- 7. rescore everything, oldest first, so this sitting lands where it belongs
  SELECT * INTO r FROM public.replay_elo_history();

  session_id        := v_session;
  tasted_at         := v_at;
  pairs             := v_pairs;
  sessions_replayed := r.sessions_replayed;
  pairs_replayed    := r.pairs_replayed;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_import_blind_tasting(uuid, date, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_import_blind_tasting(uuid, date, uuid[], text) TO authenticated;

COMMENT ON FUNCTION public.admin_import_blind_tasting(uuid, date, uuid[], text) IS
  'Admin > Blinds (#129): writes a backdated blind tasting for any user (session, details, all pairs at noon on the given day, star-guess cleanup, one tasted activity, provenance event) and then replay_elo_history(). Rejects an identical user+day+order as already submitted. No upper bottle cap. Admins only. One transaction.';

COMMIT;
