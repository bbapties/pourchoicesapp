# Phase 8 — Pre-beta cut

Work that ships **before** the 10–15 person beta. Blind-tasting core (3.0–3.3), Phase 7, Profile, feedback, and events telemetry are already on prod. This phase is: fix what testers will trip on, then the four features Brian pulled forward.

**Bug IDs** live in [BUGS.md](BUGS.md). **Checkboxes** live in [ROADMAP.md](ROADMAP.md) Phase 8. This file is the narrative + feature stories so Claude and Grok sequence the same way.

Paused **out** of this cut (do not pull in unless Brian says so):

- 3.4 group tastings (schema + realtime + two phones) — **also blocked on B-74** (don't write `auth.uid()` into participant `user_id`)
- 3.5 Social `tasted` activity + session-detail (needs additive schema go)
- Phase 5 visual polish
- Phase 6.4 CSV import (barcode *seeding* may reuse a thin import path — see 8.4)
- BACKLOG nice-to-haves not listed below

---

## Locked decisions (Brian, 2026-08-27)

- ~95% of the review findings are real bugs. Log them all in BUGS.md and work them through; don't discard medium/low.
- **Barcode scan** is a search option on **every** bottle-search screen (Search tab *and* the Drink tasting picker, plus any later picker). Also seed/prime the DB with as many barcodes as possible so a scan usually hits.
- **Tutorial / What's new** is a whole story: what a brand-new user sees on first login, and an **admin** way to decide what goes into the What's new popup (stop piling every `announce: true` coach into one digest).
- **Install as an app (PWA)** for Android **and** iOS. First visit to the URL, if they don't already have it installed, ask: install as an app vs continue in the browser, with a **strong suggestion to install**.
- **Admin notifications** (push): send to **all users** or **one user**. Profile has a Notifications toggle, **default on**. This starts to replace What's new pile-up (8.3 + 8.5 are related).

Stay greyscale/wireframe (Phase 5 still later). One feature or fix per commit. Schema = snapshot + Brian's go.

---

## Why this order

Testers' first minutes: **open the URL → (optional) install → sign up → tutorial → search/drink.**

1. **Wave 0** — prod safety confirms (don't invite people onto a world-readable users table).
2. **Wave 1** — trust bugs. Drink "isn't live," helper leak, wrong My Bar stars, Add Back hitting the wrong variant, fake Tasted tab — these make the flagship look broken.
3. **Wave 2 — PWA** — first click of the URL. Also the service worker later notifications need.
4. **Wave 3 — Tutorial / What's new** — first login after install. Admin control of announcements; notifications (8.5) will take some of this load.
5. **Wave 4 — Barcode + seed** — makes Search feel mature. Independent of PWA. Do after first-run UX so we're not adding a camera permission into a half-broken first session.
6. **Wave 5 — Push notifications** — needs the PWA service worker + Profile toggle. Admin send-to-all/one. Suggested-edit "your edit was reviewed" (BACKLOG) can ride this once it exists.
7. **Wave 6** — remaining bugs (medium/low, Elo hardening, RLS tighten). Keep grinding these during/after the invite; they don't block the first session.
8. **B-74 id cleanup** — gated auth. Do **before** 3.4 group tasting and 8.5 push. `public.users.id` ≠ `auth.users.id`; `created_by` is mixed. Not Wave 1.

Do **not** start 3.4 or Phase 5 in this phase.

---

## Wave 0 — Prod safety (confirm, then maybe fix)

Gated: auth / RLS / env. Ask Brian before changing.

| ID | What |
|----|------|
| B-18 | Confirm anon cannot `SELECT` `public.users` (login email lookup). |
| B-19 | Confirm `users.role` is not self-updatable. |
| B-20 | Confirm `delete_user_cascade` re-checks `is_admin()` inside the function. |
| B-21 | Confirm Vercel has `SUPABASE_SERVICE_ROLE_KEY` (not only `SUPABASE_SERVICE_ROLE`). |
| B-22 | Rotate or demote the QA admin password before testers. |
| — | Brian eyeballs www.pourchoicesapp.com for 3.0–3.3 (Drink tab, both solo modes). Still pending from the last session. |

If B-18 is wide open, **fix before inviting anyone.** B-22 is a Brian action (agents must not print the password).

---

## Wave 1 — Trust bugs

Ship in BUGS.md order **B-01 → B-08**, then the 1b cluster **B-09 → B-17** if time. Minimum viable for invite: **B-01, B-02, B-03, B-04, B-05, B-06, B-07, B-08**.

| ID | One-liner |
|----|-----------|
| B-01 | Stop saying tastings aren't live; wire More / pour-blind into Drink. |
| B-02 | Helper mode: don't Back into the secret mapping; freeze the shuffle. |
| B-03 | Don't render the add-slide as the whole card while `vlist` is empty. |
| B-04 | My Bar stars from `default_variant_elo` (same as Search). |
| B-05 | Persist `variant_id` on My Bar rows; Add Back / Remove that variant. |
| B-06 | Real Tasted tab **or** hide the tab (don't lie with Tasted (0)). Prefer wire it — no schema. |
| B-07 | `saveTasting` one RPC/transaction (or reuse sessionId + unique pair constraint). |
| B-08 | Signup uses `validateUsername` + uniqueness; don't navigate on insert failure. |

B-06 overlaps 3.5 "Tasted tab" — pulling that trimming forward is fine; Social `tasted` activity still waits on schema.

---

## Wave 2 — Install as an app (PWA)

**Goal:** Android and iOS can install Pour Choices on the home screen with an icon, standalone display (no browser chrome). First visit, if not already installed, prompt: Install as an app (recommended) vs Continue in browser.

### What exists today
- No `manifest.webmanifest`, no service worker, no `apple-touch-icon`, no `display-mode` detection.
- `src/app/layout.tsx` metadata is title/description only.
- Icons exist historically in older trees (`pc/pour-choices/public/shortcut-icon-*.png`); confirm what we have in *this* repo's `public/` (currently SVGs only — will need real icons).

### Locked UX
- Prompt on **first click of the URL** (login splash `/` counts — they may not have an account yet).
- If already installed (`display-mode: standalone` or iOS `navigator.standalone`), never ask.
- Strong suggestion to install. Continuing in the browser is allowed and remembered (don't nag every page load). Remember "continue in browser" in `localStorage` with a Profile way to see install instructions again.
- Stay greyscale.

### Platform reality (do not fight it)
- **Android Chrome:** `beforeinstallprompt` is real. We can show our sheet, then call `prompt()` on Install.
- **iOS Safari:** there is **no** programmatic install. The prompt must teach Share → Add to Home Screen (with a short visual). `apple-mobile-web-app-capable`, apple-touch-icon (180), theme-color.
- **Other browsers:** degrade to "continue in browser" + a short "how to install" if we detect an in-app browser (Instagram/Facebook) — those often cannot install at all; say "open in Safari / Chrome".

### Build (suggested PR split)
1. **Manifest + icons + meta** — `public/manifest.webmanifest`, 192/512 PNG icons (existing Pour Choices app icons in Downloads if Brian confirms), apple tags in `layout.tsx`, `theme-color`.
2. **Service worker** — cache app shell only (don't go offline-first hero). Needed later for Web Push. Next 16: use a small custom SW or `serwist`/`next-pwa`; keep it boring.
3. **Install prompt UI** — first-visit sheet on `/` (and after login if they skipped). Detect standalone. Android uses `beforeinstallprompt`; iOS uses instruction steps. Events: `pwa_prompt_shown`, `pwa_install_clicked`, `pwa_continue_browser` (`src/lib/events.ts` + TELEMETRY.md).
4. **Coach** — quiet (`announce: false`) unless we want a What's new for existing users ("Install Pour Choices on your phone").

### Exit
- Android: install from the prompt → home screen icon → opens standalone.
- iOS: follow in-prompt steps → home screen icon → opens standalone (no Safari chrome).
- Already-installed users never see the sheet.
- Continue in browser is sticky until they clear it / use a Profile "Install the app" row.

### Open (ask Brian when building)
- Icon asset: which of the existing "Pour Choices App Icon" files?
- Prompt *before* Get Started, or after they tap Get Started but before email?
- In-app browsers (iMessage preview, Instagram): block with "Open in Safari/Chrome" or still show the sheet?

---

## Wave 3 — Tutorial + What's new (admin-controlled)

**Goal:** a deliberate first-run tour for a brand-new user, and an admin way to choose what existing users see in What's new — instead of every `announce: true` coach piling into one digest.

### What exists today
- Catalog is hardcoded in `src/lib/coaches.ts`.
- **New user** (`core.done` not in `seen_coach_ids`): live-UI tour of every `core: true` item, flattened. Current core: Search, Have a drink, Social, My Bar, Profile feedback. **Drink / blind tasting is NOT core** (`taste.blind` is announce-only).
- **Existing user:** one What's new digest per session of all unseen `announce: true` items. Show me plays that item's tour. Skip/Got it persists into `users.seen_coach_ids`.
- Profile → Replay tutorial resets `seen_coach_ids` and reloads `/search`.
- Pile-up rule: one digest per session, never 20 autoplayed tours. Keep that.

### Discovery (do this with Brian *before* coding — UX-first)

New-user core tour — proposed default (replace, don't append):

1. Search (find a bottle)
2. Barcode scan *(only after 8.4 ships; until then skip this step)*
3. Bottle card: Have a drink + Add to My Bar
4. Drink tab: start a blind tasting
5. My Bar (owned / empty / tasted)
6. Social feed
7. Profile: feedback + notifications *(notifications after 8.5)*

What's new — proposed admin model:

- Coaches stay in code as the **tour implementations** (anchors + captions).
- A small **`announcements` (or `whats_new`) table** is what the digest reads: `{ id, coach_id, title, body, published_at, audience: 'new'|'existing'|'all', active }`.
- Admin screen (Admin tab): toggle which published items go out, draft vs live, maybe "send as push instead" (hooks 8.5).
- Existing `announce: true` flags stop auto-piling; only **published** rows appear. Seed current unseen features as unpublished so we don't dump 7.x history on beta testers.

### Build
1. Discovery pass with Brian (tour steps + copy). Update `COACH_CATALOG` core flags to match. No schema yet.
2. Admin What's new queue (schema, snapshot + go): publish/unpublish. Digest reads published unseen items only.
3. Replay tutorial still replays **core**, not the digest.
4. Events: `tour_started`, `tour_completed`, `tour_skipped`, `whatsnew_shown`, `whatsnew_show_me`.

### Exit
- Brand-new account on a clean `seen_coach_ids` gets the agreed core tour once, including Drink.
- Existing accounts with `core.done` do **not** get a 10-item digest of old features.
- Admin can publish one What's new item and an existing user sees only that.
- Replay tutorial from Profile still works.

### Open (ask Brian when building)
- Exact step list and captions.
- Do beta testers (existing Lakehouse, QA) get a one-shot "Drink tab is live" What's new? (Probably yes — publish `taste.blind` only.)
- Should Admin What's new be a new Admin tab or sit under Feedback?

---

## Wave 4 — Barcode scan + catalog seed

**Goal:** every bottle-search field has a scan control. Point the camera at a UPC/EAN, look up `bottles.barcode` (already on the SKU; already in `all_bottle_details.bottle_barcode` and Search's `.or()` / client filter). Hit → open that bottle. Miss → "We don't have this bottle yet" + provisional add, barcode prefilled.

### What exists today
- `bottles.barcode text` (SKU-level, not per-variant).
- Search already `ilike`s `bottle_barcode` if you *type* digits. No camera, no exact-match path.
- Drink picker (`DrinkClient`) is a separate substring filter over 300 names — **must get the same scan control**.
- BACKLOG had "Barcode scanner shortcut in the add modal" — this story **replaces** that (scan is a search option, not only add).
- 6.4 CSV template already includes `barcode`. Import tab is still a shell.

### Scan UX
- Camera icon on the search input (Search tab + Drink pick + any future picker). Reuse one `BarcodeScanSheet`.
- Permission denied → short explanation + "type the numbers instead."
- Prefer **exact** barcode match (normalized: strip spaces, leading zeros policy TBD). If multiple SKUs share a code, show a list.
- Log `search` event with `mode: 'barcode'` + the code (TELEMETRY; don't log the image).

### Platform
- Android Chrome: `BarcodeDetector` where available.
- iOS Safari: no BarcodeDetector in older versions — use a maintained WASM/js fallback (`html5-qrcode` or `@zxing/browser`). Must work in **installed PWA** and in Safari.
- HTTPS only (camera). Localhost is fine for QA.

### Seeding the catalog (this is half the story)
A scanner that misses every bottle feels worse than no scanner. Plan:

1. **Census first** — `SELECT count(*) FILTER (WHERE barcode IS NOT NULL AND barcode <> '') vs total` on `bottles`. Report to Brian.
2. **Fill existing SKUs** — spreadsheet / Open Food Facts / UPC databases / Brian's cellar photos. Match on (name, distillery) then set `barcode`. Admin-only. Prefer a one-off script + preview over freehand SQL.
3. **Ongoing** — Provisional add and 7.9 contribute capture barcode; 6.4 CSV when it exists. Optional: scan-on-miss creates a provisional with barcode filled.
4. **Don't invent barcodes.** If a source is unsure, leave null. Wrong codes poison the feature.

### Build
1. Shared `BarcodeScanSheet` + hook; wire Search input.
2. Wire Drink picker (same component).
3. Exact-lookup helper (`fetchBottleByBarcode`) with normalization.
4. Census + seed plan (script, not a user-facing importer unless 6.4 is pulled forward).
5. Coach step `search.barcode` (core only after this ships).
6. Event `search` `{ mode: 'barcode', query, result_count }`.

### Exit
- Scan on Search and on Drink pick. Hit opens the bottle; miss offers add with barcode filled.
- At least a meaningful % of the live catalog has real barcodes (Brian sets the bar after the census — don't ship scan against an empty code column).
- Works on Android Chrome and iOS Safari (browser + installed PWA).

### Open (ask Brian when building)
- Acceptable fill-rate before we show the camera icon to testers?
- Seed sources he's OK with (licensing)?
- Barcode on the SKU only, or later per-variant (store picks often share the parent UPC)?

---

## Wave 5 — Admin push notifications

**Goal:** admin can send a notification to **all users** or **one user**. It shows up on the phone like a normal notification if they installed the PWA and left Notifications on. Profile toggle, **default on**.

This starts to replace What's new pile-up (8.3): a real ship announcement can be a push + a single published What's new, not 8 stacked coaches.

### Depends on
- Wave 2 service worker (Web Push needs it).
- Wave 3 admin announcement model (optional: "also send as push" on publish).
- Brian's go for schema + VAPID keys (env/secrets — **guardrail**).

### What exists today
- No push, no `push_subscriptions` table, no Profile toggle.
- BACKLOG: "Notify a user when an admin approves/rejects their suggested edit" — v2 of this system, not v1.

### Locked UX
- Profile → Notifications: on/off, **default on** for new *and* existing users (column default `true`; no opt-out migration).
- OS permission is separate: we request it when they first hit a "this is better as a push" moment (after install, or first time they leave Notifications on in Profile). If OS denies, the in-app toggle stays on but we cannot deliver — show a hint.
- Admin: compose title + body, pick **Everyone** or a user (search by username), send. Record who got it.
- Don't spam. No marketing stream in v1 — product announcements + (later) "your edit was reviewed."

### Data (sketch — finalize in discovery)
- `users.notify_push boolean not null default true`
- `push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)` — one user, many devices
- `notifications (id, created_by, title, body, audience, target_user_id null, created_at)`
- `notification_deliveries (notification_id, user_id, status, sent_at)` optional for v1
- RLS: users manage own subscriptions; admin-only insert notifications; send happens server-side with VAPID (Route Handler or Edge, **service role** only on the server)

### Build
1. Profile toggle (column + UI), default on. No push yet.
2. VAPID keys in Vercel env (Brian). Service worker `push` + `notificationclick` (open a deep link).
3. Subscribe/unsubscribe from the client when installed + toggle on.
4. Admin Notifications tab: Everyone / one user, send, basic log.
5. Optional: What's new "send as push" checkbox.
6. Events: `push_permission`, `push_subscribe`, `push_send` (admin).

### Exit
- Installed Android + iOS PWA with Notifications on receive an admin test.
- Toggle off → no further pushes (subscription dropped or ignored).
- One-user send reaches only that user.
- Users who stayed in the browser: we do not fake a desktop-notification strategy in v1; in-app What's new still covers them.

### Open (ask Brian when building)
- Deep link on click (home / What's new / a bottle)?
- Also notify in-app (bell) for browser users, or What's new only?
- Suggested-edit review notice in v1 or v2?

---

## Wave 6 — Remaining bugs

Everything in BUGS.md not closed by waves 0–5. Work high remaining first (B-23 Elo farming, B-24 store-pick RLS, B-31 SKU vs variant UI, B-58 feedback UPDATE, B-59 uploads), then medium, then low. Don't let this starve Waves 2–5.

Elo math (B-50, B-57) is Brian's engine — **ask before changing**.

---

## PR / commit plan (realistic increments)

| Order | Title | Depends |
|-------|--------|---------|
| 8.0 | Prod RLS/env confirms (+ fixes Brian greenlights) | — |
| 8.1a | B-01 tasting copy + wire to Drink | — |
| 8.1b | B-02 helper Back leak | — |
| 8.1c | B-03 add-slide flash | — |
| 8.1d | B-04 My Bar stars from default_variant_elo | — |
| 8.1e | B-05 My Bar variant_id persist + scoped empty/remove | pairs with B-09, B-15 |
| 8.1f | B-06 Tasted tab (or hide) | — |
| 8.1g | B-07 saveTasting transaction | schema/RPC go |
| 8.1h | B-08 signup validation | — |
| 8.1i | B-10–B-17 cluster as separate commits | after 8.1c/e |
| 8.2a | PWA manifest + icons + apple meta | icon asset from Brian |
| 8.2b | Service worker (app-shell) | 8.2a |
| 8.2c | First-visit install prompt (Android + iOS instructions) | 8.2a–b |
| 8.3a | Core tour rewrite (catalog flags/copy) | discovery with Brian |
| 8.3b | Admin What's new publish table + digest reads it | schema go |
| 8.4a | Barcode census + seed plan | Brian on sources |
| 8.4b | BarcodeScanSheet + Search | camera on HTTPS |
| 8.4c | Same scanner on Drink picker | 8.4b |
| 8.4d | Seed barcodes on existing SKUs | 8.4a, Brian go |
| 8.5a | Profile Notifications toggle default on | schema go |
| 8.5b | Web Push subscribe + SW handler | 8.2b, VAPID |
| 8.5c | Admin send to all / one | 8.5b |
| 8.6 | Remaining BUGS.md | ongoing |

---

## Telemetry to add (as we build)

Record new types in [TELEMETRY.md](TELEMETRY.md) when they land:

- `pwa_prompt_shown` / `pwa_install_clicked` / `pwa_continue_browser`
- `tour_started` / `tour_completed` / `tour_skipped` / `whatsnew_shown`
- `search` with `mode: 'barcode'`
- `push_permission` / `push_subscribe` / `push_send`

Tasting complete should log `activities` `'tasted'` when 3.5 schema is approved (B-51) — not required to ship 8.1 if we don't want to open that CHECK yet.

---

## Landmines for this phase

- iOS cannot programmatic-install. Instructional UI is the feature, not a fallback.
- Camera + push only work in a **secure context** (HTTPS or localhost). The LAN QA URL (`192.168.68.74`) is HTTP — PWA install / camera / push **will not work there**. Test PWA/push on prod or an HTTPS tunnel.
- Don't put VAPID private key in the client. Guardrail: env/secrets need Brian.
- Barcode is SKU-level today; don't silently attach a scan to a store-pick variant.
- `created_by` still dual-id — any new owner filter matches **both** (B-46). **B-74:** `public.users.id` is not `auth.users.id`. Never write `auth.uid()` into a `user_id` that FKs to `public.users`. Resolve `auth.uid()` → `users.id` via `auth_id`. Schedule a real cleanup before 3.4 / 8.5 (gated).
- Helper mapping and Elo trigger contracts from Phase 3 still apply (one pairwise INSERT, no silent add-to-bar).
