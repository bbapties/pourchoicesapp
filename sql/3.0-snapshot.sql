-- =====================================================================
-- 3.0 -- SNAPSHOT / ROLLBACK for sql/3.0-migration.sql
--
-- Restores the pre-3.0 state of the Elo function, the tasting-table RLS
-- policies, and the user_bottles primary key.
--
-- NOTE: this does NOT (and cannot) restore data purged / rebaselined by
-- sql/3.0-reset.sql. Recover that from a Supabase backup taken before the
-- reset. The additive columns (winner_variant_id etc., user_bottles.id) are
-- harmless if left in place; drop statements are provided but commented out.
-- =====================================================================

BEGIN;

-- 1. Restore the original bottle-level Elo trigger function.
CREATE OR REPLACE FUNCTION public.update_elo_for_session()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  session_id uuid;
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
  SELECT tasting_session_id INTO session_id FROM new_results LIMIT 1;
  SELECT user_id INTO session_user_id FROM public.tasting_sessions WHERE id = session_id;

  FOR bottle_pairs IN
    SELECT winner_bottle_id, loser_bottle_id FROM new_results
  LOOP
    SELECT COALESCE(elo, 1500) INTO winner_elo_user FROM public.user_bottles WHERE user_id = session_user_id AND bottle_id = bottle_pairs.winner_bottle_id;
    SELECT COALESCE(elo, 1500) INTO loser_elo_user FROM public.user_bottles WHERE user_id = session_user_id AND bottle_id = bottle_pairs.loser_bottle_id;

    SELECT elo_global INTO winner_elo_global FROM public.bottles WHERE id = bottle_pairs.winner_bottle_id;
    SELECT elo_global INTO loser_elo_global FROM public.bottles WHERE id = bottle_pairs.loser_bottle_id;

    rank_gap_user := winner_elo_user - loser_elo_user;
    rank_gap_global := winner_elo_global - loser_elo_global;

    k_factor_user := k_factor_user + LEAST(ABS(rank_gap_user) / 10, 32);
    k_factor_global := k_factor_global + LEAST(ABS(rank_gap_global) / 10, 32);

    SELECT COALESCE(COUNT(*) FILTER (WHERE winner_bottle_id = bottle_pairs.winner_bottle_id AND loser_bottle_id = bottle_pairs.loser_bottle_id) / NULLIF(COUNT(*), 0), 0.5)
    INTO win_rate_user
    FROM public.tasting_results r
    JOIN public.tasting_sessions s ON r.tasting_session_id = s.id
    WHERE s.user_id = session_user_id
      AND ((winner_bottle_id = bottle_pairs.winner_bottle_id AND loser_bottle_id = bottle_pairs.loser_bottle_id) OR (winner_bottle_id = bottle_pairs.loser_bottle_id AND loser_bottle_id = bottle_pairs.winner_bottle_id))
      AND r.tasting_session_id <> session_id
      AND r.created_at >= (SELECT MIN(created_at) FROM (SELECT rr.created_at FROM public.tasting_results rr JOIN public.tasting_sessions ss ON rr.tasting_session_id = ss.id WHERE ss.user_id = session_user_id ORDER BY rr.created_at DESC LIMIT 10) sub);

    SELECT COALESCE(COUNT(*) FILTER (WHERE winner_bottle_id = bottle_pairs.winner_bottle_id AND loser_bottle_id = bottle_pairs.loser_bottle_id) / NULLIF(COUNT(*), 0), 0.5)
    INTO win_rate_global
    FROM public.tasting_results
    WHERE ((winner_bottle_id = bottle_pairs.winner_bottle_id AND loser_bottle_id = bottle_pairs.loser_bottle_id) OR (winner_bottle_id = bottle_pairs.loser_bottle_id AND loser_bottle_id = bottle_pairs.winner_bottle_id))
      AND tasting_session_id <> session_id
      AND created_at >= (SELECT MIN(created_at) FROM (SELECT created_at FROM public.tasting_results ORDER BY created_at DESC LIMIT 100) sub);

    expected_winner_user := 1 / (1 + POW(10, (loser_elo_user - winner_elo_user) / 400));
    expected_winner_global := 1 / (1 + POW(10, (loser_elo_global - winner_elo_global) / 400));

    swing_user := ROUND(k_factor_user * (1 - expected_winner_user) * win_rate_user, 2);
    swing_global := ROUND(k_factor_global * (1 - expected_winner_global) * win_rate_global, 2);

    INSERT INTO public.user_bottles (user_id, bottle_id, elo)
    VALUES (session_user_id, bottle_pairs.winner_bottle_id, winner_elo_user + swing_user)
    ON CONFLICT (user_id, bottle_id) DO UPDATE SET elo = EXCLUDED.elo;

    INSERT INTO public.user_bottles (user_id, bottle_id, elo)
    VALUES (session_user_id, bottle_pairs.loser_bottle_id, loser_elo_user - swing_user)
    ON CONFLICT (user_id, bottle_id) DO UPDATE SET elo = EXCLUDED.elo;

    UPDATE public.bottles SET elo_global = winner_elo_global + swing_global WHERE id = bottle_pairs.winner_bottle_id;
    UPDATE public.bottles SET elo_global = loser_elo_global - swing_global WHERE id = bottle_pairs.loser_bottle_id;
  END LOOP;

  RETURN NULL;
END;
$function$;

-- 2. Restore the original tasting-table RLS policies (auth.uid() = user_id).
DROP POLICY IF EXISTS "Users can manage their own tasting sessions" ON public.tasting_sessions;
CREATE POLICY "Users can manage their own tasting sessions"
  ON public.tasting_sessions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own tasting details" ON public.tasting_details;
CREATE POLICY "Users can manage their own tasting details"
  ON public.tasting_details
  USING (auth.uid() = (SELECT tasting_sessions.user_id FROM tasting_sessions WHERE tasting_sessions.id = tasting_details.tasting_session_id))
  WITH CHECK (auth.uid() = (SELECT tasting_sessions.user_id FROM tasting_sessions WHERE tasting_sessions.id = tasting_details.tasting_session_id));

DROP POLICY IF EXISTS "Users can manage their own tasting results" ON public.tasting_results;
CREATE POLICY "Users can manage their own tasting results"
  ON public.tasting_results
  USING (auth.uid() = (SELECT tasting_sessions.user_id FROM tasting_sessions WHERE tasting_sessions.id = tasting_results.tasting_session_id))
  WITH CHECK (auth.uid() = (SELECT tasting_sessions.user_id FROM tasting_sessions WHERE tasting_sessions.id = tasting_results.tasting_session_id));

-- 3. Restore the original user_bottles primary key (user_id, bottle_id).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname='user_bottles_pkey' AND conrelid='public.user_bottles'::regclass AND contype='p') THEN
    ALTER TABLE public.user_bottles DROP CONSTRAINT user_bottles_pkey;
  END IF;
  ALTER TABLE public.user_bottles ADD CONSTRAINT user_bottles_pkey PRIMARY KEY (user_id, bottle_id);
END $$;

COMMIT;

-- Optional hard cleanup of the additive columns (leave commented unless truly rolling all the way back):
-- ALTER TABLE public.user_bottles DROP COLUMN IF EXISTS id;
-- ALTER TABLE public.tasting_results DROP COLUMN IF EXISTS winner_variant_id, DROP COLUMN IF EXISTS loser_variant_id;
-- ALTER TABLE public.tasting_details DROP COLUMN IF EXISTS variant_id;
-- ALTER TABLE public.tasting_sessions DROP COLUMN IF EXISTS variant_ids, DROP COLUMN IF EXISTS mode;
