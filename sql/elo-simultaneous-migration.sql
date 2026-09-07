-- ============================================================================
-- Score a tasting SIMULTANEOUSLY, not pair by pair    -- board #79
--                                                        (2026-09-07)
-- APPROVED BY BRIAN 2026-09-07 after working through nine scenarios together.
--
-- THE BUG. update_elo_for_session() looped a session's pairs and updated the
-- ratings as it went, so each pair was scored against whatever the pairs before
-- it had left behind -- and the loop had no ORDER BY, so "before" meant whatever
-- order the transition table happened to yield. Measured on the real 10-bottle
-- session: feeding the same 45 pairs in opposite orders moved 10 bottles, the
-- largest by 15.01 Elo. A full replay of prod did not reproduce prod's own
-- stored numbers (11 bottles, up to 9 points) even though two consecutive
-- replays agreed exactly. The scoreboard was reproducible only by accident.
--
-- THE FIX. Read every rating ONCE at the start of the session, price every pair
-- against those, and apply the totals together. Nothing inside a sitting reads
-- another pair's result, so order stops existing as a concept.
--
-- WHY THIS AND NOT A DEFINED ORDER. Any fixed order also removes the
-- nondeterminism -- Brian proposed scoring from the bottom up, and it is a
-- 15-line change. It was rejected on the numbers, not the effort: with ten
-- unrated bottles it pays 5th and 6th place +5.6 and -18.0 for records that
-- differ by a single pair, because 6th's pairs are scored early at full value
-- and 5th's late against opponents already marked down. Whichever end you start
-- from, someone is advantaged by their position in a queue. Simultaneous pays
-- +16 and -16, and every scenario we tried stayed symmetric.
--
-- WHAT IS DELIBERATELY GIVEN UP. A bottle that shocks on the night is still
-- judged at the rating it walked in with, so beating it pays little even if it
-- finishes second. Checked across nine scenarios: worth 2-4 Elo against the
-- alternatives, and it self-corrects the moment that bottle's new rating lands.
-- The fully principled version -- solving for ratings that already include
-- tonight -- is a fixed-point iteration, and this rewrite is its first half if
-- it is ever wanted (#79 keeps the analysis).
--
-- EVERYTHING LOAD-BEARING IS PRESERVED:
--   * FOR EACH STATEMENT and the transition table -- see elo-trigger-create.sql.
--     The trigger itself is untouched; only the function it calls changes.
--   * The K schedule (elo_k_for_meetings) and the TIME-BOUNDED meeting count.
--     Meetings are about EARLIER sessions, so they are unaffected by this and
--     are still counted per pair.
--   * The store-pick rollup (elo_global_target), including skipping a pair whose
--     two variants roll up to the same target -- that is a bottle beating
--     itself and nets zero.
--   * Malformed rows (null or identical variant ids) still skipped.
--   * #2 concurrency: the arithmetic stays INSIDE the UPDATE (`elo = elo +
--     delta`), so a concurrent session cannot clobber this one, and rows are
--     still touched in a deterministic id order so two sessions covering the
--     same pair in opposite directions cannot deadlock.
--
-- It also does LESS WORK than before: one write per variant instead of two per
-- pair. A 10-bottle session goes from 90 personal upserts to 10.
--
-- Existing scores were produced by the old order-dependent engine, so they need
-- one settling replay (sql/elo-replay-function.sql) after this lands. Snapshot
-- first. Rollback: sql/elo-simultaneous-snapshot.sql.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_elo_for_session()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  session_id       uuid;
  session_user_id  uuid;
  session_at       timestamptz;      -- ordering anchor for the meeting counts
  pair             RECORD;
  d                RECORD;
  w_variant uuid; l_variant uuid;
  w_bottle  uuid; l_bottle  uuid;
  w_gtarget uuid; l_gtarget uuid;
  w_group   uuid[]; l_group uuid[];
  winner_elo_user   numeric; loser_elo_user   numeric;
  winner_elo_global numeric; loser_elo_global numeric;
  meetings_user     int;     meetings_global  int;
  expected_user     numeric; expected_global  numeric;
  swing_user        numeric; swing_global     numeric;
BEGIN
  SELECT tasting_session_id INTO session_id FROM new_results LIMIT 1;
  SELECT user_id, created_at INTO session_user_id, session_at
    FROM public.tasting_sessions WHERE id = session_id;

  -- Ratings as they stood when the session began. Read once; every pair below is
  -- priced against these and nothing here is updated until the very end. This is
  -- the whole change.
  -- Dropped at the end of every call, but dropped here too: the trigger fires
  -- once per statement, and a replay runs many statements inside ONE
  -- transaction, so a call that failed midway would otherwise leave these
  -- behind and break the next one.
  DROP TABLE IF EXISTS _elo_start_user;
  DROP TABLE IF EXISTS _elo_start_global;
  DROP TABLE IF EXISTS _elo_delta_user;
  DROP TABLE IF EXISTS _elo_delta_global;

  CREATE TEMP TABLE _elo_start_user (variant_id uuid PRIMARY KEY, elo numeric) ON COMMIT DROP;
  CREATE TEMP TABLE _elo_start_global (target_id uuid PRIMARY KEY, elo numeric) ON COMMIT DROP;
  CREATE TEMP TABLE _elo_delta_user (
    variant_id uuid PRIMARY KEY, bottle_id uuid, delta numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;
  CREATE TEMP TABLE _elo_delta_global (
    target_id uuid PRIMARY KEY, delta numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  INSERT INTO _elo_start_user (variant_id, elo)
  SELECT v.variant_id, COALESCE(ub.elo, 1500)
    FROM (
      SELECT DISTINCT winner_variant_id AS variant_id FROM new_results WHERE winner_variant_id IS NOT NULL
      UNION
      SELECT DISTINCT loser_variant_id  FROM new_results WHERE loser_variant_id  IS NOT NULL
    ) v
    LEFT JOIN public.user_bottles ub
      ON ub.user_id = session_user_id AND ub.variant_id = v.variant_id;

  INSERT INTO _elo_start_global (target_id, elo)
  SELECT t.target_id, COALESCE(bv.elo_global, 1500)
    FROM (
      SELECT DISTINCT public.elo_global_target(v.variant_id) AS target_id
        FROM (
          SELECT DISTINCT winner_variant_id AS variant_id FROM new_results WHERE winner_variant_id IS NOT NULL
          UNION
          SELECT DISTINCT loser_variant_id  FROM new_results WHERE loser_variant_id  IS NOT NULL
        ) v
    ) t
    JOIN public.bottle_variants bv ON bv.id = t.target_id
   WHERE t.target_id IS NOT NULL;

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
    SELECT elo INTO winner_elo_user FROM _elo_start_user WHERE variant_id = w_variant;
    SELECT elo INTO loser_elo_user  FROM _elo_start_user WHERE variant_id = l_variant;
    winner_elo_user := COALESCE(winner_elo_user, 1500);
    loser_elo_user  := COALESCE(loser_elo_user, 1500);

    -- #3: how often has THIS user put these two exact variants head to head in
    -- an EARLIER session? No rollup here -- personal Elo is per actual variant.
    -- Unchanged by the simultaneous rewrite: a meeting count is about previous
    -- sittings, never about this one.
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

    INSERT INTO _elo_delta_user (variant_id, bottle_id, delta)
    VALUES (w_variant, w_bottle, swing_user)
    ON CONFLICT (variant_id) DO UPDATE SET delta = _elo_delta_user.delta + EXCLUDED.delta;

    INSERT INTO _elo_delta_user (variant_id, bottle_id, delta)
    VALUES (l_variant, l_bottle, -swing_user)
    ON CONFLICT (variant_id) DO UPDATE SET delta = _elo_delta_user.delta + EXCLUDED.delta;

    -- ============================ GLOBAL (per variant; store-pick rollup) ===
    w_gtarget := public.elo_global_target(w_variant);
    l_gtarget := public.elo_global_target(l_variant);

    -- Only move global Elo if both targets resolve and differ (two store picks
    -- of the same parent, or a self-collapse, would net zero -> skip).
    IF w_gtarget IS NOT NULL AND l_gtarget IS NOT NULL AND w_gtarget <> l_gtarget THEN
      SELECT elo INTO winner_elo_global FROM _elo_start_global WHERE target_id = w_gtarget;
      SELECT elo INTO loser_elo_global  FROM _elo_start_global WHERE target_id = l_gtarget;
      winner_elo_global := COALESCE(winner_elo_global, 1500);
      loser_elo_global  := COALESCE(loser_elo_global, 1500);

      -- #10: count meetings between the two ROLLUP GROUPS, not the two literal
      -- variants -- otherwise a store pick's history never counts toward the
      -- parent default whose score it actually moves.
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

      INSERT INTO _elo_delta_global (target_id, delta) VALUES (w_gtarget, swing_global)
      ON CONFLICT (target_id) DO UPDATE SET delta = _elo_delta_global.delta + EXCLUDED.delta;

      INSERT INTO _elo_delta_global (target_id, delta) VALUES (l_gtarget, -swing_global)
      ON CONFLICT (target_id) DO UPDATE SET delta = _elo_delta_global.delta + EXCLUDED.delta;
    END IF;
  END LOOP;

  -- ============================ APPLY, ONCE ==========================
  -- In id order, one row at a time: the arithmetic stays inside the UPDATE so a
  -- concurrent session adds to the current value rather than to a stale copy
  -- (#2), and the deterministic order is what stops two sessions covering the
  -- same pair in opposite directions from deadlocking.
  FOR d IN SELECT variant_id, bottle_id, delta FROM _elo_delta_user ORDER BY variant_id LOOP
    -- New rows are tasted-only: NOT owned, times_had = 0 (the DB default is 1,
    -- so "never owned" has to be set explicitly).
    INSERT INTO public.user_bottles
      (user_id, bottle_id, variant_id, elo, currently_owned, times_had, created_at, updated_at)
    VALUES (session_user_id, d.bottle_id, d.variant_id,
            (SELECT elo FROM _elo_start_user WHERE variant_id = d.variant_id) + d.delta,
            false, 0, now(), now())
    ON CONFLICT (user_id, bottle_id, variant_id) WHERE variant_id IS NOT NULL
    DO UPDATE SET elo = COALESCE(user_bottles.elo, 1500) + d.delta, updated_at = now();
  END LOOP;

  FOR d IN SELECT target_id, delta FROM _elo_delta_global ORDER BY target_id LOOP
    UPDATE public.bottle_variants
       SET elo_global = COALESCE(elo_global, 1500) + d.delta
     WHERE id = d.target_id;
  END LOOP;

  DROP TABLE _elo_start_user;
  DROP TABLE _elo_start_global;
  DROP TABLE _elo_delta_user;
  DROP TABLE _elo_delta_global;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.update_elo_for_session() IS
  'Scores a whole tasting at once (#79): every pair priced against the ratings as they stood when the session began, then applied together. Order-independent by construction. K schedule, time-bounded meeting counts and the store-pick rollup are unchanged.';

COMMIT;
