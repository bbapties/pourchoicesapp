---
name: clean-up-one-bottle
description: >-
  Take ONE unverified Pour Choices bottle and make its data trustworthy end to end - research
  and enrich every field, dedupe, validate or find the barcode, produce a shelf-ready
  transparent pack shot with a real height, file it all as pending suggested_edits for Brian's
  in-app review, then push the admins that it is waiting. One bottle per run, then stop. This
  is THE bottle data skill: it replaces verify-bottle + shelf-image (both now point here). Runs
  as the CLOUD routine "clean up one bottle" every hour at :15 (claude.ai/code/routines; the platform floor is one hour), gated by
  scripts/bot_gate.mjs so a tick with nothing to do exits in one call: a real user's new bottle
  is picked up on the next tick, everything else once per 6 idle hours, and an empty queue seeds
  a common bourbon we do not have. Also by hand when Brian says "clean up <bottle>",
  "verify <bottle>", or "do the next bottle".
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

Every script here reads `.env.local` in the repo root. On Brian's laptop it exists. In a cloud
run it does not; build it from the environment (the claude.ai Environment holds these as
variables), one `KEY=value` line each, and **stop and report if any is missing**. Do the
gate (Step 1) BEFORE `npm ci` and the pip install - a `none` tick must not pay for either:

```
DATABASE_URL  NEXT_PUBLIC_SUPABASE_URL  NEXT_PUBLIC_SUPABASE_ANON_KEY  SUPABASE_SERVICE_ROLE
NEXT_PUBLIC_VAPID_PUBLIC_KEY  VAPID_PRIVATE_KEY  VAPID_SUBJECT
```

Then, in this order:
```
node scripts/_psql.mjs "SELECT 1 AS ok;"           # if this fails, stop and report the error
node scripts/bot_gate.mjs                          # Step 1 - on "none", STOP here
npm ci --ignore-scripts                            # only for urgent / idle / seed
python -m pip install rembg onnxruntime pillow     # if this fails, continue without rembg (see 4)
```
(`scripts/_psql.mjs` and `bot_gate.mjs` need no npm install - they shell out to `psql`.)

`scripts/_psql.mjs` splits the URI itself — never pass `DATABASE_URL` straight to `psql`.
Never print `DATABASE_URL`, the service role, or VAPID private key anywhere.

## Step 1 — Ask the gate what this tick is for

Do not pick the bottle yourself. Run the gate; it applies Brian's rules (2026-09-19) and opens a
`bot_runs` row so the 6-hour idle clock works:

```
node scripts/bot_gate.mjs
```

One JSON line. Act on `mode`:

| `mode` | Meaning | What you do |
|---|---|---|
| `none` | A real user added nothing and idle work ran < 6 h ago. | **Stop. Report "nothing to do" in one line.** No other tool calls. |
| `urgent` | A real user (human, not admin) added `bottle` and nobody has looked at it. | Steps 2–8 on that bottle. This is the run that must be fast - it is what the user is waiting for. |
| `idle` | Idle work is due: `bottle` is the oldest unverified never-checked bottle (Brian's, a data account's), or a recheck-funnel bottle (`reason` names the gaps). | Steps 2–8 on that bottle. On a funnel bottle, work the listed gaps; do not re-litigate fields that are filled and verified. |
| `seed` | Idle work is due and the queue is empty. | **Seed mode** below, then Step 8. |

Keep `run_id`: Step 8 closes the row with it. Load the bottle row and every variant, and the
creator's own add-photo if there is one. Where the gate says `added_by`, that is who to thank in
the push (Step 7 handles it).

Manual runs ("clean up <bottle>"): skip the gate, work the named bottle, and open the row by hand
so the audit trail is complete:
`node scripts/_psql.mjs "INSERT INTO bot_runs (mode, bottle_id, runner, note) VALUES ('idle', '<id>', 'manual', 'Brian asked') RETURNING id;"`

**Last thing every non-seed run does, whatever it found**: stamp the clock, so the funnel moves on.
```sql
UPDATE public.bottles SET dq_checked_at = now() WHERE id = '<bottle_id>';
```
(Bookkeeping, not bottle data — the one direct write besides image uploads. Verify stamps it too.)

## Seed mode — the queue is empty, add a common bourbon

Brian (2026-09-19): if there is nothing to clean at the 6-hour check, add a common bourbon we do
not have yet, **inserted with all the cleansed data already**. This is the one mode that writes
`bottles` / `bottle_variants` directly - it is our own new row, no human's data is at stake, and
Brian's Verify in Review is still the sign-off (`verified = false`).

1. `node .claude/skills/clean-up-one-bottle/scripts/next_seed.mjs` → `{name, distillery}` (the
   first entry of `seed_bourbons.json` with no matching bottle), or `{"done":true}` - then
   report "seed list exhausted" and finish the run as `skipped`; extend the list in a later
   session, never invent a name.
2. Research it exactly as Steps 2–5 (identity → every field, barcode with the 5-rung ladder,
   pack shot **finished** and uploaded to `bottle-images/variants/<new uuid>/front.webp` - mint
   the variant id yourself with `uuidgen`/`crypto.randomUUID()` and use it in the path - height
   with `bottle_height_source`). Same bar as any other bottle: if you cannot meet the image bar,
   insert with no image and say so.
3. Write `bottle.json` in the shape `build_new_bottle_sql.mjs` documents, `created_by` = your
   account id, plus `bottle_height` / `bottle_height_source`, then:
   ```
   node .claude/skills/import-tasting/scripts/build_new_bottle_sql.mjs --unverified bottle.json seed.sql
   node .claude/skills/clean-up-one-bottle/scripts/run_sql_file.mjs seed.sql
   ```
   The builder's guards refuse a duplicate name or barcode - if one fires, the match is the
   bottle you should have been cleaning; stop and say so.
4. Stamp `dq_checked_at = now()` on the new bottle, then `node scripts/notify_admin_adds.mjs` so
   Brian's phone says a bottle was added. No `suggested_edits` - there is nothing to diff.

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
- **Nose / palate / finish: ALWAYS file all three.** Brian, 2026-09-16, overriding the old
  "single barrels get no notes" rule: a bottle with empty notes reads as unfinished. Order of
  preference: the producer's official notes for the expression; else the brand's sell-sheet /
  reputable retailer copy; else a **consensus** of 2-3 reputable reviews (Breaking Bourbon,
  Whiskey Shelf, Dramface, Whiskey Fool) distilled into the house style - one line each, comma
  lists, no reviewer's name, no scores. For a single barrel or store pick these are the LINE's
  typical profile, not this barrel's: say so in `extras` (`"notes_scope": "line profile; barrels
  vary"`). Never leave them blank.
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
only when rung 5 has been tried on real photos, not just rungs 1-4.

**When the ladder is exhausted**, the `dq_checked_at` stamp (end of run) is what records that a
real search happened: the gap stays visible in `bottle_dq_gaps`, the funnel brings it back in 6
months, and an empty barcode reads as "searched, not registered" rather than "nobody tried".
Optionally add the WHY to `extras` (`"barcode_note": "March-2026 release, producer shows a
mockup only"`) when it would save the next pass time. Many of Brian's adds are bottles he saw on
social media, not bottles he owns, so nobody can scan them.

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
| squat decanter | 230mm | Blanton's, Dickel single barrel |
| short / wide | 250-270mm | Maker's, Elijah Craig (all), 1792, Bulleit, Willett FE (240), Bib & Tucker (260), Booker's (270) |
| standard 750ml | 285-300mm | Jim Beam, Knob Creek, Larceny, Old Grand-Dad, Rittenhouse, Wild Turkey, Buffalo Trace / Weller / Stagg (300), Old Forester (298) |
| tall | 305-310mm | Woodford, Eagle Rare, Michter's, Old Elk, Horse Soldier |
| tallest | 315-320mm | E.H. Taylor, Four Roses, New Riff, Bowman, Russell's Reserve, Blade and Bow, Blue Run, Barrell, Frey Ranch, Pikesville, Angel's Envy, Basil Hayden |

**Use the brand's glass, not a flat 290.** The whole shelf is scaled from this number; a flat
default makes every bottle the same height and gives the illusion away (2026-09-16 pass: 145
variants re-judged by shape). Same bottle line = same height across its variants. Distributor
spec sheets (Sazerac / Heaven Hill / Beam / Brown-Forman trade portals) are the only real
`published` source and are not on the open web - do not burn a run searching for them.

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

Pushes every admin "<bottle> was cleaned up - tap to review and approve it", deep-linked into that bottle's case file in
Admin › Review; idempotent per group (an `events` row `bottle_cleanup_notified`). **So: anything filed later for
the same bottle - a follow-up, a correction, rows Brian asked for after the fact - gets a NEW
`submission_group` and its own push.** Adding rows to an already-notified group is silent, and
Brian only learns about it by accident (2026-09-16). If you
inserted a bottle (rare — a missing sibling), also run `node scripts/notify_admin_adds.mjs`.

## Step 8 — Report

Finish with a plain summary: bottle name + id · identity evidence used (photo / barcode / name
only) · `submission_group` · each field old → new · barcode + check-digit result + source ·
image (cut-out / white / **none**) and fill % · height + source · merge/delete recommended, if
any · anything unresolved. **Do not commit or push anything.** Brian approves in Admin › Review
and flips `verified` himself as sign-off.

Then close the run row - this is what the 6-hour idle clock reads:
```
node scripts/bot_gate.mjs --finish <run_id> filed|seeded|queue_empty|skipped|failed "<one line>"
```
A run that dies before this line leaves `finished_at` NULL; the gate still counts its
`started_at`, so a crash cannot make the bot run idle work every tick.

## Landmines (from the sweeps)
- Nov-2025 seed data is corrupt in places: whole notes crammed into `nose` as
  `"<nose>. Palate: <p>. Finish: <f>."`; ~27 bottles with no barcode; all images hotlinked, many
  dead. Re-derive everything.
- `post_reactions` makes PostgREST refuse a bare `users!inner` embed on `activities` — name the
  FK (`users!activities_user_id_fkey!inner`). Only matters if you read activities.
- `pg_safeupdate` is loaded for the API roles: a DB function called through RPC needs a WHERE on
  every UPDATE/DELETE. Irrelevant via psql, fatal via PostgREST.
- Test_User is QA noise; never spend a run on it.
