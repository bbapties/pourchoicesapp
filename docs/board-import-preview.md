# Board import preview — review before creation

Generated 2026-09-05. **Nothing has been created yet.** Correct anything here and I'll import from this file.

Lanes: **T** = Top priority · **N** = Next priority · **M** = Maybe later · **W** = Way long future

---

## 1. Bugs (BUGS.md) — 16 issues

| # | Lane | Label | Title | Source |
|---|---|---|---|---|
| 1 | N | bug | Global Elo lost-update under concurrent tastings | B-49 (medium) |
| 2 | N | bug | Pair win-rate of 0 zeroes the entire Elo swing | B-50 (medium) |
| 3 | N | bug | removeUserBottle treats elo 1500 as never tasted, hard-deletes a net-zero tasting | B-52 (medium) |
| 4 | N | bug | Middleware matcher excludes /api/* | B-64 (medium) |
| 5 | N | bug | Cookie setAll swallowed in Server Components | B-65 (medium) |
| 6 | N | bug | Admin UsersTab over-counts; BottlesTab delete-impact includes tasters | B-62 (medium) + BACKLOG L64 |
| 7 | N | bug + needs-detail | Confirm search .or() filter injection is actually closed by B-13 | B-63 (medium) — B-13 is shipped, may be stale |
| 8 | N | bug + needs-detail | 3.0 migration replaces the Elo function but never CREATE TRIGGERs | B-55 (confirm/low) |
| 9 | M | bug | Global win-rate keys off variant ids, not rollup targets | B-57 (medium) + BACKLOG L65 |
| 10 | M | bug | saveTasting stores ranked order, not pour order; glass letters not persisted | B-53 (low) |
| 11 | M | bug | NULL-variant backfill leaves an orphan row beside the scored variant | B-56 (low) |
| 12 | M | bug | CoachHost seen_coach_ids persist is last-write-wins across tabs | B-67 (low) |
| 13 | M | bug | Feedback/events have no size or rate limits | B-68 (low) |
| 14 | M | bug | No CSP / security headers in next.config.ts | B-69 (low) |
| 15 | W | feature | Self-serve account delete + data export | B-30 (deferred) + BACKLOG L86 |
| 16 | W | enhancement | Five-six bottom nav items on a 375px thumb zone | B-44 (deferred to Phase 5) |

## 2. Prod safety — 2 issues (NOT from a checkbox — see deviation D3)

| # | Lane | Label | Title | Source |
|---|---|---|---|---|
| 17 | T | bug | Apply account-type trigger migration — users can currently set their own account_type | HANDOFF "OWED BY BRIAN" |
| 18 | T | other | Confirm Vercel service-role env var name | B-21 / ROADMAP 8.0 |

## 3. Phase 10 (PHASE10.md) — 4 issues

| # | Lane | Label | Title | Source |
|---|---|---|---|---|
| 19 | T | feature | Ranked tasting-results view — the payoff screen after a tasting | E2 + BACKLOG L76 |
| 20 | N | feature | Badges v1, awarded retroactively from captured history | E3 + BACKLOG L38 |
| 21 | N | other | Storage orphan purge + Admin usage readout | F1 + BACKLOG L63 |
| 22 | M | other | Catalog seed design session (Iowa ABC open data, ~6,628 bottles) | F2 + BACKLOG L41 + ROADMAP L308 |

*Skipped: D1, D2 (shipped as `ba102c9`), E1 (verified on prod 2026-09-05).*

## 4. Roadmap (ROADMAP.md) — 15 issues

| # | Lane | Label | Title | Source |
|---|---|---|---|---|
| 23 | T | other | Real-device install test — iPhone + Android from prod | 8.2 (still owed) |
| 24 | N | feature | CSV bulk import tab (6.4) — **7 sub-steps in body, see deviation D1** | 6.4, NOT BUILT |
| 25 | N | other | Telemetry gap: tour_* / whatsnew_* events, only whatsnew_publish exists | 8.3 partial |
| 26 | N | other | Census: how many bottles.barcode are filled | 8.4 |
| 27 | N | other | Seed barcodes for existing SKUs (no invented codes) | 8.4 |
| 28 | M | feature | Group tasting sessions — host/join short code, per-person reveal (PAUSED) | 3.4 |
| 29 | M | feature + needs-detail | Tasting trimmings — per-glass notes, session-detail view (My Bar Tasted tab already shipped via B-06) | 3.5 |
| 30 | M | feature | What's new "also send as push" (optional) | 8.5 |
| 31 | M | enhancement + needs-detail | My Bar edit bottle (2.2) — may already be shipped by Phase 7 | 2.2 |
| 32 | M | enhancement + needs-detail | My Bar FAB redirects to search/add flow (2.3) — may already be shipped | 2.3 |
| 33 | W | enhancement | Fonts — Playfair Display + Inter | 5.1 + BACKLOG L92 |
| 34 | W | enhancement | Colors — charcoal/amber/gold/ivory throughout | 5.2 + BACKLOG L93 |
| 35 | W | enhancement | Animations — fades, reveal flip, swipe glow | 5.3 + BACKLOG L94/L95 |
| 36 | W | enhancement | Splash screen artwork | 5.4 + BACKLOG L96 |
| 37 | W | enhancement | Mobile thumb-zone audit across all screens | 5.5 |

## 5. Backlog (BACKLOG.md) — 20 issues

| # | Lane | Label | Title | Source |
|---|---|---|---|---|
| 38 | N | enhancement | Card-per-variant My Bar (follow-up to B-32) | L68 |
| 39 | M | enhancement | Haptic feedback on key interactions | L12 |
| 40 | M | enhancement | Pull-to-refresh on search and My Bar | L13 |
| 41 | M | enhancement | Keyboard dismissal when tapping outside search bar | L14 |
| 42 | M | feature | Search history / recent searches (events already captured) | L17 |
| 43 | M | feature | Notify a user when an admin approves/rejects their suggested edit | L28 |
| 44 | M | feature | Personal comments on a variant | L30 |
| 45 | M | enhancement | Third image slot on variants | L31 |
| 46 | M | feature | Bulk add bottles from search results | L72 |
| 47 | M | enhancement | Filter collection by category | L73 |
| 48 | M | feature | Share tasting results (screenshot-friendly card) | L80 |
| 49 | M | feature | Tasting history — view past sessions | L81 |
| 50 | M | feature | Avatar / profile photo | L87 |
| 51 | M | feature | Stats summary on Profile | L88 |
| 52 | W | feature | Shared transaction history / personal audit log | L21 |
| 53 | W | feature | Follows / likes / comments on the Social feed | L22 |
| 54 | W | enhancement | Bottle detail UX refinement pass | L29 |
| 55 | W | enhancement | AI background removal on uploaded bottle images | L32 |
| 56 | W | other | Audit trail table for user_bottles | L62 |
| 57 | W | feature | Flavor/nuance tagging during tastings, into flavor bar charts | L82 |

---

## Skipped, and why — nothing is lost, all of it stays in the .md files

### A. Already shipped, checkbox never ticked (29)
Trusting the files' own headers.

- **ROADMAP Phase 6** (18 rows, L117-L149) — under headers reading `6.0 Foundation — SHIPPED (ab9cfbb)`, `6.1 Users tab — SHIPPED (c302164)`, `6.2 Image upload — SHIPPED core (6e44dff)`, `6.3 Bottles tab — SHIPPED queue (3ab1ce0)`. Each says "sub-boxes below not re-audited".
- **ROADMAP Phase 3** (6 rows, L77-L82) — old numbering of 3.1-3.6; header says core loop 3.0-3.3 shipped to prod 2026-08-27.
- **ROADMAP 8.1** (3 rows, L259-L261) — B-07, B-08, B-09..B-17 are all ticked in BUGS.md.
- **ROADMAP 8.0** L249 prod-verify 3.0-3.3 — done via the verified tasting, 2026-09-05.
- **PHASE10** D1, D2 (shipped `ba102c9`), E1 (verified).
- **BACKLOG** L9 tutorial rewrite, L10 PWA prompt, L11 admin push, L89 notifications toggle — all shipped as Phase 10 Waves C and D.

### B. Process, not tickets (4)
ROADMAP L12, L13, L16, L17 — the pre-push test checklist (works locally / works on mobile / pushed / verified on prod). A recurring ritual; belongs in AGENTS.md.

### C. Pointers and decision notes, not work (2)
ROADMAP L331 (points at BUGS.md), L317 (a recorded decision about browser-only users).

### D. Merged into another issue (11)
Each noted in its target issue body with both sources: BACKLOG L38, L41, L63, L64, L65, L76, L86, L92, L93, L94/95, L96; ROADMAP L308.

---

## Deviations from the brief — your call on each

**D1 — CSV import (6.4) as 1 issue, not 7.** ROADMAP 6.4 has 7 unticked rows (template / papaparse / validate-preview / reuse existing / commit RPC / verified=false / download template). They're implementation steps of one deliverable, not seven ideas. Your brief says never collapse items, so flagging it: I'd make one `feature` issue with the 7 steps as a body checklist. Say the word and I'll split them into 7 instead.

**D2 — 11 cross-doc merges.** Your brief explicitly allows this ("if two docs repeat the same item, create one issue and note both sources"). Listed in section D above so you can veto any of them.

**D3 — 2 issues that came from HANDOFF.md, not a checkbox.** The unapplied `account_type` migration and the B-21 env var check are real open work but live only in HANDOFF prose. Your brief says don't invent scope, so flagging rather than assuming. Both are genuinely open per HANDOFF's "OWED BY BRIAN".

**D4 — 6 items marked `needs-detail` because they may already be done.** #7, #8, #29, #31, #32 — the source is ambiguous about whether the work shipped. Imported as open rather than silently dropped, per your brief.

**D5 — security items on a public repo.** #17 is the `account_type` hole. Title and body are deliberately neutral — they name the migration file, not the exploit. You said keep it public; this keeps the ticket useful without publishing a recipe.

---

## Tally

| | Count |
|---|---|
| Open checkboxes parsed from the 4 files | 120 |
| Already shipped, box never ticked | 29 |
| Process / pointers / decision notes | 6 |
| Merged into another issue | 11 |
| Non-checkbox items added from HANDOFF | +2 |
| CSV import rows collapsed into 1 (D1) | -6 |
| **Issues to create** | **57** |
