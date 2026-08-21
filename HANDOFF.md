# HANDOFF.md — The baton

The living handoff between Claude and Grok. **Read the "Right now" block first; update it before switching agents.**
Full scope/status lives in [ROADMAP.md](ROADMAP.md); this file is the narrative a checkbox can't hold.

---

## Right now

- **Branch:** `MVP-v3` (= production). Working tree clean except untracked `.claude/` and a weekly HTML file.
- **Last commit:** `b231c32` — "Apply Grok's protocol review: fix 7.5 contradiction + doc nits".
- **Current phase:** **Phase 7 — bottle detail revamp + variant-first model.**

**Done in Phase 7:**
- 7.3 — new bottle-detail card layout (`66d028c`).
- 7.5 — image interactions, *partial* (`573cfe3`): broken/missing → placeholder, **tap-to-zoom, and Front/Back toggle are DONE** (verified in `src/components/BottleDetailView.tsx` on 2026-08-21 — `showZoom` + `imageSide` state). Only **per-variant images** remain, blocked on 7.1.

**Next step (do NOT skip ahead to 7.2+):**
- **7.1 — variant-first data-model migration.** This is the keystone; 7.2, 7.4, and 7.6–7.9 all depend on it.
  Agreed approach, in order:
  1. **Snapshot first** — no destructive schema work until Brian approves.
  2. Additive columns on `bottle_variants`: `elo_global`, `nose`, `palate`, `finish` (keep existing `verified`/images).
  3. Backfill a **default variant** for every bottle (≥1 variant per SKU); copy bottle-level Elo/notes/images/verified onto it.
  4. Phase the read-switch: SKU = `bottles`, scored identity = default variant first.
  5. Verify: every bottle has ≥1 variant; no bottle-level field lost; a SKU returns ordered variants (default first).
  - **Requires SQL in Supabase → needs Brian's approval before running. No hard-deletes.**

**Open decisions / waiting on Brian:**
- Approval to plan + run the 7.1 migration (snapshot step first).

---

## Known state drift (docs vs reality)
- ✅ **RECONCILED 2026-08-21** — **README.md** now carries a stale-banner pointing here; **ROADMAP** "WE ARE HERE"
  moved to Phase 7 and Phase 6 status corrected (6.0/6.1/6.2/6.3 shipped, **6.4 CSV import is the gap**;
  `ImportTab.tsx` is a shell). Phase 6 granular sub-checkboxes were **not** individually re-audited — code is truth.
  Two spec mismatches noted in ROADMAP: no `DB_SCHEMA.sql` at root (only `DB_Schema.txt.txt`); no `src/lib/useCurrentUser.ts`.
- ⬜ **Still open — DB_Schema.txt.txt lags the live DB:** missing `users.role`, the admin RPCs, the `all_bottle_details`
  view (used in code), and the storage bucket. No `suggested_edits` table yet (needed for 7.8). Refresh the dump when convenient.
- ⬜ **DB is not yet variant-first:** `bottles` is still the scored product row; `bottle_variants` is an attribute
  sidecar (no `elo_global` / nose / palate / finish). Closing that gap *is* task **7.1** (next up).

---

## Log (newest first)

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
