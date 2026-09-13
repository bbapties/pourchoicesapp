-- ============================================================================
-- blended_star: unscored = 2.5 stars, not null        (Brian, 2026-09-13)
--
-- "If it has no interactions and was never scored then it should default to
-- 2.5 stars and a 1500 elo." The 2026-09-07 views left blended_star NULL for a
-- bottle with no ratings and no blind tastings, so it sorted to the very bottom
-- while the card showed nothing (or, before today, an invented number). Now the
-- star is the Elo-star of its own (untouched, 1500) Elo -- 2.5 on the fixed
-- scale -- and it sorts in among the other 2.5s. Same columns, one expression
-- changed, security_invoker restated. Rollback: sql/blended-star-default-2-5-snapshot.sql
-- ============================================================================
BEGIN;

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
    ) AS blended_star
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
    ) AS blended_star
   FROM bottle_variants bv
     JOIN bottles b ON b.id = bv.bottles_id;

COMMIT;
