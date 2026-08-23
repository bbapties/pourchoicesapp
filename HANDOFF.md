# HANDOFF.md — The baton

The living handoff between Claude and Grok. **Read the "Right now" block first; update it before switching agents.**
Full scope/status lives in [ROADMAP.md](ROADMAP.md); this file is the narrative a checkbox can't hold.

---

## Right now

- **Branch:** `MVP-v3` (= production). Pushing here deploys www.pourchoicesapp.com.
- **Last commit:** `646ac2e` (events telemetry docs). App tip: `aa134d3` (generic events table), pushed to `MVP-v3` (prod).
- **Current phase:** **Phase 7 COMPLETE** (7.1–7.11 shipped). Beta-prep shipped: **feedback/bug-report channel** + **generic events/telemetry table** (both 2026-08-23). Phase 6.4 CSV import is still a shell.

**Single next step for the incoming agent:**
- **Nothing is queued — ask Brian.** Phase 7 is done; two beta-prep items shipped this session (feedback channel + events telemetry). Brian is prepping a **10–15 user beta**. Standing recommendation for what's left: **Phase 4 Profile** (small quick win — coming-soon stub + now holds the feedback button; view username/email, edit username, sign out), **Phase 3 Blind Tastings** (flagship must-have, large, still a stub — deserves its own dedicated push, now instrumentable via `logEvent`), **Phase 6.4 CSV import** (shell). Do not start any of these, or Phase 5 polish, without Brian's word.
- **Feedback channel — what shipped (`00188a9` feat + `50f7b00` docs):** Profile "Send Feedback / Report a Bug" → `FeedbackSheet` (type feature|bug, message with Web-Speech dictation, optional screenshot). New `feedback` table + RLS (mirrors `suggested_edits`; **migration applied to prod DB** — `sql/feedback-migration.sql`, rollback `sql/feedback-snapshot.sql`). Admin triage queue in **Admin > Feedback** (`FeedbackTab.tsx`; status new/triaged/planned/done + internal note). Screenshots under `bottle-images/feedback/<id>/` with stored `screenshot_path` for easy purge. Lib `src/lib/feedback.ts`. Coach `profile.feedback` added to the **new-user core tour**. Verified end-to-end on localhost (submit → queue → triage → note persisted) + prod verify handed to Brian. Entry is Profile-only (no persistent affordance yet).
- Design context (Brian, 7.8 discovery): from the bottle card there are exactly **two contribution actions — Suggest an edit (7.8) and Add a variant (7.9)**, both done. Personal notes/ratings are NOT a card action — they belong to the future drink/blind-tasting flow.

**Product surface (so you do not rebuild what exists):**
- Nav: Search / Social / My Bar / Profile (+ Admin). `/taste` → `/social`. Login → `/mybar`. Profile = coming-soon + Sign out.
- Bottle detail: carousel over **default + variants** (swipe / arrows / dots). One variant → no pager. Fields that swap: images, Elo, verified, age, proof, notes, tasting notes. SKU identity (name, distillery, category) stays. Front/Back + zoom live.
- Have a drink: any bottle, not gated on My Bar, does **not** insert `user_bottles` or bump `times_had`. Pour sheet: neat / rocks / mixed / blind (blind toasts "not live"). Writes `activities` with optional `variant_id` of the visible carousel slide.
- Actions (7.6): one state-dependent primary + a `MoreSheet`. **none** → Add to My Bar (primary) + Have a drink. **owned** → Have a drink (primary) + More (Add another / Mark as Empty / Blind tasting stub / Remove). **empty** → Add Back (primary) + Have a drink + More (Remove). Suggest-edit pencil stays separate (top bar). Mark as Empty = soft delete (`currently_owned=false`, kept in history). Add Back = restock (`onAddToBar`), which bumps `times_had`.
- Suggest an edit (7.8): the top-bar pencil enters **inline edit-mode** over the visible version's fields; image area = upload target. Per-field gate: mine+unverified applies directly; else pending → admin. Append-only `suggested_edits`. Under-review banner. Admin reviews **inside the Bottles queue** (`BottlesTab`) with per-field Approve/Reject + optional reason; approve keeps verified.
- Add a variant (7.9): the card's second contribution action. **Global variant** (batch/release-year, everyone sees, `verified=false` → admin queue) vs **store pick** (private to creator). Save choice on both: **database-only** (creates the version, logs `added_to_db`, no `user_bottles`) vs **add-to-bar**. Entry points: a virtual **"+ Add a version" carousel slide** (every bottle swipeable now), an explicit "+ Add a version" control by the pager, and a More-sheet "Add a variant" row. Flow reuses `VariantSelectSheet` with `mode="contribute"`. `AddVariantSheet.tsx` is **deleted**.
- **Store-pick scoping (7.9):** store picks are private to their creator — everywhere variants show (detail carousel `fetchVariantsForSku`, All-Variants leaderboard + count in `SearchClient`, the "N versions" badge) they filter `store_pick_name IS NULL OR created_by IN (my authId, my publicId)`. Matching **both** ids works around the `created_by` inconsistency.
- Social: global reverse-chrono feed from `activities`.
- Coaches: new users get a live-UI core tour; existing users get one What's new digest per session (Show me = that feature's tour). Catalog `src/lib/coaches.ts`. Storage `users.seen_coach_ids`. Existing accounts were seeded `core.done`.

**SQL already live (do not re-run as if missing):** `activities` table + RLS; `users.seen_coach_ids` (existing users seeded); **`suggested_edits` table + RLS (7.8, `sql/7.8-migration.sql`)** — rollback `DROP TABLE IF EXISTS public.suggested_edits CASCADE` (`sql/7.8-snapshot.sql`); **7.9 view columns (`sql/7.9-migration.sql`)** — `all_variant_details.variant_created_by` + `all_bottle_details.attr_variant_created_by` (additive; rollback = `sql/7.9-snapshot.sql` restores the prior view defs). Helper: `node scripts/_psql.mjs "…"`. Never pass `DATABASE_URL` as a psql URI. Direct `db.*` is IPv6-only. SQL files ASCII-only. See AGENTS.md.

**Open decisions:** none. Brian asked to push 7.4/7.11 with light testing. Confirm prod at www.pourchoicesapp.com after Vercel.

**Landmines:**
- `user_bottles` is **one row per (user, bottle)**. Restock increments `times_had`. Do not insert a second row for the same SKU.
- A drink must **not** create a `user_bottles` row. `times_had` is collection restocks, not pours.
- Empty bottles show **Add to My Bar**, not the In My Bar / Finished It split.
- Search now scores from `default_variant_elo` (fallback `bottle_elo_global`); star scaling range differs per mode. `all_bottle_details` is additive-extended; `all_variant_details` is new. Rollback: `sql/7.2-snapshot.sql` (+ `DROP VIEW all_variant_details`).
- `activities` rollback: `DROP TABLE IF EXISTS public.activities CASCADE;` (see `sql/activities-snapshot.sql`). Admin `delete_user_cascade` is unchanged; `activities.user_id` ON DELETE CASCADE covers user wipe.
- Activity policy: log every bottle action until Brian excludes it (`src/lib/activities.ts`). Fail-open. Exclusion: admin hard-delete of a bottle.
- Coach policy: new user-facing surface → one `src/lib/coaches.ts` row. Pile-up = one digest per session, never 20 autoplayed tours. New vs existing = `core.done` in `seen_coach_ids`, not account age.
- Detail carousel: `localBottle.variants` is the owner-scoped ordered list (default first; global variants + the viewer's own store picks). Display via `fieldsForVariant`. **7.9:** the carousel has a virtual **add-slide** at index `vlist.length` — `totalSlides = vlist.length + (addSlideEnabled ? 1 : 0)`, `onAddSlide = variantIndex >= vlist.length`. `showPager` is true whenever logged in (even single-version), so **"single variant = no pager" is retired**. The add-slide body replaces the normal card body (image/attrs/actions).
- **`created_by` inconsistency, revisited:** store picks (and other variants) are stamped with the **auth id on some rows, the public id on others**. 7.9 handles this by matching **both** ids (`created_by IN (authId, publicId)`) in every owner-scope filter. A future cleanup could standardize `created_by`, but until then always match both.
- **`created_by` is inconsistent across rows** — some `bottles`/`bottle_variants` rows store the **auth id** (`auth.users.id`), others store the **public `users.id`**. 7.8's gate compares `target.created_by === authId` (auth id). This works for rows stamped with the auth id (the common case), but a row stamped with a public id will read as "not mine" → routes to pending review instead of direct-apply. Harmless (worst case = an extra admin approval), but 7.9 should standardize `created_by`. Don't assume `created_by` is always an auth id.
- **7.8 gate treats `verified IS NULL` as unverified** (`!data?.verified`). A variant with `verified=null` that displays as ✓ via the bottle-level fallback (`fieldsForVariant`) will direct-apply for its creator. Intended, but note null≠false here.
- **MyBar `handleToggleOwnership` is one-way** (hard-codes `currently_owned=false`, always logs `finished`) — it is a "mark finished", not a real toggle. Use it only for **Mark as Empty**. For **Add Back** (empty→owned) use the restock path (`onAddToBar` → `addOrRestockUserBottle`), which sets owned=true and bumps `times_had` in both Search and MyBar. SearchClient's toggle *is* a real toggle; the divergence is why 7.6 routes Add Back through restock, not toggle.
- Supabase's typed client overflows ("excessively deep") on a **union table name + `.or()`** — the dynamic-table queries in `SearchClient.tsx` are cast to `any` on purpose. Don't "fix" the casts.

---

## Known state drift (docs vs reality)
- ✅ **RECONCILED 2026-08-21** — **README.md** now carries a stale-banner pointing here; **ROADMAP** "WE ARE HERE"
  moved to Phase 7 and Phase 6 status corrected (6.0/6.1/6.2/6.3 shipped, **6.4 CSV import is the gap**;
  `ImportTab.tsx` is a shell). Phase 6 granular sub-checkboxes were **not** individually re-audited — code is truth.
  Spec mismatches: no `DB_SCHEMA.sql` at root (only `DB_Schema.txt.txt`); role hook is `src/lib/useCurrentUser.tsx` (not `.ts`).
- ⬜ **Still open — DB_Schema.txt.txt lags the live DB:** missing `users.role`, admin RPCs, `all_bottle_details` view
  (now incl. `default_variant_elo`/`default_variant_id`/`variant_count`), the new `all_variant_details` view,
  storage bucket, `bottle_variants.{elo_global,nose,palate,finish,is_default}`, `user_bottles.times_had`,
  `public.activities` (actions: drank, added_to_collection, finished, added_to_db, suggested_edit, verified, removed_from_collection),
  `users.seen_coach_ids`.
  No `suggested_edits` table (7.8 pending-suggestion flow still unbuilt; current "Suggest edit" writes a variant and logs `suggested_edit`).
- ✅ **7.2 read-switch is live** — search scores from the default variant (`all_bottle_details.default_variant_elo`) and the
  All Variants view scores from `all_variant_details.variant_elo_global`. `bottles.elo_global` is now legacy/fallback only.

---

## Log (newest first)

### 2026-08-23 — Claude (generic events / telemetry table shipped)
- Beta-prep foundation (TELEMETRY.md). Discovery with Brian first: **one generic table** with an
  `event_type` filter column; v1 events = page_view + search + click + error; **capture logged-out**
  (nullable user_id + session_id); **fire-per-event** fail-open.
- **Shipped** (`aa134d3` feat, `646ac2e` docs), pushed to `MVP-v3` (prod):
  - New **`public.events`** — `event_type`/`surface`/`target_type`/`target_id`/`metadata jsonb`,
    nullable `user_id` (+ client `session_id`), append-only. RLS: anon+auth insert (anon only
    anonymous rows), **admin-only read**, no update/delete. **Applied to prod DB this session.**
    `sql/events-migration.sql` (+ `sql/events-snapshot.sql` rollback). Additive.
  - **`src/lib/events.ts`** — fail-open, fire-and-forget `logEvent` / `logClick` (never awaits/throws;
    console-only on error). `session_id` in sessionStorage (`pc.session.id`).
  - **`EventTracker.tsx`** (mounted in `AppShell`, inside the provider) — `page_view` per route change
    (incl. the login funnel) + global `error` capture (window error + unhandledrejection).
  - `search` event in `SearchClient.searchBottles` (`{query, result_count, mode}`); `click` events
    `bottle_open` (SearchClient) + `have_a_drink` (BottleDetailView `handlePour`).
- **Verified end-to-end** on localhost as admin: page_views (incl. anonymous rows, proving the
  nullable-user funnel), a `search` (buffalo → result_count 7 → correct mode), `bottle_open` +
  `have_a_drink` clicks with session_id + metadata. All QA rows purged (events table emptied; test
  `drank` activity deleted). tsc clean; ESLint only pre-existing `any`/deps warnings.
- **Pre-existing infra note (NOT from this change):** hard reloads surface Next 16 + @supabase/ssr
  "Cookies can only be modified in a Server Action/Route Handler" errors during server render (one
  transient /admin 500 that self-recovered; all routes otherwise 200). Client-only telemetry doesn't
  touch cookies. Fixing it means auth/middleware work (gated) — flagged for Brian, not touched.
- **Prod verify handed to Brian** after Vercel. Add more events freely as features land (standing
  rule (b) in TELEMETRY). **Next: ask Brian** (Phase 4 Profile is the recommended quick win).

### 2026-08-23 — Claude (END SESSION: feedback / bug-report channel shipped)
- Beta-prep item off BACKLOG. Discovery Q&A with Brian first (entry point, form fields, auto-capture,
  admin surface), then built.
- **Shipped** (`00188a9` feat, `50f7b00` docs), pushed to `MVP-v3` (prod):
  - Profile entry "Send Feedback / Report a Bug" → `FeedbackSheet` — feature|bug toggle, message box
    with **Web-Speech dictation** (🎤, gracefully hidden where unsupported), optional **screenshot**
    attach (`accept="image/*"`). Auto-captures user_agent/viewport/route (route included for a future
    persistent affordance; entry is Profile-only today). Fail-open on the screenshot upload.
  - New **`feedback`** table + RLS mirroring `suggested_edits` (insert-own / select own+admin /
    update own+admin). **Applied to prod DB this session** (Brian's go). `sql/feedback-migration.sql`
    (+ `sql/feedback-snapshot.sql` rollback). Additive.
  - Admin **Feedback** tab (`FeedbackTab.tsx`, 4th tab): triage queue, Open/All/status filters with
    counts, status controls (new→triaged→planned→done), internal note (7.8 review-note pattern),
    screenshot thumbnail, reporter+context line.
  - Screenshots namespaced `bottle-images/feedback/<id>/…`; `screenshot_path` stored on the row so a
    resolved report's image is a one-delete purge.
  - Coach `profile.feedback` added as the **final new-user core tour step** (`src/lib/coaches.ts`).
  - Lib `src/lib/feedback.ts`. TELEMETRY records the new table.
- **Verified end-to-end** on localhost @ 375px as admin (Lakehouse): submit (feature, context
  captured) → appears in Admin > Feedback with filters/counts/type badge/reporter line → New→Triaged
  persisted → note saved (`reviewed_by`+`updated_at` set). No console errors. All QA rows deleted
  (table empty). **Prod verify handed to Brian** after Vercel.
- **Env note:** another Claude session's `next dev` held this project's `.next/dev/lock`; with Brian's
  say-so I stopped that process (PIDs 19360/20136) to run verification here. That other chat's preview
  is stopped — restart it there if needed.
- **New BACKLOG items** (Brian, this session): storage image-usage/orphan-purge audit; **AI
  background-removal on uploaded bottle images** (white/transparent bg for cleaner cards).
- **Next: nothing queued — ask Brian.** (Phase 3 tastings / Phase 4 profile / 6.4 CSV / generic events table.)

### 2026-08-23 — Claude (END SESSION: 7.9 add-a-variant — Phase 7 COMPLETE)
- Discovery with Brian first (store-pick privacy + the carousel entry-point UX), then built in 3 parts.
- **7.9a leak fix** (`d218a37`): store picks are private to their creator — owner-sees-own-everywhere.
  `fetchVariantsForSku` + SearchClient (leaderboard, count, badge) filter
  `store_pick_name IS NULL OR created_by IN (authId, publicId)`. SQL views gained
  `variant_created_by` / `attr_variant_created_by` (additive, applied to prod). Verified: others'
  store picks vanish from carousel/leaderboard/badge; owner still sees own.
- **7.9b add flow + carousel** (`57e0910`): `VariantSelectSheet` `mode="contribute"` with a save
  choice (database-only vs add-to-bar); global variant → unverified → admin queue, store pick →
  private. Carousel gains a virtual **"+ Add a version" slide** (every bottle swipeable; retires
  single-variant-no-pager) + explicit control + More-sheet row. Coach `bottle.add_variant`.
  `AddVariantSheet` deleted.
- Verified end-to-end as Lakehouse: single-version bottle shows Version-1-of-1 + hint + control; the
  "+" slide CTA opens the contribute sheet (Standard hidden, save choice shown); a database-only
  global variant created `verified=false`, **0 user_bottles**, `added_to_db` logged. All test data
  cleaned up (test variant + activity deleted; earlier proof edits restored). Typecheck + lint clean
  (0 errors). **Caught a self-inflicted bug:** a `replace_all` had turned the contribute helper into
  infinite recursion — fixed before commit.
- **Phase 7 is COMPLETE.** Next work is Brian's call (Phase 3 tastings / Phase 4 profile / 6.4 CSV /
  beta-prep). New landmines: the carousel add-slide index math; the created_by dual-id match.

### 2026-08-23 — Claude (END SESSION: 7.8 suggest-an-edit pushed to MVP-v3)
- Long discovery Q&A with Brian first (functionality before UI). Outcome: the bottle card has exactly
  **two contribution actions** — Suggest an edit (7.8) and Add a variant (7.9). Personal notes/ratings
  leave the card (they belong to the future tasting flow). Three flows were untangled from today's
  muddled pencil.
- **7.8 shipped** (`6db2748`): pencil → **inline edit-mode**; per-field gate (mine+unverified applies
  directly, else pending); append-only `suggested_edits` (pending/approved/rejected/canceled/applied);
  submitter-supersede = cancel+recreate; under-review banner; admin per-field Approve/Reject with an
  optional reason **inside the Bottles queue**; approve keeps verified. New `src/lib/suggestedEdits.ts`,
  coach `bottle.suggest_edit`, `AddVariantSheet` retired.
- **SQL:** `sql/7.8-migration.sql` (+ snapshot) — new `suggested_edits` table + RLS (insert-own,
  select own+admin via `is_admin()`, update own/admin) — **applied to prod DB this session** (Brian's go).
  Additive; rollback = drop the table.
- Verified every path against the live app as an admin user (direct-apply, pending+banner, admin
  approve keeps-verified, append-only supersede, reject) with DB checks; **all test data restored**
  (Buffalo Trace proof back to 90; test suggestion/activity rows deleted). Typecheck clean; ESLint
  only pre-existing warnings. **Image-replace couldn't be automated** (browsers block scripting a file
  input) — UI is wired + reuses Phase-6 `uploadBottleImage`; eyeball it on prod.
- **Next: 7.9** (add-a-variant: global vs store-pick user-scoping; also fixes the existing leaked
  personal-variant rows). Gated. New landmines added: inconsistent `created_by`, null-verified gating.

### 2026-08-23 — Claude (END SESSION: 7.6 state-aware actions pushed to MVP-v3)
- **7.6 shipped** (`750e427`): rebuilt the `BottleDetailView` action region into one state-dependent
  primary + a new `MoreSheet` (`src/components/MoreSheet.tsx`, PourSheet bottom-sheet pattern).
  Per state — none: Add to My Bar + Have a drink; owned: Have a drink + More (Add another / Mark as
  Empty / Blind tasting stub / Remove); empty: Add Back + Have a drink + More (Remove). Suggest-edit
  pencil untouched. Added the required `coaches.ts` row `bottle.actions` (announce).
- **Bug found + fixed in the same change:** MyBar's `handleToggleOwnership` is one-way
  (`currently_owned=false` only). First cut wired "Add Back" to `onToggleOwnership` → it silently
  no-op'd in MyBar. Re-routed Add Back through the restock path (`onAddToBar` →
  `addOrRestockUserBottle`) so empty→owned persists everywhere. New landmine documents this.
- **No SQL, no schema, no parent-handler signature changes.** All actions already have `activities`
  emitters; nothing added there.
- Verified logged-in (QA account) on localhost @ 375px across all three states + the
  owned→empty→owned round-trip; typecheck + console + server logs clean. Buffalo Trace was used as
  the test bottle and restored to owned (its `times_had` is now 2 from the Add-Back restock — a
  correct "had it again", not a bug). **Prod verify still on Brian** after Vercel.
- **Next: nothing queued.** 7.8 / 7.9 remain gated. Ask Brian.

### 2026-08-22 — Grok (END SESSION: 7.11 + 7.4 pushed; next is 7.6)
- Session pulled engagement forward then returned to 7.4. Brian: light test, push everything, end session.
- **7.11 coaches** (already on origin before this push's 7.4): `users.seen_coach_ids`; `src/lib/coaches.ts`; `TourPlayer` + `WhatsNewSheet` + `CoachHost`. SQL `sql/coaches-migration.sql` applied on live DB (existing users seeded `core.done`). Commits `7688ce2`, `a7991ff`.
- **7.4 carousel** `664d6d3`: `BottleDetailView` keeps default + all variants; swipe/arrows/dots swap images, Elo, verified, age, proof, notes. Single-variant = no pager. Pours write `variant_id`. Coach id `bottle.variants` announced.
- **7.5** finished (per-variant images ride the carousel).
- Standing rules added to AGENTS.md: log every bottle action; add a coach catalog row for new user-facing UI.
- **Next agent: 7.6** state-aware actions. Do not start 7.8/7.9, Phase 3, or Phase 5 unless Brian says so. Prod: www.pourchoicesapp.com after Vercel.

### 2026-08-22 — Grok (END SESSION: 7.7 + Social feed pushed to MVP-v3)
- Brian paused 7.4, pulled engagement forward: SKU-level drinks, Taste tab -> Social, full pour sheet (neat/rocks/mixed/blind).
- SQL applied on live Supabase this session (not just in git):
  - `sql/activities-snapshot.sql` + `sql/activities-migration.sql` — `public.activities` + RLS (authenticated select-all / insert-own) + indexes.
  - `sql/activities-verified-action.sql` — action `verified`.
  - `sql/activities-more-actions.sql` — action `removed_from_collection`.
  - Rollback: `DROP TABLE IF EXISTS public.activities CASCADE`.
- App commits (then this doc commit), pushed to `MVP-v3`:
  - `cfd028c` 7.7: Have a drink + Social activity feed
  - `a56926b` docs: 7.7 Have a drink + Social feed handoff
  - `848f387` 7.10: log admin verify as a social activity
  - `69f7418` 7.10: log suggest-edit and remaining bottle actions
- Behavior: **Have a drink** on any bottle (not gated by My Bar; does not insert `user_bottles` or bump `times_had`). Blind logs the pour and toasts that tastings aren't live. `/taste` redirects to `/social`. Nav: Search / Social / My Bar / Profile.
- Activity policy: log every bottle action until Brian excludes one. Emitters: drank, added_to_collection, finished, added_to_db, suggested_edit (AddVariantSheet save), verified (admin queue), removed_from_collection. Exclusion: admin hard-delete of a bottle (CASCADE would wipe the feed row).
- Brian verified locally ("it seems to be working") then asked to push. **Next agent: 7.4** variant carousel. Do not start 7.6/7.8/7.9 unless Brian says so.

### 2026-08-21 — Grok (7.7 Have a drink + Social feed)
- Pulled 7.7 + the social activity feed forward (Brian: pause 7.4, SKU-level drinks, replace Taste with Social, full pour sheet).
- SQL: `sql/activities-snapshot.sql` + `sql/activities-migration.sql` applied on live Supabase. New `activities` table, RLS (authenticated select all / insert own), indexes. Rollback: `DROP TABLE IF EXISTS public.activities CASCADE`.
- App: `src/lib/activities.ts`; `PourSheet`; **Have a drink** on any bottle in `BottleDetailView` (neat/rocks/mixed/blind). Drink does not touch `user_bottles`. Add/finish/restock/add-to-DB also write activities (fail-open).
- New `/social` feed. AppShell Taste tab -> Social. `/taste` redirects to `/social`.
- My last activity reads `activities` when present (`Drank · date`).
- Follow-up same session: admin Verify writes `verified`. Suggest edit (AddVariantSheet save) writes `suggested_edit`. Remove from collection writes `removed_from_collection`. New variant from the add-to-bar sheet writes `added_to_db`. SQL `sql/activities-more-actions.sql`.

### 2026-08-21 — Claude (END SESSION: 7.2 shipped + Vercel deploy fixed)
- **Fixed a broken prod deploy first:** TS build error from dead `user_bottles` column fallbacks in `mybar/page.tsx` + `SearchClient.tsx` (removed — the columns are all live), and Node 18 discontinuation on Vercel (pinned `engines.node` to `22.x`; dashboard was already 22.x). Commits `b4629b5`, `a711056` — pushed and confirmed green by Brian.
- **7.2 shipped:** SQL (`b0bd17b`) added `default_variant_elo`/`default_variant_id`/`variant_count` to `all_bottle_details` (additive) + new `all_variant_details` view; snapshot in `sql/7.2-snapshot.sql`. App (`df13291`) added the [Bottles | All Variants] toggle, default-variant scoring, "N variants" badge, and the per-variant leaderboard — all fetch paths mode-aware.
- Verified on localhost by Brian ("everything seems fine"). Data: 80 SKUs / 112 variants / 30 multi-variant. Pushed to `MVP-v3` (prod) with this doc update.
- **Next agent: 7.4** variant carousel (extend `BottleDetailView`'s existing `variantIndex`/pager to a full swipeable carousel incl. the default) — also finishes 7.5 per-variant images.

### 2026-08-21 — Grok (END SESSION: 7.1 shipped to MVP-v3)
- Pushed `cb3de03..24f99b3` to `MVP-v3` (prod). Then this handoff/ROADMAP tick.
- 7.1 SQL + app live. Extra: `times_had`, last-activity dates, zoom-close fix, empty-bottle Add to My Bar.
- Localhost verified (Lakehouse / Wild Turkey 101). Prod verify still on Brian after Vercel.
- **Next agent: 7.2** search roll-up + N variants + Bottles/All Variants toggle. Do not start 7.4+.

### 2026-08-21 — Grok (session: 7.1 + SQL access)
- Agents can run approved SQL via `DATABASE_URL` + `scripts/_psql.mjs`. Documented in AGENTS.md. Direct `db.*` host is IPv6-only; use the pooler URI; never pass the URI to `psql`.
- `times_had` column applied on `user_bottles`.

### 2026-08-21 — Claude (session: apply Grok's protocol review)
- Grok reviewed the relay setup and flagged real issues; all addressed:
  - **7.5 doc contradiction** — verified against code (`BottleDetailView.tsx`): tap-to-zoom + Front/Back toggle ARE shipped; only per-variant images await 7.1. Fixed HANDOFF to match ROADMAP.
  - **"who commits the baton"** — AGENTS.md now spells out the END SESSION sequence: the agent commits the doc updates and pushes them with the code, per the agents-push policy.
  - **skipped END SESSION** — added a recovery procedure to AGENTS.md.
  - **doc nits** — ROADMAP wireframe note fixed ("until Phase 5", not 4); Phase 6 subsection headings now show section-level ✅/gap so nobody "finishes" 6.0–6.3 from empty sub-boxes.
- No app code touched. Next real work unchanged: **7.1** (variant-first migration, snapshot first, needs Brian's go).

### 2026-08-21 — Grok (session: state review, no code)
- Read README / ROADMAP / BACKLOG / DB schema. Wrote no code.
- Produced the current-state summary that seeded this file. Confirmed 7.1 is the next task and outlined the migration approach above.
- Awaiting Brian's go to plan 7.1 as SQL + app read-switch (snapshot first).

### 2026-08-21 — Claude (session: set up agent relay + doc reconcile)
- Created `AGENTS.md`, `HANDOFF.md`, and a `CLAUDE.md` shim so both agents share standing context and a handoff baton.
- Added the canonical **START SESSION / END SESSION** ritual phrases to AGENTS.md.
- Reconciled docs vs reality (verified via git + files): ROADMAP "WE ARE HERE" → Phase 7; Phase 6 status corrected
  (6.0–6.3 shipped, 6.4 the gap); README got a stale-banner. No app code touched.
- Next agent: run **START SESSION**, then the next real work is **7.1** (variant-first migration, snapshot first, needs Brian's go).
