-- Rollback for sql/badge-releases-migration.sql. Restores user_level to "all badges count".
-- Loses: who each badge was released to, and who has seen which reveal. Nothing else.
BEGIN;

CREATE OR REPLACE FUNCTION public.user_level(p_user uuid)
RETURNS TABLE (points integer, title text, next_title text, next_points integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (SELECT coalesce(sum(tier), 0)::integer AS points FROM public.user_badges WHERE user_id = p_user),
       cur AS (SELECT b.title, b.sort FROM public.level_bands b, p WHERE b.min_points <= p.points ORDER BY b.min_points DESC LIMIT 1),
       nxt AS (SELECT b.title, b.min_points FROM public.level_bands b, cur WHERE b.sort = cur.sort + 1)
  SELECT p.points, cur.title, nxt.title, nxt.min_points FROM p LEFT JOIN cur ON true LEFT JOIN nxt ON true;
$$;

DROP FUNCTION IF EXISTS public.reveal_badges(text[]);
DROP FUNCTION IF EXISTS public.released_badges(uuid);
ALTER TABLE public.user_badges DROP COLUMN IF EXISTS revealed_tier;
DROP TABLE IF EXISTS public.badge_releases;

COMMIT;
