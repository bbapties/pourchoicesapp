# Bottle images — the shelf pipeline

**Canonical doc for anything that touches bottle images: Claude, Grok, or a scheduled bot.**
Live on prod since 2026-09-09. Board runbook: [#94](https://github.com/bbapties/pourchoicesapp/issues/94).

The Home screen ([#82](https://github.com/bbapties/pourchoicesapp/issues/82)) stands every bottle as
a cut-out on a lit shelf. That only works if an image is a real transparent cut-out, cropped tight
to the glass, and scaled by the bottle's real height. This file is how that gets decided, done and
recorded.

---

## The two questions about any image

1. **Can it stand on a shelf?** → `bottle_variants.shelf_ready`
2. **If not, why not?** → `bottle_variants.image_reject_reason_ids`

A rejection is **a work order, not a dead end**: "every image needing background removal" is one
query, so curation doubles as the queue for cleanup jobs.

---

## The four states — all DERIVED, there is no status column

| state | condition |
|---|---|
| **needs re-review** | `image_flagged_at IS NOT NULL AND (image_reviewed_at IS NULL OR image_flagged_at > image_reviewed_at)` |
| **approved** | `shelf_ready` |
| **rejected** | `cardinality(image_reject_reason_ids) > 0` |
| **unreviewed** | none of the above |

Evaluate in that order. A flag outranks everything, because a disputed image may be live on
everyone's Home right now.

**Why re-review is a timestamp and not a status:** it survives repeat cycles for free, reviewing
again clears it by definition, and no state machine can get stuck.

---

## Transitions

### Put a bottle back in the queue
Set the flag later than the review. **Change nothing else** — the rejection reasons stay on the row
as the history of why it was turned down, and they are what a cleanup job reads.

```sql
UPDATE public.bottle_variants
   SET image_flagged_at = now(),
       image_flagged_by = <public.users.id>,   -- NOT auth.uid()
       image_flag_note  = 'why it is being reopened'
 WHERE id = '<variant_id>';
```

From a signed-in app context use the RPC instead — it needs no write access and can only touch the
flag columns:

```sql
SELECT public.flag_variant_image('<variant_id>', 'note');
```

**To clear it: review it again.** `image_reviewed_at = now()` makes the comparison false. There is
nothing to reset.

### Approve
```sql
UPDATE public.bottle_variants
   SET shelf_ready = true, image_reject_reason_ids = '{}', image_review_note = NULL,
       image_reviewed_at = now(), image_reviewed_by = <public.users.id>
 WHERE id = '<variant_id>';
```

### Reject
```sql
UPDATE public.bottle_variants
   SET shelf_ready = false,
       image_reject_reason_ids = ARRAY(
         SELECT id FROM public.image_reject_reasons WHERE slug IN ('background_not_removed','low_resolution')),
       image_reviewed_at = now(), image_reviewed_by = <public.users.id>
 WHERE id = '<variant_id>';
```

Reasons live in `public.image_reject_reasons` and **grow from use** — free text typed in the admin
sheet becomes a row, so the vocabulary comes out of the work rather than being guessed up front.

---

## Who may write review state

A guard trigger (`protect_image_review`) makes the review columns **admin-only**. This closes a hole
the columns would otherwise open: the existing *"Own unverified update variants"* policy lets the
creator of an unverified variant update that row, which would have let someone mark their **own**
image shelf-ready and put it on everybody's Home.

**Trusted server context is allowed** — `auth.uid() IS NULL`, meaning a direct DB connection or the
service role. That is what lets a scheduled bot work at all. It is not a hole for logged-out
browsers: RLS gates who may `UPDATE bottle_variants` in the first place, and an anonymous client
matches no UPDATE policy. RLS decides **who**; the trigger decides **which columns**.

The flag columns are deliberately unprotected — flagging only ever creates work, it never publishes.

---

## Preparing an image

```bash
node scripts/shelf_image.mjs <variantId> <sourceUrl> [--height-mm N --height-source measured|published|estimated]
```

Fetch → **refuse anything without real transparency** → trim to the alpha bounding box → downscale
to a 600px shelf derivative → WebP with alpha → upload to our own bucket → print the SQL.

- **It refuses opaque images on purpose.** A photo on a white card cannot be rescued by cropping,
  and shipping it puts a white box on a shelf — the one failure the whole review flow exists to
  prevent. Reject it with `background_not_removed` instead.
- **Trim, don't pad.** Padding is what makes one bottle float above the wood while its neighbour
  stands on it.
- **Self-host.** A third-party URL can change, expire, or start returning a watermark, and the
  shelf would degrade with no warning.
- **It does not write to the database.** Approving is a judgement and belongs in Admin › Images,
  where the image can be seen on a real shelf first.

**Known inconsistency:** `shelf_image.mjs` writes a **600px** derivative, the verify-bottle skill's
`clean_image.py` writes **1200px**. 600px is ample on a shelf and thin in the bottle detail view on
a high-DPR phone. New work should use the skill's 1200px; the 19 bottles bulk-fixed on 2026-09-09
are 600px and can be re-run if the detail view ever looks soft.

### Try this before anything expensive

Many stored URLs run through the **wsrv.nl** proxy with `&bg=white&output=jpg`, which **flattens a
transparent PNG source onto white**. Drop those two parameters, ask for `output=png`, and the
original cut-out comes back. No AI, no re-shoot — just a URL edit. `unflatten()` in the script does
it automatically.

**Measured 2026-09-09: 55 images force a white background, 31 of them from a PNG source — and 10 of
the 22 `background_not_removed` rejections are this and nothing else.**

---

## The scale contract

`bottle_variants.bottle_height` is **millimetres of real glass**.

**12 inches (305mm) is ratio 1**, filling 86% of the shelf. Everything else is a straight
proportion, clamped to 40–96%. An 8.5in Blanton's draws at 61%, leaving the top of its slot empty —
which is what a short bottle looks like on a real shelf.

**The ratio lives in the number, not in padding baked into the image.** Both look identical on
screen. The difference is correction: a stored number is fixed with one `UPDATE`, whereas baked
padding means re-rendering that bottle's image — or all of them if the baseline ever moves. Since
most heights are estimates, that difference matters.

**A cut-out's pixel height is not the bottle's height.** It only describes how the image was
cropped, so scaling by the image makes a squat Blanton's and a tall bourbon the same size — exactly
the thing that gives the illusion away.

### Provenance — `bottle_height_source`

| value | means | what a bot should do |
|---|---|---|
| `measured` | a ruler on the real bottle | never re-research |
| `published` | producer or retailer states it | trust it; re-check only if it looks wrong |
| `estimated` | a form-factor default | **this is the re-research queue** |

A `CHECK` constraint keeps the pair together: a height with no provenance is exactly the ambiguity
this column exists to remove.

**Do NOT derive height from the image's aspect ratio.** It cannot separate a short wide bottle from
a tall wide one — a shape-based guess put Knob Creek at 230mm when it is wide *and* about 11.5in.
Use a form-factor default for the bottle CLASS: **squat decanter 230mm · standard 750ml 290mm ·
tall/slim 315mm**.

**Per-bottle heights are mostly NOT published.** Blanton's is listed at 8.5in; Jim Beam Black and
Old Forester 100 are listed nowhere. **A bot that blocks on a researched height will stall on most
of the catalogue** — it should fall back to a form-factor default, record `estimated`, and move on.
Upgrading an estimate later is one `UPDATE`, which is the whole point of the column.

---

## Where things live

| | |
|---|---|
| Admin surface | Admin › **Images** (`src/app/admin/ImagesTab.tsx`) |
| Queries & transitions | `src/lib/imageReview.ts` |
| Shelf rendering | `src/components/home/BottleOnShelf.tsx` |
| Image preparation | `scripts/shelf_image.mjs` |
| Bulk URL-unflatten | `scripts/shelf_image_batch.mjs` |
| Full bottle enrichment | the **verify-bottle** skill (`.claude/skills/verify-bottle/`) — research, dedupe, barcode, image AND height, filed as pending `suggested_edits` |
| Migrations | `sql/home-shelf-ready-*.sql`, `sql/home-image-review-*.sql`, `sql/bottle-height-source-*.sql` |
| Schema reference | `DB_Schema.txt.txt` — regenerate with `node scripts/dump_schema.mjs` |
