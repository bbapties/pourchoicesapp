-- ============================================================================
-- The variant model, part 2: the split itself   -- board #71, design in #70
--                                                  (2026-09-07)
--
-- Splitting a bottle is the moment its main record stops being something people
-- interact with and becomes a rollup of its children. It happens ONCE per
-- bottle, when an admin verifies the first variant and declares the axis (#73),
-- over a triage queue that shows them what they are deciding (#76).
--
-- It lives here, as one function, for the same reason the Elo maths does: the
-- admin screen, the triage queue and any future backfill must all split a bottle
-- the same way. A second implementation is how two things that should agree stop
-- agreeing.
--
-- IT MOVES NOTHING. The main variant already holds the bottle's unlabelled
-- history, so it simply becomes the catch-all. See the header of
-- variant-axis-migration.sql for why that is better than copying rows.
--
-- IT IS IDEMPOTENT AND NARROW. Re-running it on a split bottle raises rather
-- than quietly re-pointing store picks, because a second split is always a
-- mistake -- the axis is declared once and the catch-all already exists.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.split_bottle_into_variants(
  p_bottle uuid,
  p_axis   text
)
RETURNS uuid          -- the catch-all variant
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_catchall uuid;
  v_existing text;
BEGIN
  IF p_axis IS NULL THEN
    RAISE EXCEPTION 'split_bottle_into_variants: an axis is required -- it is the question asked of everyone who adds a version';
  END IF;

  SELECT variant_axis INTO v_existing FROM public.bottles WHERE id = p_bottle;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'split_bottle_into_variants: no such bottle %', p_bottle;
  END IF;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'split_bottle_into_variants: bottle % has already split on "%" -- the axis is declared once', p_bottle, v_existing;
  END IF;

  -- The main variant becomes the catch-all. It keeps is_default, so everything
  -- that reads a bottle's default (search cards, resolveDefaultVariantId) keeps
  -- working untouched until the rollup lands in #72.
  UPDATE public.bottle_variants
     SET is_catchall = true, updated_at = now()
   WHERE bottles_id = p_bottle AND is_default
  RETURNING id INTO v_catchall;

  IF v_catchall IS NULL THEN
    RAISE EXCEPTION 'split_bottle_into_variants: bottle % has no default variant to carry its unlabelled history', p_bottle;
  END IF;

  -- A store pick that predates the split was a pick of the bottle in general,
  -- which is exactly what the catch-all now means.
  UPDATE public.bottle_variants
     SET store_pick_of_variant_id = v_catchall, updated_at = now()
   WHERE bottles_id = p_bottle
     AND store_pick_name IS NOT NULL
     AND store_pick_of_variant_id IS NULL;

  UPDATE public.bottles
     SET variant_axis = p_axis, updated_at = now()
   WHERE id = p_bottle;

  RETURN v_catchall;
END;
$fn$;

COMMENT ON FUNCTION public.split_bottle_into_variants(uuid, text) IS
  'Turns a bottle into a rollup parent with children (#70): declares its axis and marks the main variant as the "[axis] unknown" catch-all. Moves no history. Raises on a second call -- a bottle splits once.';

COMMIT;
