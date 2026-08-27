# Pour Choices — Bug queue

Canonical list of issues found in the 2026-08-27 Grok session review (tastings/Elo, collection/search, auth/admin). Brian: treat ~95% as real bugs and work them through.

**How to use:** pick the next open item from the current wave in [PHASE8.md](PHASE8.md) / [ROADMAP.md](ROADMAP.md) Phase 8. One bug (or a tight related cluster) per commit. Tick the box here when it ships, and note the commit in HANDOFF.

Status key: **open** · **confirm** (must check live DB / Vercel, don't "fix" until confirmed) · **deferred** (logged, not in the current wave)

---

## Wave 1 — Trust (testers will think the app is unfinished)

These ship before any new feature. Do them in this order.

- [x] **B-01** (high) Blind-tasting copy is stale on the bottle card.
  Pour sheet, More sheet, and post-pour toast still say "aren't live yet" / "Not live yet". More → Blind tasting only toasts; Have a drink → Blind logs a pour and does not open `/taste`. Real flow is the Drink tab.
  `src/components/PourSheet.tsx` ~10 · `MoreSheet.tsx` ~16–44 · `BottleDetailView.tsx` ~467–468, 1059–1062
  **Shipped:** copy updated; Have a drink → Blind and More → Blind tasting open `/taste?bottle=&variant=` with the bottle pre-seeded (no `drank` activity). DrinkClient lands on the mode step with that bottle already in the lineup.
- [x] **B-02** (high) Guest-helper Back leaks the secret mapping, then re-shuffles.
  Rank → Back → handback → Back lands on helper setup (bottle → glass letters). Continue from handoff shuffles again after glasses are poured.
  `src/app/taste/DrinkClient.tsx` ~144–150, 259–276
  **Shipped:** Back is hidden on helperSetup + handback. `back()` no-ops on those steps. Helper shuffle is frozen after the first deal; changing the lineup (afterPick / "Wrong bottles? Pick again") clears it so a new deal is intentional.
- [x] **B-03** (high) Default bottles flash as the "+ Add a version" slide.
  Search/My Bar/Social build `variants` by filtering to batch/year/store-pick, so a default-only SKU opens with `vlist=[]`. While logged in the virtual add-slide becomes the whole card (no image, no Add to My Bar) until `fetchVariantsForSku` returns. Failed fetch stays stuck.
  `BottleDetailView.tsx` ~102–107, 174–198 · `SearchClient.tsx` ~143–150
  **Shipped:** add-slide only exists when `vlist.length > 0`. Empty list shows the default bottle card (SKU fields) plus the small "+ Add a version" control — not the dashed add panel as the whole card.
- [x] **B-04** (high) My Bar stars/sort still use `bottles.elo_global`.
  The 3.0 trigger only writes `bottle_variants.elo_global`. Search uses variant Elo; My Bar does not. After the 1500 rebaseline, tastings will not move My Bar stars.
  `src/app/mybar/page.tsx` ~39–104 · `MyBarClient.tsx` `calcStarsFromElo`
  **Shipped:** My Bar reads/sorts/scales from `default_variant_elo` (fallback `bottle_elo_global`), same as Search. Live check at fix time: 3 SKUs had moved variant Elo; 0 had moved `bottles.elo_global`.
- [x] **B-05** (critical) My Bar drops `variant_id`, so Add Back / Remove hit the default variant.
  Query selects `variant_id` then never copies it onto the card payload. Restock/remove fall back to `resolveDefaultVariantId`. Finish a store pick → Add Back restocks the standard bottle; Remove can demote the wrong row.
  `src/app/mybar/page.tsx` ~20–73 · `MyBarClient.tsx` ~161–221
  **Shipped:** owned/empty payloads copy `variant_id` from the user_bottles row. Add Back / Remove / Mark as Empty are scoped to that variant. (SKU-collapsed cards for multiple owned variants = B-31, still open.)
- [x] **B-06** (high) My Bar "Tasted" tab is a hard-coded empty stub.
  Always `Tasted (0)` / "No tastings yet" even after a real tasting. Tasting-only rows have nowhere to live. Either wire it (reads `tasting_results` + `user_bottles`) or hide the tab until 3.5.
  `MyBarClient.tsx` ~392–415 · `mybar/page.tsx` ~26–34
  **Shipped:** Tasted lists variants this user ranked that they do **not** own and never finished (excludes star-guess placeholders with no `tasting_results`). One card per variant. Count is live. Tap opens detail as not-in-collection (Add to My Bar). Ones you own stay on In My Bar / Empty.
- [x] **B-07** (high) `saveTasting` retry could double-score global Elo. **FIXED (Claude, 2026-08-27).**
  Cause: a retry after a silently-successful results insert created a NEW session and fired the Elo trigger again. Note in this line was stale — a unique `(tasting_session_id, winner_bottle_id, loser_bottle_id)` guard already exists, so per-session dedup was fine; the gap was cross-session. Fix (app-only, no schema/RPC/trigger change): `saveTasting` reuses the session on retry and upserts results with `ignoreDuplicates` (ON CONFLICT DO NOTHING) → a retry inserts 0 rows → trigger sees no new rows and cannot double-score; details written once (on first creation). `DrinkClient` holds a `pendingSessionRef` reused across retries, cleared on success/reset. Verified via a rolled-back DB test (retry left Elo unchanged; a new session double-scored).
  `src/lib/tastings.ts` · `src/app/taste/DrinkClient.tsx`
  **How to fix (for Claude):** Ask Brian, then snapshot + additive RPC. Preferred: `save_tasting(...)` SECURITY DEFINER function that inserts session + details + **all pairwise `tasting_results` in ONE INSERT** (Elo trigger contract — do **not** rewrite `update_elo_for_session`). App calls the RPC instead of three client inserts. Add a unique constraint on `(tasting_session_id, winner_variant_id, loser_variant_id)` so a retry of the same session cannot double-fire. `user_id` is **public.users.id** (B-74 — never `auth.uid()`). Keep DrinkClient `saving` guard. Test on Grok/Claude QA accounts; purge the test session and reset touched Elos to 1500 after.
- [x] **B-08** (high) Signup could orphan an Auth user. **FIXED (Claude, 2026-08-27).**
  Signup now: validates username format (`validateUsername` from `lib/profile`), pre-checks username uniqueness (case-insensitive) at the username step BEFORE `auth.signUp` so a duplicate can't create an Auth user with no `public.users` row, and checks the `users` insert error — on failure it signs out (so an authed-but-profileless session can't bounce-loop on `/mybar`) and surfaces the error (23505 → "already taken") instead of always `router.replace("/mybar")`. `router.replace` now only runs on success. `src/app/page.tsx`.
  **Remaining (separate feature, not this fix):** no forgot-password / reset flow. Existing orphaned Auth users (pre-fix) still need an admin/server cleanup — surface via a signup that hits "User already registered" with no profile.

---

## Wave 1b — Same area, ship with the trust cluster

- [x] **B-09** (high) Mark as Empty was SKU-wide in Social. **FIXED (Claude, 2026-08-27).**
  `SocialClient.handleToggleOwnership` now scopes the `currently_owned=false` update to the card's `variant_id` (`.eq(variant_id)` / `.is(variant_id,null)`), matching My Bar (B-05) and the per-(user,variant) `user_bottles` model — finishing one version no longer empties the whole SKU. My Bar half already shipped with B-05. `SocialClient.tsx`.
- [x] **B-10** (high) Other people's store picks could flash in the initial carousel. **FIXED (Claude, 2026-08-27).**
  The variant arrays that seed the carousel from a list row are now filtered client-side by the same predicate as `fetchVariantsForSku` — new shared helper `isVariantVisibleToViewer(storePickName, createdBy, [authId, publicId])` in `lib/variants.ts` (globals always; store picks only to their creator, matching auth OR public id). Applied in SearchClient `mapBottleResult`, MyBarClient `handleCardClick`, and SocialClient `mapDetail`. Also added `attr_variant_created_by` to My Bar's `detailFields` and Social's `DETAIL_SELECT` so both can filter (Search already had it). tsc/build/lint clean.
- [x] **B-11** (high) `VariantSelectSheet` only matched `created_by = authId`. **FIXED (Claude, 2026-08-27).**
  Both the previous-store list and the reuse-existing check now match `created_by IN (authId, publicUserId)` (via `.in(...)`), so a store pick stamped with the user's public id is found and reused instead of duplicated. Added `publicUserId` to the fetch effect deps. `VariantSelectSheet.tsx`.
- [x] **B-12** (high) Search "My last activity" could show Finished on a tasting-only row. **FIXED (Claude, 2026-08-27).**
  `handleBottleClick` no longer takes an unordered `userBottlesMap[skuId][0]`; it uses the ownership row only (`currently_owned`, else `times_had >= 1`). A tasting-only row (`times_had = 0`, never owned) now yields no "Finished" label instead of mislabeling the SKU. `SearchClient.tsx`.
- [x] **B-13** (medium) Search interpolated the query into PostgREST `.or()`. **FIXED (Claude, 2026-08-27).**
  The value is now double-quoted + escaped (`"%term%"`, with `\`/`"` escaped) so commas, parentheses, apostrophes, or quotes (`Maker's Mark`, `batch 1, 2`) can't break the filter; a query error now shows a toast instead of silently emptying results. `SearchClient.tsx`.
- [x] **B-14** (medium) Confirm sheet said "Yes, reveal" even in self-serve. **FIXED (Claude, 2026-08-27).**
  The confirm button is now mode-aware: "Yes, reveal" for helper, "Save ranking" for self-serve (no in-app reveal there). `DrinkClient.tsx`.
- [x] **B-15** (medium) Collection actions ignored the visible carousel variant. **FIXED (Claude, 2026-08-27).**
  `BottleDetailView` now passes `currentVariant.variantId` to `onAddToBar`/`onToggleOwnership`/`onDeleteFromBar` (signatures gained the variant arg); Search/My Bar/Social handlers prefer that variant (fallback to the SKU's ownership row), so Empty/Remove/toggle hit the version you are looking at.
- [x] **B-16** (medium) Add Back from Empty didn't switch My Bar to In My Bar. **FIXED (Claude, 2026-08-27).**
  `handleAddToBar` now `setActiveTab('owned')` on a successful add, so the restocked bottle appears instead of vanishing from Empty. `MyBarClient.tsx`.
- [x] **B-17** (medium) Social collection status raced `publicUserId`. **FIXED (Claude, 2026-08-27).**
  `openBottle` resolves the auth/public id on demand (via `auth.getUser` → `users`) when the context hasn't resolved yet, so a quick tap no longer shows Add to My Bar on an owned bottle. `SocialClient.tsx`.

---

## Wave 0 — Confirm on prod (do not "fix" until checked)

Gated: auth / RLS / env. Ask Brian before changing.

- [x] **B-18** (critical) Anon `SELECT` on `public.users` (`USING(true)`) let the anon key dump every email/username/role. **FIXED (Claude, 2026-08-27).**
  `Public read users` policy scoped to `{authenticated}`; the logged-out login email-check now calls a SECURITY DEFINER RPC `email_exists(email)` that returns only a boolean (`page.tsx`). `sql/b18-b19-auth-hardening-migration.sql`. NOTE: authenticated users can still read other rows (usernames needed for feed/admin) — a `public_profiles` view to hide others' email/role is a follow-up.
- [x] **B-19** (high) `users.role` was self-updatable. **FIXED (Claude, 2026-08-27).**
  `BEFORE INSERT/UPDATE` trigger `protect_user_role()` resets `role` for non-admin authenticated callers (INSERT → 'user'; UPDATE → keeps old); service-role SQL (no `auth.uid()`) and admins unaffected. Verified: non-admin self-escalate blocked, admin allowed, service-role allowed. Same migration.
- [x] **B-20** (high) `delete_user_cascade` admin re-check. **CONFIRMED SAFE — no change.**
  The SECURITY DEFINER function already re-checks `role='admin'` (via `auth_id=auth.uid()`) and blocks self-delete. `src/app/api/admin/delete-user/route.ts`.
- [x] **B-21** (high) Service-role env name mismatch. **FIXED (Claude, 2026-08-27).**
  Route now reads `SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_SERVICE_ROLE`. **Still set the correct env in Vercel** (either name now works). `delete-user/route.ts`.
- [ ] **B-22** (high) QA admin account has a weak password on public prod. **Brian's action — cannot be done in code.**
  `claude@pourchoicesapp.com` / `grokbuild@pourchoicesapp.com` can verify/delete bottles + cascade-delete users. Rotate the password in Supabase (or delete the account) before testers arrive. Claude won't handle credentials.
- [ ] **B-23** (high) Elo can be farmed via extra `tasting_results` inserts.
  Trigger fires on every insert. Session owner can INSERT/UPDATE/DELETE own results. DELETE does not unwind Elo.
  `sql/3.0-migration.sql` ~93–250
- [ ] **B-24** (high) Store-pick "privacy" is client-side only.
  Any authed client can `select` `bottle_variants` / the views. UI filters hide them; RLS does not.
  `src/lib/variants.ts` · `sql/7.9-migration.sql`

---

## Auth / signup / profile

- [ ] **B-25** (high) No password minimum in the app (unless Supabase Auth is configured).
  `src/app/page.tsx` ~270–300
- [ ] **B-26** (high) No forgot-password / reset on the only auth surface.
  `src/app/page.tsx`
- [ ] **B-27** (medium) Username uniqueness is case-sensitive in DB, case-insensitive in the app.
  `Lakehouse` vs `lakehouse` both succeed. `src/lib/profile.ts` ~33–48
- [ ] **B-28** (medium) Signup does not reuse `validateUsername` (3–20, `[A-Za-z0-9_-]`).
  Covered in spirit by B-08; keep until signup calls the same helper.
- [ ] **B-29** (low) Delete-user partial failure leaves an Auth orphan.
  Public cascade can succeed, then `auth.users` delete 500s (`partial: true`).
  `delete-user/route.ts` ~65–80
- [ ] **B-30** (low) No self-serve account delete / data export on Profile.

---

## Collection / variants / search (remaining)

- [ ] **B-31** (high) Collection UI is SKU-level; DB is per-variant.
  Owning any version shows In My Bar on every carousel slide, including versions never added.
  `SearchClient.tsx` ~318–321, 833–834 · `BottleDetailView.tsx` ~159–164
- [ ] **B-32** (high) Same SKU can appear in both My Bar tabs; times_had/dates last-write-wins on `bottle_id`.
  `mybar/page.tsx` ~36–88
- [ ] **B-33** (high) Remove of a tasted bottle hides it everywhere.
  Demotes to `times_had=0`; Empty requires `times_had>=1`; Tasted is stub. Copy says it deletes history but Elo is kept.
  `userBottles.ts` ~124–130 · `BottleDetailView.tsx` ~970–971
- [ ] **B-34** (medium) Search All Variants banner count/Elo include others' store picks.
  Server page fetch is unscoped; client browse is scoped. Count vs list mismatch.
  `search/page.tsx` ~14–31
- [ ] **B-35** (medium) Search optimistic restock keys `variant_id: null` while the DB row is the default UUID.
  Phantom null row until refresh. `SearchClient.tsx` ~480–508
- [ ] **B-36** (medium) `addOrRestockUserBottle` is read-then-insert, no `ON CONFLICT`.
  Double-tap race → generic "Failed to add to My Bar". `userBottles.ts` ~62–95
- [ ] **B-37** (medium) Contribute flow can insert empty global variants (blank proof/batch/year). No uniqueness on (bottle, batch, year).
  `VariantSelectSheet.tsx` ~151–177
- [ ] **B-38** (medium) Browse + filter is client-side on the first page.
  Banner can say 40 matches while the list shows the 4 that were in the first 30 Elo rows.
  `SearchClient.tsx` ~325–333, 571–595
- [ ] **B-39** (medium) Search "Yours" sort still toasts "Taste some bottles to unlock…" even after tastings exist.
  `SearchClient.tsx` ~340–345
- [ ] **B-40** (low) `setRatingStars` inserts a tasting-only `user_bottles` row (pour itself does not). Contradicts a strict reading of "drinks never create user_bottles."
  `ratings.ts` ~89–98
- [ ] **B-41** (low) `formatLastActivity` has no tasting-only branch (not-owned always reads as Finished).
  `userBottles.ts` ~19–28
- [ ] **B-42** (low) Search toggle can set `currently_owned=true` without incrementing `times_had` (dead path if Add Back stays on restock).
  `SearchClient.tsx` ~522–525
- [ ] **B-43** (low) More sheet "Hidden from My Bar" for Mark as Empty — it actually moves to Empty Bottles.
  `MoreSheet.tsx` ~43
- [ ] **B-44** (low) Five–six bottom nav items on a 375px thumb zone.
  `AppShell.tsx` ~24–33
- [ ] **B-45** (low) Suggest-edit "mine" gate is auth-id only (`created_by === authId`).
  Public-id rows go to pending. `suggestedEdits.ts` ~100–101
- [ ] **B-46** (medium) `created_by` mixed auth id vs public id across bottles/variants.
  Symptom of **B-74**. Until B-74, every owner-scope filter must match both. HANDOFF landmine.

---

## Auth id vs public id (do before later features — gated)

- [ ] **B-74** (high, gated — auth) **`public.users.id` is not `auth.users.id`.**
  Caught by Claude, logged 2026-08-27. `public.users` has its own UUID PK; `auth_id` is the FK to `auth.users.id`. They are **never equal** (or only by accident). Several later features will break if they write `auth.uid()` into a column that FKs to `public.users.id`, or assume `created_by` / `user_id` / `users.id` are interchangeable.
  Already bitten: tasting-table RLS (fixed in 3.0 by resolving `auth.uid()` → `public.users.id`); `created_by` on bottles/variants is mixed (B-11, B-45, B-46); store-pick filters have to match both ids.
  **Will bite next:** 3.4 group tasting participants, 8.5 push subscriptions / notifications `user_id`, any "this is mine" gate, admin attribution.
  **Until a dedicated cleanup:** (1) FKs to people = `public.users.id`. Resolve with `users.auth_id = auth.uid()`. (2) Never `user_id = auth.uid()`. (3) `created_by` is mixed — match **both** ids. (4) Don't "fix" by making public PK = auth id without a snapshot + Brian's go — that's auth territory.
  Not part of Wave 1. Schedule **before 3.4 and 8.5**, or as its own gated cleanup. Snapshot + explicit go.

---

## Tastings / Elo (remaining)

- [ ] **B-47** (medium) Manual star guess is not wiped on first tasting.
  Trigger `ON CONFLICT` only updates `elo`. UI hides the guess only if `hasBlindTasted()` is true; that helper ignores query errors (`count ?? 0` → false) so the card can stay editable after a real tasting.
  `sql/3.0-migration.sql` ~162–170 · `ratings.ts` · `BottleDetailView.tsx` ~136–138
- [ ] **B-48** (medium) Drink picker catalog is 300 SKUs, name/distillery substring, default variant only.
  Bottles after the 300th name are invisible; store picks cannot be lined up (known 3.2 gap). Fetch failure shows empty with no error.
  `DrinkClient.tsx` ~47–75
- [ ] **B-49** (medium) Global Elo lost-update under concurrent tastings.
  Read Elo into a variable, then write `elo + swing` with no `SELECT FOR UPDATE` / `elo_global = elo_global + swing`.
  `sql/3.0-migration.sql` ~189–211
- [ ] **B-50** (medium) Pair win-rate of 0 zeroes the entire Elo swing.
  `swing = K * (1 - expected) * win_rate`. After a 10–0 streak a reversal moves 0. Existing engine math — flag, don't rewrite without Brian.
  `sql/3.0-migration.sql` ~139–157, 207–208
- [ ] **B-51** (medium) Completing a tasting writes no `activities` and no `events` row.
  Schema CHECK has no `'tasted'` (known 3.5). TELEMETRY policy not met for the new surface.
  `DrinkClient.tsx` `handleSave` · `tastings.ts`
- [ ] **B-52** (medium) `removeUserBottle` treats `elo === 1500` as never tasted (hard-delete). A net-zero tasting is lost.
  Already in BACKLOG; keep here so it has an ID. `userBottles.ts` ~124
- [ ] **B-53** (low) `saveTasting` stores `bottle_ids`/`variant_ids` in ranked order, not pour order; glass letters not persisted. Hurts a later session-detail view.
- [ ] **B-54** (low) Drink picker does not log search/click events.
- [ ] **B-55** (confirm / low) 3.0 migration replaces the Elo function only — does not `CREATE TRIGGER`. Relies on pre-existing `trig_update_elo_after_session`. If missing, inserts succeed with no Elo.
- [ ] **B-56** (low) NULL-variant backfill skipped when a default-variant row already exists; leftover NULL row can sit beside the scored variant row.
- [ ] **B-57** (medium) Global win-rate keys off actual variant ids, not rollup targets (store pick vs X ≠ default vs X history). Already in BACKLOG Elo refinements.

---

## Admin / feedback / telemetry / storage

- [ ] **B-58** (high) Feedback / suggested_edits UPDATE lets the submitter change any column on their row (status, admin_note, new_value after submit).
  Not actually append-only at the DB. `sql/feedback-migration.sql` ~75–88 · `sql/7.8-migration.sql` ~75–90
- [ ] **B-59** (high) Public `bottle-images` + unsanitized upload.
  Extension from `file.name`; `contentType` client-supplied; no size cap. Feedback screenshots are world-readable public URLs.
  `uploadBottleImage.ts` · `feedback.ts` ~41–58
- [ ] **B-60** (medium) Events table: unbounded anon inserts (`user_id IS NULL`), no rate limit, free-form jsonb.
  `sql/events-migration.sql` · `src/lib/events.ts`
- [ ] **B-61** (medium) `EventTracker` page_views often stamp `user_id = null` for logged-in users.
  Fires once per pathname before `useCurrentUser` resolves; never re-logs.
  `EventTracker.tsx` ~19–26
- [ ] **B-62** (medium) Admin UsersTab over-counts; BottlesTab delete-impact includes tasters.
  Already in BACKLOG. `UsersTab.tsx` ~28–47 · `BottlesTab.tsx` ~227–241
- [ ] **B-63** (medium) Search `.or()` filter injection / extra rows — see B-13.
- [ ] **B-64** (medium) Middleware matcher excludes `/api/*`. Fine for delete-user (self-gates); easy to add an unprotected API later.
  `middleware.ts` ~54–56
- [ ] **B-65** (medium) Cookie `setAll` swallowed in Server Components; relies on middleware refresh. Paths the matcher skips won't get a new token during RSC render.
  `supabase-server.ts` ~14–24
- [ ] **B-66** (low) CSV import tab still says "coming in Phase 3."
  `ImportTab.tsx`
- [ ] **B-67** (low) `CoachHost` persist is last-write-wins on `seen_coach_ids` (two tabs can drop an id).
  `coaches.ts` ~245–259
- [ ] **B-68** (low) Feedback/events have no size/rate limits (long messages, huge screenshots).
- [ ] **B-69** (low) No CSP / security headers in `next.config.ts`.
- [ ] **B-70** (low) ROADMAP/AGENTS still advertise the QA email and "weak password."
- [ ] **B-71** (docs) HANDOFF / AGENTS product surface is stale (`/taste` → `/social`, Profile = stub, Taste gone). Fix with the Phase 8 docs pass.
- [ ] **B-72** (docs) `user_bottles` landmine still says "one row per (user, bottle)". It is per-variant since 3.0.
- [ ] **B-73** (docs) `DB_Schema.txt.txt` lags the live DB.

---

## Already handled (do not re-fix)

Leave these alone unless a regression shows up:

- Tasting-only rows (`times_had=0`) do not count as in-collection in Search/Social; My Bar Empty requires `times_had>=1`.
- Have a drink does not insert `user_bottles` or bump `times_had` (the follow-up rating can — B-40).
- Add Back in My Bar / Social goes through restock, not the one-way toggle.
- Social no longer uses `.maybeSingle()` on `user_bottles`.
- Store-pick owner-scope in `fetchVariantsForSku` + All Variants browse matches both ids (VariantSelectSheet does not — B-11).
- SearchClient `any` casts on union table + `.or()` are intentional.
- Middleware / admin page / delete-user API use `getUser()` server-side.
- Tasting RLS resolves `auth.uid()` → `public.users.id`.
- Events RLS: anon insert only if `user_id IS NULL`; authed insert as self; SELECT admin-only.
- Activities insert-own via `auth.uid() → users.auth_id`.
- Pairwise tasting results go in one INSERT (contract is correct; atomicity of the three steps is B-07).

---

## Source

Grok session 2026-08-27, three read-only passes over `C:\pourchoices-frontend` (tastings/Elo, collection/search/detail, auth/admin). Git tip at review: `b014b6c` on `MVP-v3`.
