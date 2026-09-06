-- ============================================================================
-- Meeting counts must look BACKWARDS in time, not just "not me"  (2026-09-06)
--
-- Rollback: sql/elo-engine-correctness-migration.sql (re-run it; this file only
--           replaces public.update_elo_for_session()).
--
-- Follow-up to #3 / #10. The K schedule keys off how many times a pair has met
-- BEFORE the session being scored, and that was expressed as:
--
--     AND r.tasting_session_id <> session_id      -- "any session but this one"
--
-- which is only equivalent to "before" because a live INSERT is always the
-- newest session in the table. Two things break that assumption, and both are
-- things we now do on purpose:
--
--   * REPLAY. Re-scoring history from scratch inserts session 2 while sessions
--     3, 4 and 5 are already present, so session 2 would count its own future
--     as prior history and get a lower K than it had when it really happened.
--   * BACKDATED IMPORT. `import-tasting --at "<earlier date>"` writes a session
--     that is deliberately not the newest, with the same consequence.
--
-- Both would quietly under-swing, and the result looks plausible, so nothing
-- would have caught it. The predicate is now an explicit ordering comparison
-- against the scored session's own created_at.
--
-- The comparison is on the tuple (created_at, id) rather than created_at alone
-- so two sessions sharing a timestamp still have one deterministic order --
-- otherwise a replay could score them differently run to run.
--
-- No behaviour change for a normal in-app tasting: it IS the newest session, so
-- "not me" and "before me" select the same rows. Nothing needs re-running
-- because of this fix alone -- no pair in the database has met twice yet, so
-- every meeting count is 0 either way.
--
-- The global count now has to JOIN tasting_sessions to reach created_at, where
-- before it could read tasting_results alone.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_elo_for_session()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  session_id       uuid;
  session_user_id  uuid;
  session_at       timestamptz;      -- ordering anchor for the meeting counts
  pair             RECORD;
  w_variant uuid; l_variant uuid;
  w_bottle  uuid; l_bottle  uuid;
  w_gtarget uuid; l_gtarget uuid;     -- global target variants (rollup for store picks)
  w_group   uuid[]; l_group uuid[];   -- every variant that rolls up to each target (#10)
  winner_elo_user   numeric; loser_elo_user   numeric;
  winner_elo_global numeric; loser_elo_global numeric;
  meetings_user     int;     meetings_global  int;    -- PRIOR head-to-heads (#3)
  expected_user     numeric; expected_global  numeric;
  swing_user        numeric; swing_global     numeric;
BEGIN
  SELECT tasting_session_id INTO session_id FROM new_results LIMIT 1;
  SELECT user_id, created_at INTO session_user_id, session_at
    FROM public.tasting_sessions WHERE id = session_id;

  FOR pair IN
    SELECT winner_variant_id, loser_variant_id, winner_bottle_id, loser_bottle_id
    FROM new_results
  LOOP
    w_variant := pair.winner_variant_id; l_variant := pair.loser_variant_id;
    w_bottle  := pair.winner_bottle_id;  l_bottle  := pair.loser_bottle_id;

    -- Skip malformed rows (variant ids are required for scoring).
    IF w_variant IS NULL OR l_variant IS NULL OR w_variant = l_variant THEN
      CONTINUE;
    END IF;

    -- ============================ PERSONAL (per user, per variant) =====
    SELECT COALESCE(elo, 1500) INTO winner_elo_user
      FROM public.user_bottles
     WHERE user_id = session_user_id AND variant_id = w_variant
     LIMIT 1;
    IF winner_elo_user IS NULL THEN winner_elo_user := 1500; END IF;

    SELECT COALESCE(elo, 1500) INTO loser_elo_user
      FROM public.user_bottles
     WHERE user_id = session_user_id AND variant_id = l_variant
     LIMIT 1;
    IF loser_elo_user IS NULL THEN loser_elo_user := 1500; END IF;

    -- #3: how often has THIS user put these two exact variants head to head in
    -- an EARLIER session? No rollup here -- personal Elo is per actual variant.
    SELECT COUNT(*) INTO meetings_user
      FROM public.tasting_results r
      JOIN public.tasting_sessions s ON s.id = r.tasting_session_id
     WHERE s.user_id = session_user_id
       AND r.tasting_session_id <> session_id
       AND (s.created_at, s.id) < (session_at, session_id)
       AND ((r.winner_variant_id = w_variant AND r.loser_variant_id = l_variant)
         OR (r.winner_variant_id = l_variant AND r.loser_variant_id = w_variant));

    expected_user := 1 / (1 + POW(10, (loser_elo_user - winner_elo_user) / 400));
    swing_user := ROUND(public.elo_k_for_meetings(meetings_user) * (1 - expected_user), 2);

    -- Upsert personal Elo. New rows are tasted-only: NOT owned, times_had = 0
    -- (the DB default is 1, so we set it explicitly to mark "never owned").
    -- #2: on conflict, add to the row's CURRENT value rather than to the copy
    -- read above, so a concurrent session cannot clobber this swing.
    INSERT INTO public.user_bottles (user_id, bottle_id, variant_id, elo, currently_owned, times_had, created_at, updated_at)
    VALUES (session_user_id, w_bottle, w_variant, winner_elo_user + swing_user, false, 0, now(), now())
    ON CONFLICT (user_id, bottle_id, variant_id) WHERE variant_id IS NOT NULL
    DO UPDATE SET elo = COALESCE(user_bottles.elo, 1500) + swing_user, updated_at = now();

    INSERT INTO public.user_bottles (user_id, bottle_id, variant_id, elo, currently_owned, times_had, created_at, updated_at)
    VALUES (session_user_id, l_bottle, l_variant, loser_elo_user - swing_user, false, 0, now(), now())
    ON CONFLICT (user_id, bottle_id, variant_id) WHERE variant_id IS NOT NULL
    DO UPDATE SET elo = COALESCE(user_bottles.elo, 1500) - swing_user, updated_at = now();

    -- ============================ GLOBAL (per variant; store-pick rollup) ===
    w_gtarget := public.elo_global_target(w_variant);
    l_gtarget := public.elo_global_target(l_variant);

    -- Only move global Elo if both targets resolve and differ (two store picks
    -- of the same parent, or a self-collapse, would net zero -> skip).
    IF w_gtarget IS NOT NULL AND l_gtarget IS NOT NULL AND w_gtarget <> l_gtarget THEN
      SELECT COALESCE(elo_global, 1500) INTO winner_elo_global FROM public.bottle_variants WHERE id = w_gtarget;
      SELECT COALESCE(elo_global, 1500) INTO loser_elo_global  FROM public.bottle_variants WHERE id = l_gtarget;

      -- #10: count meetings between the two ROLLUP GROUPS, not the two literal
      -- variants -- otherwise a store pick's history never counts toward the
      -- parent default whose score it actually moves. Resolving the groups once
      -- keeps the results scan a plain indexed `= ANY(...)` instead of calling
      -- elo_global_target() over every history row.
      w_group := ARRAY(SELECT bv.id FROM public.bottle_variants bv
                        WHERE public.elo_global_target(bv.id) = w_gtarget);
      l_group := ARRAY(SELECT bv.id FROM public.bottle_variants bv
                        WHERE public.elo_global_target(bv.id) = l_gtarget);

      SELECT COUNT(*) INTO meetings_global
        FROM public.tasting_results r
        JOIN public.tasting_sessions s ON s.id = r.tasting_session_id
       WHERE r.tasting_session_id <> session_id
         AND (s.created_at, s.id) < (session_at, session_id)
         AND ((r.winner_variant_id = ANY(w_group) AND r.loser_variant_id = ANY(l_group))
           OR (r.winner_variant_id = ANY(l_group) AND r.loser_variant_id = ANY(w_group)));

      expected_global := 1 / (1 + POW(10, (loser_elo_global - winner_elo_global) / 400));
      swing_global := ROUND(public.elo_k_for_meetings(meetings_global) * (1 - expected_global), 2);

      -- #2: arithmetic inside the UPDATE (atomic under the row lock), and the
      -- two rows touched in a deterministic id order so two concurrent sessions
      -- covering this pair in opposite directions cannot deadlock.
      IF w_gtarget < l_gtarget THEN
        UPDATE public.bottle_variants SET elo_global = COALESCE(elo_global, 1500) + swing_global WHERE id = w_gtarget;
        UPDATE public.bottle_variants SET elo_global = COALESCE(elo_global, 1500) - swing_global WHERE id = l_gtarget;
      ELSE
        UPDATE public.bottle_variants SET elo_global = COALESCE(elo_global, 1500) - swing_global WHERE id = l_gtarget;
        UPDATE public.bottle_variants SET elo_global = COALESCE(elo_global, 1500) + swing_global WHERE id = w_gtarget;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;
