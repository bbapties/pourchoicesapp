-- Social reads (#109 / #110): what a VIEWER may see of another person. Additive. Safe to re-run.
-- Rollback: sql/social-reads-snapshot.sql
--
-- Three things, all reads:
--   1. Backfill activities.session_id for the 11 `tasted` rows that predate the column. Each one
--      matches exactly one tasting_sessions row (same user, same winner bottle, within 2 min) -
--      verified 2026-09-12 before this was written. UPDATE is limited to NULLs and to unique
--      matches, so re-running is a no-op.
--   2. tasting_podium(session_id): the ranked glasses of ANY session, for the blind-tasting card.
--      tasting_details / tasting_sessions stay owner-only for writes and direct reads; this
--      SECURITY DEFINER function is the one window, and it exposes exactly what the feed card
--      already promises - rank, bottle, glass letter, notes - nothing about the person beyond
--      what their own `tasted` post said. is_blind sessions only; seeded/test accounts included
--      because a post from them never reaches the feed anyway (fetchActivityFeed filters).
--   3. Read policies for the user page: any signed-in user may SELECT another user's
--      user_bottles (their bar, Top 3, Tried), user_ratings (the Manual-rated marker) and
--      wishlists. Writes are untouched - still own rows only. This is the design Brian settled on
--      2026-09-12: pages are ungated; what each relationship level sees is a later decision.

BEGIN;

-- ---------------------------------------------------------------- 1. backfill tasted -> session
UPDATE public.activities a
SET session_id = m.session_id
FROM (
  SELECT a2.id AS activity_id, (array_agg(s.id))[1] AS session_id
  FROM public.activities a2
  JOIN public.tasting_sessions s
    ON s.user_id = a2.user_id
   AND s.bottle_ids[1] = a2.bottle_id
   AND abs(extract(epoch FROM (s.created_at - a2.created_at))) < 120
  WHERE a2.action = 'tasted' AND a2.session_id IS NULL
  GROUP BY a2.id
  HAVING count(*) = 1
) m
WHERE a.id = m.activity_id;

-- Headline count for those cards too, so "Blind-tasted N bottles" reads the same as new posts.
UPDATE public.activities a
SET details = coalesce(a.details, '{}'::jsonb) || jsonb_build_object('count', array_length(s.bottle_ids, 1))
FROM public.tasting_sessions s
WHERE a.action = 'tasted' AND a.session_id = s.id AND (a.details IS NULL OR a.details->>'count' IS NULL);

-- ---------------------------------------------------------------- 2. the podium
CREATE OR REPLACE FUNCTION public.tasting_podium(p_session_id uuid)
RETURNS TABLE (
  rank integer,
  bottle_id uuid,
  variant_id uuid,
  name text,
  distillery text,
  image_url text,
  glass_letter text,
  notes jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.rank,
    d.bottle_id,
    d.variant_id,
    b.name,
    b.distillery,
    coalesce(v.frontimage_url, dv.frontimage_url) AS image_url,
    d.glass_letter,
    d.notes
  FROM public.tasting_details d
  JOIN public.tasting_sessions s ON s.id = d.tasting_session_id
  JOIN public.bottles b ON b.id = d.bottle_id
  LEFT JOIN public.bottle_variants v ON v.id = d.variant_id
  LEFT JOIN LATERAL (
    SELECT frontimage_url FROM public.bottle_variants
    WHERE bottles_id = d.bottle_id AND is_default = true
    LIMIT 1
  ) dv ON true
  WHERE d.tasting_session_id = p_session_id
    AND coalesce(s.is_blind, true)
  ORDER BY d.rank NULLS LAST, d.created_at;
$$;
REVOKE ALL ON FUNCTION public.tasting_podium(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.tasting_podium(uuid) TO authenticated;

-- ---------------------------------------------------------------- 3. user-page reads
DROP POLICY IF EXISTS user_bottles_select_authenticated ON public.user_bottles;
CREATE POLICY user_bottles_select_authenticated ON public.user_bottles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_ratings_select_authenticated ON public.user_ratings;
CREATE POLICY user_ratings_select_authenticated ON public.user_ratings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS wishlists_select_authenticated ON public.wishlists;
CREATE POLICY wishlists_select_authenticated ON public.wishlists
  FOR SELECT TO authenticated USING (true);

COMMIT;
