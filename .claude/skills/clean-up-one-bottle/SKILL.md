---
name: clean-up-one-bottle
description: >-
  Take ONE unverified Pour Choices bottle and make its data trustworthy end to end - research
  and enrich every field, dedupe, validate or find the barcode, produce a shelf-ready
  transparent pack shot with a real height, file it all as pending suggested_edits for Brian's
  in-app review, then push the admins that it is waiting. One bottle per run, then stop. This
  is THE bottle data skill: it replaces verify-bottle + shelf-image (both now point here). Runs
  as the desktop app's local scheduled task "clean up one bottle" every 4 hours (on Brian's
  machine, so .env.local is already there), and by hand when Brian
  says "clean up <bottle>", "verify <bottle>", or "do the next bottle".
---

# clean-up-one-bottle

One unverified bottle in, one reviewable clean-up out. **Review-gated, not direct**: every
change is a `status='pending'` row in `public.suggested_edits`, one `submission_group` per
bottle, and Brian approves in **Admin › Review**. The only direct writes are image files into
the `bottle-images` bucket. Never write `bottles` / `bottle_variants`, never flip `verified`
or `shelf_ready`. Read `AGENTS.md` guardrails first.

Brian reviews once. An image or field that needs reject → rework burns a second pass, so the
whole skill is arranged to **finish the work before filing anything**.

## Step 0 — Setup (a fresh checkout has none of this)

Every script here reads `.env.local` in the repo root. On this laptop it exists. In a cloud run
it does not; build it from the environment, one `KEY=value` line each, and **stop and report if
any is missing**:

```
DATABASE_URL  NEXT_PUBLIC_SUPABASE_URL  NEXT_PUBLIC_SUPABASE_ANON_KEY  SUPABASE_SERVICE_ROLE
NEXT_PUBLIC_VAPID_PUBLIC_KEY  VAPID_PRIVATE_KEY  VAPID_SUBJECT
```

Then:
```
npm ci --ignore-scripts
python -m pip install rembg onnxruntime pillow     # if this fails, continue without rembg (see 4)
node scripts/_psql.mjs "SELECT 1 AS ok;"           # if this fails, stop and report the error
```

`scripts/_psql.mjs` splits the URI itself — never pass `DATABASE_URL` straight to `psql`.
Never print `DATABASE_URL`, the service role, or VAPID private key anywhere.

## Step 1 — Pick the bottle

```sql
SELECT b.id, b.name, b.barcode, b.created_at, u.username, u.account_type
  FROM public.bottles b
  LEFT JOIN public.users u ON u.id = b.created_by
 WHERE b.verified = false
   AND NOT EXISTS (SELECT 1 FROM public.suggested_edits se
                    WHERE se.bottle_id = b.id AND se.status = 'pending')
   AND COALESCE(u.username, '') <> 'Test_User'
 ORDER BY b.created_at
 LIMIT 1;
```

Oldest first; a bottle with pending suggestions is already in Brian's queue and is skipped
until he clears it. **If nothing comes back, report "queue empty" and stop.** Load the bottle
row and every variant (`bottle_variants WHERE bottles_id = <id>`), and the creator's own
add-photo if there is one (`bottles.frontimage_url` / the default variant's `frontimage_url`
pointing at `bottle-images/...`).

## Ownership / ids

`public.users.id` is NOT `auth.users.id`. **Every** person-column references `public.users.id`
(B-74, FK-enforced). `submitted_by` = **your own** account:

| account | `public.users.id` |
|---|---|
| `Claude Code Agent` (`claude@`) — this skill's scheduled runs | `7063602c-1604-4d04-aa59-2b74fdd5af6d` |
| `Grain_of_Truth` (`grainoftruth@`) — Grok's data bot | `41b59766-2ab4-45ed-95a7-01467cde8146` |
| `The_Lake_House` (Brian, sole admin) | `7878be89-18a5-4043-a2da-be308b93ab05` |

## Step 2 — Identity, then research

**Identity first.** When the bottle was added through the app, the creator's **photo and
barcode** are the evidence of what it is; the typed name is a hint. Read the label (expression,
age, proof, mashbill call-outs), validate the barcode and look up what it maps to. Photo and
barcode agree → that product is what you clean up, and you correct the name if it was typed as
a sibling ("Heaven Hill 4 Grain" typed, BIB on the label and the UPC → it is the BIB). Photo and
barcode disagree → **stop and report the conflict, do not guess.** No photo and no usable
barcode → fall back to the name and say the identity is weak. Never invent a bottle.

**Never trust existing field data** — re-derive from research. Pull real facts (WebSearch /
WebFetch): proof + ABV, age, mashbill, volume, distillery, category/style, official tasting
notes (distillery's own site first, then the brand's sell sheet or a reputable retailer's copy
for this exact expression). Mashbill etc. go in `extras` (JSON-as-text).

- **Age (`bottle_variants.age`): always file it.** Years as a number, never months and never
  "N years, M months" (18 months → `1.5 years`; 2 years 4 months → `2.3 years`).
  No statement after a real search → `NAS`. Never blank.
- **Nose / palate / finish: always research; file all three when a reliable source exists.**
  Skipping them because they were not on the label is a miss. **Exception:** single barrels and
  store picks get NO brand-level notes — every barrel differs, so copied notes are fabrication;
  empty is the honest outcome there.
- Correct name / distillery / category / style / volume as identity → `bottles`.

### Field → table routing (matches `src/lib/suggestedEdits.ts`)
- **identity → `bottles`:** name, distillery, category, style, volume, barcode, extras
- **variant → `bottle_variants`:** proof, age, nose, palate, finish, batch, release_year,
  frontimage_url, backimage_url, bottle_height, bottle_height_source

Emit one row per field whose researched value differs (`old_value` = current, `new_value` =
researched). Images live **on the variant** — never also file `bottles.frontimage_url`.

## Step 3 — Dedupe and barcode

**Dedupe:** same name, or same distillery + overlapping name. A true duplicate → one
`field='__merge__'` row (`bottle_id` = loser, `old_value` = loser id, `new_value` = keeper id;
keeper = the row with a valid barcode and/or in a real user's `user_bottles`). Pure junk →
`field='__delete__'`, `new_value` = reason. Never delete rows yourself. Judgement pairs live on:
Blanton's Original vs Single Barrel; Wild Turkey 101 vs 101 8-Year.

**Barcode — REQUIRED OUTPUT.** Every run ends with either a `barcode` suggestion or a report line
listing every source below that was checked with no hit. "None found" after Total Wine and a web
search is not an answer (the first two runs, 2026-09-15, both stopped there). Small-distillery
bottles are the ones that need the ladder.

Present → validate UPC-A(12) / EAN-13(13) check digit, confirm by research it maps to THIS
product and size, enforce uniqueness across `bottles`; wrong → file a `barcode` row. Missing →
walk this ladder IN ORDER and stop at the first confirmed hit:

1. **The producer's own web shop.** Most craft distilleries are on Shopify: fetch
   `https://<shop>/products/<handle>.json` — `product.variants[].barcode` is the UPC, and
   `/products.json` lists every handle. Non-Shopify shops often print the UPC/SKU on the product page.
2. **Retailers that expose the UPC in the page:** Total Wine (JSON-LD `gtin`), Wine.com, Drizly /
   Uber Eats, ReserveBar, Caskers, Seelbach's, Flaviar. Search `"<bottle name>" upc` and open the
   product page; look for `gtin`, `upc`, `barcode`, or a 12/13-digit number near the SKU.
3. **State control boards publish UPCs:** Virginia ABC product search, Pennsylvania (FWGS)
   product code page, North Carolina ABC pricing, Ohio OHLQ, Michigan price book, Utah DABS,
   New Hampshire NHLC, Oregon OLCC price list — any one is a confirmed UPC for the 750ml.
4. **Barcode databases:** upcitemdb.com, barcodelookup.com, go-upc.com, upcindex.com — search by
   name; confirm the listing's name + size match.
5. **Read it off a photo yourself.** Any photo that shows the back label is a source:
   the creator's add-photo, retailer gallery shots (Total Wine, Caskers, Seelbach's often have a
   back-label image), auction listings (Unicorn Auctions, Whisky Auctioneer, Whisky Hammer),
   eBay / Mercari listings, reddit r/bourbon "back label" posts, the producer's press kit.
   Search `"<bottle name>" back label` and `"<bottle name>" barcode` in images, download the
   candidates, and decode them:
   ```
   python .claude/skills/clean-up-one-bottle/scripts/read_barcode.py <image-or-url> [more...]
   ```
   It tries rotations, upscales and crops, prints `UPCA <digits> check=ok` for anything it
   reads, and exits 1 if nothing decodes. A decoded code still needs the sanity check: prefix
   matches the producer's other bottles where known, size is 750ml, and it is not already on a
   different bottle in `bottles`. Two independent photos agreeing is a confirmed barcode.

Validate whatever you find (check digit + name + 750ml), then file it. The ladder is exhausted
only when rung 5 has been tried on real photos, not just rungs 1-4. **Batch and allocated
releases share one UPC across batches by design** (Elijah Craig BP `096749002368` on 4 batches;
Stagg `088004018580` on every batch) — not an error, do not invent a unique code. Every report
states: barcode, check-digit pass/fail, source URL — or the rung-by-rung list of misses.

## Step 4 — The pack shot (finish it BEFORE filing anything)

Canonical doc: **`docs/IMAGE_PIPELINE.md`** — read it. The shelf needs a real transparent
cut-out, trimmed tight, scaled by a real height. A white box on the shelf is the failure the
whole review flow exists to prevent.

**The bar (Brian, 2026-09-12):** a true no-background cut-out of the actual full bottle, standing,
cap and base intact, **filling 90–97% of the image height**, small even margins, no stretch.
**One `frontimage_url` row per group**, on the default variant, and only the FINAL image. Never
a draft, never "for now".

**Accept, in order:**
1. a true transparent cut-out of this exact product;
2. an isolated pack shot on plain white that meets the bar after cut-out;
3. an official distillery product photo that meets the bar after cut-out;
4. nothing qualifies → **file no image and say so.**

**Never file:** the creator's add-photo (identity evidence only), busy or lifestyle backgrounds,
padded / zoomed-out CDN URLs, logos, thumbnails, label-only crops, a sibling expression, or more
than one image row.

**How:**
1. **Try the cheap fix first.** A stored URL through **wsrv.nl** with `&bg=white&output=jpg` is a
   transparent PNG flattened onto white; drop those two parameters, ask for `output=png`, and the
   cut-out comes back. `node scripts/shelf_image.mjs <variantId> <sourceUrl>` does this
   (`unflatten()`), then trims, downsizes, uploads and **prints** the SQL — it writes nothing.
   Exit code 2 = the source is opaque; **do not crop-rescue it**, move to a better source.
2. **Source the best official brand asset.** Search the brand's own site (many are Shopify —
   read the real `<img>`/`srcset`, pull a `_2048x` size); marketing text beside the bottle is fine
   because rembg isolates the glass. Do not just reuse the stored URL — many are dead.
3. **Clean:** `python .claude/skills/clean-up-one-bottle/scripts/clean_image.py <in> <out.webp>
   [--crop L,T,R,B]` — rembg isolates the bottle from ANY background, then tight-trims and centres
   on transparency; already-transparent inputs skip rembg; `--crop` (source px) first to drop
   flanking text. Output is **WebP q82, 1200px long edge, 40–150 KB**; it warns above 250 KB —
   if it warns, fix the source, do not upload. Without rembg (cloud pip failed) you may only use
   sources that are already transparent (step 1) — an opaque source gets no image.
4. **Upload:** `node .claude/skills/clean-up-one-bottle/scripts/upload_image.mjs <out.webp>
   bottle-images variants/<variant_id>/front.webp` (from repo root; prints the public URL).
   Self-host always — third-party URLs expire or grow watermarks.
5. Only now: the single `frontimage_url` row → that URL.

**Store picks / private barrels** have no official packshot. Shelf = the brand's standard
packshot as a stand-in (say so in the report so Brian can reject it); detail page = the
owner's own photo, rembg'd, as `backimage_url`. **Never composite the label onto a stock bottle.**

## Step 5 — Height (with every image, always both columns)

`bottle_height` = **millimetres of real glass**; 12in (305mm) is ratio 1. `bottle_height_source`
= `measured` / `published` / `estimated` — **a height without a source is rejected by a CHECK
constraint.** File both as `bottle_variants` rows on every variant that gets an image.

Most bottles publish no height. **Do not stall on it**: use the form-factor default for the
bottle's CLASS and record `estimated` (that IS the re-research queue). **Never derive height
from the image's aspect ratio** — it put Knob Creek at 230mm when it is wide AND 11.5in.

| class | default | e.g. |
|---|---|---|
| squat decanter | 230mm | Blanton's |
| standard 750ml | 290mm | most bourbon |
| tall / slim | 315mm | many single malts |

## Step 6 — File it

One `submission_group` (a fresh UUID), every row `status='pending'`, `submitted_by` = your
account id, `target_table` ∈ {`bottles`,`bottle_variants`}, `target_id` the row, `field`,
`old_value`, `new_value`. Write it as ONE reviewable `.sql` file and run it transactionally:

```
node .claude/skills/clean-up-one-bottle/scripts/run_sql_file.mjs <file.sql>
```

(That helper snapshots and wraps in a transaction. Ad-hoc reads: `node scripts/_psql.mjs "<sql>"`.)

## Step 7 — Tell Brian (this is the "create" moment)

A clean-up must announce itself the way a bottle add does, so Brian hears it on his phone
instead of finding it days later. **Last step of every run that filed something:**

```
node scripts/notify_admin_cleanup.mjs <bottle_id> <submission_group>
```

Pushes every admin "Cleaned up <bottle>: N suggestions waiting for your review", deep-linked to
Admin › Review; idempotent per group (an `events` row `bottle_cleanup_notified`). If you
inserted a bottle (rare — a missing sibling), also run `node scripts/notify_admin_adds.mjs`.

## Step 8 — Report

Finish with a plain summary: bottle name + id · identity evidence used (photo / barcode / name
only) · `submission_group` · each field old → new · barcode + check-digit result + source ·
image (cut-out / white / **none**) and fill % · height + source · merge/delete recommended, if
any · anything unresolved. **Do not commit or push anything.** Brian approves in Admin › Review
and flips `verified` himself as sign-off.

## Landmines (from the sweeps)
- Nov-2025 seed data is corrupt in places: whole notes crammed into `nose` as
  `"<nose>. Palate: <p>. Finish: <f>."`; ~27 bottles with no barcode; all images hotlinked, many
  dead. Re-derive everything.
- `post_reactions` makes PostgREST refuse a bare `users!inner` embed on `activities` — name the
  FK (`users!activities_user_id_fkey!inner`). Only matters if you read activities.
- `pg_safeupdate` is loaded for the API roles: a DB function called through RPC needs a WHERE on
  every UPDATE/DELETE. Irrelevant via psql, fatal via PostgREST.
- Test_User is QA noise; never spend a run on it.
