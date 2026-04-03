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
