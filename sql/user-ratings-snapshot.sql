-- Rollback for sql/user-ratings-migration.sql (B-40 / user_ratings).
-- Drops the new table and restores variant_guess_avg to read user_bottles.rating_stars.
-- user_bottles is untouched by the migration, so its rating_stars values are still intact.

BEGIN;

-- Restore the original RPC (reads user_bottles.rating_stars).
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

DROP TABLE IF EXISTS public.user_ratings CASCADE;

COMMIT;
