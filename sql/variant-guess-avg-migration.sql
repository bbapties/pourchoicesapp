-- Community-guess rating fallback (BOTTLE_ACTIONS.md A.2/D.2). Additive.
-- Rollback: sql/variant-guess-avg-snapshot.sql
--
-- user_bottles RLS hides other users' rows, so a client cannot average everyone's guesses.
-- This SECURITY DEFINER function returns ONLY aggregates (per-variant average guess star plus a
-- count); no per-user data is exposed. Used to show a community star for a variant that has no
-- blind-tasting Elo yet, until the first real tasting moves it.

BEGIN;

CREATE OR REPLACE FUNCTION public.variant_guess_avg(variant_ids uuid[])
RETURNS TABLE (variant_id uuid, avg_stars numeric, n integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.variant_id, AVG(ub.rating_stars)::numeric, COUNT(*)::integer
  FROM public.user_bottles ub
  WHERE ub.variant_id = ANY(variant_ids)
    AND ub.rating_stars IS NOT NULL
  GROUP BY ub.variant_id;
$$;

GRANT EXECUTE ON FUNCTION public.variant_guess_avg(uuid[]) TO authenticated;

COMMIT;
