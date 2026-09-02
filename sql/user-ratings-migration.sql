-- Standalone user ratings (BOTTLE_ACTIONS.md Evaluation bucket; resolves B-40). Additive.
-- Safe to re-run. Rollback: sql/user-ratings-snapshot.sql
--
-- A manual star "guess" is an EVALUATION, not a collection/consumption fact, so it no longer
-- lives on user_bottles (which forced a fake times_had=0 placeholder row for a bottle you
-- neither own nor tasted). It now has its own home: one row per (user, variant), independent
-- of ownership/tasting. RLS mirrors wishlists (insert/select/update/delete own; admins read).
-- The community-guess average RPC is repointed here.
--
-- Backfill copies every existing user_bottles.rating_stars into user_ratings. Purely additive:
-- the old column is left in place (deprecated, no longer read/written) and any orphaned
-- rating-only user_bottles rows are left untouched -- that cleanup is a separate, gated pass.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_ratings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bottle_id uuid NOT NULL REFERENCES public.bottles(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.bottle_variants(id) ON DELETE CASCADE,
  stars numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_ratings_user_variant_key UNIQUE (user_id, variant_id)
);

CREATE INDEX IF NOT EXISTS user_ratings_user_idx ON public.user_ratings (user_id);
CREATE INDEX IF NOT EXISTS user_ratings_variant_idx ON public.user_ratings (variant_id);

ALTER TABLE public.user_ratings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ratings TO authenticated;

DROP POLICY IF EXISTS user_ratings_select ON public.user_ratings;
CREATE POLICY user_ratings_select ON public.user_ratings
  FOR SELECT TO authenticated
  USING (is_admin() OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

DROP POLICY IF EXISTS user_ratings_insert_own ON public.user_ratings;
CREATE POLICY user_ratings_insert_own ON public.user_ratings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

DROP POLICY IF EXISTS user_ratings_update_own ON public.user_ratings;
CREATE POLICY user_ratings_update_own ON public.user_ratings
  FOR UPDATE TO authenticated
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id))
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

DROP POLICY IF EXISTS user_ratings_delete_own ON public.user_ratings;
CREATE POLICY user_ratings_delete_own ON public.user_ratings
  FOR DELETE TO authenticated
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

-- Backfill from the old home. Additive: skip conflicts, leave user_bottles untouched.
INSERT INTO public.user_ratings (user_id, bottle_id, variant_id, stars, created_at, updated_at)
  SELECT ub.user_id, ub.bottle_id, ub.variant_id, ub.rating_stars,
         COALESCE(ub.created_at, now()), COALESCE(ub.updated_at, ub.created_at, now())
  FROM public.user_bottles ub
  WHERE ub.rating_stars IS NOT NULL AND ub.variant_id IS NOT NULL
  ON CONFLICT (user_id, variant_id) DO NOTHING;

-- Repoint the community-guess average (A.2/D.2) to read the new table. SECURITY DEFINER so it
-- can aggregate across users despite RLS; returns aggregates only, no per-user data.
CREATE OR REPLACE FUNCTION public.variant_guess_avg(variant_ids uuid[])
RETURNS TABLE (variant_id uuid, avg_stars numeric, n integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.variant_id, AVG(ur.stars)::numeric, COUNT(*)::integer
  FROM public.user_ratings ur
  WHERE ur.variant_id = ANY(variant_ids)
    AND ur.stars IS NOT NULL
  GROUP BY ur.variant_id;
$$;

GRANT EXECUTE ON FUNCTION public.variant_guess_avg(uuid[]) TO authenticated;

COMMIT;
