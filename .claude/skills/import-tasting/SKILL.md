---
name: import-tasting
description: Import a completed blind tasting straight into the database from a username plus the bottles in finishing order, skipping the app's UI while firing every real workflow (Elo, Social feed, star-guess cleanup, telemetry). Researches every bottle first, then shows Brian a confirmation sheet with embedded images and the exact field values in placement order; on his yes it inserts any missing bottle, optionally enriches an existing thin one, and runs the session. Use when Brian says "import a tasting", "log a tasting for <user>", or hands over a result list of bottle names in order.
---

# import-tasting

Brian ran a real tasting away from his phone. He has a **username** and a **list of bottle
names in finishing order, winner first**. This skill turns that into a genuine tasting session
in the database — the same rows the app would have written, firing the same triggers — so the
result counts without anyone re-typing it into the UI.

**This exists to skip the data entry, not the correctness.** The UI path is already tested; what
this replaces is the typing. Everything the app does on save still happens.

## The one rule

**Nothing is written until Brian has looked at the bottle images and said yes.** Names are
ambiguous — "Weller 12", "makers mark", "Blanton's" — and a wrong bottle silently corrupts both
a personal ranking and the global Elo. The confirmation sheet exists so he confirms with his
eyes, not by re-reading a name he already typed.

Two corollaries, both learned the hard way on 2026-09-06:

- **Research first, confirm second.** If a bottle is missing, do the research *before* the sheet
  and put the researched values **on** the sheet. Brian's ask, verbatim: *"populate the info that
  we would be inserting, so that when you provide me that html, it would have already had the
  researched info for me to confirm."* Confirming a name and then inserting facts he never saw
  is not a confirmation.
- **Embed every image as a `data:` URI.** The sheet is delivered through `SendUserFile` into a
  viewer that does not load remote images. A sheet of broken `<img>` tags defeats the entire
  step. `resolve_lineup.mjs` now inlines them automatically; **any supplementary sheet you
  hand-write must do the same.**
- **Composite transparency onto WHITE when you embed it.** Bottle images are transparent by
  design (`clean_image.py` isolates the bottle), and PIL's `.convert("RGB")` flattens alpha onto
  **black** — so a correct, clear asset renders as a bottle on a black slab and reads as a
  botched image. Use `Image.alpha_composite` over a white layer instead. This cost a round-trip
  on 2026-09-06: Brian asked why the images had black backgrounds; they did not, the preview
  did.

---

## The pipeline

### 1. Resolve the lineup

```
node .claude/skills/import-tasting/scripts/resolve_lineup.mjs \
  --user "<username or email>" --out <scratchpad-dir> [--name "<session label>"] \
  "1st place bottle" "2nd place bottle" ...
```

Read-only. Writes `lineup.json` (machine-readable) and `confirm.html` (the contact sheet), and
prints a per-place summary. It flags, and you must resolve, all of:

| flag | meaning |
|---|---|
| `*** NOT FOUND ***` | no candidate scored high enough — go to step 3a |
| `AMBIGUOUS` | the top two candidates are within 0.08 — ask Brian which one |
| `DUPLICATE of place N` | two names resolved to the same variant — one of them is wrong |
| `unverified` | the bottle exists but nobody has signed off on its data |
| `NO IMAGE` | there is nothing to show on the sheet, so Brian cannot confirm it visually |

The matcher blends token overlap, character bigrams and the distillery column, then applies two
hard penalties that exist because of real failures: a number in the query that the candidate
lacks (**"Weller 12" must not match "Weller 107"**), and no non-numeric word matching at all
(**"Weller 12 Year" scored 0.46 against "Coureur des Bois Excellence 12 Year Maple Whisky"** on
the shared age statement alone before that penalty went in). Apostrophes are stripped, so
`blantons` finds `Blanton's`.

### 2. Research anything the sheet cannot yet show

Do this **before** showing Brian anything, so the sheet carries real values rather than a name.
Two cases:

- **`*** NOT FOUND ***`** — research the bottle fully (step 3a) and build its `bottle.json`, but
  **do not run the insert yet**. The confirmation sheet quotes that JSON.
- **an existing bottle whose row is thin or wrong** — a hotlinked image, a bad crop, empty
  fields. Research the replacement values and show them as a proposed *update* (step 3b).

Uploading a cleaned image to Storage before confirmation is fine and expected: a file no row
points at is inert, and the sheet needs to show the image Brian is actually approving. **DB rows
are what waits for the yes.**

### 3. Show Brian the sheet and wait

Send the sheet with `SendUserFile` (`display: "render"`). It lays the bottles out in finishing
order with their images, what he typed, the match confidence, and any flags. When step 2 found
work to do, the sheet must **also** show, per bottle: NEW-vs-EXISTING, every field that would be
written, and every field being left `NULL` **with the reason** — an empty cell reads as an
oversight, `"no verifiable UPC exists for this discontinued release"` reads as a decision.

**Then stop and wait for an explicit yes.** Do not proceed on silence, and do not proceed on
"looks good" for a sheet that still carries a NOT FOUND or DUPLICATE flag.

### 3a. Researching and inserting a missing bottle

A tasting cannot be imported around a bottle that does not exist — the pairing would vanish and
the placement with it. So the missing bottle gets created properly, first.

**This lane inserts directly and `verified = true`, unlike the `verify-bottle` skill, which
files pending `suggested_edits`.** That difference is deliberate: `verify-bottle` cleans up
bottles that already exist, where the review queue is the right audit trail and there is no
hurry. Here, Brian is on screen approving this exact bottle's data as part of approving the
tasting — routing it through a queue would only ask him to review data he just signed off on.
**Never run this path without that confirmation, and never for a bottle that already exists.**

Do the research the same way `verify-bottle` does — it is the reference for all of this:

1. **Facts** — proof/ABV, age, distillery, category/style, volume, mashbill (`extras`), official
   tasting notes. Prefer the distillery's own site.
2. **Barcode** — the real 750ml UPC-A/EAN-13. `build_new_bottle_sql.mjs` validates the check
   digit and refuses a bad one; a wrong barcode is worse than none, because the scanner would
   resolve to this bottle forever.
3. **Image** — source the official brand asset, then:
   ```
   python .claude/skills/verify-bottle/scripts/clean_image.py <in> <out.webp> [--crop L,T,R,B]
   node  .claude/skills/verify-bottle/scripts/upload_image.mjs <out.webp> bottle-images bottles/<slug>/front.webp
   ```
   Always `.webp` — Supabase Storage is metered and the project is on the free tier. Expect
   40–150 KB. Never hotlink a brand URL.
4. **Insert** — write a `bottle.json` (shape documented at the top of the script) and:
   ```
   node .claude/skills/import-tasting/scripts/build_new_bottle_sql.mjs <bottle.json> <out.sql>
   node .claude/skills/verify-bottle/scripts/run_sql_file.mjs <out.sql>
   ```
   It creates the bottle **and its default variant** (`is_default = true`, without which
   `elo_global_target()` cannot resolve and the bottle can never be scored), plus the
   `added_to_db` activity and a `bottle_submitted` event. Two in-SQL guards abort the
   transaction rather than create a duplicate: same name (case- and whitespace-insensitive) and
   barcode already in use.

Then **re-run step 1** so the new bottle resolves.

### 3b. Enriching a bottle that already exists ("the upsert half")

A tasting only needs the bottle to *exist* — but a bottle Brian is looking at on the sheet is a
bottle whose flaws he can see, and fixing them there beats filing a ticket he will read cold.
Scope it to what he approved and nothing more.

- **Only after he asks.** Do not silently improve rows; show the flaw on the sheet and let him
  call it. On 2026-09-06 he did, in the same breath as the go: *"treat these 2 bottles as
  upserts."*
- **Guard on the variant id**, and `RAISE EXCEPTION` if it is missing, so a stale id updates
  nothing instead of the wrong row.
- **Preserve what you replace.** Write the old value into `bottles.extras`
  (`previous_frontimage_url`, plus an `image_source` / `tasting_notes_source`) so the change is
  reversible without a snapshot.
- **Never clobber.** `COALESCE(NULLIF(col,''), '<new>')` fills only what is genuinely empty.
  This is not paranoia: the Larceny row *looked* empty because the check had read
  `bottles.nose`, and the real notes were on the **variant**. The COALESCE is the only reason
  they survived.
- **Leave `verified` alone.** Signing a whole row off is the `verify-bottle` lane. Brian
  approving one image is not approving the row.
- Emit a `bottle_enriched` event (`surface: agent_import`) naming the fields touched.

There is no generator for this — write the `UPDATE` by hand, read it, and run it through
`run_sql_file.mjs`. The Larceny update of 2026-09-06 is the reference shape.

### 4. Build the tasting SQL

```
node .claude/skills/import-tasting/scripts/build_tasting_sql.mjs \
  <lineup.json> <out.sql> [--at "2026-09-01T19:30:00Z"]
```

`--at` backdates the whole session for a tasting that happened earlier. The generator **refuses**
to emit anything for an unresolved or duplicated pick, so a skipped confirmation cannot become a
corrupt import.

Read the file. It is meant to be read — it opens with the finishing order in comments, and every
statement says why it is there.

### 5. Run it

```
node .claude/skills/verify-bottle/scripts/run_sql_file.mjs <out.sql>
```

One transaction. It ends by printing the session id and the resulting personal + global Elo for
each bottle, so the run verifies itself. Show Brian that table.

**To rehearse without writing anything**, copy the file with `COMMIT;` replaced by `ROLLBACK;`
and run that first. The read-back still prints, so you see exactly what the Elo trigger would do.
This is how the skill was developed and it is worth doing for any import that matters.

---

## What the SQL replicates, and why each piece matters

Elo scoring is a database trigger, so inserting `tasting_results` scores the session by itself.
But `src/lib/tastings.ts` does three more things **client-side**, and an import that skipped them
would leave the user in a state the UI can never produce:

| | what | why it cannot be dropped |
|---|---|---|
| 1 | all pairs in **one** `INSERT` | `trig_update_elo_after_session` is `FOR EACH STATEMENT`. Row-at-a-time would score the session once per pair, each pass reading the last pass's ratings. |
| 2 | delete `user_ratings` for those variants | B-47 — a real blind tasting supersedes a manual star guess. Leave it and the bottle shows a stale guess next to a real score. |
| 3 | one `tasted` activity, anchored on the winner | B-51 — this is what puts the tasting on the Social feed and in the per-variant history. |

Plus one thing the app does *not* do: a `tasting_imported` event (`surface: agent_import`)
recording that the session arrived by import, so nobody later reads it as organic usage.
Registered in [TELEMETRY.md](../../../TELEMETRY.md).

### Two deliberate omissions

- **`glass_letter` / `pour_index` stay NULL.** An import supplies the *result*, not the order the
  glasses were poured in. Inventing letters would fabricate data that reads as real. (Board #11
  added those columns for sessions recorded through the app.)
- **`mode` is `'self'`, not `'import'`.** Nothing reads the column today, and inventing a third
  value is exactly what a later `switch` trips over. Provenance lives in the events row.

---

## Schema gotchas that have already cost a round-trip

The column names are not the ones you would guess, and a wrong guess costs a failed query
mid-confirmation. All verified against prod on 2026-09-06:

| you will write | it is actually |
|---|---|
| `bottle_variants.bottle_id` | **`bottles_id`** |
| `tasting_details.session_id` | **`tasting_session_id`** (same for `tasting_results`) |

And one that fails **silently**, which is worse:

- **`nose` / `palate` / `finish` exist on BOTH `bottles` and `bottle_variants`.** The variant is
  where the real data lives. Selecting `b.nose` returns blank and makes a populated bottle look
  empty — that is exactly how the Larceny row nearly got overwritten. **Always read `v.*`.**
- `volume` and `barcode` are on **`bottles`**; `proof`, `age`, `frontimage_url`, `is_default`
  and `elo_global` are on **`bottle_variants`**. Both tables have `verified` and `elo_global`.
- `information_schema.columns` filtered by `table_name` alone returns every schema's copy —
  four duplicates of each row. Add `AND table_schema='public'` or just read the join that fails.

## When one barcode covers several releases

Before writing any barcode, **check whether it is release-level or line-level.** Pull the same
product from two or three Shopify retailers — `curl <product-url>.json` exposes the real
`barcode` field — and check a *neighbouring* release too. If the code repeats across releases,
it identifies the **line**, not the bottle.

That is not a reason to discard it. It is a reason to model the line correctly:

> **the series is the `bottle` (and carries the barcode) · each release is a `bottle_variant`**

`bottles.barcode` is already bottle-level and `lookupBottleByBarcode()` deliberately resolves a
scan to the bottle and lets the user pick the variant — see the comment in `src/lib/barcode.ts`.
So this shape makes a shared UPC *correct* instead of dangerous. Put the release number in
`bottle_variants.batch` (`'#5'`), the year in `release_year`, and the per-release proof, blend
and image on the variant.

Worked example, 2026-09-06: `857552008028` came back identical for Bardstown Fusion #5, #6 and
#9 across five retailers. The bottle was **renamed** from the single release to the series and
the releases became variants — renamed, not replaced, because the original variant already
carried a tasting and a new bottle would have orphaned the session. Elo is unaffected:
`elo_global_target()` only redirects **store picks** to the default variant, so each release
keeps its own global score. Choosing which release is `is_default` is cosmetic.

**Two useful sanity checks on the images while you are here.** Each Fusion render prints its own
proof on the label, so the picture verifies the number you scraped. And Bardstown's own #9 page
serves the **#8** render — so #9 was left with no image rather than a mislabelled one. A picture
of the wrong release is the same failure as the shared barcode: confidently wrong.

## When research comes up empty

Not every bottle is documented. A limited or discontinued release often has **no public UPC at
all**, and plenty of distilleries publish no tasting notes.

**Leave the field NULL and say why on the sheet.** A guessed barcode is permanently worse than
none — the scanner would resolve to that bottle forever. A reviewer's tasting notes are someone
else's copyrighted prose and would sit in the row looking official. Record the reason in
`extras` (`barcode_note`, `tasting_notes_note`) so the next agent does not re-run the same dead
search. Bardstown Fusion #5 shipped this way and it was the right call.

Prefer the distillery's own site for everything, and **read the label in the image you just
downloaded** — it is the most reliable proof/ABV source there is, and it costs one `Read`.

## Guardrails

- **`public.users.id` is not `auth.users.id`.** Every person-column references the public id
  (B-74, enforced by FK). `resolve_lineup.mjs` resolves the username to the right one; do not
  hand-write ids.
- **Confirm the account before importing.** `resolve_lineup.mjs` prints `account_type`. A
  `test` / `data` account is excluded from the Social feed by design — if Brian meant a real
  user and you are about to write to a bot account, say so.
- **Never push straight past a flag.** Every flag in step 1 exists because the alternative is
  silently wrong data in two Elo scales.
- **Do not use this to re-import a session that already exists.** `ON CONFLICT DO NOTHING` stops
  the *same* session double-scoring, but a *second* session over the same bottles is a second
  real tasting and will move the scores again.
- Read `AGENTS.md` guardrails; ask before anything destructive.

## Definition of done

One `tasting_sessions` row · one `tasting_details` row per bottle carrying its rank · every
pairwise `tasting_results` row inserted in a single statement · personal and global Elo moved by
the trigger · stale star guesses cleared · one `tasted` activity on the feed · one
`tasting_imported` event — and the read-back table shown to Brian.
