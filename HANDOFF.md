# HANDOFF.md — The baton

The living handoff between Claude and Grok. **Read the "Right now" block first; update it before switching agents.**
Full scope/status lives in [ROADMAP.md](ROADMAP.md); this file is the narrative a checkbox can't hold.

---

## Right now

- **Branch:** `MVP-v3` (= production).
- **Last commit:** (this session) 7.7 Have a drink + Social feed, plus admin verify as a feed action. SQL for `activities` (incl. `verified`) is already applied on prod Supabase.
- **Current phase:** **Phase 7.** 7.1, 7.2, 7.7 (SKU-level), and 7.10 Social are done. Next is **7.4** (variant carousel).

**Done in Phase 7:**
- **7.1** — variant-first data model (2026-08-21). Additive cols on `bottle_variants`: `elo_global`, `nose`, `palate`, `finish`, `is_default`. Every SKU has exactly one default. **80 bottles, 112 variants**, 0 missing default. App: `src/lib/variants.ts`; new bottles dual-write a default variant; detail overlays default Elo/notes/images.
- **7.2** — search roll-up + [Bottles | All Variants] toggle (2026-08-21, verified on localhost, pushed to `MVP-v3`). SQL (`b0bd17b`): `all_bottle_details` gained `default_variant_elo`/`default_variant_id`/`variant_count` (**additive — no columns dropped**); new `all_variant_details` view (one row per variant + SKU identity). App (`df13291`): Bottles view scores each SKU from its default variant + "N variants" badge (hidden at 1); All Variants = per-variant cards sorted by variant Elo with a subtitle tag (Default / Batch / year / store pick). Star scaling, count banner, browse pagination, search, and category/verified filters are all mode-aware. AppShell `/search` top margin 92→128px for the toggle row.
- 7.3 — detail-card layout (`66d028c`).
- 7.5 — *partial*: placeholder, tap-to-zoom, Front/Back (`573cfe3`); zoom-close fix `27e5702`. Per-variant images wait on **7.4**.
- **7.7 + 7.10** — Have a drink + Social feed (2026-08-21). New `activities` table (append-only; authenticated read-all / insert-own). **Have a drink** on any bottle (not gated by My Bar; does not insert `user_bottles` or bump `times_had`). Pour sheet: neat / rocks / mixed / blind. Blind logs the pour and toasts that tastings aren't live. Add / finish / restock / add-to-DB / admin verify / **suggest edit** / remove from collection also write activities. Policy: log every bottle action until Brian excludes one. Current exclusion: admin hard-delete of a bottle (CASCADE would wipe the row). Bottom nav is Search / Social / My Bar / Profile. `/taste` redirects to `/social`. My last activity prefers the latest `activities` row.

**Next step:**
- **7.4 — Variant carousel.** Swipeable carousel over [default + variants]; the whole card swaps on swipe; subtitle + pager + dots. `BottleDetailView` already has a `variantIndex` + pager/dots for **labeled** (non-default) variants — extend it to a full carousel that includes the default and swaps every variant-specific field. Single-variant SKUs show no pager. This also finishes 7.5 (per-variant images) and lets 7.7 attach pours to a variant.

**SQL access:** `node scripts/_psql.mjs "…"`. Never pass `DATABASE_URL` as a psql URI. Direct `db.*` is IPv6-only. Don't print secrets. Keep SQL files ASCII-only (non-ASCII in a `-c` string fails with a UTF8 byte error on Windows). See AGENTS.md.

**Open decisions / waiting on Brian:** none for this slice. Verify Have a drink + Social on localhost and mobile before push.

**Landmines:**
- `user_bottles` is **one row per (user, bottle)**. Restock increments `times_had`. Do not insert a second row for the same SKU.
- A drink must **not** create a `user_bottles` row. `times_had` is collection restocks, not pours.
- Empty bottles show **Add to My Bar**, not the In My Bar / Finished It split.
- Search now scores from `default_variant_elo` (fallback `bottle_elo_global`); star scaling range differs per mode. `all_bottle_details` is additive-extended; `all_variant_details` is new. Rollback: `sql/7.2-snapshot.sql` (+ `DROP VIEW all_variant_details`).
- `activities` rollback: `DROP TABLE IF EXISTS public.activities CASCADE;` (see `sql/activities-snapshot.sql`). Admin `delete_user_cascade` is unchanged; `activities.user_id` ON DELETE CASCADE covers user wipe.
- Supabase's typed client overflows ("excessively deep") on a **union table name + `.or()`** — the dynamic-table queries in `SearchClient.tsx` are cast to `any` on purpose. Don't "fix" the casts.

---

## Known state drift (docs vs reality)
- ✅ **RECONCILED 2026-08-21** — **README.md** now carries a stale-banner pointing here; **ROADMAP** "WE ARE HERE"
  moved to Phase 7 and Phase 6 status corrected (6.0/6.1/6.2/6.3 shipped, **6.4 CSV import is the gap**;
  `ImportTab.tsx` is a shell). Phase 6 granular sub-checkboxes were **not** individually re-audited — code is truth.
  Two spec mismatches noted in ROADMAP: no `DB_SCHEMA.sql` at root (only `DB_Schema.txt.txt`); no `src/lib/useCurrentUser.ts`.
- ⬜ **Still open — DB_Schema.txt.txt lags the live DB:** missing `users.role`, admin RPCs, `all_bottle_details` view
  (now incl. `default_variant_elo`/`default_variant_id`/`variant_count`), the new `all_variant_details` view,
  storage bucket, `bottle_variants.{elo_global,nose,palate,finish,is_default}`, `user_bottles.times_had`,
  `public.activities`. No `suggested_edits` table (7.8); `activities.action` includes `suggested_edit` for later.
- ✅ **7.2 read-switch is live** — search scores from the default variant (`all_bottle_details.default_variant_elo`) and the
  All Variants view scores from `all_variant_details.variant_elo_global`. `bottles.elo_global` is now legacy/fallback only.

---

## Log (newest first)

### 2026-08-21 — Grok (7.7 Have a drink + Social feed)
- Pulled 7.7 + the social activity feed forward (Brian: pause 7.4, SKU-level drinks, replace Taste with Social, full pour sheet).
- SQL: `sql/activities-snapshot.sql` + `sql/activities-migration.sql` applied on live Supabase. New `activities` table, RLS (authenticated select all / insert own), indexes. Rollback: `DROP TABLE IF EXISTS public.activities CASCADE`.
- App: `src/lib/activities.ts`; `PourSheet`; **Have a drink** on any bottle in `BottleDetailView` (neat/rocks/mixed/blind). Drink does not touch `user_bottles`. Add/finish/restock/add-to-DB also write activities (fail-open).
- New `/social` feed. AppShell Taste tab -> Social. `/taste` redirects to `/social`.
- My last activity reads `activities` when present (`Drank · date`).
- Follow-up same session: admin Verify writes `verified`. Suggest edit (AddVariantSheet save) writes `suggested_edit`. Remove from collection writes `removed_from_collection`. New variant from the add-to-bar sheet writes `added_to_db`. SQL `sql/activities-more-actions.sql`.
- **Next: 7.4 variant carousel.** Verify this slice on localhost + mobile before pushing.

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
