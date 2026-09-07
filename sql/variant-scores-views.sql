-- ============================================================================
-- The variant model, part 4: what a star actually says  -- board #72, design #70
--                                                          (2026-09-07)
--
-- Two views. `variant_scores` is one row per variant; `bottle_scores` is one row
-- per bottle, rolled up from its variants. Nothing here computes Elo -- it reads
-- the `elo_global` the trigger already wrote. There is one implementation of the
-- Elo maths, ever (#3), and a view that re-derived it would be the second.
--
-- THE RULES, decided with Brian on 2026-09-07 and confirmed against his own
-- worked numbers:
--
-- 1. A VARIANT'S STAR blends its Elo-derived star with the manual ratings, both
--    weighted by how many people are behind them. Convert the Elo to a star
--    first, give it the weight of its blind tastings, then take a plain
--    count-weighted mean with the manual ratings. His four examples:
--
--      10 blind -> 4 stars, 1 manual of 5   = 4.09
--       5 blind -> 4 stars, 5 manual of 5   = 4.5
--       4 blind -> 4 stars, 96 manual of 5  = 4.96
--      96 blind -> 4 stars, 4 manual of 5   = 4.04
--
--    all of which are (blind_n * elo_star + SUM(manual)) / (blind_n + manual_n).
--
-- 2. THE WEIGHT UNIT IS A DISTINCT BLIND TASTING, not a pairwise match. One
--    five-bottle sitting produces four matches for a single bottle, and counting
--    matches would make one night look like four nights of evidence.
--
-- 3. A PARENT IS WEIGHTED BY EVIDENCE, NEVER A STRAIGHT AVERAGE. Brian's own
--    example is why: 10 tastings at 1586 and 2 at 1650 average to 1618, which
--    sits nearer the release almost nobody has tasted. So the parent applies the
--    SAME formula over the pooled evidence of all its children -- one rule, not
--    two, and a new release's first tasting nudges the parent instead of
--    yanking it. On those numbers it lands near 1597 rather than 1618.
--
-- 4. NOBODY IS COUNTED TWICE. B-47 deletes a user's manual guess the moment they
--    blind-taste that bottle, so a person is on exactly one side of the blend.
--    That behaviour is load-bearing now, not merely tidy -- see ratings.ts.
--
-- THE STAR SCALE. Elo is never shown as a number; it is scaled 0-5 across the
-- range of variants that have a REAL global Elo (moved off the 1500 baseline).
-- Store picks are excluded from the range, exactly as the client already does,
-- because a private clone must not stretch the scale everyone else is read on.
-- Ghost parents are excluded too -- they are rollups, and letting a derived
-- number back into the range it was derived from would compress it.
--
-- A variant with no blind tastings falls back to a pure manual average, and one
-- with neither scores NULL -- "no opinion yet", which the app already renders as
-- a dash.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- The 0-5 scale for a global Elo. STABLE, not IMMUTABLE: the range moves as
-- bottles are tasted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.elo_star(p_elo numeric)
RETURNS numeric
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE
           WHEN p_elo IS NULL THEN NULL
           WHEN r.hi IS NULL OR r.lo IS NULL OR r.hi = r.lo THEN NULL
           ELSE ROUND(LEAST(5, GREATEST(0, (p_elo - r.lo) / (r.hi - r.lo) * 5)), 2)
         END
    FROM (
      SELECT MAX(elo_global) AS hi, MIN(elo_global) AS lo
        FROM public.bottle_variants
       WHERE store_pick_name IS NULL
         AND elo_global IS NOT NULL
         AND elo_global <> 1500
    ) r;
$fn$;

COMMENT ON FUNCTION public.elo_star(numeric) IS
  'Scales a global Elo to 0-5 across the range of non-store-pick variants with a real (non-1500) score. Mirrors the client scaling in BottleDetailView so both agree (#70).';

-- ---------------------------------------------------------------------------
-- One row per variant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.variant_scores AS
WITH blind AS (
  -- Distinct SESSIONS, not matches. See rule 2.
  SELECT v.variant_id, COUNT(DISTINCT r.tasting_session_id) AS blind_tastings
    FROM public.tasting_results r
    CROSS JOIN LATERAL (VALUES (r.winner_variant_id), (r.loser_variant_id)) AS v(variant_id)
   WHERE v.variant_id IS NOT NULL
   GROUP BY v.variant_id
),
manual AS (
  SELECT variant_id, COUNT(*) AS manual_count, SUM(stars) AS manual_sum
    FROM public.user_ratings
   WHERE variant_id IS NOT NULL AND stars IS NOT NULL
   GROUP BY variant_id
)
SELECT
  bv.id                                   AS variant_id,
  bv.bottles_id                           AS bottle_id,
  bv.is_catchall,
  bv.store_pick_name IS NOT NULL          AS is_store_pick,
  bv.elo_global,
  COALESCE(b.blind_tastings, 0)::int      AS blind_tastings,
  COALESCE(m.manual_count, 0)::int        AS manual_count,
  -- A real Elo means someone actually moved it; 1500 is the untouched baseline
  -- and carries no evidence, so it must not enter the blend with weight.
  CASE WHEN bv.elo_global IS NOT NULL AND bv.elo_global <> 1500
       THEN public.elo_star(bv.elo_global) END AS elo_star,
  CASE
    WHEN COALESCE(b.blind_tastings, 0) > 0
     AND bv.elo_global IS NOT NULL AND bv.elo_global <> 1500
     AND public.elo_star(bv.elo_global) IS NOT NULL
    THEN ROUND(
           (b.blind_tastings * public.elo_star(bv.elo_global) + COALESCE(m.manual_sum, 0))
           / (b.blind_tastings + COALESCE(m.manual_count, 0)), 2)
    WHEN COALESCE(m.manual_count, 0) > 0
    THEN ROUND(m.manual_sum / m.manual_count, 2)
    ELSE NULL
  END                                     AS star
FROM public.bottle_variants bv
LEFT JOIN blind  b ON b.variant_id = bv.id
LEFT JOIN manual m ON m.variant_id = bv.id;

COMMENT ON VIEW public.variant_scores IS
  'One row per variant: its blind-tasting count, manual-rating count, Elo-derived star and the blended 0-5 star shown in the app (#70/#72).';

-- ---------------------------------------------------------------------------
-- One row per bottle: the same formula over the pooled evidence of its
-- children, which is what makes the parent weighted rather than an average.
--
-- Store picks are excluded. They are private to their creator and their tastings
-- have ALREADY scored the variant they are a pick of (elo_global_target), so
-- counting them here would count the same night twice and leak a private clone
-- into a public number.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.bottle_scores AS
SELECT
  vs.bottle_id,
  SUM(vs.blind_tastings)::int                     AS blind_tastings,
  SUM(vs.manual_count)::int                       AS manual_count,
  COUNT(*) FILTER (WHERE NOT vs.is_store_pick)::int AS versions,
  CASE
    WHEN SUM(
           CASE WHEN vs.star IS NOT NULL
                THEN vs.blind_tastings + vs.manual_count ELSE 0 END
         ) > 0
    THEN ROUND(
           SUM(CASE WHEN vs.star IS NOT NULL
                    THEN vs.star * (vs.blind_tastings + vs.manual_count) ELSE 0 END)
           / SUM(CASE WHEN vs.star IS NOT NULL
                      THEN vs.blind_tastings + vs.manual_count ELSE 0 END), 2)
    ELSE NULL
  END                                             AS star
FROM public.variant_scores vs
WHERE NOT vs.is_store_pick
GROUP BY vs.bottle_id;

COMMENT ON VIEW public.bottle_scores IS
  'One row per bottle: the rollup shown in search, weighted by evidence across its versions, never a straight average (#70/#72). Store picks excluded -- private, and already counted through the variant they are a pick of.';

COMMIT;
