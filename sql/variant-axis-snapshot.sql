-- ============================================================================
-- ROLLBACK for sql/variant-axis-migration.sql   (#71 / #70, 2026-09-07)
--
-- The migration is additive: three columns, one CHECK, one partial unique index,
-- one function replaced. No row's history is moved, so undoing it is dropping
-- what it added and putting elo_global_target() back to the default-variant
-- mapping it had before.
--
-- Running this un-splits every bottle (the axis and the catch-all flag are the
-- only record that a split happened), so only run it if the model is wrong --
-- not to fix a single bad split, which is one UPDATE.
-- ============================================================================

DROP INDEX IF EXISTS bottle_variants_one_catchall_per_bottle;

ALTER TABLE public.bottle_variants
  DROP COLUMN IF EXISTS is_catchall,
  DROP COLUMN IF EXISTS store_pick_of_variant_id;

ALTER TABLE public.bottles
  DROP CONSTRAINT IF EXISTS bottles_variant_axis_check,
  DROP COLUMN IF EXISTS variant_axis;

-- The pre-#71 mapping: a store pick scores its bottle's default variant.
CREATE OR REPLACE FUNCTION public.elo_global_target(p_variant uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $fn$
  SELECT CASE WHEN bv.store_pick_name IS NOT NULL
              THEN (SELECT d.id FROM public.bottle_variants d
                     WHERE d.bottles_id = bv.bottles_id AND d.is_default = true LIMIT 1)
              ELSE bv.id END
    FROM public.bottle_variants bv
   WHERE bv.id = p_variant;
$fn$;
