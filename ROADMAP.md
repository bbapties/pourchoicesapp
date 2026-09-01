# Pour Choices — Build Roadmap

**Philosophy:** Functionality first. Black/grey/white wireframe visuals until Phase 5 (the design phase).
**Commit rule:** One feature or fix per commit. Test before every commit.
**WE ARE HERE:** **Phase 8 — Pre-beta cut.** Stories in [PHASE8.md](PHASE8.md); bugs in [BUGS.md](BUGS.md).
**Test checklist before every push:**
  - [ ] Works locally (localhost:3000)
  - [ ] Works on mobile (192.168.68.74:3000)
  - [ ] Pushed to GitHub
  - [ ] Verified on prod (www.pourchoicesapp.com)

---

## Dev / QA accounts
- **Claude QA account** — `claude@pourchoicesapp.com` / role `admin`. Dedicated account so Claude's QA and bottle/variant adds are attributable (`created_by`) and Claude can exercise admin screens. **Temporary — delete once the app is more built.** Weak password by design; never grant it anything the account shouldn't touch beyond admin, and treat it as compromisable on public prod.
- **Grok QA account** — `grokbuild@pourchoicesapp.com` / username `GrokBuildAdmin` / role `admin`. Same deal for Grok (this session). Created 2026-08-27 so catalog/admin actions Grok performs in prod are attributable. **Temporary — delete after beta.** Weak password by design; treat as compromisable on public prod. Password is **not** stored in git — Brian has it; Grok should ask rather than commit it.

---

## Phase 1 — Polish Existing Screens
Goal: Make everything that exists work correctly end-to-end.

- [x] 1.0 Drop in brand assets (cellar-bg.png, coming-soon.jpg to /public)
- [x] 1.1 Splash/login screen — cellar-bg, 1.5s intentional pause, step-by-step auth wizard, redirect to /mybar
- [x] 1.1 Placeholder pages — coming-soon image on mybar/taste/profile
- [x] 1.1 AppShell — 4-tab nav (Search/Social/My Bar/Profile; Taste replaced 2026-08-21), hidden on login page
- [x] 1.2 Search — result count banner, sort dropdown (A-Z/Yours/Global), star ratings replacing percentile
- [x] 1.3 Search — "Add to My Bar" saves to DB; toggle "Finished It"; hard delete with confirmation (Story 6.13, 6.17)
- [x] 1.4 Indicator earmarks on cards (provisional=dot, owned=green✓, past=grey✓, splits for dual status) (Story 6.18, 6.28, 6.42)

## Phase 2 — My Bar
Goal: Full personal collection management.

- [x] 2.1 My Bar grid — card-medium list, count banner, sort (A-Z/Global), empty state (Stories 6.21–6.23)
- [ ] 2.2 My Bar — edit bottle (tap → detail view with toggle/delete already wired) (Story 6.24)
- [ ] 2.3 My Bar — FAB redirects to search/add flow (Story 6.26)

## Phase 3 — Blind Tastings  ·  CORE LOOP SHIPPED (3.0–3.3, prod 2026-08-27); 3.4/3.5 remain
Goal: Full tasting flow with Elo calculation.

**Reworked plan (discovery with Brian, 2026-08-26).** Full design + story split in the plan file
`C:\Users\whisk\.claude\plans\honestly-we-can-differ-immutable-matsumoto.md`. Two modes (guest-helper w/
in-app reveal vs. self-serve/report-only), hosted group sessions, **variant-level Elo** (global excludes
store picks w/ rollup to the parent default; personal includes them), Elo hidden → shown as 0–5★, a
display-only manual star "guess" wiped to a 1500 baseline on first tasting. Build order:
- [x] **3.0 Variant-aware Elo engine + data model** — LIVE on prod DB + verified 2026-08-26; app code
  SHIPPED to prod 2026-08-27. The Elo engine is a Supabase trigger (extended, not rewritten);
  `user_bottles` re-keyed per-variant; all Elo rebaselined to 1500; tasting-table RLS fixed. See HANDOFF.
- [x] **3.1 Stars everywhere + manual guess** — DONE (shipped to prod `209d72a`, verified 2026-08-26).
  Guess captured in the Have-a-drink flow (post-pour prompt) + editable on detail when in bar; Elo hidden
  everywhere (shown as 0-5 stars); locked Elo-star + message once tasted. Slider input.
- [x] **3.2 Solo Mode 2 (self-serve) flow** — DONE (shipped to prod `291be12`, verified end-to-end on
  the QA account 2026-08-26). "Drink" nav tab → /taste; pick 2-5 → auto A-E label → rank → save →
  Elo scored via the trigger. `lib/tastings.ts`, `src/app/taste/DrinkClient.tsx`.
- [x] **3.3 Solo Mode 1 (guest helper) flow** — DONE (shipped to prod `c9d4131`, verified on QA account
  2026-08-26). App randomizes the secret pour, instructs the helper, taster ranks blind letters, app reveals.
  Both solo tasting modes now work end-to-end.
- [ ] **3.4 Group sessions** — host/join via short code; per-person reveal + Elo ⏸ PAUSED (needs schema +
  realtime + multi-device testing). **Out of the pre-beta cut** — do not start during Phase 8 unless Brian says so.
- [ ] **3.5 Trimmings** — per-glass notes, My Bar "Tasted" tab, Social `tasted` activity + session-detail view,
  coaches. Social `tasted` + session-detail still need additive schema. **Tasted tab pulled forward into Phase 8.1 (B-06)** so testers aren't lied to; the rest stays paused.

Original story-level checklist (maps into 3.2–3.4 above; kept for AC reference):
- [ ] 3.1 Tasting picker — select 2–5 bottles, tray fills (Stories 6.29–6.30)
- [ ] 3.2 Partner handoff screens — overlay + walkthrough (Story 6.30)
- [ ] 3.3 Ghost cards — draggable A–E, tap to expand notes accordion (Stories 6.31–6.32)
- [ ] 3.4 Ranking complete → confirm → reveal cascade (Stories 6.33–6.34)
- [ ] 3.5 Elo calculation — client-side Momentum-Elo, sync to Supabase (Stories 6.33–6.34)
- [ ] 3.6 Post-tasting — update history, gray earmarks on past bottles (Story 6.36)

## Phase 4 — Profile Page  ✅ COMPLETE (2026-08-23)
Goal: Basic user profile management.

- [x] 4.1 View username/email — real greyscale/wireframe screen (replaces the coming-soon stub); email read-only from `public.users`.
- [x] 4.2 Edit username — inline edit + Save; format (3–20, `[A-Za-z0-9_-]`) + case-insensitive uniqueness (DB `users_username_key` is the guarantee). Lib `src/lib/profile.ts`.
- [x] 4.3 Sign out — retained.
- Extras: **Replay tutorial** (resets `seen_coach_ids`, reloads to `/search` → core tour replays); **Send Feedback** re-homed here; a `<Toaster />` now mounts on `/profile` (it previously had none). Events: `username_saved`, `replay_tutorial`.

## Phase 5 — Design & Polish (DO NOT START EARLY)
Goal: Apply full design system from the MVP doc.

- [ ] 5.1 Fonts — Playfair Display + Inter
- [ ] 5.2 Colors — charcoal/amber/gold/ivory throughout
- [ ] 5.3 Animations — 0.3s fades, reveal flip, swipe glow
- [ ] 5.4 Splash screen artwork
- [ ] 5.5 Mobile thumb-zone audit across all screens

---

## Phase 6 — Admin Panel  ·  mostly shipped (6.4 remaining)
Goal: Internal tooling — manage users, verify/clean bottles, bulk-import data.
**Status (reconciled 2026-08-21 via git + files):** 6.0 Foundation ✅ · 6.1 Users tab ✅ · 6.2 Image upload ✅ (core) · 6.3 Bottles queue ✅ · 6.4 CSV import ⬜ — **the remaining gap**.
Evidence: admin shell + role gate `ab9cfbb`, Users tab + cascade delete `c302164`, image upload `6e44dff`, bottles queue `3ab1ce0`. Files present: `src/app/admin/{AdminClient,UsersTab,BottlesTab,ImportTab}.tsx`, `src/lib/uploadBottleImage.ts`, `src/app/api/admin/delete-user/route.ts`. `ImportTab.tsx` is a shell — 6.4 not built.
> ⚠️ The granular sub-checkboxes below were **not individually re-audited** — treat code + commits as source of truth. Known spec mismatches: no `DB_SCHEMA.sql` at root (only `DB_Schema.txt.txt`); no `src/lib/useCurrentUser.ts` (role logic lives elsewhere).
Triggered: admin-only 5th nav tab. Granted via `users.role = 'admin'` (manually flipped in Supabase).

### 6.0 Foundation — ✅ SHIPPED (`ab9cfbb`; admin files present) · sub-boxes below not re-audited
- [ ] Commit DB_SCHEMA.sql at repo root (reference snapshot of Supabase schema)
- [ ] SQL to run in Supabase dashboard:
  - `alter table users add column role text not null default 'user' check (role in ('user','admin'))`
  - Create storage bucket `bottle-images` (public read; authenticated insert; RLS for update/delete)
  - RPC `delete_user_cascade(target uuid)` — SECURITY DEFINER, admin-only, cascade order: tasting_results → tasting_details → tasting_sessions → user_bottles → public.users
  - RPC `commit_bottle_import(payload jsonb)` — SECURITY DEFINER, admin-only, atomic bottles+variants insert with `(name,distillery)` dedup
  - RLS: admins can update/delete `bottles` and `bottle_variants`
- [ ] `src/lib/useCurrentUser.ts` — context + hook returning `{ publicUserId, role, isAdmin, loading }`
- [ ] AppShell: conditional 5th nav item "Admin" (lucide Shield icon) when `isAdmin`
- [ ] `src/app/admin/page.tsx` — server component re-checks role, redirects non-admins; renders AdminClient with tabs Users / Bottles / Import
- [ ] `src/app/api/admin/delete-user/route.ts` — server route using service-role key to wipe `auth.users` row after RPC succeeds; re-checks caller is admin

### 6.1 Users tab — ✅ SHIPPED (`c302164`, `UsersTab.tsx`) · sub-boxes below not re-audited
- [ ] List users with username, email, created_at, role, #bottles, #sessions
- [ ] Search filter
- [ ] Delete row → confirm modal (type username) → RPC + auth wipe → toast
- [ ] Block self-delete

### 6.2 Image upload (prereq for bottle management) — ✅ SHIPPED core (`6e44dff`, `uploadBottleImage.ts`) · EditVariantSheet button + full perm rules not re-audited
- [ ] `src/lib/uploadBottleImage.ts` — upload to bottle-images bucket, return public URL
- [ ] Fix ProvisionalSheet — currently `image` File field is silently dropped; wire to helper
- [ ] EditVariantSheet — add upload button alongside URL input
- [ ] Permission rules:
  - Unverified bottle/variant: creator OR admin can edit images
  - Verified with valid image: admin-only
  - Verified with missing/broken image: any authenticated user can replace; upload auto-sets `verified=false` + shows "re-review pending" toast
  - Broken-image detection: `<img onError>` swaps to placeholder with "Upload replacement" button

### 6.3 Bottles tab — ✅ SHIPPED queue (`3ab1ce0`, `BottlesTab.tsx`) · All-Bottles sub-tab not re-audited
- [ ] Queue sub-tab — merged queue, one card per unverified bottle, variants nested inside; verified bottles with unverified variants also appear
- [ ] Row actions: Verify / Edit (reuse existing) / Delete
- [ ] Delete confirm shows counts AND list of affected usernames (`select username from users where id in (select user_id from user_bottles where bottle_id = X)`)
- [ ] All Bottles sub-tab — searchable table over `all_bottle_details` with same row actions

### 6.4 CSV bulk import tab — ⬜ NOT BUILT (this is the Phase 6 gap; `ImportTab.tsx` is a shell)
- [ ] Template: `bottle_name, distillery, category, style, age, proof, volume, barcode, nose, palate, finish, extras, variant_release_year, variant_batch, variant_store_pick_name, variant_proof, variant_age, variant_notes`
- [ ] Parse with `papaparse`; group rows by `(bottle_name, distillery)` so duplicated bottle columns collapse into one bottle with N variants
- [ ] Validate-then-commit preview: "Would create N new bottles, M new variants. Would attach K variants to existing bottles: [list]. Errors: [list]."
- [ ] Existing bottle (name+distillery match) → reuse; append new variants only (dedup by release_year+batch+store_pick_name)
- [ ] Commit button → single `commit_bottle_import(payload)` RPC, all-or-nothing
- [ ] All new bottles + variants land `verified=false` → flow into queue
- [ ] "Download template" link

### Decisions locked (do not re-debate)
- Role model: enum-like text column (`user`/`admin`), default `user`, no `moderator` tier yet
- User delete: hard cascade incl. `auth.users` row (via service-role server route)
- Bottle verify: existing `verified` flag stays; admin UI provides queue + actions
- Bottle delete: cascade with impact preview (counts + usernames)
- Image perms: creator+admin while unverified; admin-only when verified; any auth user when image missing/broken (silently flips verified=false, toast)
- CSV duplicates: reuse existing bottle, append new variants
- Auth layers: client hides nav → server gate on /admin → SECURITY DEFINER RPCs re-check role

---

## Phase 7 — Bottle Detail Revamp & Variant-First Model  ✅ COMPLETE (7.1–7.11 shipped)
Design agreed 2026-07-25 (mockup approved). Full rationale in memory: `bottle-detail-revamp`.
Still greyscale/wireframe (styling = later). The blind-tasting branch depends on Phase 3 (Taste flow), currently a stub.

**Progress (2026-08-23):** **Phase 7 COMPLETE — 7.1–7.11 shipped to `MVP-v3`.** 7.9 landed add-a-variant (global vs private store pick) + the store-pick scoping leak fix + the carousel "+" slide. **Next major work is elsewhere** — Phase 3 Blind Tastings (big, flagship must-have, still a stub), Phase 4 Profile (coming-soon stub), Phase 6.4 CSV import (shell), or the remaining beta-prep item in BACKLOG (generic events table). **Beta-prep feedback/bug-report channel SHIPPED 2026-08-23** (Profile entry + Admin > Feedback triage queue; `feedback` table). See HANDOFF for the recommendation. Ask Brian.

### Design summary
- **Variants are near-full bottles** — each has its own Elo, nose/palate/finish, verified status, and front/back images. A "SKU/label" (name + distillery + category/style) groups them.
- **Detail card = horizontal swipeable carousel** over [Default bottle + variants]; swiping swaps the *whole* card. Subtitle = "Default bottle" / variant name; pager + dots; "N variants" indicator.
- **Portrait image** (left) with a **Front/Back segmented toggle beneath** (tap, not swipe; extensible to a 3rd slot); tap image = full-screen zoom + close. Short attrs **beside** the image: age, proof, size, Global Elo, Verified. **My last activity** full-width, per-user ("Drank · date" / "None"). Details label-less except Global Elo / Verified / My last activity; category+style combine ("Bourbon · Whiskey").
- Nose/palate/finish consolidated into one **"Characteristics and tasting notes"** accordion (static text for now).
- **Actions:** Edit = small pencil; one **state-dependent primary** (Add to My Bar / Log a Pour / Add Back) + a **More** bottom sheet. **Mark as Empty** = soft delete (hidden from My Bar, kept in history).
- **Log a Pour** = one action branching into neat / rocks / mixed / blind tasting (feeds a future activity feed).
- **Search** = one card per SKU (default) + "N variants" badge + persistent **[Bottles | All Variants]** toggle.
- **Moderation:** (A) edit an existing field → *pending suggestion*, golden copy untouched, admin approves & applies. (B/C) add a variant → publishes immediately as **unverified** (yellow dot); save choice **"Save to database only"** vs **"Save and add to my bar"**; flows to the admin verify queue.

### Tasks — goals & exit criteria

Epic A — Variant-first data model
- [x] 7.1 Variant records get their own identity (shipped 2026-08-21; SQL + app on `MVP-v3`)
  - Goal: each variant has its own Elo, nose/palate/finish, verified flag, and front/back images; every bottle backfills a "default" variant.
  - Exit: every bottle has ≥1 variant; each variant has independent Elo/notes/verified/images; no data lost from current bottle-level fields; a SKU can return its ordered variants (default first).
  - Live: 80 bottles, 112 variants, 0 missing default. Additive cols on `bottle_variants`; unique index one default per SKU. Search still reads `all_bottle_details` (bottle-level Elo) until 7.2.
- [x] 7.2 Search roll-up + variant count + toggle (shipped 2026-08-21; SQL + app on `MVP-v3`)
  - Goal: search shows one card per SKU with an "N variants" badge and a persistent [Bottles | All Variants] toggle.
  - Exit: default = one row per SKU (scored from the default variant); All Variants lists each variant as its own card sorted by its own Elo; badge count correct.
  - Live: `all_bottle_details` gained `default_variant_elo`/`default_variant_id`/`variant_count` (additive); new `all_variant_details` view. Bottles view scores from the default variant + "N variants" badge (hidden at 1); All Variants = per-variant cards sorted by variant Elo with a subtitle tag. Star scaling/count/pagination/search/filters are mode-aware. 80 SKUs / 112 variants.

Epic B — Detail card UI
- [x] 7.3 New detail-card layout (shipped 2026-07-25, commit 66d028c)
  - Goal: rebuild `BottleDetailView` to the approved layout (portrait image + attrs beside, label-less stack, My last activity, tasting-notes accordion).
  - Exit: matches the mockup for the default variant; nose/palate/finish in one accordion; only Global Elo / Verified / My last activity labeled; My last activity shows the user's last action or "None".
- [x] 7.4 Variant carousel
  - Goal: swipeable carousel over [default + variants]; whole card swaps on swipe; subtitle + pager + dots.
  - Exit: swiping changes every variant-specific field + subtitle; position/count shown; single-variant SKUs show no pager.
- [x] 7.5 Image interactions — placeholder + tap-to-zoom + Front/Back (`573cfe3`); zoom-close `27e5702`; per-variant images via 7.4 carousel.
  - Goal: portrait image, Front/Back toggle beneath (tap), tap-to-zoom full-screen + close, per-variant images, extensible to a 3rd slot.
  - Exit: toggle flips image without swiping; tap opens full-screen zoom + close; each variant shows its own images; missing/broken → placeholder.

Epic C — Actions & moderation
- [x] 7.6 State-aware action control (2026-08-23, on `MVP-v3`)
  - Goal: state-dependent primary (Add to My Bar / Log a Pour / Add Back) + More sheet (Add another, Blind tasting, Mark as Empty) + a separate Suggest-edit pencil.
  - Exit: visible actions match state (not owned / owned / empty); Mark as Empty soft-deletes (hidden from My Bar, kept in history).
  - Live: one state-dependent primary + `MoreSheet` (bottom sheet). none → Add to My Bar + Have a drink; owned → Have a drink + More (Add another / Mark as Empty / Blind tasting stub / Remove); empty → Add Back + Have a drink + More (Remove). Mark as Empty = existing `onToggleOwnership` (soft). **Add Back routes through the restock path (`onAddToBar` → `addOrRestockUserBottle`), NOT the toggle** — MyBar's `handleToggleOwnership` is one-way finished-only, so wiring Add Back to it silently no-ops. Suggest-edit pencil unchanged. Coach row `bottle.actions` (announce). `bottle.have_a_drink` anchor stays on a visible element in every state.
- [x] 7.7 Log a Pour branch (SKU-level prototype, 2026-08-21)
  - Goal: one Have a drink action branching into neat / rocks / mixed / blind tasting; records a drink event. **SKU-level UI; pours now attach `variant_id` when the carousel is on a specific version (7.4).**
  - Exit: choosing a type records an `activities` row + updates My last activity. Does **not** add the bottle to My Bar or increment `times_had`. Blind logs the pour and toasts that tastings aren't live (Phase 3 still a stub; `/taste` redirects to `/social`).
- [x] 7.8 Suggest-an-edit (correction) flow (2026-08-23, on `MVP-v3`)
  - Goal: editing existing fields creates a pending suggestion (golden copy untouched) → admin queue → approve applies.
  - Exit: user edit doesn't change live data; appears in the admin queue as pending (before/after); approve applies; user sees "under review". (Needs a suggested-edits table.)
  - Live: detail-card pencil now enters **inline edit-mode** over the visible version's fields (identity → `bottles`; proof/age/notes/images/batch/year → the shown variant); image area becomes an upload target. Gate per field: **mine (created_by==authId) AND unverified → applies directly**; else **pending** → admin. New append-only `suggested_edits` table (pending/approved/rejected/canceled/applied); revising own pending supersedes it (cancel+recreate), others' coexist. `under review` banner; per-field Approve/Reject **inside the Bottles queue** with an optional review reason; approve keeps verified. Lib `src/lib/suggestedEdits.ts`. Coach `bottle.suggest_edit`. `AddVariantSheet` retired. Store-pick user-scoping + the existing leaked personal-variant rows are **7.9**.
- [x] 7.9 Contribute / add-a-variant flow (2026-08-23, on `MVP-v3`)
  - Goal: new variant publishes immediately as unverified with a save choice ("database only" vs "and add to my bar"); flows to the verify queue.
  - Exit: new variant visible to all as unverified; "and add to my bar" also adds it to the user's collection (usable now); appears in the admin Bottles queue.
  - Live: two kinds — **global variant** (batch/release-year, everyone sees, `verified=false` → admin queue) and **store pick** (private to creator). **Store-pick scoping (leak fix):** carousel/leaderboard/badge now filter `store_pick_name IS NULL OR created_by IN (my authId, my publicId)` — owner-sees-own-everywhere, others hidden. Save choice on both types (DB-only vs add-to-bar). Entry: a virtual **"+ Add a version" carousel slide** (every bottle swipeable now — retires single-variant-no-pager) + an explicit control + a More-sheet row. `VariantSelectSheet` gained `mode="contribute"`. SQL added `variant_created_by`/`attr_variant_created_by` to the two views (`sql/7.9-*.sql`). Coach `bottle.add_variant`. `AddVariantSheet` deleted.

- [x] 7.10 Social activity feed (pulled forward from BACKLOG, 2026-08-21)
  - Goal: bottom-nav Social tab; reverse-chronological global feed of bottle, username, action.
  - Exit: Search / Social / My Bar / Profile; rows for drank / added to collection / finished / added to DB / verified / suggested an edit / removed from collection; tap opens bottle detail. Policy: log every bottle action until Brian excludes one. Admin hard-delete of a bottle is the current exclusion (CASCADE would wipe the feed row).
- [x] 7.11 First-use coach marks + What's new (2026-08-22, on `MVP-v3`)
  - Goal: new users get a short **live-UI visual tour** of today's core (Search, Have a drink, Social, My Bar). Existing users get **one What's new digest per session** (Show me plays that feature's tour). Pile-up never autoplays 20 tours. Catalog in `src/lib/coaches.ts` — one row per future feature.
  - Exit: `users.seen_coach_ids`; existing accounts seeded with `core.done`; Skip/Got it persist; greyscale overlay + digest sheet. New user-facing PRs add a catalog row.

Notes: 7.4/7.5 done (carousel + per-variant images). 7.7 pours attach `variant_id` of the visible slide. Live blind tastings wait on Phase 3. New user-facing PRs add a `src/lib/coaches.ts` row. Deferred to BACKLOG: personal comments, flavor tagging → charts, 3rd image slot, follows/likes/comments.

---

## Phase 8 — Pre-beta cut  ·  WE ARE HERE (2026-08-27)
Goal: testers get a trustworthy first session (URL → install → signup → tour → search/drink), plus barcode scan and admin push. Full narrative + feature stories: **[PHASE8.md](PHASE8.md)**. Bug IDs: **[BUGS.md](BUGS.md)**.

Paused **out** of this cut: 3.4 group tastings, 3.5 Social `tasted` + session-detail (schema), Phase 5 polish, 6.4 CSV (unless barcode seeding needs a thin import). Do not pull those in unless Brian says so.

### 8.0 Prod safety (confirm on live DB / Vercel — ask before changing)
- [ ] B-18 anon `SELECT` on `public.users` (login email lookup)
- [ ] B-19 `users.role` not self-updatable
- [ ] B-20 `delete_user_cascade` re-checks `is_admin()` inside the function
- [ ] B-21 Vercel `SUPABASE_SERVICE_ROLE_KEY` vs local `SUPABASE_SERVICE_ROLE`
- [ ] B-22 rotate/demote QA admin password (Brian)
- [ ] Prod-verify 3.0–3.3 on www.pourchoicesapp.com (still pending)

### 8.1 Trust bugs (minimum before invite: B-01 … B-08)
- [x] B-01 Stop "tastings aren't live" copy; wire More / pour-blind to Drink
      (follow-up: Drink tab + More both offer **Have a drink** *and* **Blind tasting**)
- [x] B-02 Helper-mode Back leak + re-shuffle
- [x] B-03 Default bottles flash as "+ Add a version"
- [x] B-04 My Bar stars from `default_variant_elo`
- [x] B-05 Persist My Bar `variant_id`; Add Back / Remove the right variant
- [x] B-06 Wire Tasted tab **or** hide it (don't lie with Tasted (0))
- [ ] B-07 `saveTasting` one transaction / no double Elo
- [ ] B-08 Signup uses same username rules as Profile; no orphan Auth users
- [ ] B-09 … B-17 (1b cluster — scoped empty, store-pick flash, VariantSelectSheet both ids, search `.or()` escape, etc.)

### 8.2 PWA — install as an app (Android + iOS)
- [ ] Manifest + icons + apple-touch / theme-color
- [ ] Service worker (app-shell; needed later for push)
- [ ] First-visit prompt: Install (recommended) vs Continue in browser; skip if already installed
- [ ] iOS: instructional Add to Home Screen (no programmatic install)
- [ ] Events: `pwa_prompt_shown` / `pwa_install_clicked` / `pwa_continue_browser`

### 8.3 Tutorial + admin What's new
- [ ] Discovery with Brian: new-user core steps (must include Drink)
- [ ] Rewrite `COACH_CATALOG` core flags/copy to match
- [ ] Admin publish/unpublish for What's new (stop auto-piling every `announce: true`)
- [ ] Replay tutorial still replays **core** only
- [ ] Events: `tour_*` / `whatsnew_*`

### 8.4 Barcode scan + catalog seed
- [ ] Census: how many `bottles.barcode` are filled
- [~] Shared scan sheet on bottle search — **done on Search + My Bar** (`BarcodeScannerSheet`, Claude 2026-08-27); Drink picker still pending
- [x] Exact lookup → open bottle; miss → provisional add with barcode filled (`lib/barcode.ts`, Claude 2026-08-27)
- [ ] Seed existing SKUs (script/preview; no invented codes) — only Buffalo Trace has a verified barcode so far; Blanton's/Eagle Rare pending Brian's approval
- [x] Coach `search.barcode`; event `click/barcode_scan { matched }` (Claude 2026-08-27)

### 8.5 Admin push notifications
- [ ] Profile Notifications toggle, **default on**
- [ ] Web Push (VAPID, server-only private key) + SW handler — needs 8.2
- [ ] Admin: send to everyone **or** one user
- [ ] Optional: What's new "also send as push"
- [ ] Browser-only users stay on What's new (no fake desktop-notification strategy in v1)

### 8.6 Remaining bugs
- [~] In progress. **Shipped 2026-08-30 (Claude, autonomous):** B-31 (per-variant detail ownership +
  had-it earmark), B-33 (honest Remove copy), B-35/B-36 (restock correctness), B-39/B-43/B-66 (truthful
  copy). **B-32 model-resolved** (dual-tab is intended) but its code needs the two-count ownership work.
- [~] **PHASE9 Wave 2 (2026-08-30/09-01): 8/10 shipped** — #1 two-count, #2 tastings-finished,
  #3 ratings fallback, #4 submission hardening, #5 honest search, #6 feed cascade, **#7 drink picker
  (B-48/B-54)**, **#8 wishlist-in-history + barcode two-zone chooser (A.1)**. Remaining: #9 telemetry
  integrity (B-60/B-61), #10 docs + polish. See [PHASE9.md](PHASE9.md).
- [ ] Still **open** in [BUGS.md](BUGS.md): B-23 tier-2, B-24 follow-ups, **B-32 two-count model**,
  B-34/37/38 search, B-58 feedback UPDATE, B-59 uploads, then medium/low. Elo math (B-50/B-57) = ask
  Brian before changing.

> **Bottle behavior is now specced in [BOTTLE_ACTIONS.md](BOTTLE_ACTIONS.md)** — the agreed model for
> every collection / consumption / evaluation action. Diff new work against it. Net-new pieces still to
> build: two-count ownership (B-32), wishlist tab, per-variant history modal, global-guess rating fallback.

### 8.7 Id cleanup — before 3.4 / 8.5 (gated, auth)
- [ ] **B-74** `public.users.id` ≠ `auth.users.id`. Do not assume they are equal. Standardize `created_by` (B-46) and any new `user_id` FKs. Snapshot + Brian's go. Until then: resolve via `users.auth_id`, match **both** ids on `created_by`. See BUGS.md B-74.

---

## Completed
(Move items here as they're done)
- [x] Auth — email/password signup/login
- [x] Protected routes via middleware
- [x] Bottle search — fuzzy full-text search
- [x] card-slim list display
- [x] card-full bottle detail modal
- [x] Global Elo percentile display
- [x] Provisional bottle submission form
- [x] AppShell + bottom nav
- [x] Vercel + Supabase connected
- [x] www.pourchoicesapp.com live
- [x] 7.7 Have a drink (SKU-level pour sheet; any bottle; `activities.drank`)
- [x] 7.10 Social activity feed (Taste tab replaced; global feed)
- [x] 7.4 Variant carousel (default included; swipe swaps the card)
- [x] 7.5 Per-variant images on the carousel
- [x] 7.11 First-use coaches + What's new digest
- [x] 7.6 State-aware action control (primary + More sheet; Add Back via restock)
- [x] 7.8 Suggest-an-edit (inline edit-mode; gate + append-only suggested_edits; admin per-field review)
- [x] 7.9 Add-a-variant (global vs private store pick; store-pick scoping leak fix; carousel "+" slide)
