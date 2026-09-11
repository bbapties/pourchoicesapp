-- Merge the two Chattanooga Whiskey Experimental parents into one roll-up with three batch
-- variants (030, 283, Unknown), 2026-09-11. Brian's ask; done by hand because Admin has no
-- merge / re-parent tool yet (board story filed the same day).
--
-- Before: two bottles, each with a batch variant plus a default/catchall variant.
--   451d3d41  "Chattanooga Whiskey Experimental Batch 030: Honey Infused"  -> 06cea5da (030), 2c739750 (catchall)
--   fdce97fc  "Chattanooga Whiskey Experimental Single Barrel"             -> 4990d7fb (283), e851f395 (catchall)
-- After: one bottle fdce97fc with 06cea5da (030), 4990d7fb (283), e851f395 (Unknown, default+catchall).
-- Neither parent had any user_bottles / tastings / ratings / wishlists / activities / suggested_edits.
-- Snapshot for rollback: sql/chattanooga-merge-2026-09-11-snapshot.sql

BEGIN;

-- 1. Re-parent the Batch 030 variant and give it its own notes (they were on the doomed parent).
UPDATE bottle_variants SET
  bottles_id = 'fdce97fc-50dc-48cc-85b3-bc6e98f04ad0',
  is_default = false, is_catchall = false,
  nose   = 'Honeysuckle, ripe pear, cut hay and dried herbs',
  palate = 'Hot toddy and shortbread; wildflower honey over triple-distilled bourbon with heather and linden',
  finish = 'Sweet, herbal and soft',
  notes  = 'Experimental Batch 030: Honey Infused (March 2023). Bourbon liqueur, 85 proof, 4 yr, 4 barrels. Mash: yellow corn, Irish malted barley, flaked barley, malted rye; triple-pot distilled; toasted & charred new and used 53 gal oak. Infused with wildflower honey, heather blossom, sweet woodruff, linden, lemon juice & cane sugar. UPC 853192006141.',
  updated_at = now()
WHERE id = '06cea5da-703b-46b6-8d98-136a5d79f500';

-- 2. Batch 283 gets its notes (were on the surviving parent) and its production details.
UPDATE bottle_variants SET
  nose   = 'Baklava, allspice and chocolate banana bread',
  palate = 'Nutty richness from the malted dinkel wheat; honeyed pastry, anise and baking spice',
  finish = 'Sweet, toasted biscuit',
  notes  = 'Experimental Single Barrel 283 (May 2024). 117.8 proof, 4 yr 4 mo. Mash: malted dinkel wheat, yellow corn, pale / Vienna / Munich malted barley. #2 char + toast profile 91, 18-month seasoned 53 gal. Same family of barrels as Experimental Batch 037: Ancient Wheat. UPC 853192006158.',
  updated_at = now()
WHERE id = '4990d7fb-5cc7-40b1-80db-b3e20a717e8b';

-- 3. The surviving catchall becomes the explicit "Unknown" batch. Proof / age are batch-specific,
--    so an unknown batch carries neither.
UPDATE bottle_variants SET
  batch = 'Unknown', is_default = true, is_catchall = true,
  proof = NULL, age = NULL, release_year = NULL,
  notes = 'Use when the batch / barrel number is not known. Pick the numbered batch if you can read it off the label.',
  updated_at = now()
WHERE id = 'e851f395-f309-4e49-85de-a5f8fd2c2779';

-- 4. The roll-up parent: generic across batches. Barcode stays (283's) so a scan still resolves.
UPDATE bottles SET
  style  = 'Straight Bourbon (experimental; varies by batch)',
  proof  = NULL, age = NULL,
  nose   = 'Varies by batch; the house Tennessee High Malt style leans to honeyed malt, baked pastry and dried fruit',
  palate = 'Malt-forward and rich; toasted grain, baking spice and orchard fruit, with each batch adding its own twist',
  finish = 'Warm and sweet with toasted biscuit',
  extras = '{"series":"Chattanooga Whiskey Experimental releases (single barrels and small experimental batches) from the Tennessee High Malt program. Mash bill, proof, age and cooperage differ per batch - see the batch variant.","barcodes":{"030":"853192006141","283":"853192006158"}}',
  updated_at = now()
WHERE id = 'fdce97fc-50dc-48cc-85b3-bc6e98f04ad0';

-- 5. Retire the Batch 030 parent and its now-redundant catchall variant. Both verified empty of
--    dependents above; storage file variants/2c739750.../shelf-mtx40d28.webp is left in place.
DELETE FROM bottle_variants WHERE id = '2c739750-b795-4c50-9523-bd049fe55afe';
DELETE FROM bottles WHERE id = '451d3d41-0ff8-4681-9590-e6105d20addb';

-- Prove the shape.
DO $$
DECLARE n int; d int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_default) INTO n, d
  FROM bottle_variants WHERE bottles_id = 'fdce97fc-50dc-48cc-85b3-bc6e98f04ad0';
  IF n <> 3 OR d <> 1 THEN RAISE EXCEPTION 'expected 3 variants with 1 default, got % / %', n, d; END IF;
  SELECT count(*) INTO n FROM bottles WHERE name ILIKE 'Chattanooga%Experimental%';
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 Chattanooga Experimental parent, got %', n; END IF;
END $$;

COMMIT;
