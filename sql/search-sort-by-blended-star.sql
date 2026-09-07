-- ============================================================================
-- Sort search by the star it actually shows        (2026-09-07)
--
-- Brian: "if the only rating for that Weller is 5.0, then why is it not showing
-- as such on the main search screen" -- it was, at 5.00, seventeen bottles down
-- the list. The list was ordered by `default_variant_elo` while the card showed
-- the BLENDED star from #72, and those are different numbers: W.L. Weller
-- Antique 107 has one manual rating of 5 and no blind tastings, so its star is
-- 5.00 and its Elo is the untouched 1500 baseline.
--
-- Before today the card's star WAS derived from Elo, so order and display always
-- agreed. Adding manual ratings to the star broke that silently. His call: sort
-- by the blended star, the logic already worked out.
--
-- WHY IN THE VIEW AND NOT IN THE BROWSER. Search is paginated with infinite
-- scroll, so a client-side sort would only reorder the rows already loaded --
-- which is exactly the mistake recorded in HANDOFF against My Ranks ("sorting
-- client-side only touched the loaded page"). The sort key has to exist where
-- the ORDER BY runs.
--
-- ADDITIVE. Both columns are appended at the end, so every existing consumer of
-- these views is untouched, and `security_invoker` is restated explicitly
-- because CREATE OR REPLACE VIEW would otherwise be a chance to lose it -- these
-- two MUST stay invoker so RLS keeps scoping store picks and unverified versions
-- to the people allowed to see them.
--
-- PERFORMANCE NOTE: the new column is a correlated read of bottle_scores /
-- variant_scores, which aggregate over tasting_results and user_ratings. At 109
-- bottles that is free. If the catalog grows into the thousands and search gets
-- slow, this is the first thing to look at -- the fix would be materialising the
-- score rather than un-picking the sort.
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
    -- The number the card actually displays, so the list can be ordered by it.
    (SELECT bs.star FROM public.bottle_scores bs WHERE bs.bottle_id = b.id) AS blended_star
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
    -- own score -- not the parent's.
    (SELECT vs.star FROM public.variant_scores vs WHERE vs.variant_id = bv.id) AS blended_star
   FROM bottle_variants bv
     JOIN bottles b ON b.id = bv.bottles_id;

COMMIT;
