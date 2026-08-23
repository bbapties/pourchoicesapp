# Pour Choices — Nice-to-Have Backlog

Add ideas here as they come up. Don't build these until core functionality is complete.
Format: `- [ ] Short description — why it matters`

## UX / Quality of Life
- [x] First-use / What's new coaches (shipped 7.11 — live-UI tour + digest; catalog `src/lib/coaches.ts`)
- [ ] Replay tutorial from Profile (Profile is still a stub)
- [ ] Haptic feedback on key interactions (add to bar, tasting reveal)
- [ ] Pull-to-refresh on search and My Bar lists
- [ ] Keyboard dismissal on mobile when tapping outside search bar

## Search & Discovery
- [ ] Search history / recent searches
- [ ] Barcode scanner shortcut in the add modal

## History / Activity Log
- [ ] Shared transaction history page (accessible from My Bar + Profile) — text-based log of all activity: bottles added/finished/deleted, tastings completed, rankings changed, DB contributions. Not a visual UI, just a chronological list with timestamps. (Social tab is the public feed; this item is still the personal/audit log.)
- [ ] Follows / likes / comments on the Social feed — prototype is a global unfiltered list

## Social
- [x] Global activity feed tab (shipped 2026-08-22 as `/social`; Taste removed from nav)

## Bottle Detail Page
- [ ] Notify a user when an admin approves/rejects their suggested edit — surface the admin's `review_note` (stored on `suggested_edits` as of 7.8). Needs a notification system; 7.8 only stores the note.
- [ ] UX refinement pass — layout, button placement, stats section structure (defer until all functionality is working)
- [ ] Personal comments on a variant — per-user notes, saved instantly, no moderation (deferred from the Phase 7 detail revamp)
- [ ] Third image slot on variants — badge / detail close-up (the Front/Back toggle is built to extend)

## Feedback & Support (beta-important)
- [ ] **User feedback + bug reports → admin panel** — an in-app "Suggest a feature / Report a bug" entry (e.g. from Profile or a persistent affordance) that writes to a `feedback` table and surfaces in the Admin panel as a triage queue (status new/triaged/planned/done, type feature|bug, optional route + screenshot/context auto-captured). Reuse the 7.8 admin-queue + review-note pattern. **Important before a 10–15 user beta** — it's the primary channel to collect feedback instead of ad-hoc texts. Ties into TELEMETRY (capture context with each report).

## Badges & Achievements (future — depends on capturing event data NOW)
- [ ] **Badges / achievements system** — reward users for activity and milestones (early adopter, streaks, "first pour", "first N pours", contributor badges from `suggested_edit` / `added_to_db`, tasting milestones, collection size, etc.). Award retroactively from stored history, so the data must be captured *before* this ships. Backed by `activities` + the generic events table (see TELEMETRY.md). Needs: a `badges` catalog (id, name, criteria, icon) + `user_badges` (earned_at), award logic (batch/trigger), and a Profile display surface. **Why the timing matters:** you can't reward early activity you never recorded — this is the payoff for the "instrument everything" policy.

## Data / Audit
- [ ] **Generic `events` table + `logEvent` helper** — one wide append-only table for usage/interaction telemetry not already covered by `activities` (page views, clicks, searches, filters/sorts, coach interactions, errors). Fail-open; `metadata jsonb` for the long tail; `ON DELETE CASCADE` to users. Foundation for badges/achievements, personalization, and usage analytics. See **TELEMETRY.md** for the proposed shape. Needs Brian's go + a schema decision (one generic table vs a few typed ones).
- [ ] **Search history** — capture every search (query + result_count + mode) as an event; feeds a future "recent searches" and discovery insights. (Falls out of the generic events table above.)
- [ ] Audit trail table for user_bottles — store every insert/update as a separate row (user_id, bottle_id, action, changed_at) for future reporting and tasting history

## My Bar
- [ ] Bulk add bottles from search results
- [ ] Filter collection by category (whiskey, gin, etc.)

## Blind Tastings
- [ ] Share tasting results (screenshot-friendly results card)
- [ ] Tasting history — view past sessions
- [ ] Flavor/nuance tagging during tastings → aggregate into per-section flavor bar charts (see memory: tasting-flavor-tags-and-charts)
- [x] Activity feed — drink events (neat / rocks / mixed / blind) surface as "so-and-so poured X" (shipped as Social tab, 2026-08-21; global feed, SKU-level)

## Profile
- [ ] Avatar / profile photo
- [ ] Stats summary (# tastings, # bottles, top-ranked bottle)

## Design / Polish (POST-FUNCTIONALITY — do not touch until Phase 4)
- [ ] Apply full Playfair Display + Inter fonts
- [ ] Amber/gold/charcoal/ivory color system
- [ ] Indicator earmark animations
- [ ] Tasting reveal flip animation
- [ ] Cellar background splash screen image
