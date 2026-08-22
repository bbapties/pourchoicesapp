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
- [ ] UX refinement pass — layout, button placement, stats section structure (defer until all functionality is working)
- [ ] Personal comments on a variant — per-user notes, saved instantly, no moderation (deferred from the Phase 7 detail revamp)
- [ ] Third image slot on variants — badge / detail close-up (the Front/Back toggle is built to extend)

## Data / Audit
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
