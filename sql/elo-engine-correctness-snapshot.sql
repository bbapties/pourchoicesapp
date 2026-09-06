-- ============================================================================
-- SNAPSHOT / ROLLBACK for elo-engine-correctness-migration.sql
--
-- Restores `public.update_elo_for_session()` exactly as it stood before board
-- #2 / #3 / #10 were fixed on 2026-09-06. Verified byte-identical to the live
-- prod definition (pg_get_functiondef) at the time this was written, so this
-- file alone is a complete rollback of the trigger function.
--
-- NOT restored here (both additive, both safe to leave in place on a rollback):
--   * public.elo_global_target(uuid)          -- helper extracted by the migration
--   * idx_tasting_results_winner_variant / _loser_variant
-- Drop them by hand only if you want a truly pristine revert.
-- ============================================================================

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
  winner_elo_user   numeric; loser_elo_user   numeric;
  winner_elo_global numeric; loser_elo_global numeric;
  k_factor          numeric := 32;    -- FLAT per comparison
  win_rate_user     numeric; win_rate_global  numeric;
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

    -- Win-rate: last 10 head-to-heads of THIS pair, this user, prior sessions.
    SELECT COALESCE(
             (COUNT(*) FILTER (WHERE recent.winner_variant_id = w_variant))::numeric
             / NULLIF(COUNT(*), 0), 0.5)
      INTO win_rate_user
      FROM (
        SELECT r.winner_variant_id
          FROM public.tasting_results r
          JOIN public.tasting_sessions s ON s.id = r.tasting_session_id
         WHERE s.user_id = session_user_id
           AND r.tasting_session_id <> session_id
           AND ((r.winner_variant_id = w_variant AND r.loser_variant_id = l_variant)
             OR (r.winner_variant_id = l_variant AND r.loser_variant_id = w_variant))
         ORDER BY r.created_at DESC
         LIMIT 10
      ) recent;

    expected_user := 1 / (1 + POW(10, (loser_elo_user - winner_elo_user) / 400));
    swing_user := ROUND(k_factor * (1 - expected_user) * win_rate_user, 2);

    -- Upsert personal Elo. New rows are tasted-only: NOT owned, times_had = 0
    -- (the DB default is 1, so we set it explicitly to mark "never owned").
    -- On conflict with an existing owned/finished row we only move elo.
    INSERT INTO public.user_bottles (user_id, bottle_id, variant_id, elo, currently_owned, times_had, created_at, updated_at)
    VALUES (session_user_id, w_bottle, w_variant, winner_elo_user + swing_user, false, 0, now(), now())
    ON CONFLICT (user_id, bottle_id, variant_id) WHERE variant_id IS NOT NULL
    DO UPDATE SET elo = EXCLUDED.elo;

    INSERT INTO public.user_bottles (user_id, bottle_id, variant_id, elo, currently_owned, times_had, created_at, updated_at)
    VALUES (session_user_id, l_bottle, l_variant, loser_elo_user - swing_user, false, 0, now(), now())
    ON CONFLICT (user_id, bottle_id, variant_id) WHERE variant_id IS NOT NULL
    DO UPDATE SET elo = EXCLUDED.elo;

    -- ============================ GLOBAL (per variant; store-pick rollup) ===
    -- Resolve the global target: a store pick rolls up to its parent's default variant.
    SELECT CASE WHEN bv.store_pick_name IS NOT NULL
                THEN (SELECT d.id FROM public.bottle_variants d
                       WHERE d.bottles_id = bv.bottles_id AND d.is_default = true LIMIT 1)
                ELSE bv.id END
      INTO w_gtarget FROM public.bottle_variants bv WHERE bv.id = w_variant;

    SELECT CASE WHEN bv.store_pick_name IS NOT NULL
                THEN (SELECT d.id FROM public.bottle_variants d
                       WHERE d.bottles_id = bv.bottles_id AND d.is_default = true LIMIT 1)
                ELSE bv.id END
      INTO l_gtarget FROM public.bottle_variants bv WHERE bv.id = l_variant;

    -- Only move global Elo if both targets resolve and differ (two store picks
    -- of the same parent, or a self-collapse, would net zero -> skip).
    IF w_gtarget IS NOT NULL AND l_gtarget IS NOT NULL AND w_gtarget <> l_gtarget THEN
      SELECT COALESCE(elo_global, 1500) INTO winner_elo_global FROM public.bottle_variants WHERE id = w_gtarget;
      SELECT COALESCE(elo_global, 1500) INTO loser_elo_global  FROM public.bottle_variants WHERE id = l_gtarget;

      -- Global win-rate: last 20 head-to-heads of THIS pair, all users, prior sessions.
      SELECT COALESCE(
               (COUNT(*) FILTER (WHERE recent.winner_variant_id = w_variant))::numeric
               / NULLIF(COUNT(*), 0), 0.5)
        INTO win_rate_global
        FROM (
          SELECT r.winner_variant_id
            FROM public.tasting_results r
           WHERE r.tasting_session_id <> session_id
             AND ((r.winner_variant_id = w_variant AND r.loser_variant_id = l_variant)
               OR (r.winner_variant_id = l_variant AND r.loser_variant_id = w_variant))
           ORDER BY r.created_at DESC
           LIMIT 20
        ) recent;

      expected_global := 1 / (1 + POW(10, (loser_elo_global - winner_elo_global) / 400));
      swing_global := ROUND(k_factor * (1 - expected_global) * win_rate_global, 2);

      UPDATE public.bottle_variants SET elo_global = winner_elo_global + swing_global WHERE id = w_gtarget;
      UPDATE public.bottle_variants SET elo_global = loser_elo_global  - swing_global WHERE id = l_gtarget;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;
