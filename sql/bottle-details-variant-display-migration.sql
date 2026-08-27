-- Fix: all_bottle_details showed stale per-variant fields in search.
-- The suggest-edit system routes proof/age/notes/images to the DEFAULT VARIANT,
-- but this view sourced attr_* from the bottles table, so approved variant edits
-- never reached search (the detail card reads the variant and looked correct).
-- Now the per-variant display fields resolve from the default variant, falling
-- back to the bottle column (covers no-variant bottles). Identity fields
-- (name/distillery/category/style/volume/barcode/extras) stay on bottles.
-- Additive/idempotent: CREATE OR REPLACE, same column names/order/types.
-- Rollback: sql/bottle-details-variant-display-snapshot.sql
CREATE OR REPLACE VIEW public.all_bottle_details AS
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
    COALESCE(array_agg(bv.created_by ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::uuid[]) AS attr_variant_created_by
   FROM bottles b
     LEFT JOIN bottle_variants bv ON bv.bottles_id = b.id
  GROUP BY b.id;
