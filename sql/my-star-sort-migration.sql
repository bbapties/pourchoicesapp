-- ============================================================================
-- My Ranks is a SORT, and "ranked" means blind-tasted        (Brian, 2026-09-13)
--
-- Three things, one migration, because they share a definition:
--
-- 1. "RANKED" = blind_tasted_at IS NOT NULL, never `elo <> 1500`. Bib & Tucker
--    finished 2nd of 3 in Brian's blind and its personal Elo netted out at
--    exactly 1500.00, so every `elo <> 1500` check in the app called it
--    "never ranked" and it vanished from My Ranks. The number is not the
--    signal; the tasting is.
--
-- 2. my_variant_scores is SCOPED TO THE CALLER. It was written (#80) when RLS
--    hid other people's user_bottles rows, so "security_invoker" alone scoped
--    it. The social layer (sql/social-reads-migration.sql) opened cross-user
--    SELECT on user_bottles and user_ratings, and from that moment this view
--    quietly returned EVERYONE's rows -- My Bar keys them by variant_id and the
--    last row wins, so "your star" could have been someone else's. Latent, found
--    2026-09-13 while chasing (1).
--
-- 3. all_bottle_details / all_variant_details gain `my_star`: the caller's own
--    star for that row, or NULL. Search's "My Ranks" used to NARROW the browse
--    to ranked bottles because a client-side sort could only reorder the loaded
--    page. With the key in the view the ORDER BY runs server-side across the
--    whole catalog -- ranked bottles first, best first, then everything else --
--    so My Ranks becomes the sort it says it is. Same rule as blended_star.
--
-- your_star / my_star: the personal Elo on the fixed star scale once the bottle
-- has been blind-tasted, else the manual star, else NULL. Additive: columns
-- appended, security_invoker restated. Rollback: sql/my-star-sort-snapshot.sql
-- ============================================================================
BEGIN;

-- The caller's public.users.id. Inlined as a subquery below (a view cannot take
-- parameters); STABLE per statement so the planner evaluates it once.
CREATE OR REPLACE FUNCTION public.current_public_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $fn$
  SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1;
$fn$;

CREATE OR REPLACE VIEW public.my_variant_scores
WITH (security_invoker = true) AS
SELECT
  ub.variant_id,
  ub.bottle_id,
  ub.elo AS personal_elo,
  CASE WHEN ub.blind_tasted_at IS NOT NULL THEN public.elo_star(COALESCE(ub.elo, 1500)) END AS personal_star,
  ur.stars AS manual_star,
  COALESCE(
    CASE WHEN ub.blind_tasted_at IS NOT NULL THEN public.elo_star(COALESCE(ub.elo, 1500)) END,
    ur.stars
  ) AS your_star,
  ub.tasted_at IS NOT NULL AS tasted
FROM public.user_bottles ub
LEFT JOIN public.user_ratings ur
  ON ur.user_id = ub.user_id AND ur.variant_id = ub.variant_id
WHERE ub.variant_id IS NOT NULL
  AND ub.user_id = public.current_public_user_id();

CREATE OR REPLACE VIEW public.all_bottle_details
WITH (security_invoker = true) AS
 SELECT b.id AS bottle_id,
    b.name AS bottle_name,
    b.distillery AS bottle_distillery,
    b.category AS bottle_category,
    b.style AS bottle_style,
    b.barcode AS bottle_barcode,
    b.elo_global AS bottle_elo_global,
    b.verified AS bottle_verified,
    b.created_by AS bottle_created_by,
    COALESCE((array_agg(bv.proof ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1], b.proof) AS attr_proof,
    COALESCE((array_agg(bv.age ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1], b.age) AS attr_age,
    b.volume AS attr_volume,
    COALESCE((array_agg(bv.frontimage_url ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1], b.frontimage_url) AS attr_frontimage_url,
    COALESCE((array_agg(bv.backimage_url ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1], b.backimage_url) AS attr_backimage_url,
    COALESCE((array_agg(bv.nose ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1], b.nose) AS attr_nose,
    COALESCE((array_agg(bv.palate ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1], b.palate) AS attr_palate,
    COALESCE((array_agg(bv.finish ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1], b.finish) AS attr_finish,
    b.extras AS attr_extras,
    COALESCE(array_agg(bv.id ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::uuid[]) AS attr_variant_ids,
    COALESCE(array_agg(bv.batch ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::text[]) AS attr_batch,
    COALESCE(array_agg(bv.release_year ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::integer[]) AS attr_release_year,
    COALESCE(array_agg(bv.store_pick_name ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::text[]) AS attr_store_pick_name,
    max(bv.elo_global) FILTER (WHERE bv.is_default) AS default_variant_elo,
    (array_agg(bv.id ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1] AS default_variant_id,
    count(bv.id) AS variant_count,
    COALESCE(array_agg(bv.created_by ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::uuid[]) AS attr_variant_created_by,
    -- The number the card actually displays, so the list can be ordered by it. A bottle nobody
    -- has scored is not a null: it is 2.5 stars at its untouched 1500 Elo (Brian, 2026-09-13),
    -- and it sorts in among the other 2.5s rather than falling to the bottom.
    COALESCE(
      (SELECT bs.star FROM public.bottle_scores bs WHERE bs.bottle_id = b.id),
      public.elo_star(COALESCE(max(bv.elo_global) FILTER (WHERE bv.is_default), b.elo_global, 1500))
    ) AS blended_star,
    -- The CALLER's own star for this bottle (best across its versions), or NULL if they have
    -- never blind-tasted or rated it. My Ranks orders by this, then blended_star.
    COALESCE(
      (SELECT max(public.elo_star(COALESCE(ub.elo, 1500)))
         FROM public.user_bottles ub
        WHERE ub.bottle_id = b.id AND ub.user_id = public.current_public_user_id()
          AND ub.blind_tasted_at IS NOT NULL),
      (SELECT max(ur.stars)
         FROM public.user_ratings ur
        WHERE ur.bottle_id = b.id AND ur.user_id = public.current_public_user_id())
    ) AS my_star
   FROM bottles b
     LEFT JOIN bottle_variants bv ON bv.bottles_id = b.id
  GROUP BY b.id;

CREATE OR REPLACE VIEW public.all_variant_details
WITH (security_invoker = true) AS
 SELECT bv.id AS variant_id,
    bv.bottles_id AS bottle_id,
    b.name AS bottle_name,
    b.distillery AS bottle_distillery,
    b.category AS bottle_category,
    b.style AS bottle_style,
    b.barcode AS bottle_barcode,
    bv.is_default AS variant_is_default,
    bv.elo_global AS variant_elo_global,
    bv.verified AS variant_verified,
    bv.frontimage_url AS attr_frontimage_url,
    bv.backimage_url AS attr_backimage_url,
    bv.age AS attr_age,
    bv.proof AS attr_proof,
    bv.batch AS attr_batch,
    bv.release_year AS attr_release_year,
    bv.store_pick_name AS attr_store_pick_name,
    bv.nose AS attr_nose,
    bv.palate AS attr_palate,
    bv.finish AS attr_finish,
    bv.notes AS attr_notes,
    bv.created_at AS variant_created_at,
    bv.created_by AS variant_created_by,
    -- Show variants judges each version on its own evidence, so it sorts on its
    -- own score -- not the parent's. Unscored = 2.5 at 1500, same as the bottle view.
    COALESCE(
      (SELECT vs.star FROM public.variant_scores vs WHERE vs.variant_id = bv.id),
      public.elo_star(COALESCE(bv.elo_global, 1500))
    ) AS blended_star,
    -- The caller's own star for THIS version, or NULL.
    COALESCE(
      (SELECT public.elo_star(COALESCE(ub.elo, 1500))
         FROM public.user_bottles ub
        WHERE ub.variant_id = bv.id AND ub.user_id = public.current_public_user_id()
          AND ub.blind_tasted_at IS NOT NULL
        LIMIT 1),
      (SELECT max(ur.stars)
         FROM public.user_ratings ur
        WHERE ur.variant_id = bv.id AND ur.user_id = public.current_public_user_id())
    ) AS my_star
   FROM bottle_variants bv
     JOIN bottles b ON b.id = bv.bottles_id;

COMMIT;
