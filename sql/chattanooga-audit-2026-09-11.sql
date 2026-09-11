-- Data audit follow-up on the merged Chattanooga Experimental roll-up, 2026-09-11.
-- Findings (producer page chattanoogawhiskey.com/product/exp-single-bbls, read live):
--   * Barrel 283's tasting notes were barrel 304's (the page lists 304's notes directly above the
--     283 heading and a summariser mis-attributed them). 283 = lemon candy / creme caramel /
--     glazed poppyseed muffin / toasted oak / lingering wheaty finish.
--   * 283's producer style is "Straight Whiskey" (dinkel-wheat-led mash), not Straight Bourbon;
--     030 is a Bourbon Liqueur; the line's stock bottle (Barrel 172) is Straight Bourbon. So the
--     roll-up style is "Experimental (varies by batch)".
--   * Both UPCs pass the check digit. 030 = 853192006141, 283 = 853192006158.
--   * Images: 030 correct. 283 and Unknown both carry the producer's stock hero, which is
--     Barrel #172 -- Chattanooga publishes no barrel-number-free bottle shot. 283 is flagged
--     for Brian's re-review; Unknown keeps the stock image pending his call.
--   * Parent frontimage_url was a Reddit group photo (i.redd.it) -- replaced with the
--     self-hosted stock image the Unknown variant already carries.
BEGIN;

UPDATE bottle_variants SET
  nose   = 'Lemon candy and creme caramel with toasted oak',
  palate = 'Glazed poppyseed muffin and baked dessert; bright fruit over nutty dinkel wheat, wildly complex and structured',
  finish = 'Lingering and wheaty with toasted oak',
  notes  = 'Experimental Single Barrel 283 (May 2024), selected by BS. Producer style: Straight Whiskey. 117.8 proof, 4 yr 4 mo. Mash: malted dinkel wheat, yellow corn, pale / Vienna / Munich malted barley. #2 char + toast profile 91, 18-month seasoned 53 gal. Same family of barrels as Experimental Batch 037: Ancient Wheat. UPC 853192006158.',
  image_flagged_at = now(), image_flagged_by = NULL,
  image_flag_note  = 'Stored image is the producer''s stock line photo, which is Barrel #172 (125 proof, bottled 4/12/2023), not 283. No public photo of 283 exists; needs Brian''s own shot or a decision to keep the stock image.',
  updated_at = now()
WHERE id = '4990d7fb-5cc7-40b1-80db-b3e20a717e8b';

UPDATE bottle_variants SET
  image_review_note = 'Producer stock image for the Experimental Single Barrel line (shows Barrel #172 on the label; Chattanooga publishes no number-free shot).',
  updated_at = now()
WHERE id = 'e851f395-f309-4e49-85de-a5f8fd2c2779';

UPDATE bottles SET
  style = 'Experimental (varies by batch: straight bourbon, straight whiskey, bourbon liqueur)',
  frontimage_url = 'https://bicpipgbspasxbtqjzvg.supabase.co/storage/v1/object/public/bottle-images/variants/e851f395-f309-4e49-85de-a5f8fd2c2779/front.webp',
  extras = '{"series":"Chattanooga Whiskey Experimental releases (single barrels and small experimental batches) from the Tennessee High Malt program. Mash bill, proof, age, style and cooperage differ per batch - see the batch variant.","barcodes":{"030":"853192006141","283":"853192006158"},"barcode_check":"both UPC-A check digits PASS (2026-09-11)","source":"https://chattanoogawhiskey.com/product/exp-single-bbls/"}',
  updated_at = now()
WHERE id = 'fdce97fc-50dc-48cc-85b3-bc6e98f04ad0';

COMMIT;
