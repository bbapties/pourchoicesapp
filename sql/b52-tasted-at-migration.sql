-- ============================================================================
-- "Tasted" becomes a fact, not a guess -- board #4 / B-52   (2026-09-07)
--
-- THE BUG. removeUserBottle decided whether someone had ever tasted a bottle by
-- asking whether its personal Elo was still exactly 1500, and hard-deleted the
-- row when it was. There is no tasted flag on user_bottles, so that WAS the only
-- available signal -- but a tasting that nets to zero (equal wins and losses)
-- lands back on 1500 and reads as a mistaken add. Verified 2026-09-06: 0 rows
-- currently affected, so nothing has been lost yet.
--
-- BRIAN'S TERMINOLOGY (2026-09-07), which this migration makes expressible:
--
--   Blind Tasted   did the blind tasting flow
--   Tasted         blind tasted OR logged a pour ("have a drink")
--   Had it         all of the above, or added it to their bar at some point
--
-- And the rule that follows from it: removing a bottle from your bar clears the
-- SHELF facts (owned, finished, times had) and nothing else. Drinking it and
-- blind-tasting it are a different history that the bar button cannot reach --
-- permanent by design, because a blind tasting is part of the global Elo and
-- unpicking it would move other people's numbers.
--
-- WHY COLUMNS RATHER THAN A QUERY AT REMOVE TIME. "Have they ever drunk this"
-- is a fact about the row, and inferring it from two other tables on every
-- remove means every future feature re-derives it too -- #20 (the ranked results
-- screen) and #50 both want exactly these stamps. Timestamps rather than
-- booleans for the same reason: "when" answers strictly more questions than
-- "whether", at the same cost.
--
-- ADDITIVE ONLY. Two nullable columns and two new triggers. No existing column
-- is rewritten, nothing is dropped, and the scoring function is not touched.
-- Rollback: sql/b52-tasted-at-snapshot.sql.
-- ============================================================================

BEGIN;

ALTER TABLE public.user_bottles
  ADD COLUMN IF NOT EXISTS tasted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS blind_tasted_at timestamptz;

COMMENT ON COLUMN public.user_bottles.blind_tasted_at IS
  'Most recent blind tasting of this variant by this user. Set by trig_zz_stamp_tasted_after_session. Never cleared by removing the bottle from a bar.';
COMMENT ON COLUMN public.user_bottles.tasted_at IS
  'Most recent blind tasting OR logged pour. The test for "Tasted" -- what stops removeUserBottle hard-deleting a real history. Never cleared by removing the bottle from a bar.';

-- ---------------------------------------------------------------------------
-- Backfill from the history that already exists.
-- ---------------------------------------------------------------------------

-- Blind tastings: the session's own created_at, not now(), so the stamp means
-- what it says on rows that predate this migration.
WITH blind AS (
  SELECT s.user_id,
         v.variant_id,
         MAX(s.created_at) AS at
    FROM public.tasting_results r
    JOIN public.tasting_sessions s ON s.id = r.tasting_session_id
    CROSS JOIN LATERAL (VALUES (r.winner_variant_id), (r.loser_variant_id)) AS v(variant_id)
   WHERE v.variant_id IS NOT NULL
   GROUP BY s.user_id, v.variant_id
)
UPDATE public.user_bottles ub
   SET blind_tasted_at = blind.at,
       tasted_at       = blind.at
  FROM blind
 WHERE ub.user_id = blind.user_id
   AND ub.variant_id = blind.variant_id;

-- Pours. GREATEST over the existing value so a bottle blind-tasted in March and
-- drunk in June ends up stamped June, and one drunk before it was ever tasted
-- keeps the tasting date when that is the later of the two.
WITH pours AS (
  SELECT a.user_id,
         a.bottle_id,
         a.variant_id,
         MAX(a.created_at) AS at
    FROM public.activities a
   WHERE a.action = 'drank'
   GROUP BY a.user_id, a.bottle_id, a.variant_id
)
UPDATE public.user_bottles ub
   SET tasted_at = GREATEST(COALESCE(ub.tasted_at, pours.at), pours.at)
  FROM pours
 WHERE ub.user_id = pours.user_id
   AND ub.bottle_id = pours.bottle_id
   AND (pours.variant_id IS NULL OR ub.variant_id = pours.variant_id);

-- ---------------------------------------------------------------------------
-- Going forward: stamp on a blind tasting.
--
-- A SEPARATE trigger rather than an edit to update_elo_for_session(). That
-- function is load-bearing in three ways documented in elo-trigger-create.sql
-- (FOR EACH STATEMENT, the transition table, INSERT-only), it is the single
-- implementation of the Elo maths, and a stamp is not Elo. Keeping them apart
-- means a mistake here cannot mis-score anything.
--
-- The name sorts after trig_update_elo_after_session, and Postgres fires
-- statement triggers in name order, so scoring has already upserted the rows by
-- the time this runs. The upsert below does not depend on that -- it creates a
-- tasting-only row if one is somehow missing -- but the ordering keeps the
-- common path to a plain UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_blind_tasted_for_session()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  session_user_id uuid;
  session_at      timestamptz;
BEGIN
  SELECT s.user_id, s.created_at
    INTO session_user_id, session_at
    FROM public.tasting_sessions s
   WHERE s.id = (SELECT tasting_session_id FROM new_results LIMIT 1);

  IF session_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Tasting-only defaults match what the scoring function inserts: not owned,
  -- times_had = 0 (the column defaults to 1, so "never owned" must be explicit).
  INSERT INTO public.user_bottles
        (user_id, bottle_id, variant_id, currently_owned, times_had,
         blind_tasted_at, tasted_at, created_at, updated_at)
  SELECT session_user_id, v.bottle_id, v.variant_id, false, 0,
         session_at, session_at, now(), now()
    FROM (
      SELECT DISTINCT winner_bottle_id AS bottle_id, winner_variant_id AS variant_id FROM new_results
      UNION
      SELECT DISTINCT loser_bottle_id,               loser_variant_id               FROM new_results
    ) v
   WHERE v.variant_id IS NOT NULL
     AND v.bottle_id IS NOT NULL
  ON CONFLICT (user_id, bottle_id, variant_id) WHERE variant_id IS NOT NULL
  DO UPDATE SET
    blind_tasted_at = GREATEST(COALESCE(user_bottles.blind_tasted_at, EXCLUDED.blind_tasted_at), EXCLUDED.blind_tasted_at),
    tasted_at       = GREATEST(COALESCE(user_bottles.tasted_at,       EXCLUDED.tasted_at),       EXCLUDED.tasted_at),
    updated_at      = now();

  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trig_zz_stamp_tasted_after_session
  AFTER INSERT ON public.tasting_results
  REFERENCING NEW TABLE AS new_results
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.stamp_blind_tasted_for_session();

-- ---------------------------------------------------------------------------
-- Going forward: stamp on a pour.
--
-- In the database rather than in logActivity() because a pour is written from
-- three places already (bottle detail, the Drink tab, and the import-tasting
-- skill's generated SQL) and "a pour means Tasted" must not be true in two of
-- them and forgotten in the third.
--
-- A pour on a bottle the user has never added CREATES a tasting-only row. That
-- is the point: Tasted has to outlive the bar, so the fact needs somewhere to
-- live that removing the bottle from a shelf does not touch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_tasted_for_pour()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_variant uuid;
BEGIN
  IF NEW.action <> 'drank' OR NEW.user_id IS NULL OR NEW.bottle_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Older feed rows can carry a null variant; fall back to the SKU's default so
  -- the stamp still lands on the row the app reads.
  v_variant := NEW.variant_id;
  IF v_variant IS NULL THEN
    SELECT bv.id INTO v_variant
      FROM public.bottle_variants bv
     WHERE bv.bottles_id = NEW.bottle_id AND bv.is_default
     LIMIT 1;
  END IF;

  IF v_variant IS NULL THEN
    -- Nothing to key an insert on: stamp whatever rows exist for this bottle
    -- rather than inventing a variant.
    UPDATE public.user_bottles
       SET tasted_at  = GREATEST(COALESCE(tasted_at, NEW.created_at), NEW.created_at),
           updated_at = now()
     WHERE user_id = NEW.user_id AND bottle_id = NEW.bottle_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.user_bottles
        (user_id, bottle_id, variant_id, currently_owned, times_had, tasted_at, created_at, updated_at)
  VALUES (NEW.user_id, NEW.bottle_id, v_variant, false, 0, NEW.created_at, now(), now())
  ON CONFLICT (user_id, bottle_id, variant_id) WHERE variant_id IS NOT NULL
  DO UPDATE SET
    tasted_at  = GREATEST(COALESCE(user_bottles.tasted_at, EXCLUDED.tasted_at), EXCLUDED.tasted_at),
    updated_at = now();

  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trig_stamp_tasted_after_pour
  AFTER INSERT ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_tasted_for_pour();

COMMIT;
