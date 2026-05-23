# Pour Choices — Build Roadmap

**Philosophy:** Functionality first. Black/grey/white wireframe visuals until Phase 4.
**Commit rule:** One feature or fix per commit. Test before every commit.
**Test checklist before every push:**
  - [ ] Works locally (localhost:3000)
  - [ ] Works on mobile (192.168.68.74:3000)
  - [ ] Pushed to GitHub
  - [ ] Verified on prod (www.pourchoicesapp.com)

---

## Phase 1 — Polish Existing Screens ← WE ARE HERE
Goal: Make everything that exists work correctly end-to-end.

- [x] 1.0 Drop in brand assets (cellar-bg.png, coming-soon.jpg to /public)
- [x] 1.1 Splash/login screen — cellar-bg, 1.5s intentional pause, step-by-step auth wizard, redirect to /mybar
- [x] 1.1 Placeholder pages — coming-soon image on mybar/taste/profile
- [x] 1.1 AppShell — 4-tab nav (Search/Taste/My Bar/Profile), hidden on login page
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

## Phase 6 — Admin Panel
Goal: Internal tooling — manage users, verify/clean bottles, bulk-import data.
Triggered: admin-only 5th nav tab. Granted via `users.role = 'admin'` (manually flipped in Supabase).

### 6.0 Foundation
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

### 6.1 Users tab
- [ ] List users with username, email, created_at, role, #bottles, #sessions
- [ ] Search filter
- [ ] Delete row → confirm modal (type username) → RPC + auth wipe → toast
- [ ] Block self-delete

### 6.2 Image upload (prereq for bottle management)
- [ ] `src/lib/uploadBottleImage.ts` — upload to bottle-images bucket, return public URL
- [ ] Fix ProvisionalSheet — currently `image` File field is silently dropped; wire to helper
- [ ] EditVariantSheet — add upload button alongside URL input
- [ ] Permission rules:
  - Unverified bottle/variant: creator OR admin can edit images
  - Verified with valid image: admin-only
  - Verified with missing/broken image: any authenticated user can replace; upload auto-sets `verified=false` + shows "re-review pending" toast
  - Broken-image detection: `<img onError>` swaps to placeholder with "Upload replacement" button

### 6.3 Bottles tab
- [ ] Queue sub-tab — merged queue, one card per unverified bottle, variants nested inside; verified bottles with unverified variants also appear
- [ ] Row actions: Verify / Edit (reuse existing) / Delete
- [ ] Delete confirm shows counts AND list of affected usernames (`select username from users where id in (select user_id from user_bottles where bottle_id = X)`)
- [ ] All Bottles sub-tab — searchable table over `all_bottle_details` with same row actions

### 6.4 CSV bulk import tab
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
