# TELEMETRY.md — Instrument everything (standing policy)

> Pre-read doc for both agents. **Capture audit trails, activity, and usage generously** so future
> features already have the historical data they need. You can't reward early activity — or analyze a
> behavior — that you never recorded. When in doubt, log it.

Brian's intent (2026-08-23): deliberately go a little overboard on tracking events, activities, and
usage. Future features like **badges / achievements** (reward early adopters, streaks, "first N
pours", top contributors), **personalized discovery**, and **usage analytics** all depend on data we
must be storing *now*, before those features exist.

---

## Principles (apply to every feature, new or reworked)

1. **Instrument as you build.** Every new or reworked user-facing action emits an event. When you
   touch old code that wasn't instrumented, add it.
2. **Append-only + fail-open.** Logging never blocks or breaks the user action. Follow the
   `src/lib/activities.ts` pattern (returns, never throws; errors console-logged only). Audit rows are
   never rewritten in place — supersede with a new row (see `suggested_edits`, status `canceled`).
3. **Capture enough to slice later without a migration.** who (`user_id`), what (`event_type`),
   the target (`target_type` + `target_id`), when (`created_at`), and a `metadata jsonb` for the
   long tail. A jsonb bag means new event shapes don't need DDL.
4. **Privacy first.** Never log credentials, tokens, passwords, or sensitive PII in payloads, and
   never secrets. User-entered search text is fine to store (it's their query) but is user data —
   subject to the same delete-on-user-wipe cascade. Keep `DATABASE_URL`/keys out of everything.
5. **Additive + snapshot + ask.** New event columns/tables are additive; snapshot before migrating;
   get Brian's go for schema changes (guardrail). Wire an `ON DELETE CASCADE` to `users` so a user
   wipe removes their events too.

---

## What exists today (the domain/audit trails)

- **`activities`** (`src/lib/activities.ts`) — user/admin **bottle actions**: `drank`,
  `added_to_collection`, `finished`, `added_to_db`, `suggested_edit`, `verified`,
  `removed_from_collection` (+ `pour_type`, optional `variant_id`). Powers the Social feed and
  "My last activity". Standing rule: **log every bottle action** until Brian excludes one; fail-open.
- **`suggested_edits`** (7.8, `src/lib/suggestedEdits.ts`) — **append-only audit** of proposed
  corrections (`pending`/`approved`/`rejected`/`canceled`/`applied`) with reviewer + reason. A model
  for how other audit trails should look (immutable rows, status lifecycle).
- **`feedback`** (beta-prep, `src/lib/feedback.ts`) — user-submitted **feature requests / bug reports**
  from Profile; admin triages in Admin > Feedback (`status` new/triaged/planned/done + `admin_note`).
  Captures context per report: `user_agent`, `viewport`, `route`, optional user screenshot
  (`screenshot_url` + `screenshot_path` under the shared `bottle-images` bucket, `feedback/<id>/`
  prefix so a resolved report's image is easy to purge). RLS mirrors `suggested_edits`
  (insert-own / select own+admin / update own+admin). SQL: `sql/feedback-migration.sql` (+ snapshot).

- **`events`** (beta-prep, `src/lib/events.ts`) — the generic **usage/interaction** table (see below).
  Broad telemetry that isn't a first-class bottle action: page views, searches, key clicks, errors.

These cover *domain* actions well; `events` covers the broad *usage/interaction* layer.

---

## The generic `events` table (BUILT 2026-08-23)

One wide, append-only table for everything that isn't already a first-class domain action. Decision
(Brian): **one generic table**, with `event_type` as the "what kind" filter column and `metadata jsonb`
for the long tail (new event shapes need no migration). Logged-out visitors are captured too
(`user_id` NULL + a client `session_id`), so the pre-login funnel is visible. SQL:
`sql/events-migration.sql` (+ `sql/events-snapshot.sql`).

Shape:

| column | notes |
|--------|-------|
| `id uuid` | pk |
| `user_id uuid null` | null for logged-out; `ON DELETE CASCADE` to `users` |
| `session_id text null` | client-generated per app session (sessionStorage `pc.session.id`) |
| `event_type text` | **v1:** `page_view`, `search`, `click`, `error` |
| `surface text null` | route / screen (e.g. `/search`) |
| `target_type text null` · `target_id text null` | what was acted on (`bottle_open`, `have_a_drink`, …) |
| `metadata jsonb null` | the long tail (query, result_count, mode, message, pour_type, …) |
| `created_at timestamptz` | default now() |

Indexes: `(user_id, created_at)`, `(event_type, created_at)`, `(session_id)`. RLS: anon + auth may
**insert** (anon only anonymous rows); **select is admin-only**; no UPDATE/DELETE policies (append-only).

**Client helper** `logEvent` / `logClick` (`src/lib/events.ts`) — **fire-and-forget + fail-open**
(never awaits, never throws; console-only on error). No batching (per-event) — fine at beta volume.

**v1 instrumentation (live):**
- `page_view` — every route change + the login funnel (`EventTracker`, mounted in `AppShell`).
- `error` — uncaught JS errors + unhandled promise rejections (`EventTracker` window listeners).
- `search` — `metadata = { query, result_count, mode }` (`SearchClient.searchBottles`). The
  highest-value event: feeds a future "recent searches" + discovery insights.
- `click` — `bottle_open` (SearchClient; not otherwise in `activities`), `have_a_drink` intent
  (BottleDetailView + Drink tab; `pour_type` and optional `source: 'drink_tab'` in metadata), and
  `blind_tasting` (Have-a-drink → Blind, More → Blind tasting, or Drink tab pour-pick → Blind;
  metadata `{ source: 'pour'|'more'|'drink_tab', variant_id }`). Blind does **not** write an
  `activities.drank` row — it opens `/taste` with the bottle pre-seeded.
- `click` → `barcode_scan` — a successful camera scan from the search bar (`SearchClient.handleScan`).
  `metadata = { matched: boolean }`, `target_id` = matched bottle id when found. Feeds scan-usage
  and catalog-coverage insights (how often a scan finds nothing → add-flow).

Add more events freely as you build (see the standing rule). Not yet wired: filters/sorts,
coach/tour interactions, add-to-bar click (its success is already in `activities`).

**Retired 2026-09-01 — `barcode_autofill`.** The online barcode lookup shipped and was removed
the same day. Kept here because the measurement is the point: against our own catalog it identified
roughly 1 mainstream bottle in 3, missed Early Times and Hard Truth (both stocked everywhere), and
once returned an LG refrigerator part for a bourbon UPC. Root cause is structural, not a bad vendor —
**there is no open barcode->product registry**; GS1 owns it and licenses it, so every free API is a
scraped aggregator with thin US spirits coverage. Historical rows stay in `events`; nothing emits it
now. Do not rebuild this without new evidence that a source has real spirits coverage.

**Shipped 2026-09-01 — `bottle_submitted`** (surface `provisional_sheet`, target = the new bottle):
one row per provisional add, with `from_scan`, `has_barcode`, `has_image` and `special`
(none|store_pick|variant). This is the enrichment queue's input signal — an add with a barcode is
keyable, an add with only a name and a photo needs a label read. Watch the `from_scan` vs
`has_barcode` split to see how often scanning actually feeds the catalog.

**Phase 8 (planned — record here when they land):** `pwa_prompt_shown` / `pwa_install_clicked` /
`pwa_continue_browser`; `tour_started` / `tour_completed` / `tour_skipped` / `whatsnew_shown` /
`whatsnew_show_me`; `search` with `metadata.mode = 'barcode'`; `push_permission` /
`push_subscribe` / `push_send`. Tasting-complete `activities.tasted` still waits on the 3.5 CHECK.

---

## Standing rule for agents (part of the build checklist)

When you build or rework a feature:
- **(a)** If it's a bottle action, log it to `activities` (existing rule).
- **(b)** The generic `events` table exists — emit a usage event for the new surface via `logEvent` /
  `logClick` (`src/lib/events.ts`): at least its key interactions (page views are captured globally).
- **(c)** Keep all logging **fail-open**; never let it break the feature.
- **(d)** Record any new `event_type` / `activities.action` values **here** so the vocabulary stays
  discoverable (and note the CHECK-constraint update if you add an `activities.action`).

---

## Future features this unlocks (why we bother)
Badges & achievements (early-adopter, streaks, "first pour", contributor badges off
`suggested_edit`/`added_to_db`), personalized discovery from search history, retention/usage
analytics, and admin insight into how the app is actually used — all needing data captured *before*
the feature is built.
