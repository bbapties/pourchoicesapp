# Pour Choices — Build Roadmap

**Philosophy:** Functionality first. Black/grey/white wireframe visuals until Phase 5 (the design phase).
**Commit rule:** One feature or fix per commit. Test before every commit.
**Test checklist before every push:**
  - [ ] Works locally (localhost:3000)
  - [ ] Works on mobile (192.168.68.74:3000)
  - [ ] Pushed to GitHub
  - [ ] Verified on prod (www.pourchoicesapp.com)

---

## Dev / QA accounts
- **Claude QA account** — `claude@pourchoicesapp.com` / role `admin`. Dedicated account so Claude's QA and bottle/variant adds are attributable (`created_by`) and Claude can exercise admin screens. **Temporary — delete once the app is more built.** Weak password by design; never grant it anything the account shouldn't touch beyond admin, and treat it as compromisable on public prod.

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

## Phase 3 — Blind Tastings
Goal: Full tasting flow with Elo calculation.

- [ ] 3.1 Tasting picker — select 2–5 bottles, tray fills (Stories 6.29–6.30)
- [ ] 3.2 Partner handoff screens — overlay + walkthrough (Story 6.30)
- [ ] 3.3 Ghost cards — draggable A–E, tap to expand notes accordion (Stories 6.31–6.32)
- [ ] 3.4 Ranking complete → confirm → reveal cascade (Stories 6.33–6.34)
- [ ] 3.5 Elo calculation — client-side Momentum-Elo, sync to Supabase (Stories 6.33–6.34)
- [ ] 3.6 Post-tasting — update history, gray earmarks on past bottles (Story 6.36)

## Phase 4 — Profile Page
Goal: Basic user profile management.

- [ ] 4.1 View username/email
- [ ] 4.2 Edit username
- [ ] 4.3 Sign out

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

## Phase 7 — Bottle Detail Revamp & Variant-First Model  ← WE ARE HERE
Design agreed 2026-07-25 (mockup approved). Full rationale in memory: `bottle-detail-revamp`.
Still greyscale/wireframe (styling = later). The blind-tasting branch depends on Phase 3 (Taste flow), currently a stub.

**Progress (2026-08-22):** **7.1, 7.2, 7.4, 7.5, 7.7, 7.10, 7.11.** 7.11 coach marks pushed to `MVP-v3`. 7.4 carousel includes the default variant; the whole detail card swaps (images, Elo, notes, proof). **Next: 7.6** state-aware actions (or 7.8 suggest-edit) unless Brian says otherwise.

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
- [ ] 7.6 State-aware action control
  - Goal: state-dependent primary (Add to My Bar / Log a Pour / Add Back) + More sheet (Add another, Blind tasting, Mark as Empty) + a separate Suggest-edit pencil.
  - Exit: visible actions match state (not owned / owned / empty); Mark as Empty soft-deletes (hidden from My Bar, kept in history).
- [x] 7.7 Log a Pour branch (SKU-level prototype, 2026-08-21)
  - Goal: one Have a drink action branching into neat / rocks / mixed / blind tasting; records a drink event. **SKU-level UI; pours now attach `variant_id` when the carousel is on a specific version (7.4).**
  - Exit: choosing a type records an `activities` row + updates My last activity. Does **not** add the bottle to My Bar or increment `times_had`. Blind logs the pour and toasts that tastings aren't live (Phase 3 still a stub; `/taste` redirects to `/social`).
- [ ] 7.8 Suggest-an-edit (correction) flow
  - Goal: editing existing fields creates a pending suggestion (golden copy untouched) → admin queue → approve applies.
  - Exit: user edit doesn't change live data; appears in the admin queue as pending (before/after); approve applies; user sees "under review". (Needs a suggested-edits table.)
- [ ] 7.9 Contribute / add-a-variant flow
  - Goal: new variant publishes immediately as unverified with a save choice ("database only" vs "and add to my bar"); flows to the verify queue.
  - Exit: new variant visible to all as unverified; "and add to my bar" also adds it to the user's collection (usable now); appears in the admin Bottles queue.

- [x] 7.10 Social activity feed (pulled forward from BACKLOG, 2026-08-21)
  - Goal: bottom-nav Social tab; reverse-chronological global feed of bottle, username, action.
  - Exit: Search / Social / My Bar / Profile; rows for drank / added to collection / finished / added to DB / verified / suggested an edit / removed from collection; tap opens bottle detail. Policy: log every bottle action until Brian excludes one. Admin hard-delete of a bottle is the current exclusion (CASCADE would wipe the feed row).
- [x] 7.11 First-use coach marks + What's new (2026-08-22; verify locally before treating as prod-complete)
  - Goal: new users get a short **live-UI visual tour** of today's core (Search, Have a drink, Social, My Bar). Existing users get **one What's new digest per session** (Show me plays that feature's tour). Pile-up never autoplays 20 tours. Catalog in `src/lib/coaches.ts` — one row per future feature.
  - Exit: `users.seen_coach_ids`; existing accounts seeded with `core.done`; Skip/Got it persist; greyscale overlay + digest sheet. New user-facing PRs add a catalog row.

Notes: 7.3–7.5 build against 7.1's model; 7.7's variant-level pours wait on 7.4; live blind tastings wait on Phase 3. Deferred to BACKLOG: personal comments, flavor tagging → charts, 3rd image slot, follows/likes/comments.

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
