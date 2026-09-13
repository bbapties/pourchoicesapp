-- ============================================================================
-- ROLLBACK for sql/elo-star-fixed-scale-migration.sql   (2026-09-13)
--
-- Restores the previous elo_star(): 0-5 across the global min..max Elo of
-- non-store-pick variants with a real score. Views that call it need no change.
-- ============================================================================
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
