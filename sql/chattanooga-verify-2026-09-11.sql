-- Verify both Chattanooga Experimental parents and every variant, split by batch/barrel.
-- Mirrors Admin > Bottles "Verify" exactly (verified=true + a hidden 'verified' activities row),
-- done in SQL because the queue screen cannot bulk-approve 73 variants (board story filed).
-- Attributed to The_Lake_House (Brian asked for it). updated_by set explicitly: the
-- default_to_admin() trigger would otherwise stamp auth.uid(), which is NULL here.
BEGIN;
WITH parents AS (
  SELECT id, CASE WHEN name LIKE '%Single Barrel' THEN 'barrel' ELSE 'batch' END AS axis
  FROM bottles WHERE name ILIKE 'Chattanooga Whiskey Experimental%'
)
UPDATE bottles b SET verified = true, variant_axis = p.axis, updated_by = '7878be89-18a5-4043-a2da-be308b93ab05', updated_at = now()
FROM parents p WHERE b.id = p.id;

UPDATE bottle_variants SET verified = true, updated_by = '7878be89-18a5-4043-a2da-be308b93ab05', updated_at = now()
WHERE bottles_id IN (SELECT id FROM bottles WHERE name ILIKE 'Chattanooga Whiskey Experimental%');

INSERT INTO activities (user_id, bottle_id, variant_id, action)
SELECT '7878be89-18a5-4043-a2da-be308b93ab05', id, NULL, 'verified'
FROM bottles WHERE name ILIKE 'Chattanooga Whiskey Experimental%';
INSERT INTO activities (user_id, bottle_id, variant_id, action)
SELECT '7878be89-18a5-4043-a2da-be308b93ab05', bottles_id, id, 'verified'
FROM bottle_variants WHERE bottles_id IN (SELECT id FROM bottles WHERE name ILIKE 'Chattanooga Whiskey Experimental%') AND NOT is_default;
COMMIT;

-- Variants tab triage: the new Batch parent had no variant_triage, so it sat in the queue.
UPDATE bottles SET variant_triage='split', variant_axis='batch', variant_triaged_at=now(), variant_triaged_by='7878be89-18a5-4043-a2da-be308b93ab05', updated_by='7878be89-18a5-4043-a2da-be308b93ab05', updated_at=now() WHERE name='Chattanooga Whiskey Experimental Batch';
