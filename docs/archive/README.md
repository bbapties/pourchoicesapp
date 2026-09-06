# Archive — frozen planning docs

These files were the working queue until **2026-09-05**, when all open work moved to the
[Pour Choices Board](https://github.com/users/bbapties/projects/1).

**They are kept for research, not for status.** Nothing in here is maintained.

## Do not

- **Do not tick a checkbox in these files.** They were frozen mid-flight. Of the 120 unticked boxes
  at freeze time, ~29 were already shipped and never ticked, and ~11 were the same item recorded in
  two different files. The checkbox state is unreliable by construction.
- **Do not take priority or ordering from these files.** The board's columns are the order.
- **Do not add new items here.** File an issue instead (`gh issue create`), then put it on the board.

## Do

- **Read them for specs and context.** This is where the story-level detail lives, and the board's
  one-paragraph issue bodies do not replace it.
- **Read them for history.** Why a decision was made, what was tried, what broke.

## What each file is

| File | What it holds | Still useful for |
|---|---|---|
| `PHASE8.md` | Feature specs — PWA, tutorial + What's new, push, barcode | **Yes** — the fullest spec detail for those features |
| `PHASE9.md` | Bottle-model build-out (variant-first model) | **Yes** — how the bottle/variant model came to be |
| `PHASE10.md` | Waves A–F, the road to a 3-person beta, ranked 2026-09-04 | **Yes** — the *reasoning* behind the current ordering |
| `ROADMAP.md` | Phase-by-phase build log, Phases 1–8 | History, and the record of what shipped when |
| `BUGS.md` | Bug queue B-01…B-74 from the 2026-08-27 review | History — most are fixed, with the fix described inline |
| `BACKLOG.md` | Nice-to-have idea list | History — every live item is now an issue |

## Where things went

Every item that was still open became a GitHub issue. The full mapping — what became an issue, what
was skipped, and why — is in [../board-import-preview.md](../board-import-preview.md).

The pre-push **test checklist** that used to live at the top of `ROADMAP.md` is still live and has
moved into [../../AGENTS.md](../../AGENTS.md). The **Dev / QA account** details are in AGENTS.md too.
