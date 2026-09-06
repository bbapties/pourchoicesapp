# The board

The live work list for Pour Choices. Replaces the bugs / backlog / roadmap checkbox trio.

- **Board:** https://github.com/users/bbapties/projects/1
- **Repo:** https://github.com/bbapties/pourchoicesapp
- **Issues:** https://github.com/bbapties/pourchoicesapp/issues

Set up 2026-09-05. Import record, including everything deliberately skipped:
[board-import-preview.md](board-import-preview.md).

---

## How the board works

**Priority is not a field.** It's expressed by which column a card sits in — Brian drives that by
dragging. The columns are a *readiness* pipeline, not just urgency:

| Column | Means |
|---|---|
| **To be reviewed** | Imported, not yet triaged. All 57 start here. |
| **North Star** | Large ideas. Need breaking into sections, then tasks. |
| **Backlog** | Broken into features. Waiting for prioritization. |
| **Coming Soon** | Broken into tasks. Coming up soon in the roadmap. |
| **Top Priority** | Immediate work. |
| **In Progress** | Actively being worked. |
| **Done** | Completed. |

## Fields

### Size — level of effort, vibe-coding scale

| Size | Effort |
|---|---|
| **XS** | 30 min – 1 hour |
| **S** | ~2 hours |
| **M** | ~4 hours |
| **L** | ~8 hours |
| **XL** | Multiple days |

As imported: XS 8 · S 15 · M 18 · L 9 · XL 7. Roughly **350 hours** of work on the board if every
item were built at these estimates.

**These sizes are Claude's first-pass estimates, not Brian's.** Correct them freely — they're a
starting point so the board isn't blank, not a commitment.

### Area — which part of the app

Colour-coded so a glance shows where the work is concentrated.

`Search` · `My Bar` · `Social` · `Tastings` · `Bottle Detail` · `Profile` · `Admin` ·
`Auth & Security` · `Backend / DB` · `Data Quality & Seeding` · `Infra / PWA` · `Telemetry` ·
`Design / UI`

Current concentration: Tastings 10 · Design/UI 8 · Profile 6 · My Bar 5 · Auth 4 · Search 4 ·
Data Quality 4 · Bottle Detail 4 · Admin 3 · Backend/DB 3 · Infra/PWA 3 · Telemetry 2 · Social 1.

## Labels

| Label | Use for |
|---|---|
| `bug` | Something broken in current behavior. |
| `feature` | New user-facing capability, including user stories. |
| `enhancement` | Improve something that already exists. |
| `other` | Chores, research, docs, infra. |
| `needs-detail` | Thin source note, or it may already be done. Check before working it. |
| `imported` | Came from the original planning docs. Safe to filter on. |

Spread: `feature` 18 · `enhancement` 16 · `bug` 15 · `other` 8 · `needs-detail` 5 · `imported` 57.

---

## Useful views to add

Beyond the board, `+ New view` gives you other cuts of the same 57 items:

- **By area** — Board layout, column field `Area`. Shows where the debt is piled up.
- **Quick wins** — Table layout, filter `size:XS,S`, sorted by Area. What you can knock out in an evening.
- **Inbox** — Table layout showing Title, Status, Size, Area, Labels, Updated.

## Adding a card from your phone

GitHub mobile app → `pourchoicesapp` repo → **Issues** → **+** → title and body → create.
Then open the issue → **Projects** → *Pour Choices Board* → set Status, Size, Area.

To skip the second step, turn on auto-add once: board → **⋯** (top right) → **Workflows** →
**Item added to repository** → enable. New issues then land in the board automatically and you drag
them out of *To be reviewed*.

Worth also enabling **Item closed → set Status: Done** in the same Workflows menu, so closing an
issue moves the card by itself.

## Phrases that work with Claude

- "Read the board. Recommend the next mix." — reads Top Priority then Coming Soon.
- "Close #12 and #18."
- "Move #31 to Backlog." / "Move #20 to In Progress."
- "What's in Top Priority right now?"
- "Size #44 as a Large."
- "File that as a new issue in Coming Soon, area Tastings, size M."

The CLI lives at `.tools\gh\bin\gh.exe` (gitignored). Authenticated as `bbapties` with `repo` and
`project` scopes.

---

## Import tally

| | Count |
|---|---|
| Open checkboxes parsed from the 4 source docs | 120 |
| Already shipped, checkbox never ticked | −29 |
| Process / pointers / decision notes | −6 |
| Merged into another issue (both sources noted in the body) | −11 |
| CSV import sub-steps folded into one issue | −6 |
| Added from HANDOFF.md prose | +2 |
| **Issues created** | **57** |

By source: 16 from BUGS.md · 20 from BACKLOG.md · 15 from ROADMAP.md · 4 from PHASE10.md ·
2 from HANDOFF.md.

**Nothing failed to parse.** Every skipped item is listed with a reason in
[board-import-preview.md](board-import-preview.md), and all four source docs are untouched.

---

## Still to decide

- **The source docs are now duplicates.** BUGS.md, BACKLOG.md, ROADMAP.md and PHASE10.md still hold
  the same items as unticked boxes. Until they're cut back there are two sources of truth and the
  board will drift. Plan: review the board first, then delete or archive them.
- **AGENTS.md still points both agents at the .md checkboxes.** It needs one edit — read-first order
  points here — or the next agent ticks markdown and ignores the board. Deliberately not done yet.
- **`board-import-preview.md` deviation D1** (CSV import as 1 issue, not 7) was applied. Reverse it
  by splitting [#25](https://github.com/bbapties/pourchoicesapp/issues/25) if you'd rather have 7.
