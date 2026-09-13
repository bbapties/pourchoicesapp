-- ============================================================================
-- elo_star(): a FIXED scale   (Brian, 2026-09-13)
--
-- The star was 0-5 across the global min..max Elo of every bottle, so it moved
-- whenever anyone tasted anything: Brian's Blanton's went 1.85 -> 2.87 in one
-- evening without him touching it, and his own #1 finish read as "middle of
-- the pack". Stars are now a fixed conversion of Elo, the same for a personal
-- Elo and a global one:
--
--     2.5 stars = 1500, one star per 60 Elo, clamped to 0..5
--     4 stars = 1560   1 star = 1410   5 stars = 1650
--
-- Immutable now: nothing but the bottle's own Elo can change its star. The
-- client mirror is eloToStar() in src/lib/scores.ts.
-- Rollback: sql/elo-star-fixed-scale-snapshot.sql
-- ============================================================================
CREATE OR REPLACE FUNCTION public.elo_star(p_elo numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
           WHEN p_elo IS NULL THEN NULL
           ELSE ROUND(LEAST(5, GREATEST(0, 2.5 + (p_elo - 1500) / 60.0)), 2)
         END;
$fn$;

COMMENT ON FUNCTION public.elo_star(numeric) IS
  'Fixed Elo -> star conversion: 2.5 at 1500, one star per 60 Elo, clamped 0-5. Same scale for personal and global Elo. Mirrors eloToStar() in src/lib/scores.ts.';
