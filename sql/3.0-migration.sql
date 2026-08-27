-- =====================================================================
-- 3.0 -- Variant-aware Blind-Tasting Elo engine + data model
-- Phase 3 (Blind Tastings) foundation.
--
-- Additive + idempotent where possible. Wrapped in BEGIN/COMMIT.
-- Rollback: sql/3.0-snapshot.sql (restores the old function, RLS, and
-- user_bottles PK). The one-time data rebaseline lives in a SEPARATE file
-- (sql/3.0-reset.sql) so THIS migration is safe to re-run.
--
-- Run: node scripts/_psql.mjs "$(cat sql/3.0-migration.sql)"   (or paste)
--
-- Locked design (discovery with Brian, 2026-08):
--   * Elo is VARIANT-level. Global excludes store picks; personal includes them.
--   * Store-pick GLOBAL points roll up to the parent SKU's DEFAULT variant.
--   * Personal Elo is per (user, variant) in user_bottles (surrogate id PK).
--   * Tasted-but-not-owned rows are inserted currently_owned = false
--     (no more silent add-to-bar).
--   * K-factor FLAT = 32 (upset credit carried by the expected-score term;
--     one-off flukes dampened by a per-pair last-N head-to-head win-rate).
--   * Win-rate window: personal last 10 / global last 20 head-to-heads of
--     that specific pair (either direction), excluding the current session.
--   * RLS on the tasting tables resolves auth.uid() -> public.users.id.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Additive variant columns on the tasting tables
-- ---------------------------------------------------------------------
ALTER TABLE public.tasting_results
  ADD COLUMN IF NOT EXISTS winner_variant_id uuid REFERENCES public.bottle_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loser_variant_id  uuid REFERENCES public.bottle_variants(id) ON DELETE SET NULL;

ALTER TABLE public.tasting_details
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.bottle_variants(id) ON DELETE SET NULL;

-- Record the specific variants chosen for the flight (parallel to bottle_ids).
ALTER TABLE public.tasting_sessions
  ADD COLUMN IF NOT EXISTS variant_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS mode text;   -- 'helper' (Mode 1) | 'self' (Mode 2)

-- ---------------------------------------------------------------------
-- 2. Re-key user_bottles to per-variant
--    Surrogate id PK; the existing partial unique indexes
--    (user_bottles_no_variant, user_bottles_with_variant) keep enforcing
--    one NULL-variant row and one row per (user, bottle, variant).
--    No FKs point at user_bottles, so this is safe.
-- ---------------------------------------------------------------------
ALTER TABLE public.user_bottles
  ADD COLUMN IF NOT EXISTS id uuid;

UPDATE public.user_bottles SET id = uuid_generate_v4() WHERE id IS NULL;

ALTER TABLE public.user_bottles
  ALTER COLUMN id SET DEFAULT uuid_generate_v4(),
  ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  -- Drop the old composite PK if it is still (user_id, bottle_id); make id the PK.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_bottles_pkey' AND conrelid = 'public.user_bottles'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, bottle_id)'
  ) THEN
    ALTER TABLE public.user_bottles DROP CONSTRAINT user_bottles_pkey;
    ALTER TABLE public.user_bottles ADD CONSTRAINT user_bottles_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Backfill legacy NULL-variant ownership rows to the bottle's DEFAULT variant, so
-- every row is variant-keyed and ownership/tasting rows never collide on NULL.
-- (Idempotent: only NULL rows are touched; skips if a default-variant row already
--  exists for that user+bottle to avoid violating user_bottles_with_variant.)
UPDATE public.user_bottles ub
   SET variant_id = d.id
  FROM public.bottle_variants d
 WHERE ub.variant_id IS NULL
   AND d.bottles_id = ub.bottle_id
   AND d.is_default = true
   AND NOT EXISTS (
     SELECT 1 FROM public.user_bottles x
      WHERE x.user_id = ub.user_id AND x.bottle_id = ub.bottle_id AND x.variant_id = d.id
   );

-- ---------------------------------------------------------------------
-- 3. Extend the Elo trigger function -- variant-aware + store-pick rollup
--    (same statement-level trigger; still reads the new_results
--     transition table, so the app must insert all pairwise rows in ONE
--     INSERT statement.)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. Fix RLS on the tasting tables: resolve auth.uid() -> public.users.id
--    (the existing policies compared auth.uid() to a public id and would
--     fail every real app insert). Admin-read policies are left untouched.
--    Each participant (incl. group joiners) owns their own session row, so
--    per-user ownership is still the correct model for group tastings.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own tasting sessions" ON public.tasting_sessions;
CREATE POLICY "Users can manage their own tasting sessions"
  ON public.tasting_sessions
  USING      (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their own tasting details" ON public.tasting_details;
CREATE POLICY "Users can manage their own tasting details"
  ON public.tasting_details
  USING (EXISTS (SELECT 1 FROM public.tasting_sessions s
                  WHERE s.id = tasting_details.tasting_session_id
                    AND s.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasting_sessions s
                  WHERE s.id = tasting_details.tasting_session_id
                    AND s.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())));

DROP POLICY IF EXISTS "Users can manage their own tasting results" ON public.tasting_results;
CREATE POLICY "Users can manage their own tasting results"
  ON public.tasting_results
  USING (EXISTS (SELECT 1 FROM public.tasting_sessions s
                  WHERE s.id = tasting_results.tasting_session_id
                    AND s.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasting_sessions s
                  WHERE s.id = tasting_results.tasting_session_id
                    AND s.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())));

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run after commit)
-- ---------------------------------------------------------------------
-- New columns present:
SELECT 'tasting_results.winner_variant_id' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='tasting_results'
                  AND column_name='winner_variant_id') AS ok;
-- user_bottles PK is now the surrogate id:
SELECT 'user_bottles pk = id' AS check, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE conname='user_bottles_pkey' AND conrelid='public.user_bottles'::regclass;
-- Partial unique indexes still present:
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='user_bottles'
   AND indexname IN ('user_bottles_no_variant','user_bottles_with_variant');
-- RLS policies rewritten:
SELECT polname FROM pg_policy WHERE polrelid='public.tasting_sessions'::regclass;
