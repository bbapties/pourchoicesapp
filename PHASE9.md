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

## Status (2026-08-30, autonomous run)

**Shipped to prod:** S1 history modal · S2 wishlist (schema live) · S3 barcode "in your bar"
pinning · D.2 guess-gating broaden · **S4 = real "My Ranks" sort** (own ratings). Verified via
tsc + build green + preview smoke test (wishlist tab + toggle + detail render, no console/server
errors). Full authenticated QA still pending.

**Deferred (not force-shipped blind — reasons):**
- **Ratings aggregate (D.2 community-guess fallback + A.2 search avg-star):** both must read
  *other users'* `user_bottles.rating_stars`, which RLS blocks. Needs a SECURITY DEFINER
  aggregate RPC (gated infra) — do with Brian.
- **S5 two-count ownership / card-per-variant My Bar (B.1/B.2/B-32):** a rewrite of the core
  collection screen; too risky to deploy without authenticated QA. The additive schema is
  designed (below) but not applied. Do in a QA'd session.
- **Book-page drag-follow swipe (A.3):** the full-card swipe already works (pointer-level); the
  drag-follow *animation* is Phase-5 polish.

The S1–S5 sections below are the original plan; S4/S5 shifted per the above.

---

## Wave 2 — next 10 stories (approved 2026-08-30; keystone-first, QA on the Claude account)

Gated decisions approved by Brian: additive `owned_count`/`emptied_count` columns; a
`SECURITY DEFINER` aggregate-guess RPC; tightened RLS on feedback/suggested_edits + upload
sanitization. **Still explicitly gated (do NOT touch without a fresh go):** B-74 auth-id vs
public-id cleanup (own snapshot + go), and the Elo trigger math (B-49/B-50 ask-first).

1. **Two-count ownership + card-per-variant My Bar** (B-32; B.1/B.2). Additive `owned_count` +
   `emptied_count` on `user_bottles`, backfilled (`owned_count = currently_owned?1:0`,
   `emptied_count = (!owned && times_had>=1)?1:0`), `currently_owned` kept synced (`owned_count>0`)
   so all existing reads still work. My Bar tabs + counts read the new columns; a variant can be in
   both tabs. Wire My Bar/Social detail ownership to full per-variant rows (finishes B-31).
2. **Blind tastings feel finished** (D.1; B-51, B-47). Completing a tasting posts one
   `did a blind tasting` activity → a ranked results view; wipe the manual guess on first tasting;
   log the tasting event.
3. **Ratings pre-tasting** (A.2/D.2; B-41). `SECURITY DEFINER` RPC returns per-variant AVG of guess
   stars (aggregate only). Global star falls back to it until a blind tasting exists; search list
   star = avg(my, global). Fix last-activity tasting-only mislabel.
4. **Harden user-writable data** (B-58, B-59). feedback/suggested_edits truly append-only at the DB
   (submitter can't change status/admin_note/value post-submit); sanitize + size-cap uploads.
5. **Honest search/browse numbers** (B-34, B-38, B-37). All-Variants count/Elo exclude others'
   store picks; browse+filter counts match the list; block empty/dup global variants.
6. **Honest Remove -> social feed cascade** (B.4). Hard-deleting an erroneous add/pour removes its
   feed post; reversing a mistaken empty removes the finished post. Needs an activities DELETE
   policy (own rows).
7. **Drink picker overhaul** (B-48, B-54). Beyond the 300-SKU cap; allow store picks/variants; log
   search/click events.
8. **Barcode two-zone chooser + wishlist-in-history** (A.1 completion + minor). Full "in your bar"
   multi-version callout; add `wishlisted` to the history-modal timeline.
9. **Telemetry integrity** (B-60, B-61). Events rate-limit / anon guard; page_views stamp the real
   user once resolved.
10. **Docs + small trust polish** (B-70/71/72/73 docs; B-44 nav crowding; B-42/B-40 edge cases).

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
