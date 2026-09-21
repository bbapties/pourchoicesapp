# Badge release + reveal — the runbook

**Canonical for Brian, Claude and Grok.** How a badge goes from "built" to "on people's shelves",
one badge at a time, from psql. There is no admin UI for this on purpose (Brian, 2026-09-21): adding
a badge is back-end work anyway. Art rules are [BADGE_ART.md](BADGE_ART.md); award rules are the
#21 body and `sql/badges-migration.sql`. Schema for this file: `sql/badge-releases-migration.sql`.

---

## The model in one paragraph

The engine (`award_badges`) awards **every** badge to **everyone**, silently, and has since #138.
Credit sits in `user_badges` whether or not a badge is visible. What a person may **see** is a
separate switch: **`badge_releases`** — one row per badge, `user_id` NULL for everyone or set for
one person. A badge that is not released to you sits under "Coming soon" on the shelf, does not
count toward your level, and never reveals. **`user_badges.revealed_tier`** is the highest tier you
have been shown the reveal for (0 = never). The reveal queue is:

```
released to me  AND  tier > revealed_tier
```

Nothing is ever deleted or zeroed in `user_badges`. Un-releasing hides; it never strips credit.

---

## Releasing a badge — the exact steps

All from this machine: `node scripts/_psql.mjs "<sql>"` (see AGENTS.md "Supabase SQL").

**0. Ids you need**

```sql
SELECT id, username FROM users WHERE username IN ('The_Lake_House');
SELECT id, name, one_off FROM badges WHERE active ORDER BY sort;
```

**1. Art done and signed** (BADGE_ART.md) — `public/badges/objects/<id>.webp` exists and the id is
in `OBJECT_IDS` (`src/lib/badgeArt.ts`). Pushed to prod. The badge is still "Coming soon" for
everyone at this point.

**2. Release to Brian alone** (prod test — the reveal fires for him on his next open):

```sql
INSERT INTO badge_releases (badge_id, user_id, released_by, note)
VALUES ('<badge_id>', '<The_Lake_House id>', '<The_Lake_House id>', 'Brian test')
ON CONFLICT DO NOTHING;
```

Open the app → the reveal plays → Close / More details. To watch it again:

```sql
UPDATE user_badges SET revealed_tier = 0 WHERE user_id = '<id>' AND badge_id = '<badge_id>';
```

**3. Release to a few more people** — one row each, same INSERT with their ids.

**4. Release to everyone** — the NULL row. Every holder gets ONE reveal of their **current** tier on
their next open (the ladder never replays; someone at Silver sees Silver, not Wood→Bronze→Silver):

```sql
INSERT INTO badge_releases (badge_id, user_id, released_by, note)
VALUES ('<badge_id>', NULL, '<The_Lake_House id>', 'released to everyone')
ON CONFLICT DO NOTHING;
```

The per-person rows can stay; they are redundant once the NULL row exists.

**5. Un-release** (hides it again everywhere, credit and `revealed_tier` untouched):

```sql
DELETE FROM badge_releases WHERE badge_id = '<badge_id>';
```

**Before you release: decide the reward for people who already hold credit** (Brian's call per
badge — HANDOFF "Brian's plan"). The reveal itself is the reward the app gives; anything more
(a post, a push) is a separate decision. `BADGE_MOMENTS_ENABLED` (Social row + push) is still off.

---

## Useful queries

```sql
-- what is released, to whom
SELECT badge_id, coalesce(u.username, 'EVERYONE') AS who, released_at, note
  FROM badge_releases r LEFT JOIN users u ON u.id = r.user_id ORDER BY badge_id, released_at;

-- who is due a reveal right now
SELECT u.username, ub.badge_id, ub.tier, ub.revealed_tier
  FROM user_badges ub JOIN users u ON u.id = ub.user_id
 WHERE ub.tier > ub.revealed_tier
   AND ub.badge_id IN (SELECT released_badges(ub.user_id));

-- did the reveal play (telemetry)
SELECT created_at, user_id, target_id, metadata FROM events
 WHERE event_type = 'badge_revealed' ORDER BY created_at DESC LIMIT 20;
```

---

## What the app does with it

| Piece | File | Behaviour |
|---|---|---|
| Release lookup | `src/lib/badgeRelease.ts` | `fetchReleased(userId)` → RPC `released_badges` (everyone-rows + own rows), 60s cache |
| Shelf / sheet | `src/components/badges/BadgeShelf.tsx` | unreleased → "Coming soon" (locked plate, no tier, no progress). `/profile?badge=<id>` opens that badge's sheet (the reveal's More details) |
| Level plate | `src/components/user/UserPage.tsx` + `user_level()` | hidden until something is released to that person; points count released badges only |
| Reveal queue | `src/lib/badgeReveal.ts` | `fetchPendingReveals` (released ∧ tier > revealed_tier, oldest first), `markRevealed` → RPC `reveal_badges` (own rows only) + `badge_revealed` event |
| The reveal | `src/components/badges/BadgeReveal.tsx` | mounted once in AppShell. Fires on sign-in, when the tab comes back to the front, and on `pc:badge-check` (dispatched by `runAwards` the instant something goes up, so a live earn reveals right away if released). Never on `/` or `/taste`. |

**Choreography:** plate of `revealed_tier` (grey when 0 — "New badge earned"; the old metal on an
upgrade — "Badge upgraded") holds 0.9s, shakes 1.6s (`pc-shake-long`), bursts (confetti +
`pc-pop`) into the earned medal with name, how-to-earn, **More details** / **Close**. Tap the plate
to skip ahead. More than one queued: "1 of X", **Next**, and **Reveal all X** (always the person's
choice; no animation, a scrollable list with Details per row and one Close). `prefers-reduced-motion`
→ no shake, no confetti. **Close marks everything still queued as seen** (a nag is worse than a
missed reveal; the shelf has them).

**Telemetry** (TELEMETRY.md): `badge_revealed` per badge `{tier, from, upgrade, mode:
animated|reveal_all|dismissed, queued}`; clicks `badge_reveal_close`, `badge_reveal_all`,
`badge_reveal_details`.

---

## Landmines

- **`RELEASED_BADGES` in code is gone.** Do not bring back a code-side set; the table is the switch.
- `reveal_badges` resolves the caller through `users.auth_id` — never pass a user id in.
- The QA account (`Claude Code Agent`) has `founders_reserve` released to it for testing and its
  `revealed_tier` pinned; reset it with the UPDATE above to watch the reveal again.
- A reveal that fails to mark (offline) simply plays again next open — fail-open by design.
