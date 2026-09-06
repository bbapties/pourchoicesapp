-- ============================================================================
-- Elo engine correctness -- board #2, #3, #10   (2026-09-06)
--
-- Rollback: sql/elo-engine-correctness-snapshot.sql
--
-- These three cards are one change because they all live inside the body of
-- `public.update_elo_for_session()` and could not be applied independently.
--
--   #2  Global Elo lost-update. The function read `elo_global` into a variable
--       and wrote `variable + swing` ~20 lines later, so two tastings landing
--       concurrently on the same variant lost one of the swings. Now the
--       arithmetic happens inside the UPDATE, under the row lock. The two
--       global UPDATEs are also ordered by id so two sessions covering the same
--       pair in opposite directions cannot deadlock on each other.
--       Deliberately NOT wrapping the whole calculation in SELECT ... FOR
--       UPDATE: that serialises every concurrent tasting for contention that is
--       near-zero at three testers. `expected_global` may be computed from a
--       marginally stale rating; the accumulation is what has to be atomic.
--
--   #3  `swing = K * (1 - expected) * win_rate` is gone. Two problems with it:
--       the multiplier defaulted to 0.5 when a pair had never met -- which is
--       EVERY pair in the database today -- so every swing in the app was being
--       silently halved; and it keyed off *who won historically*, which made
--       confirmations of an established result move MORE and upsets move LESS.
--       That is backwards, and redundant with the `(1 - expected)` term beside
--       it, which already prices in surprise.
--       The actual intent (Brian, 2026-09-06) was confidence weighting: the
--       more times a pair has met, the less any single result -- upset or
--       confirmation alike -- should move them. That is a K schedule, not a
--       multiplier, and it is what the Momentum-Elo spec described. It now
--       lives in `public.elo_k_for_meetings()` so the numbers are one line to
--       retune. Chosen schedule 32 / 24 / 16 / 8 (the spec said 32/16/8; the
--       gentler ramp was picked).
--
--   #10 The global win-rate keyed off the actual variant ids while the global
--       Elo it fed was written to the ROLLUP target (a store pick rolls up to
--       its parent's default variant). So "this store pick vs X" history never
--       counted toward "parent default vs X". The meeting count that replaces
--       it resolves both sides through the same rollup the UPDATE uses.
--       Personal Elo deliberately does NOT roll up -- a store pick is its own
--       row in a user's bar, and its own line on their ranking.
--
-- Existing scores are untouched. Only future swings change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rollup target, extracted. Was inlined twice as a CASE expression; #10
--    needs it a third time (and inside a set-returning query), so it is a
--    function now. STABLE, not IMMUTABLE: it reads bottle_variants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.elo_global_target(p_variant uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE WHEN bv.store_pick_name IS NOT NULL
              THEN (SELECT d.id FROM public.bottle_variants d
                     WHERE d.bottles_id = bv.bottles_id AND d.is_default = true LIMIT 1)
              ELSE bv.id END
    FROM public.bottle_variants bv
   WHERE bv.id = p_variant;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. The K schedule (#3). Argument is how many times this pair has met BEFORE
--    the session being scored, so 0 = first ever meeting.
--
--      prior   meeting     K     a full upset moves
--      -----   -------   ----   -------------------
--        0       1st       32          up to 32
--       1-2     2nd-3rd    24          up to 24
--       3-5     4th-6th    16          up to 16
--       6+      7th+        8          up to  8
--
--    Retune by editing this function alone -- nothing else hardcodes a K.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.elo_k_for_meetings(p_prior_meetings int)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT (CASE
            WHEN COALESCE(p_prior_meetings, 0) <= 0 THEN 32
            WHEN p_prior_meetings <= 2 THEN 24
            WHEN p_prior_meetings <= 5 THEN 16
            ELSE 8
          END)::numeric;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. The meeting counts scan tasting_results by variant. Trivial at today's
--    row count, but this runs 45 times for a 10-bottle session and the table
--    only grows.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tasting_results_winner_variant
  ON public.tasting_results (winner_variant_id);
CREATE INDEX IF NOT EXISTS idx_tasting_results_loser_variant
  ON public.tasting_results (loser_variant_id);

-- ---------------------------------------------------------------------------
-- 4. The engine.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_elo_for_session()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  session_id       uuid;
  session_user_id  uuid;
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
  SELECT user_id INTO session_user_id FROM public.tasting_sessions WHERE id = session_id;

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

    -- #3: how often has THIS user put these two exact variants head to head
    -- before? No rollup here -- personal Elo is per actual variant.
    SELECT COUNT(*) INTO meetings_user
      FROM public.tasting_results r
      JOIN public.tasting_sessions s ON s.id = r.tasting_session_id
     WHERE s.user_id = session_user_id
       AND r.tasting_session_id <> session_id
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
       WHERE r.tasting_session_id <> session_id
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
