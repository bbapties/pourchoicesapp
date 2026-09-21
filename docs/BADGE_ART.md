# Badge medals — photoreal art (#150)

**Canonical for Claude and Grok.** Read this before generating, cropping, or compositing any badge
image. Award rules stay in the #21 body and `sql/badges-migration.sql`. This file is the pictures
and how `Medal` draws them.

Board card: [#150](https://github.com/bbapties/pourchoicesapp/issues/150) (In Progress, Design/UI, L).
Do not reopen #140. #21 stays the epic. **Do not push until Brian has signed the seven empty
plates, then seen Founder's Reserve on the real Profile shelf at 100px and the 38px ladder.**

---

## Right now (2026-09-21, night)

**Founder's Reserve has its object** (Brian's design, 2026-09-21): a gold eagle, wings spread
across the inner ring, a Glencairn of whiskey in front with **"Pour / Choices"** etched on the bowl
just above the liquid. Built by `scripts/founders_reserve_medal.mjs` from Brian's three cut-out
parts (`masters/parts/`: eagle with a rectangular hole for the glass, glass, bowl - the bowl part is
the liquid already inside the glass part and is unused; `fr-mockup.webp` is his composite). The
hole is filled with the chest feathers flipped down so the body reads through the glass. Every
layout number is a constant at the top of the script; re-run it, never hand-edit the WebP.

`Medal` draws it via `OBJECT_IDS` / `hasObject()` in `src/lib/badgeArt.ts`: the object image sits
**in front of** the plate (the wings cross the ring), dimmed on Locked, glyph fallback if the image
fails. Reviewed on the real Profile shelf at 100, the 250 sheet and the 38 ladder (temporary local
release, reverted). Still under "Coming soon" on prod until Brian releases it.

**Next object:** one at a time, Brian supplies the parts or a mockup; same stacking script pattern.
**Releasing a finished badge** (to Brian first, then everyone) and the reveal it triggers are in
[BADGE_RELEASE.md](BADGE_RELEASE.md) - `badge_releases` in the DB is the switch, not code.

## Earlier (2026-09-21, evening)

**The seven empty plates are signed** (Brian, 2026-09-21 - the labeled dock is what he sent back
as "the background base of all the medals") **and wired in.** `frames/` serves all seven at 512;
the 1024 originals are in `masters/plates-1024/`. Diamond was cropped from `masters/diamond-signed.jpg`
(Grok's finished still), Limited from `masters/limited-signed.jpg`, both onto Gold's circle.

`Medal` now draws **plate + the badge's SVG glyph inlaid in the well + stars**. The glyph is the
interim object layer: it uses the same `<use>` geometry as the old coin (72/140 of the disc) and the
frame's `--medal-*` ramp, so it reads as a metal inlay on the wood. The all-SVG coin only draws if a
plate image fails to load. `hasPhotoreal()` is gone - every badge is photoreal.

**Next: the objects, one badge at a time.** Each is an `image_edit` from the Founder's Reserve
bottle (same camera, same key light), keyed to a transparent cutout, saved as
`public/badges/objects/<badgeId>.webp`, and shown to Brian ON the plate at 100px and 38px before it
replaces that badge's glyph. Do not batch-generate the catalog. The FR bottle composite on Limited
was rejected once; re-show it on the signed Limited plate before anything else.

---

## What a medal is

Not a thick Olympic coin with a line-icon glyph. A **barrel top in a metal picture frame**,
studio-lit, cropped to a circle that sits on the Profile leather.

```
[back]  object cutout     — miniature still-life, transparent, same camera as FR
[mid]   ring plate        — photoreal frame; well is tinted vertical oak until an object exists
[front] stars             — 0–4 five-point stars drawn in code, never baked into the PNG
```

Empty plates (what Brian is signing now) are the mid layer with wood in the well and no object.
When objects return, the object sits **behind** the rings so the inner ring overlaps it (the FR
wax tucks under metal). Stars sit in the band between the two rings.

A new badge is one object file. A metal retune is one plate. Target art set is **~25 files, not
~90**.

---

## Locked decisions

Do not re-walk these. They were settled with Brian on 2026-09-21.

- **Gold is the geometry master.** All seven plates share one circle, one diameter, one center.
  Output: **1024×1024** (or 512 WebP for the app), face-on, outer rim = the image circle,
  transparent corners. Square file; empty corners are expected; the medal is the disc.
- **Redraw from gold. Do not recrop the old 2:3 studio portraits.** Those shots are slightly
  elliptical and off-center. Incremental crop/scale chased left gutters and shaved the
  bottom-right rim for an hour. Method: `image_edit` the gold master (change metal + well tint
  only). Wood and Limited last so they cannot drift.
- **Wood is the base plate, not a metal variant.** Literal barrel top: vertical raw/charred oak
  staves, **one hoop, no inner metal ring**. Stars will sit on the hoop.
- **Every other plate = that barrel language + a double metal ring.** Center wood is
  **aesthetically tinted** to sit with the metal (ashen / copper / grey / honey / pale / cherry) —
  not painted the metal color, not a charcoal paper disc.
- **Solid fill in the band between the two rings.** Not an open gap. That band is the star zone.
- **Limited is not a ladder rung.** Onyx ring, four compass diamonds, thin gold rim, **no wood
  ring**, well = vertical planks in a rich polished dark cherry stain. Founder's Reserve lives
  here.
- **Platinum is gone.** Ladder copy renamed in place (thresholds unchanged). Someone who already
  holds old Gold Regular Pour (tier 3) now reads **Silver**. Cheap: four users, moments off.
- **Frame pick is a rule, not `tier === 1`.** One-offs are stored as tier 1. They pick `wood` or
  `limited` from an allow-list (`LIMITED_IDS` in `src/lib/badgeArt.ts`). Founder's Reserve =
  `limited`. Early Adopter / Installed / Tastemaker = `wood`.
- **Stars are code.** 0–4, group grows and stays centered, no empty seats. 0 = clean rings; 1 =
  one star at 12 o'clock. Fill follows the frame (`--medal-*-hi`). `sub_tier` is still always 0;
  overlay ships anyway. One-offs follow the data — no special "never stars" rule.
- **Object never changes metal.** Only the rings (and stars) do. At 38px, color is what reads.
- **No words around the rim.** Short stamps on the object are fine when large (`FR` worked).
- **Same camera and key light on every object.** Every later object is `image_edit` from the FR
  bottle, never `image_gen` from a blank prompt.
- **Award engine, thresholds, pushes, #143: untouched.** Copy-only on the client (`TIER_NAME`,
  coach "Wood to Diamond").
- **Drop the old SVG sparkle/sweep** on the photoreal path.

---

## The ladder

| `tier` | Old name | New name (`TIER_NAME`) | Frame file | Well tint |
|---|---|---|---|---|
| 0 | Locked | Locked | `locked.webp` | dark charcoal oak |
| 1 | Bronze | **Wood** | `wood.webp` | untinted barrel (no inner ring) |
| 2 | Silver | **Bronze** | `bronze.webp` | warm copper oak |
| 3 | Gold | **Silver** | `silver.webp` | cool grey oak |
| 4 | Platinum | **Gold** | `gold.webp` | honey oak |
| 5 | Diamond | Diamond | `diamond.webp` | pale weathered oak |
| — | — | **Limited** | `limited.webp` | dark cherry oak |

Judge every plate at **38px first**, then 100px. Sizes that must hold: 38 (ladder), 66 (toast),
100 (shelf), 124 (sheet). App files are 512 WebP today; masters can be 1024.

---

## Signed vs in-flight

| Plate | Signed? | Master to trust | What's wrong in `public/badges/frames/` today |
|---|---|---|---|
| **Gold** | Geometry yes | `frames/gold.webp` + `masters/gold-geometry.png` (magenta = outside the medal) | Close enough. Do not recrop. |
| **Limited** | **Signed** | `masters/limited-signed.jpg` | Nothing - `limited.webp` is the crop of the signed file (2026-09-21). |
| **Diamond** | **Signed** | `masters/diamond-signed.jpg` | Nothing - `diamond.webp` is the crop of the finished still (2026-09-21). |
| Wood | **Signed** | `masters/plates-1024/wood.webp` | Nothing. |
| Locked / Bronze / Silver | **Signed** | `masters/plates-1024/` | Nothing. |
| Objects | FR **signed** | `objects/founders_reserve.webp` (eagle + glass) | The rejected bottle cutout is `masters/fr-bottle-rejected.webp`. |

`public/badges/review/` is the **abandoned overlay dock** (barrel hoop visible around the metal).
Do not copy those into `frames/`. The labeled contact sheet there is history, not the signed set.

Session scratch (Grok only, not in git):
`C:\Users\whisk\.grok\sessions\C%3A%5Cpourchoices-frontend\01a0c3a2-4c2c-7702-888f-d6e81cd91b31\images\`.
The four files a cold agent needs were copied to `public/badges/masters/`.

---

## Generation rules

**Do**

- `image_edit` from the gold master (or from a signed plate). Change metal and well tint only.
- Keep vertical barrel planks in the well. Tint them; do not replace them with a smooth disc.
- Crop so metal meets the circular edge all the way around. Measure per-side insets if a crop
  looks off (gold after circularize: left 2 / right 1 / top 1 / bottom 1).
- Magenta-outside overlay to prove the rim (`masters/gold-geometry.png` is the template).
- Recrop from the original plate, never from an already-cropped output — each pass compounds offset.

**Do not**

- Recrop the old 2:3 studio shots (session images 24 / 25 / 29 / 27 / 21 / 30).
- Composite a separate barrel photo *under* a punched ring. Center misses every time; well-key
  eats Locked and Limited because that metal is as dark as the well.
- Punch the well with "center is dark." Wood and pewter are already dark; you need a sustained
  luminance *drop* into the well, or you eat the frame.
- Square-center a circular mask on a portrait that isn't centered. That shaves bottom-right and
  leaves studio in Limited's upper-left.
- Bake stars into the PNG.
- Treat a generator puck in the well as part of the metal.
- `image_gen` a later object from a blank prompt.
- Touch app code, push, or restore the FR bottle on Limited until Brian signs the empty set.

---

## Failed approaches (do not retry)

These each ate a round. The failure mode is in parentheses.

1. **Hole-punch + overlay of barrel `32.jpg` under punched rings 24/25/29/27/21/30.** (Center
   miss. Color-keying the dark well also ate Locked/Limited hoops.)
2. **Incremental crop of 2:3 studio portraits into "ring = image edge."** (Photos were ~2% taller
   than wide and not centered. Left gutter / shaved BR / studio in Limited UL, cycling.)
3. **One shared radius for every plate.** (Limited needed its own edge check.)
4. **Auto well-detection on wood/pewter.** (Dark discs, no step-down, over-punched.)
5. **Shipping FR on Limited before empty plates were signed.** (Brian rejected the composite.
   Freeze objects.)
6. **Treating a second FR Imagine as a recut.** (`grok_1789990130602.jpg` is the same language,
   generated seconds later. Lighting master only. FR still ships on Limited, not aged brass.)

---

## How `Medal` draws (code)

Files: `src/components/badges/Medal.tsx`, `src/lib/badgeArt.ts`.

```ts
frameFor(tier, oneOff, badgeId)
  tier === 0          → locked
  oneOff && limited   → limited          // currently only founders_reserve
  oneOff              → wood
  else                → wood|bronze|silver|gold|diamond from tier 1–5
```

Intended stack (locked plan, `336f9c6`):

```tsx
<img src={`/badges/objects/${badgeId}.webp`} />   // behind; dim if locked
<img src={`/badges/frames/${frame}.webp`} />      // holed plate
<StarOverlay count={sub_tier} frame={frame} />
{houndInitial && <span>{initial}</span>}
```

Shipped stack (2026-09-21): the plate `<img>`, then `GlyphOverlay` (the badge's `BadgeSprite`
symbol with the frame's metal ramp and `pc-pop3d`), then `StarOverlay`. When a badge gets a
cutout, `GlyphOverlay` is replaced for that badge by an object `<img>` behind the plate - keep the
glyph as the fallback for badges without one so the shelf never blanks mid-rollout.

`--medal-*` tokens in `src/app/globals.css` are the **star fills** (and the SVG fallback ramps).
They are the one place a colour outside the room is allowed. Wood has no old SVG ramp — SVG
fallback borrows bronze.

`scripts/medal_image.mjs` punches a studio ring photo to a 512 circular WebP (transparent outside
the outer ring and inside the inner well) or keys a black-void object to a transparent WebP.
Useful again when plates become holed frames. Do not run it on the signed Limited/Diamond masters
as a substitute for a visual crop — it was written for the first Imagine split.

---

## Object catalog (frozen until plates sign off)

Lighting master: the first Founder's Reserve Imagine (double antique-brass ring, amber bottle,
dripping red wax stamped `FR`, dark studio). Brass draft = lighting/layout only, not a shipped
plate.

| `badge_id` | Object in the well |
|---|---|
| `founders_reserve` | **Shipped:** gold eagle + Glencairn etched "Pour / Choices" (`objects/founders_reserve.webp`, built by `scripts/founders_reserve_medal.mjs`) |
| `regular_pour` | Glencairn of amber whiskey |
| `night_owl` | Short glass under a crescent moon, or a candle — first pass is cheap to reject |
| `blindfold` | Silk blindfold draped over a Glencairn |
| `big_flight` | Flight paddle with three nosing glasses |
| `helper` | Decanter mid-pour |
| `collector` | A short row of bottles |
| `dead_soldiers` | Empty bottle on its side, wax drip |
| `well_travelled` | Small globe with a bottle |
| `barcode_bandit` | Bottle label under a scanner beam |
| `someday` | Wax-sealed tag |
| `cheers` | Two glasses toasting |
| `barstool` | Leather barstool or a brass plaque (**not** a speech bubble) |
| `crowd` | Three glasses on a rail |
| `contributor` | Fountain pen on a bottle label |
| `early_adopter` | Rising sun over a copper still |
| `installed` | Home-screen pin with a Glencairn (**not** a phone UI screenshot) |
| `tastemaker` | Bottle with a wax-seal check |
| `hound_*` (later) | One hound + bottle; category letter overlaid in code |

Still open before generate: Night Owl, Barstool, Crowd, Installed. Kill in pixels if they read as
icons.

Founder's Reserve was **granted to The_Lake_House** (tier 1) so the Limited plate could be
reviewed. Moments still off (`BADGE_MOMENTS_ENABLED = false`) — nothing was pushed. Hard-refresh
localhost if the shelf still shows pewter.

---

## File map

```
public/badges/frames/{locked,wood,bronze,silver,gold,diamond,limited}.webp
public/badges/objects/{badgeId}.webp          # only founders_reserve today (eagle + glass)
public/badges/masters/founders_reserve-1024.webp  # the FR object at 1024 (parts are ~400px, so an upscale)
public/badges/masters/parts/                  # Brian's FR cut-outs + mockup - the script's inputs
public/badges/masters/fr-bottle-rejected.webp # the first FR object (bottle), rejected
scripts/founders_reserve_medal.mjs            # stacks the parts, etches the glass, writes previews
public/badges/masters/limited-signed.jpg      # Brian signed this look
public/badges/masters/diamond-signed.jpg      # the finished Diamond still (cropped to frames/)
public/badges/masters/diamond-rings.jpg       # earlier Diamond: rings right, honey well
public/badges/masters/diamond-well-ref.png    # pale oak reference used for the Diamond well
public/badges/masters/plates-1024/*.webp      # the seven plates at 1024; frames/ is the 512 downsize
public/badges/masters/gold-geometry.png       # magenta-outside check of the gold master
public/badges/review/                         # abandoned overlay comps — do not ship
src/lib/badgeArt.ts                           # frameFor, TIER_NAME, LIMITED_IDS, OBJECT_IDS
src/components/badges/Medal.tsx               # photoreal path + SVG fallback
src/components/badges/BadgeShelf.tsx          # labels via TIER_NAME
src/lib/coaches.ts                            # "Wood to Diamond"
scripts/medal_image.mjs                       # punch/crop helper for holed frames
```

---

## Out of scope

- Award engine, `badge_tiers` thresholds, `award_badges`, level titles.
- Turning `sub_tier` on.
- Unique art per whiskey/gin/rum Hound.
- Badge Social post (#143) and moments (`BADGE_MOMENTS_ENABLED`).
- Replacing `BadgeSprite` until objects exist for the whole catalog.
