-- ============================================================================
-- SNAPSHOT / ROLLBACK for sql/drop-dead-elo-overload.sql  (#64, 2026-09-10)
--
-- Recreates public.update_elo_for_session(uuid) -- the pre-3.0 engine that
-- writes bottles.elo_global and upserts user_bottles without variant_id.
-- Captured from prod with pg_get_functiondef immediately before the DROP.
-- Do not run unless you mean to put that footgun back.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_elo_for_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  session_user_id uuid;
  bottle_pairs RECORD;
  winner_elo_user numeric;
  loser_elo_user numeric;
  winner_elo_global numeric;
  loser_elo_global numeric;
  rank_gap_user numeric;
  rank_gap_global numeric;
  k_factor_user numeric := 32;
  k_factor_global numeric := 32;
  win_rate_user numeric;
  win_rate_global numeric;
  expected_winner_user numeric;
  expected_winner_global numeric;
  swing_user numeric;
  swing_global numeric;
BEGIN
  -- Get the user_id from the session
  SELECT user_id INTO session_user_id FROM public.tasting_sessions WHERE id = p_session_id;

  -- Loop over all pairwise results in this session
  FOR bottle_pairs IN
    SELECT winner_bottle_id, loser_bottle_id FROM public.tasting_results WHERE tasting_session_id = p_session_id
  LOOP
    -- Get INITIAL Elo for this calc (before any swings in this session)
    SELECT COALESCE(elo, 1500) INTO winner_elo_user FROM public.user_bottles WHERE user_id = session_user_id AND bottle_id = bottle_pairs.winner_bottle_id;
    SELECT COALESCE(elo, 1500) INTO loser_elo_user FROM public.user_bottles WHERE user_id = session_user_id AND bottle_id = bottle_pairs.loser_bottle_id;

    SELECT elo_global INTO winner_elo_global FROM public.bottles WHERE id = bottle_pairs.winner_bottle_id;
    SELECT elo_global INTO loser_elo_global FROM public.bottles WHERE id = bottle_pairs.loser_bottle_id;

    -- Rank gaps
    rank_gap_user := winner_elo_user - loser_elo_user;
    rank_gap_global := winner_elo_global - loser_elo_global;

    -- Scale K
    k_factor_user := k_factor_user + LEAST(ABS(rank_gap_user) / 10, 32);
    k_factor_global := k_factor_global + LEAST(ABS(rank_gap_global) / 10, 32);

    -- Win rate from PREVIOUS sessions only (exclude current)
    SELECT COALESCE(COUNT(*) FILTER (WHERE winner_bottle_id = bottle_pairs.winner_bottle_id AND loser_bottle_id = bottle_pairs.loser_bottle_id) / NULLIF(COUNT(*), 0), 0.5)
    INTO win_rate_user
    FROM public.tasting_results r
    JOIN public.tasting_sessions s ON r.tasting_session_id = s.id
    WHERE s.user_id = session_user_id
      AND ((winner_bottle_id = bottle_pairs.winner_bottle_id AND loser_bottle_id = bottle_pairs.loser_bottle_id) OR (winner_bottle_id = bottle_pairs.loser_bottle_id AND loser_bottle_id = bottle_pairs.winner_bottle_id))
      AND r.tasting_session_id <> p_session_id
      AND r.created_at >= (SELECT MIN(created_at) FROM (SELECT rr.created_at FROM public.tasting_results rr JOIN public.tasting_sessions ss ON rr.tasting_session_id = ss.id WHERE ss.user_id = session_user_id ORDER BY rr.created_at DESC LIMIT 10) sub);

    SELECT COALESCE(COUNT(*) FILTER (WHERE winner_bottle_id = bottle_pairs.winner_bottle_id AND loser_bottle_id = bottle_pairs.loser_bottle_id) / NULLIF(COUNT(*), 0), 0.5)
    INTO win_rate_global
    FROM public.tasting_results
    WHERE ((winner_bottle_id = bottle_pairs.winner_bottle_id AND loser_bottle_id = bottle_pairs.loser_bottle_id) OR (winner_bottle_id = bottle_pairs.loser_bottle_id AND loser_bottle_id = bottle_pairs.winner_bottle_id))
      AND tasting_session_id <> p_session_id
      AND created_at >= (SELECT MIN(created_at) FROM (SELECT created_at FROM public.tasting_results ORDER BY created_at DESC LIMIT 100) sub);

    -- Expected
    expected_winner_user := 1 / (1 + POW(10, (loser_elo_user - winner_elo_user) / 400));
    expected_winner_global := 1 / (1 + POW(10, (loser_elo_global - winner_elo_global) / 400));

    -- Swing rounded
    swing_user := ROUND(k_factor_user * (1 - expected_winner_user) * win_rate_user, 2);
    swing_global := ROUND(k_factor_global * (1 - expected_winner_global) * win_rate_global, 2);

    -- Update (using upsert for user)
    INSERT INTO public.user_bottles (user_id, bottle_id, elo)
    VALUES (session_user_id, bottle_pairs.winner_bottle_id, winner_elo_user + swing_user)
    ON CONFLICT (user_id, bottle_id) DO UPDATE SET elo = EXCLUDED.elo;

    INSERT INTO public.user_bottles (user_id, bottle_id, elo)
    VALUES (session_user_id, bottle_pairs.loser_bottle_id, loser_elo_user - swing_user)
    ON CONFLICT (user_id, bottle_id) DO UPDATE SET elo = EXCLUDED.elo;

    UPDATE public.bottles SET elo_global = winner_elo_global + swing_global WHERE id = bottle_pairs.winner_bottle_id;
    UPDATE public.bottles SET elo_global = loser_elo_global - swing_global WHERE id = bottle_pairs.loser_bottle_id;
  END LOOP;
END;
$function$
