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

These cover *domain* actions well. The **gap** is broad *usage/interaction* telemetry.

---

## The gap → a generic `events` table (proposed — NOT built yet; needs Brian's go)

A single wide, append-only table for everything that isn't already a first-class domain action:
screen/route views, taps/clicks on key controls, **searches** (query + result count + mode),
filters/sorts applied, coach/tour interactions, feature opens, and client errors.

Proposed shape (one generic table; final call — generic vs a few typed tables — is Brian's):

| column | notes |
|--------|-------|
| `id uuid` | pk |
| `user_id uuid null` | null for logged-out; `ON DELETE CASCADE` to `users` |
| `session_id text null` | client-generated per app session, to stitch a visit together |
| `event_type text` | e.g. `page_view`, `click`, `search`, `filter`, `coach_shown`, `error` |
| `surface text null` | route / screen (e.g. `/search`) |
| `target_type text null` · `target_id text null` | what was acted on (bottle, variant, nav, button…) |
| `metadata jsonb null` | the long tail (query text, result_count, sort mode, ms, etc.) |
| `created_at timestamptz` | default now() |

Indexes: `(user_id, created_at)`, `(event_type, created_at)`. Ship with a **fail-open `logEvent`
client helper** (batch/debounce; never throws). **Search history** = `event_type='search'` rows with
`metadata = { query, result_count, mode }` — this alone feeds a future "recent searches" and
discovery insights.

This is tracked in **BACKLOG.md** (Data / Audit). Do not build it without Brian's go + a schema
decision.

---

## Standing rule for agents (part of the build checklist)

When you build or rework a feature:
- **(a)** If it's a bottle action, log it to `activities` (existing rule).
- **(b)** Once the generic `events` table exists, emit a usage event for the new surface — at least a
  view + its key interactions.
- **(c)** Keep all logging **fail-open**; never let it break the feature.
- **(d)** Record any new `event_type` / `activities.action` values **here** so the vocabulary stays
  discoverable (and note the CHECK-constraint update if you add an `activities.action`).

---

## Future features this unlocks (why we bother)
Badges & achievements (early-adopter, streaks, "first pour", contributor badges off
`suggested_edit`/`added_to_db`), personalized discovery from search history, retention/usage
analytics, and admin insight into how the app is actually used — all needing data captured *before*
the feature is built.
