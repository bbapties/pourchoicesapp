-- ROLLBACK for sql/home-image-review-migration.sql  (#83 / Home "The Cabinet", #82)
--
-- The migration is additive: one new table, seven new columns, one guard trigger, one RPC.
-- Nothing existing is rewritten, so the rollback drops what was added and no data is restored.
--
-- WHAT THIS THROWS AWAY: Brian's curation decisions -- which images were approved, which were
-- rejected and why. That is hours of judgement, not something a re-run recreates. Copy it out
-- first if any review has happened:
--
--   COPY (SELECT id, shelf_ready, image_reject_reason_ids, image_review_note
--           FROM public.bottle_variants
--          WHERE shelf_ready OR cardinality(image_reject_reason_ids) > 0)
--     TO STDOUT WITH CSV HEADER;

DROP FUNCTION IF EXISTS public.flag_variant_image(uuid, text);
DROP TRIGGER  IF EXISTS trg_protect_image_review ON public.bottle_variants;
DROP FUNCTION IF EXISTS public.protect_image_review();

ALTER TABLE public.bottle_variants
  DROP COLUMN IF EXISTS image_reject_reason_ids,
  DROP COLUMN IF EXISTS image_review_note,
  DROP COLUMN IF EXISTS image_reviewed_at,
  DROP COLUMN IF EXISTS image_reviewed_by,
  DROP COLUMN IF EXISTS image_flagged_at,
  DROP COLUMN IF EXISTS image_flagged_by,
  DROP COLUMN IF EXISTS image_flag_note;

DROP TABLE IF EXISTS public.image_reject_reasons;
