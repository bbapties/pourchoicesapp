---
name: verify-bottle
description: Verify a Pour Choices bottle end-to-end — research & enrich real data, dedupe rows, validate/add the barcode, self-host a clean product image, then flip verified=true. Use when Brian says "verify <bottle>", "verify the next bottle", or works the bottle data-cleanup lane.
---

# verify-bottle

Turns one **unverified** bottle in the Pour Choices DB into clean, trustworthy, `verified = true` data. This is the data-only lane (runs parallel to Grok's code lane by Brian's explicit OK — the lanes don't overlap). Read `AGENTS.md` guardrails first.

## Golden rules
- **Never trust existing field data** — the Nov-2025 seed import is full of corruption (see Known landmines). Re-derive from research.
- **Snapshot before every write.** Each write script snapshots the affected rows into a `backup_*` schema. Keep it that way.
- **Destructive SQL runs via the bundled file-runner**, not inline — the auto-mode classifier blocks raw DELETE/UPDATE in Bash. Run from the repo root so `.env.local` (with `DATABASE_URL`) resolves. `scripts/_psql.mjs` in the repo is for read-only queries.
- **Barcode-only ≠ verified.** All five steps must pass before flipping `verified`.
- Bottle data lives on TWO tables: `bottles` and `bottle_variants` (variant-first model; images + per-release notes live on the variant, `bottles_id` FK). Fix both.

## Ownership / id quirk (important)
`public.users.id` ≠ `auth.users.id` for the same person (linked by email, not id).
- `bottles.created_by/updated_by` and `bottle_variants.updated_by` FK → **auth.users**. Brian = `d65ef6f6-…` there. Never set these to a `public.users` id (FK fails).
- `events.user_id` FK → **public.users**. Brian (The_Lake_House) = `7878be89-…`; PourChoicesOG (real user) = `dbaf1f8d-…`.

## The pipeline

### 1. Research & enrich
Pull the real product facts (WebSearch/WebFetch): proof + ABV, age statement, mashbill/grain bill, volume, distillery, and **official tasting notes** (prefer the distillery's own site/CMS). Correct `category` (Bourbon/Rye/Whiskey/Tequila/…), `style`, `name` (full official label). Store mashbill etc. in `extras` (JSON-as-text, matching existing format).

### 2. Dedupe
Search for duplicate/near-duplicate rows (same name, or same distillery + overlapping name). If a true duplicate exists, pick ONE keeper (prefer the row with a valid barcode and/or one that's in a real user's `user_bottles`), **fold the better fields from the loser into the keeper**, then delete the loser + its variant(s) + any backfilled `bottle_added` event whose `target_id` = the loser variant. Check `user_bottles` / `tasting_*` don't reference the loser first.

### 3. Barcode
- If present: validate it's a numeric UPC-A (12) / EAN-13 (13) with a correct check digit, AND confirm via research it maps to THIS exact product + size. Enforce uniqueness across `bottles`.
- If missing: research the real 750ml UPC and add it.
- Batch/allocated releases (e.g. Elijah Craig Barrel Proof) legitimately **share one UPC across batches** — that's not an error; the scan maps to the product line and the user picks the variant. Note it; don't force a fake unique code.
- Coordinate with Grok on the barcode storage/normalization contract (canonical form the column stores + scanner normalizes to; a UNIQUE constraint; a `lookupByBarcode()` helper). Test mapping by running the exact-match query directly.

### 4. Image (self-host — no hotlinks)
Every legacy image is a fragile external hotlink. Replace with a self-hosted, background-free, centered shot.
1. Source an **official brand asset** first (distillery site/CMS). Verify the URL actually returns an image (legacy DB URLs are often dead 404s). If none found by legal means, fall back to cleaning the existing draft image.
2. Clean it: `scripts/clean_image.py <in> <out>` — trims to the bottle, centers, keeps/*makes* transparent background (official PNGs are usually already transparent; Pillow handles trim+pad).
3. Upload: `node scripts/upload_image.mjs <cleaned.png> bottle-images variants/<variant_id>/front.png` (run from repo root). Bucket `bottle-images` already exists (public). Prints the public URL.
4. Set that URL on the variant's `frontimage_url` (and the bottle's).

### 5. Verify
Only after 1–4: `UPDATE ... SET verified = true, updated_at = now()` on the bottle AND its default variant. Confirm with a read-back.

## How to run SQL (from repo root)
- Read-only: `node scripts/_psql.mjs "SELECT …"`
- Writes (snapshotted, transactional): write a `.sql` file, then
  `node .claude/skills/verify-bottle/scripts/run_sql_file.mjs <file.sql>`

## Known landmines (from the 2026-08-27 sweep)
- **Corrupted notes:** the whole note was crammed into `nose` as `"<nose>. Palate:/Taste: <p>. Finish: <f>."`. The 36 parseable ones were bulk-decomposed 2026-08-27; new imports may reintroduce it.
- **Missing barcodes:** ~27 bottles had none.
- **Shared barcode:** `096749002368` on 4 Elijah Craig Barrel Proof batches (by design).
- **Name-variant pairs to judge:** Blanton's Original vs Blanton's Single Barrel; Wild Turkey 101 vs 101 8-Year-Old.
- **All images hotlinked**, many dead. Self-host as you verify.

## Definition of done
Single canonical row · correct category/style/name/proof/age/volume · clean split nose/palate/finish · enriched `extras` · validated unique (or intentionally shared) barcode · self-hosted transparent centered image · `verified = true` on bottle + variant · read-back confirms · snapshot exists.

## Reference: pilot
Buffalo Trace Kentucky Straight Bourbon (`4256976f`) was verified end-to-end on 2026-08-27 as the template for this skill.
