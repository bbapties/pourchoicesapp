-- Phase 7.2 - search roll-up + variant leaderboard
-- Additive and idempotent (CREATE OR REPLACE). No columns dropped from all_bottle_details.
-- Rollback: sql/7.2-snapshot.sql (+ DROP VIEW all_variant_details).

-- 1. all_bottle_details: keep every existing column, append the default-variant Elo,
--    the default variant id, and the total variant count for the SKU roll-up.
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
    COALESCE(array_agg(bv.store_pick_name ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::text[]) AS attr_store_pick_name,
    -- 7.2 additions (exactly one default variant per SKU after 7.1 backfill):
    max(bv.elo_global) FILTER (WHERE bv.is_default) AS default_variant_elo,
    (array_agg(bv.id ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1] AS default_variant_id,
    count(bv.id) AS variant_count
   FROM bottles b
     LEFT JOIN bottle_variants bv ON bv.bottles_id = b.id
  GROUP BY b.id;

-- 2. all_variant_details: one row per variant with its SKU identity, for the
--    "All Variants" leaderboard (each variant scored by its own Elo).
CREATE OR REPLACE VIEW all_variant_details AS
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
    bv.created_at AS variant_created_at
   FROM bottle_variants bv
     JOIN bottles b ON b.id = bv.bottles_id;
