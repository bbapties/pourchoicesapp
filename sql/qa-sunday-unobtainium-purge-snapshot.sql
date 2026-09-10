-- ============================================================================
-- Restore QA Sunday Unobtainium Rye 2099 after the #96 purge (2026-09-10)
--
-- Captured off prod immediately before sql/qa-sunday-unobtainium-purge.sql.
-- Inserts the bottle, its default variant, and the one hidden `verified`
-- activity. Nothing else hung off this row (no user_bottles, tastings,
-- ratings, wishlists, or suggested_edits).
-- ============================================================================

BEGIN;

INSERT INTO public.bottles (
  id, name, category, verified, elo_global, created_at, updated_at,
  distillery, style, barcode, created_by, updated_by, nose, palate, finish,
  extras, proof, age, volume, frontimage_url, backimage_url, variant_axis,
  variant_triage, variant_triaged_at, variant_triaged_by
) VALUES (
  '5423bb7d-3e91-48a4-b898-2db5e4b65de9',
  'QA Sunday Unobtainium Rye 2099',
  'Whiskey',
  false,
  1500,
  '2026-08-30T11:16:46.05672+00:00',
  '2026-09-09T23:08:56.889086+00:00',
  NULL, NULL, NULL,
  '41b59766-2ab4-45ed-95a7-01467cde8146',
  '7063602c-1604-4d04-aa59-2b74fdd5af6d',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'single',
  '2026-09-09T23:08:56.687+00:00',
  '7878be89-18a5-4043-a2da-be308b93ab05'
);

INSERT INTO public.bottle_variants (
  id, bottles_id, frontimage_url, backimage_url, age, proof, batch,
  release_year, store_pick_name, verified, created_by, created_at,
  updated_by, updated_at, notes, elo_global, nose, palate, finish,
  is_default, is_catchall, store_pick_of_variant_id, shelf_ready,
  image_reject_reason_ids, image_review_note, image_reviewed_at,
  image_reviewed_by, image_flagged_at, image_flagged_by, image_flag_note,
  bottle_height, bottle_height_source
) VALUES (
  '6966b81f-d246-4a36-9d65-7668f4436580',
  '5423bb7d-3e91-48a4-b898-2db5e4b65de9',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  false,
  '41b59766-2ab4-45ed-95a7-01467cde8146',
  '2026-08-30T11:16:46.220832+00:00',
  '41b59766-2ab4-45ed-95a7-01467cde8146',
  '2026-09-09T18:06:31.870116+00:00',
  NULL,
  1500,
  NULL, NULL, NULL,
  true,
  false,
  NULL,
  false,
  ARRAY['f975ece8-fcc1-4d56-94b8-39782965a57f']::uuid[],
  NULL,
  '2026-09-09T18:06:31.688+00:00',
  '7878be89-18a5-4043-a2da-be308b93ab05',
  NULL, NULL, NULL, NULL, NULL
);

INSERT INTO public.activities (
  id, user_id, bottle_id, variant_id, action, pour_type, created_at
) VALUES (
  'df6885c4-b7fb-4acd-8a50-638dfdfdf948',
  '7063602c-1604-4d04-aa59-2b74fdd5af6d',
  '5423bb7d-3e91-48a4-b898-2db5e4b65de9',
  NULL,
  'verified',
  NULL,
  '2026-09-05T03:02:27.973694+00:00'
);

COMMIT;
