# HANDOFF.md — The baton

The living handoff between Claude and Grok. **Read the "Right now" block first; update it before switching agents.**
Full scope/status lives in [ROADMAP.md](ROADMAP.md); this file is the narrative a checkbox can't hold.

---

## Right now

- **Branch:** `MVP-v3` (= production). Pushing here deploys www.pourchoicesapp.com.
- **Tip:** `48f3b00` (+ this doc commit). **Working tree clean; everything on origin/MVP-v3.**
- **Current phase:** **Phase 9 build-out (Wave 2).** Model = [BOTTLE_ACTIONS.md](BOTTLE_ACTIONS.md);
  plan + status = [PHASE9.md](PHASE9.md). Read the model before touching collection/consumption/
  evaluation UI.
- **PHASE9 Wave 2: 6 of 10 stories shipped this session** (two-count ownership, tasting visibility,
  ratings fallback, submission hardening, honest search, feed cascade — all QA'd on the Claude
  account + deployed). **Next up = #7 drink picker** (see the Wave-2 log entry + PHASE9.md #7–#10).
  Continue one story at a time.

**PHASE9 shipped this session (all on prod):** S1 per-variant **history modal**; S2 **wishlist**
(new `wishlists` table applied to prod — additive, rollback `sql/wishlist-snapshot.sql`; detail
toggle + My Bar Wishlist tab + social post + auto-clear on add); S3 **barcode "in your bar"** (a scan
opens pinned to the version you own); **D.2 guess-gating** broadened (any prior contact); S4 real
**"My Ranks" sort** (own ratings). tsc + build green; preview smoke test passed (wishlist tab/toggle
render, detail per-variant, no console/server errors).

**Deferred, NOT force-shipped blind (see PHASE9.md for why):**
- **Ratings aggregate** (community-guess global fallback + search avg-star) — needs a SECURITY
  DEFINER aggregate RPC because `user_bottles` RLS hides other users' rating rows. **Gated.**
- **Two-count ownership + card-per-variant My Bar (B-32)** — core-collection-screen rewrite; needs
  authenticated QA. Additive schema is designed in PHASE9.md S5 but not applied.
- **Book-page drag-follow swipe** — Phase-5 polish (full-card swipe already works).

**State — what shipped this session (all pushed to prod MVP-v3):**
- **`BOTTLE_ACTIONS.md`** — the locked interaction model (buckets A–F). This reshaped the bug queue:
  B-31 is now "per-variant everything + had-it earmark"; B-32 is a defined feature (dual-tab is
  intended); B-33 is honest-Remove-copy. Net-new concepts captured (two-count ownership, wishlist
  tab, per-variant history modal, global-guess rating fallback, book-page swipe) — **not yet built**.
- **5 stories shipped** (app-only, no schema/auth/RLS — safe to deploy solo):
  1. **B-33** honest Remove copy (`cce6582`) — conditional on `hasTasted`; no more "deletes history" lie.
  2. **B-43/B-66/B-39** truthful copy (`6b8f063`) — MoreSheet "Moves to Empty", ImportTab, "My Ranks" toast.
  3. **B-35/B-36** restock correctness (`a197f51`) — `addOrRestockUserBottle` returns the resolved
     variant (no phantom null row) + recovers from the concurrent-add 23505 race.
  4. **B-31** per-variant ownership on the detail carousel (`9730b27`) — each slide shows its own
     ownership (fallback = old SKU-level when no rows passed); Search wired fully; My Bar/Social pin
     to the tapped version.
  5. **B-31 earmark** (`b2875e1`) — search card 4-state (verified × had-it); "had it" = owned/past
     **+ drank + blind-tasted** (fail-open extra fetches).

**⚠ VERIFICATION GAP (important):** I could not do authenticated UI QA — the password-entry safety
rule stands and Brian was away. Verified via **tsc + eslint (0 errors) + production build green +
a live unauth+existing-session smoke test** (app boots, Search earmarks render, detail card opens
per-variant with correct not-owned actions, zero console/server errors). **NOT exercised:** the
*differential* per-variant ownership (a variant you own vs one you don't, side by side) and the
**green** earmark — the logged-in preview session owned/tasted nothing and I would not mutate an
unidentified account. **Brian: eyeball these on a real account with mixed ownership.**

**Single next step (recommended):**
- **B-32 / the two-count ownership model** — the biggest net-new piece of `BOTTLE_ACTIONS.md` (B.1/B.2):
  per-variant **currently-owned + emptied** counts so a variant can sit in both My Bar tabs with real
  numbers, card-per-variant My Bar, and the current-quantity display. This needs a **schema or
  derived-from-activities decision** (gated — do with Brian). Then wire My Bar/Social detail ownership
  to the full per-variant rows (currently pinning-only). After that: wishlist tab (B.5), per-variant
  history modal (B.1), global-guess rating fallback (D.2).

**⚠ Brian's config TODOs (not code):**
- Supabase Auth → **URL Configuration**: add `https://www.pourchoicesapp.com/reset-password` (+ localhost) to **Redirect URLs** and enable the **Reset Password** email template (B-26), else the reset link won't return to the app.
- Vercel: ensure a service-role env var is set — either `SUPABASE_SERVICE_ROLE` or `SUPABASE_SERVICE_ROLE_KEY` now works (B-21).
- One deployed-site sanity check: **login** (B-18 rerouted the email-check to the `email_exists` RPC) and **Search/My Bar/Social** (B-24 flipped `all_bottle_details`/`all_variant_details` to `security_invoker`).

**Landmines / gated:**
- **B-74 (auth id vs public id)** still gated: `public.users.id ≠ auth.users.id` — match BOTH ids in any owner-scope filter. Do before 3.4 group tasting + 8.5 push.
- **B-23 tier-2** (RPC-gate + rate-limit tasting writes) deferred post-beta. **Do NOT rewrite the Elo trigger.**
- **DB migrations applied to prod this session** (rollbacks in `sql/`): `bottle-details-variant-display-*`, `b18-b19-auth-hardening-*`, `b23-b24-security-*`, `b27-username-ci-unique-*`. Data backups in schemas `backup_20260827`, `backup_bt_pilot`, `backup_notes_fix` (incl. `qa_roles`).

**Why Phase 8 exists (Brian, 2026-08-27):** before inviting 10–15 testers, (1) log the review findings as bugs and work them, (2) barcode scan on every bottle search + seed barcodes, (3) rewrite new-user tutorial + admin-controlled What's new, (4) PWA install prompt (Android + iOS, strongly suggest install), (5) admin push to all or one user (Profile notifications default on). Order is in PHASE8.md — first-session path is URL → install → signup → tour → search/drink, so trust bugs then PWA then tutorial then barcode then push.
**TESTING NOTE:** Grok uses `grokbuild@pourchoicesapp.com` (username `GrokBuildAdmin`), Claude uses `claude@pourchoicesapp.com`. **Both were demoted `admin → user` (B-22, 2026-08-27) — `The_Lake_House` is now the sole admin.** So these QA accounts can do regular-user testing (add bottles, tastings, bar) but NOT admin actions (verify/approve/delete). If Grok needs to test an admin surface, Brian promotes the account temporarily (SQL, via service-role) or does it on Lakehouse himself; re-demote after. Ask Brian for passwords rather than committing them. Do NOT test on Brian's Lakehouse account for data. A real tasting moves **shared global Elo** — after QA, delete the test session and reset touched `bottle_variants.elo_global` (+ QA `user_bottles`) to 1500. (Roles snapshotted in `backup_notes_fix.qa_roles`.)

**⚠️ Phase 3 — what is LIVE on the prod DB right now (from Story 3.0, applied 2026-08-26):**
- **The Elo engine is a Supabase trigger** (`trig_update_elo_after_session` AFTER INSERT on `tasting_results`, fn `update_elo_for_session()`), NOT app code. It was EXTENDED to be **variant-level**: personal Elo → `user_bottles.elo` keyed per (user, variant); global Elo → `bottle_variants.elo_global`, with **store-pick global points rolling up to the parent SKU's default variant** (store pick's own global stays put; personal stays on the store pick). Flat **K=32**; upset credit via the expected-score term; win-rate dampener over the **last N head-to-heads of that specific pair** (personal 10 / global 20). The trigger uses a `new_results` transition table → the flow **must insert all pairwise rows for a session in ONE INSERT**. SQL: `sql/3.0-migration.sql` (re-runnable) + `sql/3.0-reset.sql` (one-time, already run) + `sql/3.0-snapshot.sql` (rollback).
- **`user_bottles` was re-keyed to per-variant:** PK is now the surrogate `id` (partial unique indexes `user_bottles_no_variant` / `user_bottles_with_variant` enforce uniqueness). Legacy NULL-variant rows backfilled to their default variant. **Row semantics:** owned = `currently_owned=true`; finished = `currently_owned=false AND times_had>=1`; **tasted-only = `times_had=0`** (trigger-created, never owned — no silent add-to-bar).
- **All Elo was rebaselined to 1500** and the 13 test tasting sessions purged, for a clean beta leaderboard. Star display already degrades to "no rating" when all Elo is equal (calcStars returns null when min==max), so a flat baseline is fine.
- **RLS on the tasting tables was fixed** to resolve `auth.uid()` → `public.users.id` (the old policies compared auth id to a public id and would fail every app insert). Each participant owns their own session row (works for group joiners too).
- **App code audit (Story 3.0, shipped to prod 2026-08-27):** `src/lib/userBottles.ts` (`addOrRestockUserBottle`/`removeUserBottle` now variant-scoped; `resolveDefaultVariantId`; **remove DEMOTES a tasted row to tasting-only instead of deleting**, preserving Elo), `src/app/mybar/page.tsx` (Empty tab query now `times_had>=1`), `MyBarClient.tsx` + `SearchClient.tsx` + `SocialClient.tsx` (variant-scoped writes; `inCollection` = an ownership row exists, not any row; Social fetch no longer `.maybeSingle()`). tsc clean; verified via rolled-back DB tests (engine deltas incl. store-pick rollup; My Bar tab filters exclude tasting-only rows).
- **Feedback channel — what shipped (`00188a9` feat + `50f7b00` docs):** Profile "Send Feedback / Report a Bug" → `FeedbackSheet` (type feature|bug, message with Web-Speech dictation, optional screenshot). New `feedback` table + RLS (mirrors `suggested_edits`; **migration applied to prod DB** — `sql/feedback-migration.sql`, rollback `sql/feedback-snapshot.sql`). Admin triage queue in **Admin > Feedback** (`FeedbackTab.tsx`; status new/triaged/planned/done + internal note). Screenshots under `bottle-images/feedback/<id>/` with stored `screenshot_path` for easy purge. Lib `src/lib/feedback.ts`. Coach `profile.feedback` added to the **new-user core tour**. Verified end-to-end on localhost (submit → queue → triage → note persisted) + prod verify handed to Brian. Entry is Profile-only (no persistent affordance yet).
- Design context (Brian, 7.8 discovery): from the bottle card there are exactly **two contribution actions — Suggest an edit (7.8) and Add a variant (7.9)**, both done. Personal notes/ratings are NOT a card action — they belong to the future drink/blind-tasting flow.

**Product surface (so you do not rebuild what exists):**
- Nav: Search / Social / My Bar / Drink / Profile (+ Admin). Drink = `/taste` (solo self-serve + guest-helper shipped). Login → `/mybar`. Profile = username/email/replay tutorial/feedback/sign out. Join-a-blind is a stub (3.4).
- **My Bar tabs:** In My Bar / Empty / **Tasted (B-06 live)** — Tasted = variants this user ranked that they do not own and never finished. Owned/empty still SKU-collapsed (B-31). Cards carry `variant_id` (B-05). Stars from `default_variant_elo` (B-04).
- Bottle detail: carousel over **default + variants** (swipe / arrows / dots). One variant → no pager. Fields that swap: images, Elo, verified, age, proof, notes, tasting notes. SKU identity (name, distillery, category) stays. Front/Back + zoom live.
- Have a drink: any bottle, not gated on My Bar, does **not** insert `user_bottles` or bump `times_had`. Pour sheet: neat / rocks / mixed / **blind**. Neat/rocks/mixed write `activities.drank` (optional `variant_id` of the visible carousel slide). **Blind opens `/taste?bottle=&variant=`** with that bottle pre-seeded — it does **not** log a pour.
- **Drink tab (`/taste`)** is a hub: **Have a drink** (pick one bottle → same pour sheet) **or** **Start a blind tasting**. Join-a-blind is still a stub.
- Actions (7.6): one state-dependent primary + a `MoreSheet`. **none** → Add to My Bar (primary) + Have a drink. **owned / empty** More includes **Have a drink** (pour sheet) **and** **Blind tasting** (Drink, pre-seeded). Owned also: Add another / Mark as Empty / Remove. Empty: Remove. Suggest-edit pencil stays separate (top bar). Mark as Empty = soft delete (`currently_owned=false`, kept in history). Add Back = restock (`onAddToBar`), which bumps `times_had`.
- Suggest an edit (7.8): the top-bar pencil enters **inline edit-mode** over the visible version's fields; image area = upload target. Per-field gate: mine+unverified applies directly; else pending → admin. Append-only `suggested_edits`. Under-review banner. Admin reviews **inside the Bottles queue** (`BottlesTab`) with per-field Approve/Reject + optional reason; approve keeps verified.
- Add a variant (7.9): the card's second contribution action. **Global variant** (batch/release-year, everyone sees, `verified=false` → admin queue) vs **store pick** (private to creator). Save choice on both: **database-only** (creates the version, logs `added_to_db`, no `user_bottles`) vs **add-to-bar**. Entry points: a virtual **"+ Add a version" carousel slide** (every bottle swipeable now), an explicit "+ Add a version" control by the pager, and a More-sheet "Add a variant" row. Flow reuses `VariantSelectSheet` with `mode="contribute"`. `AddVariantSheet.tsx` is **deleted**.
- **Store-pick scoping (7.9):** store picks are private to their creator — everywhere variants show (detail carousel `fetchVariantsForSku`, All-Variants leaderboard + count in `SearchClient`, the "N versions" badge) they filter `store_pick_name IS NULL OR created_by IN (my authId, my publicId)`. Matching **both** ids works around the `created_by` inconsistency.
- Social: global reverse-chrono feed from `activities`.
- Coaches: new users get a live-UI core tour; existing users get one What's new digest per session (Show me = that feature's tour). Catalog `src/lib/coaches.ts`. Storage `users.seen_coach_ids`. Existing accounts were seeded `core.done`. **Phase 8.3:** rewrite core (include Drink) and stop auto-piling every `announce: true` — admin publish instead.

**SQL already live (do not re-run as if missing):** **`all_bottle_details` view fixed 2026-08-27 (Claude)** — its per-variant display fields (`attr_proof/age/nose/palate/finish/frontimage_url/backimage_url`) now resolve from the **default variant** (COALESCE fallback to the bottle column), so approved variant-level edits (incl. images) show in bottle search, matching the detail card. Was: all `attr_*` read from `bottles`, so variant edits never reached search. Migration `sql/bottle-details-variant-display-migration.sql`; rollback `sql/bottle-details-variant-display-snapshot.sql`. Identity fields (name/distillery/category/style/volume/barcode/extras) still from `bottles`. `activities` table + RLS; `users.seen_coach_ids` (existing users seeded); **`suggested_edits` table + RLS (7.8, `sql/7.8-migration.sql`)** — rollback `DROP TABLE IF EXISTS public.suggested_edits CASCADE` (`sql/7.8-snapshot.sql`); **7.9 view columns (`sql/7.9-migration.sql`)** — `all_variant_details.variant_created_by` + `all_bottle_details.attr_variant_created_by` (additive; rollback = `sql/7.9-snapshot.sql` restores the prior view defs). Helper: `node scripts/_psql.mjs "…"`. Never pass `DATABASE_URL` as a psql URI. Direct `db.*` is IPv6-only. SQL files ASCII-only. See AGENTS.md.

**Open decisions (Phase 8 — ask when that wave starts, not before):**
- PWA: which app-icon asset; prompt before vs after Get Started; in-app browsers.
- Tutorial: exact new-user steps/copy; whether Lakehouse/QA get a one-shot "Drink is live" What's new.
- Barcode: fill-rate before showing the camera; seed sources/licensing; SKU-level vs later per-variant.
- Push: notification click deep-link; in-app bell for browser users or What's new only; suggested-edit notice v1 vs v2.

**Landmines:**
- `user_bottles` is **one row per (user, variant)** since 3.0 (surrogate `id` PK). Restock increments `times_had` on that variant. Do not insert a second row for the same (user, variant). My Bar UI still collapses to SKU (B-05/B-31) — persist `variant_id` on the card payload.
- A drink must **not** create a `user_bottles` row. `times_had` is collection restocks, not pours.
- Empty bottles show **Add to My Bar**, not the In My Bar / Finished It split.
- Search now scores from `default_variant_elo` (fallback `bottle_elo_global`); star scaling range differs per mode. `all_bottle_details` is additive-extended; `all_variant_details` is new. Rollback: `sql/7.2-snapshot.sql` (+ `DROP VIEW all_variant_details`).
- `activities` rollback: `DROP TABLE IF EXISTS public.activities CASCADE;` (see `sql/activities-snapshot.sql`). Admin `delete_user_cascade` is unchanged; `activities.user_id` ON DELETE CASCADE covers user wipe.
- Activity policy: log every bottle action until Brian excludes it (`src/lib/activities.ts`). Fail-open. Exclusion: admin hard-delete of a bottle.
- Coach policy: new user-facing surface → one `src/lib/coaches.ts` row. Pile-up = one digest per session, never 20 autoplayed tours. New vs existing = `core.done` in `seen_coach_ids`, not account age. **Phase 8.3 will change the digest source** to admin-published rows; until then the old rule still applies.
- Detail carousel: `localBottle.variants` is the owner-scoped ordered list (default first; global variants + the viewer's own store picks). Display via `fieldsForVariant`. **7.9:** the carousel has a virtual **add-slide** at index `vlist.length` — `totalSlides = vlist.length + (addSlideEnabled ? 1 : 0)`. **B-03:** `addSlideEnabled` requires `vlist.length > 0` so a default-only SKU does not open as the dashed add panel. The add-slide body replaces the normal card body (image/attrs/actions).
- **`public.users.id` ≠ `auth.users.id` (B-74, Claude 2026-08-27).** Public users have their own UUID; `auth_id` links to Auth. Do **not** assume they are equal. FKs to people (`user_bottles.user_id`, tasting `user_id`, activities, events, feedback) are public ids. Resolve with `users.auth_id = auth.uid()`. Never `user_id = auth.uid()`. Logged as a gated cleanup **before 3.4 and 8.5** — not Wave 1, not a drive-by.
- **`created_by` inconsistency (B-46, symptom of B-74):** store picks (and other variants) are stamped with the **auth id on some rows, the public id on others**. 7.9 handles this by matching **both** ids (`created_by IN (authId, publicId)`) in every owner-scope filter. Until B-74, always match both. 7.8's gate compares `target.created_by === authId` only — a public-id stamp reads as "not mine" → extra admin approval (B-45).
- **7.8 gate treats `verified IS NULL` as unverified** (`!data?.verified`). A variant with `verified=null` that displays as ✓ via the bottle-level fallback (`fieldsForVariant`) will direct-apply for its creator. Intended, but note null≠false here.
- **MyBar `handleToggleOwnership` is one-way** (hard-codes `currently_owned=false`, always logs `finished`) — it is a "mark finished", not a real toggle. Use it only for **Mark as Empty**. For **Add Back** (empty→owned) use the restock path (`onAddToBar` → `addOrRestockUserBottle`), which sets owned=true and bumps `times_had` in both Search and MyBar. SearchClient's toggle *is* a real toggle; the divergence is why 7.6 routes Add Back through restock, not toggle.
- Supabase's typed client overflows ("excessively deep") on a **union table name + `.or()`** — the dynamic-table queries in `SearchClient.tsx` are cast to `any` on purpose. Don't "fix" the casts.

---

## Known state drift (docs vs reality)
- ✅ **RECONCILED 2026-08-21** — **README.md** now carries a stale-banner pointing here; **ROADMAP** "WE ARE HERE"
  moved to Phase 7 and Phase 6 status corrected (6.0/6.1/6.2/6.3 shipped, **6.4 CSV import is the gap**;
  `ImportTab.tsx` is a shell). Phase 6 granular sub-checkboxes were **not** individually re-audited — code is truth.
  Spec mismatches: no `DB_SCHEMA.sql` at root (only `DB_Schema.txt.txt`); role hook is `src/lib/useCurrentUser.tsx` (not `.ts`).
- ⬜ **Still open — DB_Schema.txt.txt lags the live DB:** missing `users.role`, admin RPCs, `all_bottle_details` view
  (now incl. `default_variant_elo`/`default_variant_id`/`variant_count`), the new `all_variant_details` view,
  storage bucket, `bottle_variants.{elo_global,nose,palate,finish,is_default}`, `user_bottles.times_had`,
  `public.activities` (actions: drank, added_to_collection, finished, added_to_db, suggested_edit, verified, removed_from_collection),
  `users.seen_coach_ids`.
  `suggested_edits` **is live** (7.8). Drift list above is stale on that point; views/`users.role`/`activities`/`events`/`feedback`/`seen_coach_ids` still need a schema dump refresh (B-73).
- ✅ **7.2 read-switch is live** — search scores from the default variant (`all_bottle_details.default_variant_elo`) and the
  All Variants view scores from `all_variant_details.variant_elo_global`. `bottles.elo_global` is now legacy/fallback only.

---

## Log (newest first)

### 2026-08-30 — Claude (PHASE9 Wave 2 — next-10 stories, in progress)
- Brian approved the gated decisions (additive columns, aggregate RPC, RLS hardening) and asked for
  the next 10 stories (PHASE9.md "Wave 2"). Building + QA-testing each on the **Claude QA account**
  (`claude@`, verified it's that account) and deploying. **B-74 + Elo math stay gated.**
- **Also fixed (from live QA):** `f7a5d39`→`7b5789b` wishlist auto-clear didn't fire (the variant
  sheet passes null for "Standard bottle" → `autoClearWishlist(null)` bailed). Resolves null→default
  now; verified wishlist→0 / owned→1 on the QA account.
- **Shipped so far (prod):**
  1. **B-32 two-count ownership** (`5e4cfce`) — additive `owned_count`/`emptied_count` on
     `user_bottles` (applied to prod; backfilled to preserve tab membership; `currently_owned`
     kept synced; rollback `sql/two-count-snapshot.sql`). My Bar tabs + counts from the new columns
     (a SKU can be in both tabs; card shows ×N; detail "you own N"); `markVariantEmpty` lib centralizes
     "finish one" across the 3 clients. **QA'd:** seeded owned 2/emptied 1 → both tabs + ×2;
     mark-empty → owned 2→1, emptied 1→2. My Bar still SKU-collapses (separate cards per owned variant
     = follow-up).
  2. **D.1/B-51/B-47 tastings feel finished** (`97a1742`) — completing a tasting posts a `tasted`
     activity (activities CHECK widened, applied to prod; rollback `sql/tasted-activity-snapshot.sql`)
     → Social "did a blind tasting with it" + history; wipes the manual guess. **QA'd:** `tasted`
     activity renders on the feed. Ranked "click for details" results view = follow-up.
  3. **A.2/D.2/B-41 ratings pre-tasting** (`1371a40`) — new SECURITY DEFINER RPC
     `variant_guess_avg(uuid[])` (aggregate only; applied to prod, rollback
     `sql/variant-guess-avg-snapshot.sql`). Detail Global star falls back to the guess-average until
     a blind tasting moves `elo_global` off 1500; search card star = avg(my, global); B-41 last-activity
     no longer mislabels tasting-only as "Finished". **QA'd:** guess of 4 → Global 4.0 + card 4.00.
  4. **B-58/B-59 harden user-writable data** (`e04aa1e`) — BEFORE UPDATE trigger
     `protect_submission_update` (applied to prod, rollback `sql/submission-hardening-snapshot.sql`)
     freezes moderation columns: feedback submitter can only attach a screenshot; suggested_edits
     submitter can only cancel their own pending row. Uploads allow-list MIME + derive ext + 8 MB cap.
     **QA'd via SET ROLE:** self-approve/tamper frozen, cancel works.
  5. **B-38/B-37 honest search** (`aa5fcd5`) — browse filter runs in the query (list matches the
     banner count; **QA'd:** Whiskey → 43 with only whiskeys, Gin → 0/0); new global variants require
     a batch/year + dedupe. B-34 was already resolved by B-24 (security_invoker view scopes the count).
  6. **B.4 hard-delete → feed cascade** (`48f3b00`) — new scoped `activities` DELETE-own RLS policy
     (applied to prod; rollback `sql/activities-delete-own-snapshot.sql`): a user may delete only
     their own drank/added/finished rows, never `tasted`. removeUserBottle erases a mistaken add's
     feed post; the history modal gives each pour a trash button (removes it from feed + history).
     **QA'd via SET ROLE:** own pour deletable, own `tasted` blocked. Completes B-33's deferred cascade.
- **STOPPED HERE (6/10) — session end 2026-08-30/09-01.** Working tree clean, all on origin/MVP-v3
  at `48f3b00` (+ the doc commit after this). **Remaining (PHASE9.md Wave 2, #7–#10):** drink picker
  overhaul (#7 — B-48/B-54), barcode two-zone chooser + wishlist-in-history (#8), telemetry integrity
  (#9 — B-60/B-61), docs + small polish (#10 — B-70/71/72/73, B-44, B-42/B-40). All specced in
  PHASE9.md. **Still gated (do NOT touch without a fresh go):** B-74 auth-id cleanup, Elo math
  (B-49/B-50). The "click for details" ranked tasting-results view (D.1) also remains a follow-up.

### 2026-08-30 — Claude (END SESSION — PHASE9: 5 model build-out stories, autonomous)
- Continued the autonomous mandate: planned [PHASE9.md](PHASE9.md) from the model, then built +
  deployed the next 5 stories safest-first (app-only or additive; snapshots for schema).
- **Shipped to prod** (`9869795`, `f7a5d39`, `975f53b`, `d48e1cf`, `8314a03`): S1 per-variant
  **history modal** (read-only over activities + tastings); S2 **wishlist** — new `public.wishlists`
  table + widened activities check **applied to prod** (`sql/wishlist-migration.sql`, rollback
  `sql/wishlist-snapshot.sql`), detail bookmark toggle + My Bar **Wishlist tab** (4 tabs now) +
  `wishlisted` social post + auto-clear on add; S3 **barcode → land on the version you own**;
  **D.2** guess editable on any prior contact (not owned-only); S4 real **"My Ranks" sort** (own
  `rating_stars`, RLS-safe).
- **Verification:** tsc + eslint (0 errors) + production build green; preview smoke test on the
  existing logged-in session — Wishlist tab + empty state, detail wishlist toggle, per-variant
  detail all render; only HMR-websocket dev noise in console, no app/server errors. **Did not
  mutate** the preview account (unidentified) so wishlist WRITE + history-populated states are
  unverified — Brian to eyeball on a real account.
- **Deferred with reasons** (did not force to prod blind): ratings aggregate fallback (RLS → needs
  aggregate RPC, gated); two-count/card-per-variant My Bar (core-screen rewrite → needs auth QA;
  additive schema designed in PHASE9.md); book-page drag animation (Phase 5).
- **Exact next:** with Brian — (1) the two-count ownership model + card-per-variant My Bar (B-32,
  gated schema/derive decision), (2) an aggregate RPC for the community-guess rating fallback. Then
  wire My Bar/Social detail ownership to full per-variant rows (completes B-31). B-74 + B-23 tier-2
  still gated; Elo trigger untouched.
- **3-line summary:** PHASE9 shipped 5 model stories (history, wishlist, barcode-pin, guess-gating,
  My-Ranks) to prod `8314a03`; the two gated keystones (two-count My Bar, ratings aggregate) are
  designed + documented for a QA'd session with Brian; verify wishlist/history on a real account.

### 2026-08-30 — Claude (END SESSION — bottle-interaction model + 5 model-aligned stories, autonomous)
- **Long discovery with Brian → `BOTTLE_ACTIONS.md`** (commit `95c3e04`): a full greenfield spec of
  every user↔bottle action across six buckets (Find / Collection / Consumption / Evaluation /
  Contribute / Social), each through the same lens (entry / stored / Elo / screens / activity / edges).
  Key decisions: **two-count per-variant ownership** (currently-owned + emptied → a variant can be in
  both My Bar tabs); **"had it" earmark** (owned/past OR drank OR tasted; verified × had-it 4-state);
  **wishlist** (per-variant, own My Bar sub-tab, posts to social, auto-clears on add); **honest Remove**
  (mistake-correction only, tastings never deletable, hard-deletes cascade to the feed); **guess rating**
  (gated to prior contact; global falls back to the average of guesses until the first blind tasting);
  per-variant **history modal**; **book-page** full-card swipe; barcode-miss → "add it now"; contribute
  requires a proof photo for global variants. B-30 moved to long-term backlog.
- **Then, on Brian's full autonomy grant, shipped the next 5 stories to prod** (app-only; no schema/
  auth/RLS while he was away): B-33 honest Remove copy (`cce6582`); B-43/B-66/B-39 truthful copy
  (`6b8f063`); B-35/B-36 restock correctness (`a197f51`); B-31 per-variant detail ownership + pin-to-
  tapped (`9730b27`); B-31 "had it" earmark (`b2875e1`). Each its own commit; tsc + eslint (0 errors)
  + production build green after each.
- **Verification:** compile/build clean + a live smoke test on the dev server via an existing
  logged-in preview session (Search renders, earmarks correct for never-had, detail opens per-variant
  with correct not-owned actions, no console/server errors). **Could NOT verify** the differential
  per-variant ownership or the green earmark — password-entry rule + empty preview account. Brian to
  eyeball on a real mixed-ownership account.
- **Exact next:** the **two-count ownership model (B-32)** — gated schema/derivation decision with
  Brian — then wire My Bar/Social detail ownership to full per-variant rows, then wishlist tab /
  history modal / guess-fallback. B-74 + B-23 tier-2 still gated; Elo trigger untouched.
- **3-line summary:** `BOTTLE_ACTIONS.md` locks the bottle model; 5 model-aligned stories (B-31/33/
  35/36/39/43/66) shipped to prod `b2875e1`; next is the two-count ownership model with Brian, and a
  real-account eyeball of B-31's per-variant ownership + earmark.

### 2026-08-27 — Claude (END SESSION — Wave 1b/0 + auth sweep, barcode scanner, bottle-data lane)
- **Pushed to `origin/MVP-v3`** through tip `5232438` (24 commits). Working tree clean (untracked `.claude/launch.json`, worktrees, weekly HTML only). tsc/build green on every push.
- **Bugs shipped:** B-07 (saveTasting retry idempotency — session reuse + `ignoreDuplicates` upsert; app-only, trigger untouched); B-08 (signup validate + uniqueness pre-check + insert-error handling); B-09…B-12 (Social empty variant-scope; carousel store-pick flash → shared `isVariantVisibleToViewer`; VariantSelectSheet dual-id; Search last-activity ownership row); B-13…B-17 (Search `.or()` escaping + toast; self-serve confirm copy; collection actions use the VISIBLE variant; Add-Back tab switch; Social ownership race); B-25…B-29 (8-char password min; forgot-password + `/reset-password` page; CI username unique index; B-28 verified via B-08; delete-user detaches catalog authorship before the auth delete).
- **Wave 0 security (RLS/auth on prod DB; rollbacks in `sql/`):** B-18 anon `users` read → `{authenticated}` + `email_exists` RPC; B-19 `protect_user_role` trigger; B-20 confirmed already-safe; B-21 service-role env fallback; **B-22 QA accounts demoted admin→user** (Lakehouse is sole admin); B-23 tier-1 `tasting_results` SELECT+INSERT only; B-24 store-pick RLS + `all_bottle_details`/`all_variant_details` `security_invoker=true`. Verified via `SET ROLE authenticated` + simulated `auth.uid()`.
- **Barcode scanner (Phase 8.4 search side, Brian pulled forward):** `BarcodeScannerSheet` (ZXing `@zxing/browser`) on **Search + My Bar**; `lib/barcode.ts` UPC-A/EAN-13 lookup; Add Bottle gained a `barcode` field + one-step store-pick creation.
- **Bottle-data lane:** built the `verify-bottle` skill + review-gated `suggested_edits` queue (barcode/extras editable + `__merge__`/`__delete__` structural suggestions); DB reset-to-new + real-timestamp events backfill (snapshot schema `backup_20260827`); fixed `all_bottle_details` to source display fields (proof/age/notes/images) from the **default variant** (`bottle-details-variant-display-*`); Buffalo Trace fully verified; **Blanton's + Eagle Rare filed as PENDING suggestions** for Brian to approve in Admin ▸ Bottles (`b1a70000-…0001`, `ea91e000-…0001`). `rembg` installed for image cleanup.
- **UI:** portrait fixed-frame bottle thumbnails across Search/My Bar/Social (image fills the card height, never changes card height); admin Bottles queue no longer double-lists the default variant + a read-only "review before verify" modal.
- **Brian's non-code TODOs:** (1) Supabase Auth → add `/reset-password` redirect URL + enable the reset email template (B-26); (2) confirm the Vercel service-role env (B-21); (3) one prod sanity check of **login** + **Search/My Bar/Social** (B-18/B-24 changed those paths); (4) rotate/keep the demoted QA accounts as you like.
- **Exact next for Grok:** **B-30** (self-serve account delete + data export — a FEATURE, needs a user-callable self-delete path + export bundle), then the **B-31…B-46** Collection/variants/search cluster (B-31 SKU-vs-variant UI is the big one). **B-74** (auth vs public id) and **B-23 tier-2** stay gated; do not rewrite the Elo trigger.
- **3-line summary:** Bug waves 1 / 1b / 0 + the auth-signup cluster (B-01…B-29) are all on prod; the barcode scanner and the verify-bottle data lane shipped; Blanton's + Eagle Rare await Brian's in-app approval. Next code = **B-30** then the B-31 cluster. Brian TODOs: reset-password Supabase config + a prod login/search sanity check.

### 2026-08-27 — Grok (END SESSION — baton to Claude)
- **Pushed to `origin/MVP-v3`.** Tip includes Grok Wave 1 B-01…B-06 + Drink hub, then Claude's verify-bottle skill (`1b39f85`, `ac1ff14`). Working tree clean aside from untracked `.claude/launch.json` / weekly HTML.
- **Shipped this Grok session (prod):** B-01 Blind wired to Drink; Drink tab + More offer pour **or** blind; B-02 helper Back leak; B-03 add-slide flash; B-04 My Bar default-variant Elo; B-05 persist My Bar `variant_id`; B-06 Tasted tab; B-74 logged (not fixed). Grok QA admin `grokbuild@pourchoicesapp.com` / `GrokBuildAdmin`.
- **Exact next for Claude:** **B-07** `saveTasting` RPC/transaction — ask Brian first. Notes on BUGS.md B-07. Then B-08. QUEUE_SPEC.md (barcode/extras + merge/delete in suggest-edit) is later unless Brian pulls it forward.
- **3-line summary:** Wave 1 trust bugs B-01…B-06 are on prod. Next code is B-07 (schema go). Do not start 8.2–8.5 / 3.4 / B-74 without Brian.

### 2026-08-27 — Grok (B-06 My Bar Tasted tab)
- Tasted tab is no longer a hardcoded `Tasted (0)`. It lists variants from this user's `tasting_results` that are not on Owned/Empty (never owned, or removed after a tasting). Star-guess-only `user_bottles` rows stay out.
- One card per variant; date is last tasted; no owned/empty earmark. Detail opens as not-in-collection. Adding to the bar moves it off Tasted.
- Grok QA has 0 sessions so empty copy is correct. Next: **B-07**.

### 2026-08-27 — Grok (log B-74: public.users.id ≠ auth.users.id)
- Claude flagged the public.users ↔ auth.users id mismatch as something to fix before later features assume they are equal. Not fixing now (auth / gated). Logged as **B-74**: FKs stay `public.users.id`; resolve `auth.uid()` via `users.auth_id`; `created_by` stays dual-match (B-46) until a dedicated cleanup. Schedule **before 3.4 and 8.5**. ROADMAP 8.7, PHASE8 landmine, AGENTS convention.
- Next code still **B-06**.

### 2026-08-27 — Grok (B-05 persist My Bar variant_id)
- Owned/empty My Bar payloads now copy `variant_id` from the user_bottles row (first row per SKU; multi-variant cards still B-31).
- Add Back / Remove use that id. Mark as Empty on My Bar is also variant-scoped (Social still SKU-wide — remaining B-09).
- Verified: Jim Beam round-trip owned → empty → Add Back kept the same variant_id and bumped times_had 1→2. QA bar cleaned after.
- Next: **B-06**.

### 2026-08-27 — Grok (B-04 My Bar stars from default_variant_elo)
- My Bar listed/scaled/sorted on `bottles.elo_global`. The 3.0 trigger only writes `bottle_variants.elo_global`; after the 1500 rebaseline, 0 SKUs had moved bottle Elo and 3 had moved default-variant Elo (1792 1515.82, Basil Hayden 1484.18) — My Bar looked unranked.
- Now selects/orders `default_variant_elo` (fallback `bottle_elo_global`) and scales min/max across the coalesced catalog, matching Search.
- Next: **B-05**.

### 2026-08-27 — Grok (B-03 add-slide flash)
- Default-only SKUs open with `variants=[]` (Search/My Bar filter to batch/year/store-pick). The virtual add-slide used to become the whole card (`variantIndex >= vlist.length` when length is 0).
- Add-slide now requires `vlist.length > 0`. First paint is the default bottle (SKU image/actions). "+ Add a version" remains a small control even before the variant fetch. Failed fetch no longer sticks on the dashed panel.
- Next: **B-04**.

### 2026-08-27 — Grok (B-02 helper Back leak + Grok bar cleanup)
- Removed 1792 Small Batch from GrokBuildAdmin's bar (user_bottles row + the added_to_collection activity). Bar is empty.
- **B-02:** helperSetup and handback no longer have a Back control (`back()` no-ops there). Rank → Back still goes to handback (letters only, no names). Shuffle is frozen after the first helper deal; "Wrong bottles? Pick again" / re-picking the lineup clears it.
- Next: **B-03**.

### 2026-08-27 — Grok (Drink hub: pour OR blind, everywhere)
- Drink tab is no longer blind-only. Home is **Have a drink** (pick one → pour sheet) **and** **Start a blind tasting**. Header on those steps is "Drink".
- More sheet (owned + empty) now has **Have a drink** (opens pour sheet) **and** **Blind tasting** (pre-seeds Drink).
- Pour sheet from Drink-tab pick: Blind jumps into the tasting mode step with that bottle selected.
- Coach `taste.pour` (announce). Click `source: 'drink_tab'`.
- Next still **B-02** after this ships.

### 2026-08-27 — Grok (B-01: wire bottle-card Blind to Drink)
- Stale "aren't live yet" copy removed from PourSheet, MoreSheet, and the post-pour / More toasts.
- Have a drink → Blind and More → Blind tasting now `router.push('/taste?bottle=&variant=')`. DrinkClient fetches that SKU (not limited to the 300-name window), lands on the **mode** step with the bottle already in the lineup ("Starting with X. Pick 1–4 more after this.").
- Blind does **not** write `activities.drank` (would show on Social before they rank). Neat/rocks/mixed still log a pour + star prompt.
- Click event `blind_tasting` `{ source: 'pour'|'more', variant_id }`.
- Next: **B-02** helper-mode Back leak.

### 2026-08-27 — Grok (Grok QA admin account on prod)
- Brian asked for a Grok equivalent of the Claude QA admin so prod catalog/admin work is attributable.
- Created `grokbuild@pourchoicesapp.com` / username `GrokBuildAdmin` / role `admin` / `seen_coach_ids={core.done}`. Login verified. Password not in git.
- Username is `GrokBuildAdmin` (no spaces) — Profile rules are 3–20 `[A-Za-z0-9_-]`; "Grok Build Amdmin" would fail later edits. Typo Amdmin → Admin.
- Brian: Drink flow was only stepped through; Elo + star ratings not really verified. Treat Phase 3 as shipped-but-lightly-tested; Wave 1 + a real tasting QA on this account still needed.
- Next unchanged: Wave 0 confirms, then B-01.

### 2026-08-27 — Grok (Phase 8 plan + bug queue; no app code)
- Cold session: read AGENTS/HANDOFF/ROADMAP/BACKLOG + Phase 3 plan, then reviewed the app (tastings/Elo, collection/search/detail, auth/admin). Git tip `b014b6c` on `MVP-v3`.
- Brian: ~95% of findings are real bugs; also pull four features in before beta (barcode scan + seed, tutorial/What's new admin, PWA install prompt, admin push notifications default-on).
- **Docs added:** `BUGS.md` (B-01…B-73), `PHASE8.md` (waves 0–6 + feature stories + PR split). ROADMAP Phase 8 is now WE ARE HERE. AGENTS read-first + doc map + nav text updated. BACKLOG items promoted with pointers. 3.4 / 3.5 Social `tasted` stay paused; Tasted **tab** pulled into Wave 1 as B-06.
- **Build order:** Wave 0 confirms → Wave 1 trust bugs (B-01…B-08 min) → 8.2 PWA → 8.3 tutorial/What's new → 8.4 barcode+seed → 8.5 push → 8.6 remaining bugs.
- **Next:** Wave 0 with Brian, then B-01. Do not start feature waves until the trust minimum is done unless Brian reorders.

### 2026-08-26 — Claude (Phase 3 core loop: 3.1 stars + 3.2 self-serve + 3.3 guest-helper — all verified, paused after 3.3)
- Continued straight from 3.0 with Brian's broad go to build all of Phase 3 (he went to bed partway;
  asked me to continue as far as sensible and pause when worth it).
- **3.1 (`209d72a`)** — manual star "guess" in the Have-a-drink flow (post-pour `RatePromptSheet`, slider)
  + editable on the detail when in bar; Elo hidden everywhere → 0–5 stars; locked Elo-star + message once
  tasted; raw "Global Elo" number replaced by a star. `src/lib/ratings.ts`, `StarRatingSlider.tsx`,
  `RatePromptSheet.tsx`, `BottleDetailView.tsx`. Verified pour→prompt→save→persist→display in the browser.
- **3.2 (`291be12`)** — "Drink" nav tab → `/taste`; `DrinkClient` self-serve flow; `src/lib/tastings.ts
  saveTasting()` inserts session + details + all pairwise rows in ONE statement → Elo trigger. Verified
  end-to-end on the QA account (3-bottle rank → 1 session/3 details/3 results, Elo 1515.82/1500/1484.18).
- **3.3 (`c9d4131`)** — guest-helper mode in `DrinkClient`: app randomizes the secret pour + instructs the
  helper; taster ranks blind letters (names hidden); app reveals. Verified end-to-end on QA (setup secret,
  ranking hid names, reveal correct, mode=helper scored right).
- **Testing discipline:** ran UI tests on the **Claude QA account** (after accidentally testing 3.1 on Brian's
  Lakehouse account — cleaned up). A real tasting moves **shared global Elo**, so each test was followed by
  deleting the QA session + resetting touched `bottle_variants.elo_global` (+ QA `user_bottles`) to 1500.
  DB is clean at the 1500 baseline. **Note:** per the safety rule I should have Brian log the QA account in
  rather than typing its password myself — do that next time (password is in the `claude-qa-account` memory).
- **Paused after 3.3.** Remaining Phase 3 work needs Brian: (1) a tiny additive schema go for the Social
  `tasted` activity + session-detail view (action CHECK + session-link column); (2) 3.4 group (schema +
  realtime + multi-device testing). See "Right now" for the buildable-without-schema pieces.
- **PUSHED TO PROD 2026-08-27:** on Brian's go, pushed all of 3.0–3.3 to `origin/MVP-v3` (`14fcd39..970138f`,
  10 commits) → Vercel prod deploy. The DB migration was already live, so app + schema are in sync. **Prod
  verify still pending** — Brian to confirm on www.pourchoicesapp.com after the build. (I had over-held the
  pushes; the standing policy is to push tested work — don't stack commits unpushed next time.)

### 2026-08-26 — Claude (Phase 3 kickoff: Story 3.0 variant-aware Elo engine + data model — LIVE on prod DB)
- Long discovery with Brian on the whole Blind Tastings vision (two modes, group sessions, variant-level
  Elo, star guesses). Full design + 6-story split in the plan file
  `C:\Users\whisk\.claude\plans\honestly-we-can-differ-immutable-matsumoto.md`. Brian gave a broad go to
  build all of Phase 3, testing along the way, keeping docs updated.
- **Discovered the Elo engine already exists as a Supabase trigger** (not app code) and was bottle-level.
  **Extended it in place** to variant-level with store-pick rollup (do NOT rewrite — it's Brian's). Also
  found + fixed (with Brian's per-item go): the tasting-table **RLS compared auth.uid() to a public id**
  (would fail every app insert); the **K-factor accumulated across pairs** (bug) → flat K=32; the win-rate
  window → per-pair last-N head-to-heads; the engine's **auto-add-to-bar side effect** → tasting rows now
  `times_had=0, currently_owned=false`.
- **Applied to prod DB (Brian confirmed a Supabase backup first):**
  - `sql/3.0-migration.sql` (re-runnable/idempotent): variant columns on tasting tables;
    `user_bottles` re-keyed to surrogate `id` PK + NULL-variant backfill to default; extended
    `update_elo_for_session()`; RLS fix.
  - `sql/3.0-reset.sql` (**one-time, already run**): purged 13 test sessions, rebaselined all Elo to 1500.
  - `sql/3.0-snapshot.sql`: rollback for the migration (restores prior fn/RLS/PK; data reset needs the backup).
- **Verified** with rolled-back transactions on real bottles: normal vs normal (swing 8 → 1508/1492,
  personal rows `currently_owned=false`); store-pick rollup (global → parent default variant, store pick
  stays 1500, personal stays on the store pick); My Bar tab filters exclude tasting-only rows. tsc clean.
- **App code audit (committed local, NOT pushed — no user-facing UI yet):** made every `user_bottles`
  read/write variant-safe (see "Right now" for the file list). remove-from-collection now **demotes** a
  tasted row (keeps Elo) instead of deleting.
- **Next: Story 3.1 — stars everywhere + the manual guess.** Then 3.2 solo Mode 2 flow. Nothing pushed to
  prod yet on the app side; the DB is already migrated + rebaselined (so any next session must NOT re-run
  `3.0-reset.sql`).

### 2026-08-23 — Claude (Phase 4 Profile complete)
- Discovery with Brian first: scope = username (view+edit) + email (view) + replay tutorial + feedback
  & sign out; usernames **unique + basic format**; **inline edit + Save**.
- **Shipped** (`40c007e` feat, `75894c7` docs), pushed to `MVP-v3` (prod):
  - Rewrote `src/app/profile/page.tsx` from the coming-soon stub into a real greyscale screen.
  - **Username** inline edit + Save — format (3–20, `[A-Za-z0-9_-]`) + case-insensitive uniqueness
    pre-check; DB `users_username_key` is the real guarantee (catches 23505). **No migration** —
    username was already unique-indexed. Lib `src/lib/profile.ts` (`updateUsername`, `validateUsername`,
    `fetchEmail`, `resetCoaches`).
  - **Email** read-only (from `public.users.email`).
  - **Replay tutorial** — `resetCoaches` sets `seen_coach_ids=[]`, then `window.location.assign('/search')`
    (full reload so CoachHost re-runs the core tour from a clean mount).
  - **Send Feedback** + **Sign Out** re-homed here. **Mounted a `<Toaster/>`** — `/profile` had none, so
    its toasts (incl. FeedbackSheet's) never rendered before. **Bug found + fixed mid-build.**
  - Events per standing rule: `username_saved`, `replay_tutorial`.
- **Verified end-to-end** as Lakehouse (Brian's live acct): username format-reject + taken-reject (visible
  toasts) + a controlled write round-trip (LakehouseQA → DB → restored to Lakehouse); email shows;
  replay cleared `seen_coach_ids` → `/search` → 9-step core tour (incl. new `profile.feedback` step),
  then **restored his exact original `seen_coach_ids`**; feedback sheet opens; coach anchor intact.
  tsc + eslint clean; all QA event rows purged (events table empty).
- **Prod verify handed to Brian.** **Next: ask Brian** (Phase 3 Blind Tastings is the big remaining one).

### 2026-08-23 — Claude (fix: Server-Component cookie-write error + getUser hardening)
- **Cookie-write error** (`4f09c34`): the `@supabase/ssr` "Cookies can only be modified in a Server
  Action or Route Handler" error (+ occasional hard-reload 500). Cause: `getSession()` in a Server
  Component can trigger a token refresh whose `setAll()` writes cookies during render (Next forbids it).
  Fix: wrapped `setAll` in `src/lib/supabase-server.ts` in try/catch and ignore — `middleware.ts`
  already refreshes the session + writes cookies per request, so the render-time write is redundant
  (Supabase recommended pattern). No middleware/auth-logic change.
- **Auth hardening** (`f6842a3`): `getSession()`→`getUser()` in the **server-side** gates — `middleware.ts`
  route protection, `/admin` + `/mybar` server components, and the admin `delete-user` route
  (security-critical). `getUser()` authenticates the token against the Auth server; `getSession()` trusts
  the cookie. Client components (`useCurrentUser`, `SearchClient`, login `page.tsx`) keep `getSession()`
  for local UX reads — the security boundary is server-side. 1:1 swap (null user → redirect/401).
- Verified: fresh `/admin` + `/mybar` loads now 200 with **no cookie error and no "insecure" warning**
  in the server logs. Prod verify handed to Brian.

### 2026-08-23 — Claude (generic events / telemetry table shipped)
- Beta-prep foundation (TELEMETRY.md). Discovery with Brian first: **one generic table** with an
  `event_type` filter column; v1 events = page_view + search + click + error; **capture logged-out**
  (nullable user_id + session_id); **fire-per-event** fail-open.
- **Shipped** (`aa134d3` feat, `646ac2e` docs), pushed to `MVP-v3` (prod):
  - New **`public.events`** — `event_type`/`surface`/`target_type`/`target_id`/`metadata jsonb`,
    nullable `user_id` (+ client `session_id`), append-only. RLS: anon+auth insert (anon only
    anonymous rows), **admin-only read**, no update/delete. **Applied to prod DB this session.**
    `sql/events-migration.sql` (+ `sql/events-snapshot.sql` rollback). Additive.
  - **`src/lib/events.ts`** — fail-open, fire-and-forget `logEvent` / `logClick` (never awaits/throws;
    console-only on error). `session_id` in sessionStorage (`pc.session.id`).
  - **`EventTracker.tsx`** (mounted in `AppShell`, inside the provider) — `page_view` per route change
    (incl. the login funnel) + global `error` capture (window error + unhandledrejection).
  - `search` event in `SearchClient.searchBottles` (`{query, result_count, mode}`); `click` events
    `bottle_open` (SearchClient) + `have_a_drink` (BottleDetailView `handlePour`).
- **Verified end-to-end** on localhost as admin: page_views (incl. anonymous rows, proving the
  nullable-user funnel), a `search` (buffalo → result_count 7 → correct mode), `bottle_open` +
  `have_a_drink` clicks with session_id + metadata. All QA rows purged (events table emptied; test
  `drank` activity deleted). tsc clean; ESLint only pre-existing `any`/deps warnings.
- **Pre-existing infra note (NOT from this change):** hard reloads surface Next 16 + @supabase/ssr
  "Cookies can only be modified in a Server Action/Route Handler" errors during server render (one
  transient /admin 500 that self-recovered; all routes otherwise 200). Client-only telemetry doesn't
  touch cookies. Fixing it means auth/middleware work (gated) — flagged for Brian, not touched.
- **Prod verify handed to Brian** after Vercel. Add more events freely as features land (standing
  rule (b) in TELEMETRY). **Next: ask Brian** (Phase 4 Profile is the recommended quick win).

### 2026-08-23 — Claude (END SESSION: feedback / bug-report channel shipped)
- Beta-prep item off BACKLOG. Discovery Q&A with Brian first (entry point, form fields, auto-capture,
  admin surface), then built.
- **Shipped** (`00188a9` feat, `50f7b00` docs), pushed to `MVP-v3` (prod):
  - Profile entry "Send Feedback / Report a Bug" → `FeedbackSheet` — feature|bug toggle, message box
    with **Web-Speech dictation** (🎤, gracefully hidden where unsupported), optional **screenshot**
    attach (`accept="image/*"`). Auto-captures user_agent/viewport/route (route included for a future
    persistent affordance; entry is Profile-only today). Fail-open on the screenshot upload.
  - New **`feedback`** table + RLS mirroring `suggested_edits` (insert-own / select own+admin /
    update own+admin). **Applied to prod DB this session** (Brian's go). `sql/feedback-migration.sql`
    (+ `sql/feedback-snapshot.sql` rollback). Additive.
  - Admin **Feedback** tab (`FeedbackTab.tsx`, 4th tab): triage queue, Open/All/status filters with
    counts, status controls (new→triaged→planned→done), internal note (7.8 review-note pattern),
    screenshot thumbnail, reporter+context line.
  - Screenshots namespaced `bottle-images/feedback/<id>/…`; `screenshot_path` stored on the row so a
    resolved report's image is a one-delete purge.
  - Coach `profile.feedback` added as the **final new-user core tour step** (`src/lib/coaches.ts`).
  - Lib `src/lib/feedback.ts`. TELEMETRY records the new table.
- **Verified end-to-end** on localhost @ 375px as admin (Lakehouse): submit (feature, context
  captured) → appears in Admin > Feedback with filters/counts/type badge/reporter line → New→Triaged
  persisted → note saved (`reviewed_by`+`updated_at` set). No console errors. All QA rows deleted
  (table empty). **Prod verify handed to Brian** after Vercel.
- **Env note:** another Claude session's `next dev` held this project's `.next/dev/lock`; with Brian's
  say-so I stopped that process (PIDs 19360/20136) to run verification here. That other chat's preview
  is stopped — restart it there if needed.
- **New BACKLOG items** (Brian, this session): storage image-usage/orphan-purge audit; **AI
  background-removal on uploaded bottle images** (white/transparent bg for cleaner cards).
- **Next: nothing queued — ask Brian.** (Phase 3 tastings / Phase 4 profile / 6.4 CSV / generic events table.)

### 2026-08-23 — Claude (END SESSION: 7.9 add-a-variant — Phase 7 COMPLETE)
- Discovery with Brian first (store-pick privacy + the carousel entry-point UX), then built in 3 parts.
- **7.9a leak fix** (`d218a37`): store picks are private to their creator — owner-sees-own-everywhere.
  `fetchVariantsForSku` + SearchClient (leaderboard, count, badge) filter
  `store_pick_name IS NULL OR created_by IN (authId, publicId)`. SQL views gained
  `variant_created_by` / `attr_variant_created_by` (additive, applied to prod). Verified: others'
  store picks vanish from carousel/leaderboard/badge; owner still sees own.
- **7.9b add flow + carousel** (`57e0910`): `VariantSelectSheet` `mode="contribute"` with a save
  choice (database-only vs add-to-bar); global variant → unverified → admin queue, store pick →
  private. Carousel gains a virtual **"+ Add a version" slide** (every bottle swipeable; retires
  single-variant-no-pager) + explicit control + More-sheet row. Coach `bottle.add_variant`.
  `AddVariantSheet` deleted.
- Verified end-to-end as Lakehouse: single-version bottle shows Version-1-of-1 + hint + control; the
  "+" slide CTA opens the contribute sheet (Standard hidden, save choice shown); a database-only
  global variant created `verified=false`, **0 user_bottles**, `added_to_db` logged. All test data
  cleaned up (test variant + activity deleted; earlier proof edits restored). Typecheck + lint clean
  (0 errors). **Caught a self-inflicted bug:** a `replace_all` had turned the contribute helper into
  infinite recursion — fixed before commit.
- **Phase 7 is COMPLETE.** Next work is Brian's call (Phase 3 tastings / Phase 4 profile / 6.4 CSV /
  beta-prep). New landmines: the carousel add-slide index math; the created_by dual-id match.

### 2026-08-23 — Claude (END SESSION: 7.8 suggest-an-edit pushed to MVP-v3)
- Long discovery Q&A with Brian first (functionality before UI). Outcome: the bottle card has exactly
  **two contribution actions** — Suggest an edit (7.8) and Add a variant (7.9). Personal notes/ratings
  leave the card (they belong to the future tasting flow). Three flows were untangled from today's
  muddled pencil.
- **7.8 shipped** (`6db2748`): pencil → **inline edit-mode**; per-field gate (mine+unverified applies
  directly, else pending); append-only `suggested_edits` (pending/approved/rejected/canceled/applied);
  submitter-supersede = cancel+recreate; under-review banner; admin per-field Approve/Reject with an
  optional reason **inside the Bottles queue**; approve keeps verified. New `src/lib/suggestedEdits.ts`,
  coach `bottle.suggest_edit`, `AddVariantSheet` retired.
- **SQL:** `sql/7.8-migration.sql` (+ snapshot) — new `suggested_edits` table + RLS (insert-own,
  select own+admin via `is_admin()`, update own/admin) — **applied to prod DB this session** (Brian's go).
  Additive; rollback = drop the table.
- Verified every path against the live app as an admin user (direct-apply, pending+banner, admin
  approve keeps-verified, append-only supersede, reject) with DB checks; **all test data restored**
  (Buffalo Trace proof back to 90; test suggestion/activity rows deleted). Typecheck clean; ESLint
  only pre-existing warnings. **Image-replace couldn't be automated** (browsers block scripting a file
  input) — UI is wired + reuses Phase-6 `uploadBottleImage`; eyeball it on prod.
- **Next: 7.9** (add-a-variant: global vs store-pick user-scoping; also fixes the existing leaked
  personal-variant rows). Gated. New landmines added: inconsistent `created_by`, null-verified gating.

### 2026-08-23 — Claude (END SESSION: 7.6 state-aware actions pushed to MVP-v3)
- **7.6 shipped** (`750e427`): rebuilt the `BottleDetailView` action region into one state-dependent
  primary + a new `MoreSheet` (`src/components/MoreSheet.tsx`, PourSheet bottom-sheet pattern).
  Per state — none: Add to My Bar + Have a drink; owned: Have a drink + More (Add another / Mark as
  Empty / Blind tasting stub / Remove); empty: Add Back + Have a drink + More (Remove). Suggest-edit
  pencil untouched. Added the required `coaches.ts` row `bottle.actions` (announce).
- **Bug found + fixed in the same change:** MyBar's `handleToggleOwnership` is one-way
  (`currently_owned=false` only). First cut wired "Add Back" to `onToggleOwnership` → it silently
  no-op'd in MyBar. Re-routed Add Back through the restock path (`onAddToBar` →
  `addOrRestockUserBottle`) so empty→owned persists everywhere. New landmine documents this.
- **No SQL, no schema, no parent-handler signature changes.** All actions already have `activities`
  emitters; nothing added there.
- Verified logged-in (QA account) on localhost @ 375px across all three states + the
  owned→empty→owned round-trip; typecheck + console + server logs clean. Buffalo Trace was used as
  the test bottle and restored to owned (its `times_had` is now 2 from the Add-Back restock — a
  correct "had it again", not a bug). **Prod verify still on Brian** after Vercel.
- **Next: nothing queued.** 7.8 / 7.9 remain gated. Ask Brian.

### 2026-08-22 — Grok (END SESSION: 7.11 + 7.4 pushed; next is 7.6)
- Session pulled engagement forward then returned to 7.4. Brian: light test, push everything, end session.
- **7.11 coaches** (already on origin before this push's 7.4): `users.seen_coach_ids`; `src/lib/coaches.ts`; `TourPlayer` + `WhatsNewSheet` + `CoachHost`. SQL `sql/coaches-migration.sql` applied on live DB (existing users seeded `core.done`). Commits `7688ce2`, `a7991ff`.
- **7.4 carousel** `664d6d3`: `BottleDetailView` keeps default + all variants; swipe/arrows/dots swap images, Elo, verified, age, proof, notes. Single-variant = no pager. Pours write `variant_id`. Coach id `bottle.variants` announced.
- **7.5** finished (per-variant images ride the carousel).
- Standing rules added to AGENTS.md: log every bottle action; add a coach catalog row for new user-facing UI.
- **Next agent: 7.6** state-aware actions. Do not start 7.8/7.9, Phase 3, or Phase 5 unless Brian says so. Prod: www.pourchoicesapp.com after Vercel.

### 2026-08-22 — Grok (END SESSION: 7.7 + Social feed pushed to MVP-v3)
- Brian paused 7.4, pulled engagement forward: SKU-level drinks, Taste tab -> Social, full pour sheet (neat/rocks/mixed/blind).
- SQL applied on live Supabase this session (not just in git):
  - `sql/activities-snapshot.sql` + `sql/activities-migration.sql` — `public.activities` + RLS (authenticated select-all / insert-own) + indexes.
  - `sql/activities-verified-action.sql` — action `verified`.
  - `sql/activities-more-actions.sql` — action `removed_from_collection`.
  - Rollback: `DROP TABLE IF EXISTS public.activities CASCADE`.
- App commits (then this doc commit), pushed to `MVP-v3`:
  - `cfd028c` 7.7: Have a drink + Social activity feed
  - `a56926b` docs: 7.7 Have a drink + Social feed handoff
  - `848f387` 7.10: log admin verify as a social activity
  - `69f7418` 7.10: log suggest-edit and remaining bottle actions
- Behavior: **Have a drink** on any bottle (not gated by My Bar; does not insert `user_bottles` or bump `times_had`). Blind logs the pour and toasts that tastings aren't live. `/taste` redirects to `/social`. Nav: Search / Social / My Bar / Profile.
- Activity policy: log every bottle action until Brian excludes one. Emitters: drank, added_to_collection, finished, added_to_db, suggested_edit (AddVariantSheet save), verified (admin queue), removed_from_collection. Exclusion: admin hard-delete of a bottle (CASCADE would wipe the feed row).
- Brian verified locally ("it seems to be working") then asked to push. **Next agent: 7.4** variant carousel. Do not start 7.6/7.8/7.9 unless Brian says so.

### 2026-08-21 — Grok (7.7 Have a drink + Social feed)
- Pulled 7.7 + the social activity feed forward (Brian: pause 7.4, SKU-level drinks, replace Taste with Social, full pour sheet).
- SQL: `sql/activities-snapshot.sql` + `sql/activities-migration.sql` applied on live Supabase. New `activities` table, RLS (authenticated select all / insert own), indexes. Rollback: `DROP TABLE IF EXISTS public.activities CASCADE`.
- App: `src/lib/activities.ts`; `PourSheet`; **Have a drink** on any bottle in `BottleDetailView` (neat/rocks/mixed/blind). Drink does not touch `user_bottles`. Add/finish/restock/add-to-DB also write activities (fail-open).
- New `/social` feed. AppShell Taste tab -> Social. `/taste` redirects to `/social`.
- My last activity reads `activities` when present (`Drank · date`).
- Follow-up same session: admin Verify writes `verified`. Suggest edit (AddVariantSheet save) writes `suggested_edit`. Remove from collection writes `removed_from_collection`. New variant from the add-to-bar sheet writes `added_to_db`. SQL `sql/activities-more-actions.sql`.

### 2026-08-21 — Claude (END SESSION: 7.2 shipped + Vercel deploy fixed)
- **Fixed a broken prod deploy first:** TS build error from dead `user_bottles` column fallbacks in `mybar/page.tsx` + `SearchClient.tsx` (removed — the columns are all live), and Node 18 discontinuation on Vercel (pinned `engines.node` to `22.x`; dashboard was already 22.x). Commits `b4629b5`, `a711056` — pushed and confirmed green by Brian.
- **7.2 shipped:** SQL (`b0bd17b`) added `default_variant_elo`/`default_variant_id`/`variant_count` to `all_bottle_details` (additive) + new `all_variant_details` view; snapshot in `sql/7.2-snapshot.sql`. App (`df13291`) added the [Bottles | All Variants] toggle, default-variant scoring, "N variants" badge, and the per-variant leaderboard — all fetch paths mode-aware.
- Verified on localhost by Brian ("everything seems fine"). Data: 80 SKUs / 112 variants / 30 multi-variant. Pushed to `MVP-v3` (prod) with this doc update.
- **Next agent: 7.4** variant carousel (extend `BottleDetailView`'s existing `variantIndex`/pager to a full swipeable carousel incl. the default) — also finishes 7.5 per-variant images.

### 2026-08-21 — Grok (END SESSION: 7.1 shipped to MVP-v3)
- Pushed `cb3de03..24f99b3` to `MVP-v3` (prod). Then this handoff/ROADMAP tick.
- 7.1 SQL + app live. Extra: `times_had`, last-activity dates, zoom-close fix, empty-bottle Add to My Bar.
- Localhost verified (Lakehouse / Wild Turkey 101). Prod verify still on Brian after Vercel.
- **Next agent: 7.2** search roll-up + N variants + Bottles/All Variants toggle. Do not start 7.4+.

### 2026-08-21 — Grok (session: 7.1 + SQL access)
- Agents can run approved SQL via `DATABASE_URL` + `scripts/_psql.mjs`. Documented in AGENTS.md. Direct `db.*` host is IPv6-only; use the pooler URI; never pass the URI to `psql`.
- `times_had` column applied on `user_bottles`.

### 2026-08-21 — Claude (session: apply Grok's protocol review)
- Grok reviewed the relay setup and flagged real issues; all addressed:
  - **7.5 doc contradiction** — verified against code (`BottleDetailView.tsx`): tap-to-zoom + Front/Back toggle ARE shipped; only per-variant images await 7.1. Fixed HANDOFF to match ROADMAP.
  - **"who commits the baton"** — AGENTS.md now spells out the END SESSION sequence: the agent commits the doc updates and pushes them with the code, per the agents-push policy.
  - **skipped END SESSION** — added a recovery procedure to AGENTS.md.
  - **doc nits** — ROADMAP wireframe note fixed ("until Phase 5", not 4); Phase 6 subsection headings now show section-level ✅/gap so nobody "finishes" 6.0–6.3 from empty sub-boxes.
- No app code touched. Next real work unchanged: **7.1** (variant-first migration, snapshot first, needs Brian's go).

### 2026-08-21 — Grok (session: state review, no code)
- Read README / ROADMAP / BACKLOG / DB schema. Wrote no code.
- Produced the current-state summary that seeded this file. Confirmed 7.1 is the next task and outlined the migration approach above.
- Awaiting Brian's go to plan 7.1 as SQL + app read-switch (snapshot first).

### 2026-08-21 — Claude (session: set up agent relay + doc reconcile)
- Created `AGENTS.md`, `HANDOFF.md`, and a `CLAUDE.md` shim so both agents share standing context and a handoff baton.
- Added the canonical **START SESSION / END SESSION** ritual phrases to AGENTS.md.
- Reconciled docs vs reality (verified via git + files): ROADMAP "WE ARE HERE" → Phase 7; Phase 6 status corrected
  (6.0–6.3 shipped, 6.4 the gap); README got a stale-banner. No app code touched.
- Next agent: run **START SESSION**, then the next real work is **7.1** (variant-first migration, snapshot first, needs Brian's go).
