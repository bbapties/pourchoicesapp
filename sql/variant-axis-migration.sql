-- ============================================================================
-- The variant model, part 1: axis, catch-all, and store-pick parentage
-- board #71, under the design in #70            (2026-09-07)
--
-- THE PROBLEM. A bottle's main variant is doing two jobs at once: it is the
-- canonical barcode record AND the thing people interact with. That holds until
-- a bottle has real variations. Elijah Craig Barrel Proof has five batches in
-- this database, and the star everyone sees in search is batch C925's score
-- alone, because C925 happens to carry is_default. The other four are separately
-- rated whiskeys nobody meets unless they open the carousel.
--
-- THE MODEL (decided with Brian 2026-09-07, in full, in #70):
--
--   main record   one per barcode. Once a bottle SPLITS it becomes a display-only
--                 rollup of its children -- still in search, never interacted
--                 with directly.
--   variant       a global variation: release year, batch, rickhouse, barrel.
--                 Everyone sees it once an admin verifies it.
--   store pick    a store's clone. Private to its creator; its tastings score the
--                 shared record as if the clone did not exist.
--   the axis      ONE per bottle, declared by an admin when the first variant is
--                 verified. It is the question asked of anyone adding a version:
--                 "which batch?", "which year?".
--   catch-all     the child that holds everything unlabelled -- "batch unknown".
--
-- WHY NOTHING MOVES. Brian's worked example showed the main record's history
-- being COPIED onto a new "unknown" child. The end state here is identical, but
-- reached by relabelling instead: the main variant row ALREADY holds that
-- history, so a split marks it `is_catchall` and declares the axis on the bottle.
-- Zero rows change hands. That matters because moving history means repointing
-- tasting_results across four columns for other people's tastings, and the
-- cheapest version of a risky operation is the one that does not happen. The
-- parent is then the `bottles` row itself rather than a leftover variant row.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO:
--   - it does not split anything. Every bottle stays exactly as it is; splitting
--     is an admin action (#73) over a triage queue (#76), because deciding
--     "variant or duplicate" needs a person -- there are no duplicate barcodes
--     and no duplicate names in this catalog, so nothing can be inferred.
--   - it does not compute rollups. That is #72, and the Elo itself stays
--     trigger-scored: there is one implementation of the Elo maths, ever (#3).
--
-- ADDITIVE ONLY. Rollback: sql/variant-axis-snapshot.sql.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The axis. Its presence IS the record that a bottle has split -- one column
--    instead of a separate boolean that could drift out of step with it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bottles
  ADD COLUMN IF NOT EXISTS variant_axis text;

ALTER TABLE public.bottles
  DROP CONSTRAINT IF EXISTS bottles_variant_axis_check;
ALTER TABLE public.bottles
  ADD CONSTRAINT bottles_variant_axis_check
  CHECK (variant_axis IS NULL OR variant_axis IN
         ('release_year', 'batch', 'rickhouse', 'barrel', 'custom'));

COMMENT ON COLUMN public.bottles.variant_axis IS
  'The one question asked when adding a version of this bottle (#70). NULL means the bottle has not split and behaves exactly as it always has. Declared by an admin when verifying the first variant; never inferred.';

-- ---------------------------------------------------------------------------
-- 2. The catch-all child: where unlabelled history lives after a split.
--    Exactly one per bottle, enforced rather than trusted.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bottle_variants
  ADD COLUMN IF NOT EXISTS is_catchall boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS bottle_variants_one_catchall_per_bottle
  ON public.bottle_variants (bottles_id)
  WHERE is_catchall;

COMMENT ON COLUMN public.bottle_variants.is_catchall IS
  'The "[axis] unknown" child (#70): interactions on the bare barcode, plus any store pick that predates the split. Set on the existing main variant at split time, which is why no history has to move.';

-- ---------------------------------------------------------------------------
-- 3. Store picks hang off a VARIANT, not the bottle.
--
--    Brian, 2026-09-07: a store pick of Elijah Craig Barrel Proof is a barrel out
--    of one particular batch, so it belongs to that batch. A pick that predates
--    its bottle's split belongs to the catch-all, along with everything else
--    unlabelled.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bottle_variants
  ADD COLUMN IF NOT EXISTS store_pick_of_variant_id uuid
    REFERENCES public.bottle_variants(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bottle_variants.store_pick_of_variant_id IS
  'For a store pick: the variant it is a pick OF, and therefore the variant its tastings score globally (#70). NULL on a non-pick. NULL on a pick means fall back to the bottle default, which is the pre-split behaviour.';

-- Existing picks point at the variant they already scored: their bottle's
-- default. Same behaviour as before this migration, now stated rather than
-- recomputed on every call.
UPDATE public.bottle_variants sp
   SET store_pick_of_variant_id = d.id
  FROM public.bottle_variants d
 WHERE sp.store_pick_name IS NOT NULL
   AND sp.store_pick_of_variant_id IS NULL
   AND d.bottles_id = sp.bottles_id
   AND d.is_default;

-- ---------------------------------------------------------------------------
-- 4. Teach the Elo rollup about it.
--
--    Behaviour is UNCHANGED for every row in the database today -- each existing
--    pick's stored parent is the same default variant the old CASE looked up. It
--    changes only for picks created after a split, which is the point.
--
--    Everything that is not a store pick still targets itself: a variant keeps
--    its own global Elo, and the parent's number is derived from its children in
--    #72 rather than being scored directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.elo_global_target(p_variant uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $fn$
  SELECT CASE
           WHEN bv.store_pick_name IS NULL THEN bv.id
           WHEN bv.store_pick_of_variant_id IS NOT NULL THEN bv.store_pick_of_variant_id
           ELSE (SELECT d.id FROM public.bottle_variants d
                  WHERE d.bottles_id = bv.bottles_id AND d.is_default = true LIMIT 1)
         END
    FROM public.bottle_variants bv
   WHERE bv.id = p_variant;
$fn$;

COMMIT;
