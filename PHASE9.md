# PHASE9.md — Building out the bottle-interaction model

The next wave after Phase 8. Source of truth for behavior is **[BOTTLE_ACTIONS.md](BOTTLE_ACTIONS.md)**;
this file is the build plan for the 5 stories that turn the model's net-new pieces into shipped code.

**Ground rules for this wave (autonomous, Brian away 2026-08-30):** app-only or **additive** schema
only (snapshot + rollback SQL in `sql/`, never destructive); defensive coding with graceful fallback so
existing prod behavior can never regress; tsc + eslint + production build green before every deploy.
Authenticated UI QA is not available this session — verification is compile/build + unauth smoke test,
and each story's handoff flags what still needs a real-account eyeball.

Build order = safest-first so guaranteed wins land even if a later story is deferred.

---

## S1 — Per-variant history modal  *(safest; app-only, read-only)*
> "As a user, I tap the history icon on a version and see my counts plus a timeline of every
> interaction with it — adds, pours (with style), tastings, empties, removes."

- **Data:** read-only over `activities` (added_to_collection / finished / drank+pour_type /
  removed_from_collection / suggested_edit) filtered to (user, variant), plus tasting participation
  from `tasting_sessions` → `tasting_results` (winner/loser variant). No writes, no schema.
- **UI:** a history/calendar icon on the detail (shown when the viewer has any interaction with the
  shown variant) → a scrollable modal: high-level counts (times had, pours, tastings, added/emptied)
  then a reverse-chron timeline.
- **Risk:** low — additive read-only surface, cannot regress existing flows.

## S2 — Wishlist  *(additive schema)*
> "As a user, I wishlist a specific version, find it in a My Bar ▸ Wishlist tab, it posts to social,
> and it auto-clears when I add it to my bar."

- **Schema (additive, rollback in `sql/`):** new `public.wishlists` (id, user_id→public.users, bottle_id,
  variant_id, created_at, unique(user_id,variant_id)) + RLS (insert/select/delete own). Widen the
  `activities` action CHECK to allow `'wishlisted'` (drop+recreate the check, values-only widen).
- **UI:** wishlist toggle on the detail (colored/b-w, per variant); new **My Bar ▸ Wishlist** sub-tab;
  auto-clear the flag when that variant is added to bar; emit a `wishlisted` activity → Social.
- **Risk:** low-medium — new table + new tab don't touch existing collection flows.

## S3 — Barcode scan: two-zone result + "add it now"  *(app-mostly)*
> "As a user, scanning shows the default bottle plus an 'in your bar' callout of the versions I own,
> and a miss offers to add it with the barcode pre-filled."

- **Data:** existing scanner + `lookupBottleByBarcode`; the callout reads the viewer's owned non-default
  versions of the matched SKU from `user_bottles`.
- **UI:** on a hit, show the default SKU result + an "in your bar" list of owned non-default versions
  (tappable → open that version). Miss already routes to provisional add; ensure the barcode pre-fills.
- **Risk:** medium — contained to the scan-result path.

## S4 — Dual-star ratings + guess/global fallback  *(display + logic)*
> "As a user, the detail shows both my rating and the community rating; my guess is editable until I've
> truly blind-tasted; and before any blind tasting exists the community star = the average of everyone's
> guesses."

- **Data:** personal from `user_bottles` (rating_stars/elo); global from `bottle_variants.elo_global`,
  with a fallback = AVG of all users' `user_bottles.rating_stars` for that variant when no blind tasting
  exists yet. Search list star = avg(my, global).
- **UI:** two stars on the detail (Global + My); My editable only while no real personal Elo.
- **Risk:** medium — touches the rating display; build behind the existing star components with fallback.

## S5 — Two-count ownership (additive, backward-compatible)  *(the keystone; deploy conservatively)*
> "As a collector, a version I own 2 of and finished 1 of reads In My Bar: 2 · Empty: 1."

- **Schema (additive, rollback in `sql/`):** add `owned_count int` + `emptied_count int` to `user_bottles`,
  backfilled `owned_count = (currently_owned ? 1 : 0)`, `emptied_count = 0`, and keep `currently_owned`
  in sync (`owned_count > 0`) so **every existing read keeps working unchanged**. Add flow increments
  owned_count; mark-empty does owned_count−1 / emptied_count+1; "this isn't empty" reverses.
- **UI:** My Bar tab membership + the on-card/detail **count** read from the new columns; a variant can
  appear in both In My Bar and Empty. Existing rows (counts 0/1, emptied 0) render exactly as today.
- **Deploy stance:** additive + backward-compatible so it cannot break the current collection screen.
  Full **card-per-variant My Bar** (vs. today's SKU-collapse) is the one piece that most needs a
  real-account eyeball — ship the safe data + counts layer; flag the card-per-variant split for QA.
- **Risk:** highest of the five — the core collection screen. Kept additive/backward-compatible for that
  reason. **STOP + ASK only if** the existing `times_had` semantics force a data-design fork.
