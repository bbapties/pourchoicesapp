-- Home "The Cabinet" (#82) / the unverified-image safety net (#83).
-- Approved by Brian 2026-09-09. Additive only. Rollback: sql/home-shelf-ready-snapshot.sql
--
-- WHY A STORED FLAG AND NOT A CHECK AT RENDER TIME.
-- The Home screen stands every bottle as a cut-out on a lit wooden shelf. That only works if
-- the image has a transparent background, a consistent aspect, and the bottle sitting on the
-- baseline. A browser cannot cheaply or reliably tell whether a PNG is a real cut-out -- and
-- Home must never depend on it trying, because the failure is silent and disfigures the whole
-- screen, not just one bottle.
--
-- WHY IT DEFAULTS TO FALSE.
-- Every variant starts un-curated and is promoted by hand, from an admin preview that shows the
-- image ON a shelf (#83 half B) -- a background fringe is invisible at thumbnail size and
-- obvious at shelf size. Defaulting false means the failure mode is a tidy shelf of ghost
-- bottles, never a broken one, and nothing uploaded in future can silently degrade Home.
--
-- WHY ON bottle_variants AND NOT bottles.
-- The variant owns the image (#70). bottles.frontimage_url is the legacy/fallback path; a
-- bottle-level image is treated as not shelf-ready, which is the safe reading anyway.
--
-- The two image problems are DERIVED, not stored -- they need different work, not different
-- columns:
--   frontimage_url IS NULL                     -> nobody has photographed it   (needs a picture)
--   frontimage_url IS NOT NULL AND NOT ready   -> photographed, not cut out    (needs an edit)

ALTER TABLE public.bottle_variants
  ADD COLUMN IF NOT EXISTS shelf_ready boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bottle_variants.shelf_ready IS
  'frontimage_url is a clean cut-out fit to stand on the Home cabinet shelf: transparent '
  'background, consistent aspect, bottle on the baseline. Set by hand from the admin shelf '
  'preview (#83); never inferred at render time. False renders a ghost bottle instead.';
