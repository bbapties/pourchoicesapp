-- Phase 7.2 SNAPSHOT / ROLLBACK reference (captured before the roll-up change)
-- Views hold no data, so this is a pure definition backup. To roll back 7.2:
--   1. Run the CREATE OR REPLACE VIEW below to restore all_bottle_details.
--   2. DROP VIEW IF EXISTS all_variant_details;   (it did not exist before 7.2)

-- all_bottle_details, pre-7.2: one row per SKU, scored by the bottle-level elo.
CREATE OR REPLACE VIEW all_bottle_details AS
 SELECT b.id AS bottle_id,
    b.name AS bottle_name,
    b.distillery AS bottle_distillery,
    b.category AS bottle_category,
    b.style AS bottle_style,
    b.barcode AS bottle_barcode,
    b.elo_global AS bottle_elo_global,
    b.verified AS bottle_verified,
    b.created_by AS bottle_created_by,
    b.proof AS attr_proof,
    b.age AS attr_age,
    b.volume AS attr_volume,
    b.frontimage_url AS attr_frontimage_url,
    b.backimage_url AS attr_backimage_url,
    b.nose AS attr_nose,
    b.palate AS attr_palate,
    b.finish AS attr_finish,
    b.extras AS attr_extras,
    COALESCE(array_agg(bv.id ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::uuid[]) AS attr_variant_ids,
    COALESCE(array_agg(bv.batch ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::text[]) AS attr_batch,
    COALESCE(array_agg(bv.release_year ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::integer[]) AS attr_release_year,
    COALESCE(array_agg(bv.store_pick_name ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::text[]) AS attr_store_pick_name
   FROM bottles b
     LEFT JOIN bottle_variants bv ON bv.bottles_id = b.id
  GROUP BY b.id;
