-- Provenance for bottle_height (#94). Approved by Brian 2026-09-09. Additive.
-- Rollback: sql/bottle-height-source-snapshot.sql
--
-- WHY. `bottle_height` scales every bottle on the Home shelf: 12 inches is ratio 1. But per-bottle
-- dimensions are mostly NOT published -- Blanton's is listed at 8.5in, Jim Beam Black and Old
-- Forester 100 are listed nowhere -- so most heights will start as form-factor guesses. Without
-- provenance a guess is indistinguishable from a real figure, which means nobody can tell which
-- numbers are worth re-checking, and a bot re-researches everything or nothing.
--
--   measured   -- somebody put a ruler on the actual bottle. Highest confidence; never re-research.
--   published  -- a producer or retailer states it. Trust it; re-check only if it looks wrong.
--   estimated  -- a form-factor default. THIS IS THE RE-RESEARCH QUEUE.
--
-- The paired constraint is deliberate: a height with no provenance is exactly the ambiguity this
-- column exists to remove, so the two must always travel together.

ALTER TABLE public.bottle_variants
  ADD COLUMN IF NOT EXISTS bottle_height_source text;

COMMENT ON COLUMN public.bottle_variants.bottle_height_source IS
  'Where bottle_height came from: measured (a ruler on the real bottle) / published (producer or '
  'retailer spec) / estimated (form-factor default). "estimated" is the re-research queue. Must be '
  'set whenever bottle_height is set.';

-- Backfill the three heights that already exist, before the constraint lands.
UPDATE public.bottle_variants SET bottle_height_source = 'published'
 WHERE id = 'a74424b2-990a-45ab-8b6b-45ca82decb58' AND bottle_height IS NOT NULL;  -- Blanton's, 8.5in listed
UPDATE public.bottle_variants SET bottle_height_source = 'estimated'
 WHERE bottle_height IS NOT NULL AND bottle_height_source IS NULL;

ALTER TABLE public.bottle_variants
  DROP CONSTRAINT IF EXISTS bottle_height_needs_source;
ALTER TABLE public.bottle_variants
  ADD CONSTRAINT bottle_height_needs_source CHECK (
    (bottle_height IS NULL AND bottle_height_source IS NULL)
    OR (bottle_height IS NOT NULL AND bottle_height_source IN ('measured', 'published', 'estimated'))
  );
