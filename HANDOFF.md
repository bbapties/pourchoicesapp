# HANDOFF.md — The baton

The living handoff between Claude and Grok. **Read the "Right now" block first; update it before switching agents.**
Full scope/status lives in [ROADMAP.md](ROADMAP.md); this file is the narrative a checkbox can't hold.

---

## Right now

- **Branch:** `MVP-v3` (= production). Pushing here deploys www.pourchoicesapp.com.
- **Last commit:** END SESSION docs (this baton). App tip before docs: `750e427` (7.6 actions).
- **Current phase:** **Phase 7.** Shipped: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.10, 7.11. **Not shipped:** 7.8 (real suggest-edit table), 7.9 (contribute/add-variant save choice). Phase 6.4 CSV import is still a shell.

**Single next step for the incoming agent:**
- **Nothing is queued.** 7.6 is done. The remaining Phase-7 items are **7.8** (suggest-an-edit → needs a `suggested_edits` table + admin queue) and **7.9** (add-a-variant save choice), both **gated — do not start unless Brian says go.** Also do not start Phase 3 tastings or Phase 5 polish without Brian's word. Ask Brian what's next.

**Product surface (so you do not rebuild what exists):**
- Nav: Search / Social / My Bar / Profile (+ Admin). `/taste` → `/social`. Login → `/mybar`. Profile = coming-soon + Sign out.
- Bottle detail: carousel over **default + variants** (swipe / arrows / dots). One variant → no pager. Fields that swap: images, Elo, verified, age, proof, notes, tasting notes. SKU identity (name, distillery, category) stays. Front/Back + zoom live.
- Have a drink: any bottle, not gated on My Bar, does **not** insert `user_bottles` or bump `times_had`. Pour sheet: neat / rocks / mixed / blind (blind toasts "not live"). Writes `activities` with optional `variant_id` of the visible carousel slide.
- Actions (7.6): one state-dependent primary + a `MoreSheet`. **none** → Add to My Bar (primary) + Have a drink. **owned** → Have a drink (primary) + More (Add another / Mark as Empty / Blind tasting stub / Remove). **empty** → Add Back (primary) + Have a drink + More (Remove). Suggest-edit pencil stays separate (top bar). Mark as Empty = soft delete (`currently_owned=false`, kept in history). Add Back = restock (`onAddToBar`), which bumps `times_had`.
- Social: global reverse-chrono feed from `activities`.
- Coaches: new users get a live-UI core tour; existing users get one What's new digest per session (Show me = that feature's tour). Catalog `src/lib/coaches.ts`. Storage `users.seen_coach_ids`. Existing accounts were seeded `core.done`.

**SQL already live (do not re-run as if missing):** `activities` table + RLS; `users.seen_coach_ids` (existing users seeded). Helper: `node scripts/_psql.mjs "…"`. Never pass `DATABASE_URL` as a psql URI. Direct `db.*` is IPv6-only. SQL files ASCII-only. See AGENTS.md.

**Open decisions:** none. Brian asked to push 7.4/7.11 with light testing. Confirm prod at www.pourchoicesapp.com after Vercel.

**Landmines:**
- `user_bottles` is **one row per (user, bottle)**. Restock increments `times_had`. Do not insert a second row for the same SKU.
- A drink must **not** create a `user_bottles` row. `times_had` is collection restocks, not pours.
- Empty bottles show **Add to My Bar**, not the In My Bar / Finished It split.
- Search now scores from `default_variant_elo` (fallback `bottle_elo_global`); star scaling range differs per mode. `all_bottle_details` is additive-extended; `all_variant_details` is new. Rollback: `sql/7.2-snapshot.sql` (+ `DROP VIEW all_variant_details`).
- `activities` rollback: `DROP TABLE IF EXISTS public.activities CASCADE;` (see `sql/activities-snapshot.sql`). Admin `delete_user_cascade` is unchanged; `activities.user_id` ON DELETE CASCADE covers user wipe.
- Activity policy: log every bottle action until Brian excludes it (`src/lib/activities.ts`). Fail-open. Exclusion: admin hard-delete of a bottle.
- Coach policy: new user-facing surface → one `src/lib/coaches.ts` row. Pile-up = one digest per session, never 20 autoplayed tours. New vs existing = `core.done` in `seen_coach_ids`, not account age.
- Detail carousel: `localBottle.variants` is the **full** ordered list (default first). Do not filter to labeled-only. Display via `fieldsForVariant`.
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
