-- Gramling Woods Checkerboard: Brian's call (2026-09-11) - the "Barrel 145" (2025) variant becomes
-- the Batch "Unknown" catch-all; the previous empty catch-all (no owners, activity, ratings,
-- wishlists, tastings or edits) is retired. Barrel 145 keeps its approved shelf image and its
-- one activity row. Snapshot of both rows: sql/gramling-unknown-2026-09-11-snapshot.sql
BEGIN;
-- Old catch-all goes first: bottle_variants_one_default_per_bottle allows one default at a time.
DELETE FROM bottle_variants WHERE id='856f369b-1641-4226-9c02-47796e294e9a';
UPDATE bottle_variants SET batch='Unknown', release_year=NULL, is_default=true, is_catchall=true,
  notes='Use when the batch / barrel number is not known. Was entered as Barrel 145 (2025) - folded into the catch-all on 2026-09-11 at Brian''s request.',
  updated_by='7878be89-18a5-4043-a2da-be308b93ab05', updated_at=now()
WHERE id='6790c73c-99a9-40a2-b175-496dc187f736';
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM bottle_variants WHERE bottles_id='634ab52d-b913-49e0-b471-6d43de445b74' AND is_default;
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 default, got %', n; END IF;
END $$;
COMMIT;

-- Batch 1 (added by Brian in-app 2026-09-11) came in with no image/height/shelf state, because the
-- add-variant flow inserts only batch/proof/year (#102). Inherit the parent's approved cut-out by
-- POINTING at the same stored object -- no second copy -- and carry the height with it. Same bytes
-- Brian already approved, so shelf_ready carries over with a note saying so.
UPDATE bottle_variants c SET
  frontimage_url = p.frontimage_url, bottle_height = p.bottle_height, bottle_height_source = p.bottle_height_source,
  shelf_ready = true, image_reviewed_at = now(), image_reviewed_by = '7878be89-18a5-4043-a2da-be308b93ab05',
  image_review_note = 'Inherits the parent''s approved shelf image (same stored file as the Unknown variant).',
  updated_by = '7878be89-18a5-4043-a2da-be308b93ab05', updated_at = now()
FROM bottle_variants p
WHERE c.bottles_id = '634ab52d-b913-49e0-b471-6d43de445b74' AND c.batch = 'Batch 1' AND p.bottles_id = c.bottles_id AND p.is_default;
-- Parent fallback image was still the distillery's external JPG; point it at our own approved file.
UPDATE bottles SET frontimage_url = (SELECT frontimage_url FROM bottle_variants WHERE bottles_id = bottles.id AND is_default), updated_at = now()
WHERE id = '634ab52d-b913-49e0-b471-6d43de445b74';
