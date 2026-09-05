---
name: verify-bottle
description: Verify a Pour Choices bottle end-to-end — research & enrich real data, dedupe rows, validate/add the barcode, self-host a clean product image — and file it all as pending suggested_edits for Brian's in-app review. Use when Brian says "verify <bottle>", "verify the next bottle", or works the bottle data-cleanup lane.
---

# verify-bottle

Turns one **unverified** bottle into clean, trustworthy data — but instead of writing the live tables directly, it files every change as a **pending `suggested_edits` row for Brian to review and approve in the app**. This is the data-only lane (runs parallel to Grok's code lane by Brian's explicit OK — the lanes don't overlap). Read `AGENTS.md` guardrails first.

## Golden rules
- **Review-gated, not direct.** All changes are inserted as `status='pending'` `suggested_edits` rows, grouped by one `submission_group` UUID per bottle. Brian approves in the admin queue; the app applies them. Do NOT write `bottles`/`bottle_variants` directly (the Buffalo Trace pilot on 2026-08-27 was the one-time exception).
- **Stamp `submitted_by` with YOUR OWN account's `public.users.id`**, so the queue shows who actually submitted. See the id table below. Do not hardcode another agent's id.
- **Never trust existing field data** — the Nov-2025 seed import is full of corruption (see Known landmines). Re-derive from research.
- **The `verified` flip is Brian's, not ours.** Approving suggestions does not set `verified`. Brian flips `verified=true` as his explicit sign-off after reviewing a bottle.
- Bottle data lives on TWO tables: `bottles` (identity) and `bottle_variants` (per-release: proof, age, notes, images; `bottles_id` FK). Route each field to the right one.
- SQL: read-only via repo `scripts/_psql.mjs`; inserts via the bundled `scripts/run_sql_file.mjs` (snapshots + transactional; run from repo root so `.env.local` resolves).

## Ownership / ids (important)

`public.users.id` is NOT `auth.users.id` -- they are unrelated UUIDs for the same person, linked by
`users.auth_id`.

**As of 2026-09-05 (B-74), EVERY person-column in the schema references `public.users.id`**, enforced
by foreign keys. That includes `bottles.created_by/updated_by` and
`bottle_variants.created_by/updated_by`, which used to reference `auth.users` -- **this doc said so
until B-74 shipped, and it is now wrong.** Writing an auth id into any of them is rejected by the
foreign key, so a suggestion or insert carrying one will fail outright.

**Always use the `public.users.id` column below. Never `auth.users.id`.**

| account | `public.users.id` (USE THIS) | role |
|---|---|---|
| `Grain_of_Truth` (`grainoftruth@`) | `41b59766-2ab4-45ed-95a7-01467cde8146` | **the Grok data bot** -- runs this skill on a schedule |
| `Claude Code Agent` (`claude@`) | `7063602c-1604-4d04-aa59-2b74fdd5af6d` | Claude QA |
| `GrokBuildAdmin` (`grokbuild@`) | `121de2bf-fbef-4665-9d62-699ed557dc0c` | Grok QA |
| `The_Lake_House` (Brian) | `7878be89-18a5-4043-a2da-be308b93ab05` | sole admin |
| `PourChoicesOG` | `dbaf1f8d-232b-4491-a17e-e7bb1fbdbf19` | user |

Auth ids are deliberately not listed: there is no longer any column that wants one.

## Field → target table routing (matches src/lib/suggestedEdits.ts)
- **identity → `bottles`**: name, distillery, category, style, volume, **barcode**, **extras**
- **variant → `bottle_variants`**: proof, age, nose, palate, finish, batch, release_year, frontimage_url, backimage_url

`barcode` and `extras` are not yet first-class in the app's editable-field UI — file them anyway (the generic mechanism carries them); see QUEUE_SPEC.md for the Grok work to label them nicely.

## The pipeline (each step emits pending suggestions)

### 1. Research & enrich
Pull real facts (WebSearch/WebFetch): proof+ABV, age, mashbill/grain bill, volume, distillery, official tasting notes (prefer the distillery's own site/CMS). For each field whose verified value differs from the current value, emit a suggestion (old_value = current, new_value = verified). Correct category/style/name. Put mashbill etc. in `extras` (JSON-as-text).

### 2. Dedupe → suggested delete/merge
Find duplicate/near-duplicate rows (same name, or same distillery + overlapping name). If a true duplicate exists, file a **suggested merge** (keeper = the row with a valid barcode and/or one in a real user's `user_bottles`): encode as a `suggested_edits` row with `field='__merge__'`, `bottle_id=` loser, `old_value=` loser id, `new_value=` keeper id. For a pure junk row, file `field='__delete__'`, `new_value=` reason. These render as "Suggested merge/delete" and are applied by the handler described in QUEUE_SPEC.md (Grok). Never delete rows directly.

### 3. Barcode
- Present: validate numeric UPC-A(12)/EAN-13(13) + correct check digit, confirm via research it maps to THIS product + size, enforce uniqueness across `bottles`. If wrong, emit a `barcode` suggestion.
- Missing: research the real 750ml UPC, emit a `barcode` suggestion.
- Batch/allocated releases legitimately share one UPC across batches (e.g. Elijah Craig Barrel Proof: `096749002368` on 4 batches) — not an error; scan maps to the product line, user picks the variant. Note it; don't invent a unique code.

### 4. Image (self-host — no hotlinks)

> **Storage budget -- always output `.webp`.** Supabase Storage is metered and this project is
> on the **free tier**, so every oversized upload is real money. `clean_image.py` now downscales
> to **1200px on the long edge** and encodes **WebP q82**, matching `src/lib/compressImage.ts`
> so bot-uploaded and user-uploaded images are identical in size and quality. WebP keeps the
> transparency these cutouts need and runs **7-10x smaller than the same PNG** (measured on our
> own images: 505 KB -> 66 KB, 495 KB -> 54 KB).
>
> **Expect 40-150 KB per bottle image.** The script prints the output size and warns above
> 250 KB -- if you see that warning, do not upload it; re-check the source instead. Never upload
> a raw brand asset or an un-cleaned photo directly. Do not pass `.png` unless you have a
> specific reason.
1. Source the best **official brand asset**: don't just reuse the DB's URL (often a dead 404). Actively **search the brand's own site** — many are Shopify (`cdn/shop/files/...`), where the browser tools can read the real `<img>`/`srcset` and you can pull a high-res size (e.g. `_2048x`). Official marketing images are fine even with text around the bottle — rembg isolates the bottle. Fall back to the existing draft only if no official asset exists.
2. Clean + optimize: `python .claude/skills/verify-bottle/scripts/clean_image.py <in> <out.webp> [--crop L,T,R,B]` — uses **rembg** (ML) to isolate the bottle from ANY background, then tight-trims + centers on transparency. Already-transparent PNGs skip rembg. `--crop` first (source px) to drop flanking marketing text before removal. rembg is installed; if missing: `python -m pip install rembg onnxruntime` (first run downloads a ~1GB model).
3. Upload: `node .claude/skills/verify-bottle/scripts/upload_image.mjs <out.webp> bottle-images variants/<variant_id>/front.webp` (from repo root). Bucket `bottle-images` exists (public). Prints the public URL. (Uploading is harmless even if the suggestion is later rejected — worst case an orphan file.)
4. Emit a `frontimage_url` suggestion pointing at that URL.

### 5. Hand off for review
Report the `submission_group` id and a summary of every suggested change (field, old→new, plus any merge/delete). Brian reviews in the admin queue, approves, then flips `verified=true` on the bottle + default variant as his sign-off.

## Known landmines (from the 2026-08-27 sweep)
- **Corrupted notes:** whole note crammed into `nose` as `"<nose>. Palate:/Taste: <p>. Finish: <f>."` — the 36 parseable ones were bulk-decomposed 2026-08-27; new imports may reintroduce it.
- **Missing barcodes:** ~27 bottles had none. **Shared barcode:** `096749002368` on 4 Elijah Craig Barrel Proof batches (by design).
- **Name-variant pairs to judge:** Blanton's Original vs Blanton's Single Barrel; Wild Turkey 101 vs 101 8-Year-Old.
- **All images hotlinked**, many dead. Self-host as you verify.

## Definition of done (per bottle)
One pending `submission_group` covering: corrected identity (name/category/style/volume) · clean split nose/palate/finish · proof/age · enriched extras · validated barcode · self-hosted image URL · any needed merge/delete — all as reviewable old→new rows. Brian's approval + `verified` flip completes it.

## Dependencies on Grok (see QUEUE_SPEC.md)
`barcode`/`extras` as first-class editable fields, and handler/UI support for `__merge__`/`__delete__` suggestions. Until shipped, those rows are visible in the queue but not one-click applicable.

## Reference: pilot
Buffalo Trace Kentucky Straight Bourbon (`4256976f`) verified end-to-end 2026-08-27 as the template (direct-write, pre-review-gate).
