-- Backfill nose / palate / finish / extras on the bottle rows that had none anywhere
-- (neither on the bottle nor on the default variant), 2026-09-11.
--
-- Audit that motivated it: 22 bottles rendered with no tasting notes at all via
-- all_bottle_details; 3 verified bottles were missing only `extras`. Every UPDATE below
-- is guarded so it only fills NULL / blank columns -- nothing that exists is overwritten.
-- Snapshot of the prior state: sql/backfill-tasting-notes-2026-09-11-snapshot.sql
--
-- Sources: producer pages where they exist, otherwise the consensus of published reviews
-- (Breaking Bourbon, The Whiskey Wash, Drinkhacker, Whiskey Consensus). Two bottles have
-- almost no published notes (Gramling Woods Checkerboard, Julius James); those are written
-- from the producer's own one-line description plus the grain bill, and say so in `extras`.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.fill_notes(p_name text, p_nose text, p_palate text, p_finish text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE bottles SET
    nose   = COALESCE(NULLIF(btrim(nose), ''),   p_nose),
    palate = COALESCE(NULLIF(btrim(palate), ''), p_palate),
    finish = COALESCE(NULLIF(btrim(finish), ''), p_finish),
    updated_at = now()
  WHERE name = p_name;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'expected exactly one bottle named %, matched %', p_name, n; END IF;
END $$;

SELECT pg_temp.fill_notes('1792 Small Batch Kentucky Straight Bourbon Whiskey',
  'Bold rye spice, caramel and vanilla with a touch of oak',
  'Sweet and spicy; brown sugar, toasted oak, cinnamon and a firm rye backbone',
  'Long, warm and spicy with lingering caramel');

SELECT pg_temp.fill_notes('Bardstown Bourbon Company Fusion Series Kentucky Straight Bourbon Whiskey',
  'Caramel candy, red fruit (cherry, strawberry), orange peel, bread crust and cocoa',
  'Bread pudding, dark chocolate and bing cherry with brown sugar, baking spice and a little pine from the young wood',
  'Smooth and balanced; warm cinnamon, maple and oak');

SELECT pg_temp.fill_notes('Basil Hayden Kentucky Straight Bourbon Whiskey',
  'Light and spicy; tea, honey, a hint of peppermint',
  'Light-bodied with a gentle bite; brown sugar, honey and black pepper',
  'Dry, clean and brief');

SELECT pg_temp.fill_notes('Booker''s Kentucky Straight Bourbon Whiskey',
  'Intense oak, vanilla and roasted nuts with tobacco',
  'Rich and full; vanilla, caramel, charred oak, dark fruit and peppery spice',
  'Long, hot and intense; oak and spice that keep going');

SELECT pg_temp.fill_notes('Chattanooga Whiskey Experimental Batch 030: Honey Infused',
  'Honeysuckle, ripe pear, cut hay and dried herbs',
  'Hot toddy and shortbread; wildflower honey over triple-distilled bourbon with heather and linden',
  'Sweet, herbal and soft');

SELECT pg_temp.fill_notes('Chattanooga Whiskey Experimental Single Barrel',
  'Baklava, allspice and chocolate banana bread',
  'Nutty richness from the malted dinkel wheat; honeyed pastry, anise and baking spice',
  'Sweet, toasted biscuit');

SELECT pg_temp.fill_notes('Elijah Craig Private Barrel',
  'Vanilla bean, caramel and toasted oak with a little dried fruit',
  'Rich brown sugar, baking spice, charred oak and sweet corn; single-barrel intensity',
  'Long and warm with lingering oak and spice');

SELECT pg_temp.fill_notes('Elijah Craig Small Batch Bourbon',
  'Vanilla bean, sweet fruit and fresh-cut oak',
  'Smooth and warm, pleasantly woody with accents of spice, smoke and nutmeg',
  'Long, sweet and slightly toasty');

SELECT pg_temp.fill_notes('Evan Williams Kentucky Straight Bourbon Whiskey',
  'Oak, brown sugar, vanilla and caramel',
  'Rich and sweet; caramel, vanilla and oak with a little rye spice',
  'Warm and sweet with soft oak');

SELECT pg_temp.fill_notes('Four Roses Small Batch Bourbon',
  'Mellow spice with ripe fruit, sweet oak and caramel',
  'Spicy and fruity; caramel, ripe berries and oak, creamy in the middle',
  'Long, soft and mellow with lingering sweetness');

SELECT pg_temp.fill_notes('Gramling Woods Checkerboard Bourbon Whiskey',
  'Sweet red corn, caramel and dark rye grain',
  'Smooth and sweet up front; corn sugar and vanilla with the black rye showing as pepper',
  'Spicy and warm at 122 proof');

SELECT pg_temp.fill_notes('Julius James Small Batch 100% Corn Whiskey',
  'Fresh sweet corn, vanilla and light oak',
  'Full-bodied and sweet; corn, honey and a little toasted oak from the square barrels',
  'Short to medium, clean and sweet');

SELECT pg_temp.fill_notes('OCD #5 Bourbon',
  'Wild and unique; honey graham cereal, root beer, blackberry jam and brown sugar',
  'Burnt sugar, heavy corn and smoky oak char with sharp rye spice building on the back',
  'Medium, with lingering heat, rye spice and burnt sugar');

SELECT pg_temp.fill_notes('Old Forester 86 Proof Kentucky Straight Bourbon Whiskey',
  'Sharp and sweet; floral, oak, vanilla and caramel',
  'Sweet and spicy; caramel, vanilla and oak with a rye edge',
  'Long and warm with a little smoke and spice');

SELECT pg_temp.fill_notes('Old Grand-Dad 114',
  'Rye spice, caramel and sweet corn',
  'Rich and bold; cinnamon, brown sugar, oak and peppery rye',
  'Long, hot and spicy');

SELECT pg_temp.fill_notes('Origin Series Bourbon',
  'Tangerine, vanilla and eggnog with apricot, orange blossom, mint and oak',
  'Smooth and round; coconut, toasted walnut and a dusting of anise, cinnamon and vanilla against rye spice',
  'Bold and lasting; vanilla, baking spice and a touch of sherry');

SELECT pg_temp.fill_notes('Red Eye Louie''s Whisquila',
  'Spiced caramel, roasted agave and toasted wood',
  'Rye grain and cinnamon up front, then agave earthiness and a light citrus edge',
  'Warm, round and dry with soft oak and lingering sweetness');

SELECT pg_temp.fill_notes('Russell''s Reserve 10 Year Kentucky Straight Bourbon Whiskey',
  'Vanilla, toffee, oak and dried fruit',
  'Rich and mellow; caramel, vanilla, sweet oak and gentle spice',
  'Long and smooth with sweet oak');

SELECT pg_temp.fill_notes('Savage & Cooke Cask Finished Bourbon',
  'Orange peel and honey with toasty oak, caramel and butterscotch',
  'Smooth and lush; vanilla bean, baking spice, maple and baked apple',
  'Long and warming; peppery spice with lingering caramel and dark fruit');

SELECT pg_temp.fill_notes('Sweetens Cove Kennessee',
  'Brown sugar, browned butter, butterscotch, vanilla bean and gingersnaps',
  'Butterscotch and cookies with a little fire; the texture of a good s''more, sweet with an echo of smoke',
  'Toasted sugar, dark vanilla bean and cigar wrapper');

SELECT pg_temp.fill_notes('Thirteenth Colony Southern Bourbon Whiskey',
  'Cherry wood, mulling spice, toasted oak, sweet corn and butter cookies',
  'Oak up front turning to caramel and warm cider; cornbread, toasted walnut and orange blossom honey',
  'Long and nutty, coating the mouth with sweet fruit, rich oak and peppery rye');

SELECT pg_temp.fill_notes('Woodford Reserve Kentucky Straight Bourbon Whiskey',
  'Rich dried fruit, hints of mint and orange with a dusting of cocoa, faint vanilla and tobacco spice',
  'Rich, chewy, rounded and smooth; complex citrus, cinnamon and cocoa with toffee, caramel and spice',
  'Silky, creamy and long with hints of toasted oak');

-- The three verified bottles whose notes live on the variant but had no `extras`.
UPDATE bottles SET extras = '{"blend":"59% bourbon / 41% Irish whiskey (4 yr triple-distilled pot still + 4 yr grain, both from refill American oak)","proof":"118 (59% ABV), cask strength","producer":"O''Shaughnessy Distilling Co., Minneapolis; master distiller Brian Nation (ex-Midleton)"}', updated_at = now()
WHERE name = 'Keeper''s Heart Irish + Bourbon Cask Strength' AND (extras IS NULL OR btrim(extras) = '');

UPDATE bottles SET extras = '{"style":"Flavored whiskey: bourbon and aged light whiskey blended with blackberries grown on the Huber farm","proof":"84 (42% ABV)","producer":"Huber''s Starlight Distillery, Borden, Indiana; Huber family on the land since 1843"}', updated_at = now()
WHERE name = 'Starlight Distillery Blackberry Flavored Whiskey' AND (extras IS NULL OR btrim(extras) = '');

UPDATE bottles SET extras = '{"mashbill":"Buffalo Trace wheated mash bill (corn, wheat, malted barley), the same recipe as Pappy Van Winkle","proof":"107 (53.5% ABV)","history":"W.L. Weller is the original wheated bourbon; Antique 107 is the higher-proof expression of the core line"}', updated_at = now()
WHERE name = 'W.L. Weller Antique 107' AND (extras IS NULL OR btrim(extras) = '');

-- Prove the requirement holds before committing: nothing user-visible may be blank.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM all_bottle_details
  WHERE attr_nose IS NULL OR btrim(attr_nose) = '' OR attr_palate IS NULL OR btrim(attr_palate) = ''
     OR attr_finish IS NULL OR btrim(attr_finish) = '' OR attr_extras IS NULL OR btrim(attr_extras) = '';
  IF n <> 0 THEN RAISE EXCEPTION 'still % bottles with a blank nose/palate/finish/extras', n; END IF;
END $$;

COMMIT;
