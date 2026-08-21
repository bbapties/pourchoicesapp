# HANDOFF.md — The baton

The living handoff between Claude and Grok. **Read the "Right now" block first; update it before switching agents.**
Full scope/status lives in [ROADMAP.md](ROADMAP.md); this file is the narrative a checkbox can't hold.

---

## Right now

- **Branch:** `MVP-v3` (= production).
- **Last commit:** `651afb2` — "END SESSION: mark 7.1 done, next is 7.2" (app tip `24f99b3`).
- **Current phase:** **Phase 7.** **7.1 is done.** Next is **7.2**.

**Done in Phase 7:**
- **7.1** — variant-first data model (2026-08-21). Additive cols on `bottle_variants`: `elo_global`, `nose`, `palate`, `finish`, `is_default`. Every SKU has exactly one default. Live after migration: **80 bottles, 112 variants**, 0 missing default. App: `src/lib/variants.ts`; new bottles dual-write a default variant; detail overlays default Elo/notes/images. Search/My Bar still read `all_bottle_details` (one row per SKU, **bottle-level** Elo) — that switch is **7.2**.
- 7.3 — detail-card layout (`66d028c`).
- 7.5 — *partial*: placeholder, tap-to-zoom, Front/Back (`573cfe3`). Zoom **X was covered by the image** — fixed `27e5702`. Per-variant images wait on **7.4**.
- Also this session: empty bottle → **Add to My Bar** (same `user_bottles` row, increment `times_had`); **My last activity** = `Added · date` / `Finished · date`. "Drank ·" is 7.7.

**Next step (do NOT skip to 7.4+):**
- **7.2 — Search roll-up + variant count + [Bottles | All Variants] toggle.**
  - Default: one card per SKU, scored from the **default variant's** Elo, "N variants" badge.
  - All Variants: each variant is its own card, sorted by its own Elo.
  - View `all_bottle_details` is still `GROUP BY b.id` with `b.elo_global`. 7.2 needs a view change or new query — **do not drop columns the app selects**. Arrays: `attr_variant_ids`, `attr_batch`, `attr_release_year`, `attr_store_pick_name`. SQL in `sql/` (7.1 already applied, idempotent).

**SQL access:** `node scripts/_psql.mjs "…"`. Never pass `DATABASE_URL` as a psql URI. Direct `db.*` is IPv6-only. Don't print secrets. See AGENTS.md.

**Open decisions / waiting on Brian:**
- Confirm www.pourchoicesapp.com after this Vercel deploy (Search, detail, add, My Bar, zoom X, empty → Add to My Bar, Times had, last activity).

**Landmines:**
- `user_bottles` is **one row per (user, bottle)**. Restock increments `times_had`. Do not insert a second row for the same SKU.
- Empty bottles show **Add to My Bar**, not the In My Bar / Finished It split.
- `all_bottle_details` was **not** rewritten in 7.1.

---

## Known state drift (docs vs reality)
- ✅ **RECONCILED 2026-08-21** — **README.md** now carries a stale-banner pointing here; **ROADMAP** "WE ARE HERE"
  moved to Phase 7 and Phase 6 status corrected (6.0/6.1/6.2/6.3 shipped, **6.4 CSV import is the gap**;
  `ImportTab.tsx` is a shell). Phase 6 granular sub-checkboxes were **not** individually re-audited — code is truth.
  Two spec mismatches noted in ROADMAP: no `DB_SCHEMA.sql` at root (only `DB_Schema.txt.txt`); no `src/lib/useCurrentUser.ts`.
- ⬜ **Still open — DB_Schema.txt.txt lags the live DB:** missing `users.role`, admin RPCs, `all_bottle_details` view,
  storage bucket, `bottle_variants.{elo_global,nose,palate,finish,is_default}`, `user_bottles.times_had`. No `suggested_edits` (7.8).
- ✅ **7.1 data model is live** — variants have independent Elo/notes; every bottle has a default variant. Search still scores from `bottles.elo_global` until 7.2.

---

## Log (newest first)

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
