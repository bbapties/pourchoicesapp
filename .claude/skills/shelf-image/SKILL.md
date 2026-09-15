---
name: shelf-image
description: >-
  use this when preparing Pour Choices shelf pack shots or bottle_height.
  Canonical: pourchoicesapp MVP-v3 docs/IMAGE_PIPELINE.md +
  scripts/shelf_image.mjs. Unflatten wsrv white-fill first; opaque →
  background_not_removed; upload WebP to bottle-images; never flip shelf_ready —
  Brian approves in Admin › Images.
---
# shelf-image

Use this when preparing Pour Choices bottle pack shots for the Home shelf, or when populating `bottle_height` / `bottle_height_source`. Owned by Bottle Images — not general verify-bottle.

**Canonical:** [docs/IMAGE_PIPELINE.md](https://github.com/bbapties/pourchoicesapp/blob/MVP-v3/docs/IMAGE_PIPELINE.md) + `scripts/shelf_image.mjs` on repo **`bbapties/pourchoicesapp`** branch **MVP-v3**. Board: issue #94. Prefer the script over ad-hoc rembg/wsrv hacks.

Catalog: PourChoicesApp (`bicpipgbspasxbtqjzvg`).

## Scope
- **In:** `frontimage_url`, cutout quality, trim/framing, reading Brian's `image_reject_reason_ids`, `bottle_height` (mm) + `bottle_height_source`.
- **Out:** tasting notes, barcode, identity, **approving / flipping `shelf_ready`**, verified flips, DQ backlog.

## Prep only (hard)
- **NEVER** set `shelf_ready = true` or clear reject reasons. Brian approves in Admin › Images after seeing it on a shelf.
- **NEVER** flip `verified`.
- Do not overwrite Brian's `image_reject_reason_ids` (those are the work-order queue).
- The prep script **prints SQL** — it does not write the DB. File pending `suggested_edits` as YOUR OWN account (see verify-bottle for ids) unless Brian authorizes live writes.

## Priority queue
1. Rejected / flagged variants Brian steered (`image_reject_reason_ids`, needs re-review)
2. Real-user collections with `shelf_ready = false`
3. Missing height or `bottle_height_source = estimated` (upgrade when published/measured found)
Skip Test_User unless asked.

## Pipeline (preferred)
```bash
# from pourchoicesapp repo root (needs .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE)
node scripts/shelf_image.mjs <variantId> <sourceUrl> [--height-mm N --height-source measured|published|estimated]
```

What it does: unflatten → fetch → **refuse if &lt; ~6% true transparency (exit 2)** → trim to alpha bbox → max 600px WebP alpha → upload `bottle-images` / `variants/{id}/shelf-*.webp` → print UPDATE SQL (no DB write, no shelf_ready).

### Do this before anything expensive
Many `background_not_removed` tickets are only `&bg=white&output=jpg` on wsrv flattening a PNG. `unflatten()` strips those and asks for `output=png`. Try that first.

### Opaque images
Exit code 2 = refuse. Do **not** crop-rescue. Reject / leave `background_not_removed`. White box on shelf is the failure mode.

### Hosting
Self-host in bucket **`bottle-images`** (public). Path: `variants/{variantId}/shelf-{id}.webp`. Public URL under `…/storage/v1/object/public/bottle-images/…`. Service-role upload only.

## bottle_height scale contract
- Unit: **mm of real glass**. 12in (305mm) = ratio 1 → 86% of shelf slot; others proportion, clamp 40–96%.
- Scale from the **number**, not padded pixels in the image.
- Provenance `bottle_height_source`: `measured` (never re-research) | `published` (trust) | `estimated` (form-factor default — **this is the re-research queue**). Height and source must be set together.
- **Most heights are not published.** Do not stall: fall back to form-factor default, record `estimated`, move on.

## Report to Brian
bottle name, variant id, height mm + source (or estimated default used), unflatten vs full prep, public URL / submission_group, shelf_ready still false awaiting Brian. Escalate only if blocked (auth/env).
