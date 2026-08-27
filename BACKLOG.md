# Pour Choices — Nice-to-Have Backlog

Add ideas here as they come up. Don't build these until core functionality is complete.
Format: `- [ ] Short description — why it matters`

## UX / Quality of Life
- [x] First-use / What's new coaches (shipped 7.11 — live-UI tour + digest; catalog `src/lib/coaches.ts`)
- [x] Replay tutorial from Profile (shipped 2026-08-23 with Phase 4 — resets `seen_coach_ids`, reloads to `/search`, core tour replays)
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
- [ ] **AI background removal on uploaded bottle images** — run every uploaded bottle/variant image through an AI background-strip step so the subject sits on a white or transparent background, for cleaner, more consistent card presentation. Applies at upload (`uploadBottleImage` path) and could batch-process the existing library. Consider on-device vs a service/API, cost, and storing the processed version (keep the original?). Pairs well with the storage image-usage/orphan-purge item under Data / Audit.

## Feedback & Support (beta-important)
- [x] **User feedback + bug reports → admin panel** (shipped 2026-08-23) — Profile entry "Send Feedback / Report a Bug" → `FeedbackSheet` (type feature|bug, message with **speech-to-text** dictation, optional **screenshot** attach). Writes the `feedback` table (context auto-captured: user_agent/viewport/route). Admin triage queue in **Admin > Feedback** (status new/triaged/planned/done + internal note), reusing the 7.8 queue + review-note pattern. Added to the new-user core coach tour (`profile.feedback`). Ties into TELEMETRY. Entry point is Profile only (no persistent affordance yet — could add later).

## Badges & Achievements (future — depends on capturing event data NOW)
- [ ] **Badges / achievements system** — reward users for activity and milestones (early adopter, streaks, "first pour", "first N pours", contributor badges from `suggested_edit` / `added_to_db`, tasting milestones, collection size, etc.). Award retroactively from stored history, so the data must be captured *before* this ships. Backed by `activities` + the generic events table (see TELEMETRY.md). Needs: a `badges` catalog (id, name, criteria, icon) + `user_badges` (earned_at), award logic (batch/trigger), and a Profile display surface. **Why the timing matters:** you can't reward early activity you never recorded — this is the payoff for the "instrument everything" policy.

## Data / Audit
- [x] **Generic `events` table + `logEvent` helper** (shipped 2026-08-23) — one wide append-only table for usage/interaction telemetry not covered by `activities`. One generic table, `event_type` filter column + `metadata jsonb`; nullable `user_id` (captures logged-out funnel) + client `session_id`; anon+auth insert, admin-only read, append-only. Fail-open `logEvent`/`logClick`. v1 instrumented: page_view, search (query/result_count/mode), click (bottle_open, have_a_drink), client errors. See **TELEMETRY.md**. Foundation for badges/achievements, personalization, usage analytics.
- [x] **Search history** — captured as `event_type='search'` rows with `metadata={query,result_count,mode}` (part of the events table above). A "recent searches" UI can now read from it.
- [ ] Audit trail table for user_bottles — store every insert/update as a separate row (user_id, bottle_id, action, changed_at) for future reporting and tasting history
- [ ] **Storage image-usage / orphan purge** (raised by Brian 2026-08-23) — no easy way today to see which uploaded images in the `bottle-images` bucket are still referenced vs orphaned, so old/replaced images can't be safely purged. Want an admin view (or script) that lists bucket objects, flags each as in-use (referenced by a bottle/variant/feedback row) or orphaned, and allows deletion. Feedback screenshots are already namespaced under `feedback/<id>/` + store `screenshot_path` so a resolved report's image is one delete; the gap is the general bottle-image case.
- [ ] **Admin `user_bottles` counts are now over-inclusive** (noted 2026-08-26, Phase 3.0) — after the per-variant re-key, `UsersTab` "#bottles" counts every `user_bottles` row (incl. tasting-only `times_had=0` rows and multiple variants per SKU), and `BottlesTab` delete-impact ("who owns this") lists users who only *tasted* a bottle. Non-breaking (over-cautious), but the metrics/impact previews should filter to real ownership rows (`currently_owned OR times_had>=1`) for accuracy.
- [ ] **Elo engine minor refinements** (noted 2026-08-26, Phase 3.0) — (a) the store-pick *global* win-rate dampener is computed on the recorded store-pick variant ids, not the rolled-up parent-default targets; second-order, revisit if store picks get tasted head-to-head often. (b) `removeUserBottle`'s demote-vs-delete uses an `elo != 1500` heuristic to detect tasting history; a genuinely net-zero tasting (lands exactly 1500) would be treated as untasted. Could instead check `tasting_details`/`tasting_results` participation.

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
