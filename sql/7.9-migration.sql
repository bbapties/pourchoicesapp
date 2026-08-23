-- Phase 7.9 - store-pick scoping support.
-- Additive: appends one column to each of two views so the app can make store
-- picks owner-scoped (owner-sees-own-everywhere). No tables/columns/RLS change.
-- Rollback: sql/7.9-snapshot.sql (restores the prior view definitions).
--
--   all_bottle_details : + attr_variant_created_by (array, same order as attr_variant_ids)
--                        -> lets the client compute a viewer-aware "N versions" count.
--   all_variant_details: + variant_created_by
--                        -> lets the All-Variants leaderboard hide others' store picks.
-- New columns are appended at the END so CREATE OR REPLACE VIEW accepts them.

BEGIN;

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
    max(bv.elo_global) FILTER (WHERE bv.is_default) AS default_variant_elo,
    (array_agg(bv.id ORDER BY bv.created_at) FILTER (WHERE bv.is_default))[1] AS default_variant_id,
    count(bv.id) AS variant_count,
    COALESCE(array_agg(bv.created_by ORDER BY bv.created_at) FILTER (WHERE bv.id IS NOT NULL), '{}'::uuid[]) AS attr_variant_created_by
   FROM bottles b
     LEFT JOIN bottle_variants bv ON bv.bottles_id = b.id
  GROUP BY b.id;

CREATE OR REPLACE VIEW public.all_variant_details AS
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
    bv.created_by AS variant_created_by
   FROM bottle_variants bv
     JOIN bottles b ON b.id = bv.bottles_id;

COMMIT;
