# Phase 10 — Road to a 3-person beta

Supersedes the Phase 8 ordering. **[PHASE8.md](PHASE8.md) stories are still valid specs** (PWA,
tutorial/What's new, push, barcode) — this file changes *what order and why*, and adds the cost and
retention work Phase 8 never had.

Planning session with Brian, 2026-09-04. Full rationale + measurements in the plan file
`C:\Users\whisk\.claude\plans\start-a-new-session-precious-hamster.md`.

---

## The change in framing

The beta is now **3 people Brian knows**, not 10-15 strangers. The bar moved from *"testers get a
trustworthy first session"* (Phase 8) to **"they install it and keep opening it."** That is a
retention problem, not an onboarding problem.

Brian's stated priority, verbatim: *"install with more of an app feel with icon on mobile and push
notifications and a really good What's new ... that will almost be my way to market it and keep my
beta testers engaged."*

Those are Phase 8 waves 2, 3 and 5 — **the three waves never started.** Two bug waves shipped instead.

---

## Measured baseline (prod, 2026-09-04)

| | |
|---|---|
| Bottles / variants | 82 / 110 |
| **Verified** bottles | **8** (10%) |
| Bottles with a barcode | 58 (71%) |
| Users | 7 (1 with no `auth_id`: `Grain_of_Truth`) |
| **Tasting sessions** | **0 — the core loop has never been run by a human on prod** |
| Events rows | 65,212, of which **~64,500 are redirect-loop junk** (~700 real) |
| Storage | 11 objects / **17 MB — ~1.5 MB per image** |

Two numbers drive this phase: **0 tastings** (the flagship loop is unexercised) and **1.5 MB/image**
(the free tier holds ~660 images at that size; ~10,000 at ~100 KB WebP).

---

## Wave A — Stop the bleeding (small, independent)

- [x] **A1 Redirect loop — investigate, cap, purge.** Declared fixed 23:17 UTC 2026-09-01; **restarted
  at 23:35 the same night.** Five anon sessions bouncing `/` <-> `/mybar`, ~60k rows in 4.5h, one
  session alone 26,794 rows. Decayed to a trickle **still firing 3 hits/day at 11:00 UTC**.
  `middleware.ts:45-59` + `src/app/page.tsx:48-59` both use `getUser()` and look correct, so the
  hypothesis is non-human clients ignoring the `Set-Cookie` purge — **confirm before coding.**
  Then add a **server-side per-session rate cap** (extend `guard_event_insert`; today's cap is
  client-side only, which is why one client wrote 26k rows), then purge by session_id.
  **DONE 2026-09-05.** Root cause was **not** the client: `middleware.ts` sat at the repo root, and
  Next.js only reads `src/middleware.ts` when a `src/` directory exists -- **the middleware had never
  run in production.** So `/search`, `/social` and `/profile` served 200 to signed-out visitors (no
  data leaked -- RLS held), and both `f6842a3` (getUser hardening) and `4210e1c` (the stale-cookie
  purge built to end this very loop) were no-ops. Moved to `src/middleware.ts` + a `/`,
  `/reset-password` public allowlist (enabling it had bounced password-reset arrivals) -- `a6de5b0`,
  verified live on prod. Added the server-side cap (200 rows/session/hour in `guard_event_insert`;
  260-row burst -> exactly 200) and purged 64,560 rows (**65,215 -> 655**).
  The five loopers were **browser tabs, not a bot**: `session_id` lives in `sessionStorage`, so ids
  persisting from Sep 1 to Sep 4 means those tabs stayed open; they wake together once a day.
- [x] **A2 Compress images on upload.** Resize + WebP in `src/lib/uploadBottleImage.ts` (already
  MIME-allow-listed + 8 MB capped from B-59). ~15x more headroom on the same free tier. Must land
  **before** more beta photos and well before any catalog seed.
  **DONE 2026-09-05** (`046f94d`). Measured first: six phone JPEGs (1.1-4.6 MB) were **86% of the
  bucket**; the bot's five images were 178-505 KB -- **the app was the problem, not the bot.**
  New `src/lib/compressImage.ts`: 1200px long edge + WebP q82, EXIF-aware, alpha-safe, skips
  already-small files, never returns a bigger blob, and fails open to the original. Input guard
  raised to 25 MB with the 8 MB cap now applying to what is *stored*. Applied to feedback
  screenshots too. **Verified end-to-end through the real app path: a 3024x4032 5.91 MB JPEG
  stored as 149.8 KB WebP (40x).**
  Bot side aligned in the same pass: `clean_image.py` now downscales + emits WebP and warns over
  250 KB; SKILL.md requires `.webp`. On our real bot images: 505 KB -> 66 KB, 495 KB -> 54 KB,
  transparency intact.
- [ ] **A3 Brian's config tasks (not code).** **B-26** — add `/reset-password` to Supabase Auth ->
  URL Configuration -> Redirect URLs + enable the Reset Password template. **Forgot-password ships in
  the UI and does not work today.** **B-21** — confirm the service-role env var in Vercel.
- [ ] **A4 Tick BUGS.md drift** — B-32, B-48, B-54, B-60, B-61 shipped in PHASE9 but read as open.

## Wave B — B-74 done properly  ✅ COMPLETE 2026-09-05

Brian: *"I'd rather just do things the best way for long term."* **Measured, it is not major:**

| | |
|---|---|
| People-FK columns already on `public.users.id` | **10 of 10** |
| FKs pointing at `auth.users` | **3** -- `bottles.created_by`, `bottles.updated_by`, `bottle_variants.updated_by`. (An earlier note here said 0; that came from `information_schema`, which does not surface cross-schema references. `pg_constraint` is authoritative. `bottle_variants.created_by` has no FK at all.) |
| `bottles.created_by` | **81/82 auth ids**, 0 public ids |
| `bottle_variants.created_by` | **109/110 auth ids** |
| Rows to remap | **192** |
| Stragglers | none, as it turned out -- all three "orphan" values were one id: the `auth.users` row for `grainoftruth@`, whose `public.users` row had the same email and a NULL `auth_id`. A broken link, not an orphan. Repaired, so nothing was nulled. |

**B-46's "created_by is mixed" is effectively false** — it is consistently auth ids, just a
*different convention* from the other ten columns, which forces every ownership check to match both
ids and makes each one a chance to get it wrong.

- [x] **DONE 2026-09-05.** Shipped in three steps because code and SQL do not deploy atomically and
  `created_by` is written on every bottle add -- migrating fully first would have made the deployed
  code violate the new FK, and deploying code first would have violated the old one. So:
  **part 1** repaired the `auth_id` link, dropped the three `auth.users` FKs and remapped all **384**
  values, deliberately leaving the columns unconstrained; **the app was deployed writing public ids**
  (`fab85e2`); **part 2** re-swept, aborted-if-unresolvable, added `ON DELETE SET NULL` FKs to
  `public.users(id)` and simplified the B-24 policy; then **`9c76dd3`** deleted the dual-id matching
  across `variants.ts`, Search / My Bar / Social / Drink / VariantSelectSheet and `suggestedEdits`.
  Changing the helper *signatures* rather than their bodies made the compiler enumerate every caller.
  Removing the dual match stranded the auth-id plumbing that only fed it, so `authId` now survives in
  exactly one place -- `AppShell`, where it genuinely means "is there a session".
  **Verified:** an auth id in `created_by` is now rejected by the FK; store-pick privacy still holds
  under `SET ROLE authenticated` (creator sees, others do not); All Variants shows 108 of 110, the 2
  hidden rows being exactly the store picks owned by someone else.
  Closes **B-74, B-45, B-46**. `sql/b74-created-by-public-id-part{1,2}-migration.sql`.

Doing this **before** push means `push_subscriptions.user_id` is right by construction, and 3.4 is
unblocked whenever it comes up.

## Wave C — The app feel  ✅ COMPLETE 2026-09-05

`public/` has **no manifest, no service worker, no PNG icons** — only SVGs + `cellar-bg.png`.
Icon art: **derive from `cellar-bg.png` / existing art** (Brian's call, 2026-09-04).

- [x] **C1** Manifest + icon set + apple meta + `theme-color` (`27e0f8d`). `cellar-bg.png` turned
  out to contain a real brand mark -- the hanging barrel-head sign, already circular. Cropped to the
  medallion and generated at 192/512/maskable/180/32. Photographic icons are a poor fit for
  truecolour PNG (the 512 was 571 KB); an adaptive 256-colour palette holds the wood gradient for
  2.6x less, whole set 394 KB. **Three things this surfaced:** the middleware matcher ate
  `/manifest.webmanifest` (excluded images but not `.webmanifest`), so install was broken for
  exactly the signed-out first visitor it targets; Next emits only `mobile-web-app-capable`, not the
  `apple-` prefixed name iOS needs for standalone launch; and `src/app/favicon.ico` was still the
  **Next.js default Vercel triangle**.
- [x] **C2** Service worker (`cd77527`). Deliberately narrow: caches ONLY immutable, content-hashed,
  same-origin assets. Never HTML, never API, never cross-origin. Navigations return early and are
  never intercepted, so a bad deploy stays recoverable by a plain reload. No offline mode -- the
  right trade for an auth-gated app whose screens are meaningless without fresh data. Registers in
  production only. **Verified:** cache holds exactly 3 hashed chunks + 5 precached assets, zero HTML,
  zero API, zero cross-origin. Adds a `pourchoices-prod` launch config, since a production-only
  worker needs a production build to test.
- [x] **C3** First-visit install prompt (`90f3f36`). Asks **before signup** -- installing after
  signing up in Safari means the installed app opens in its own storage partition with no session.
  Android one-tap; iOS instructional; in-app browsers told to open a real browser.
  **Two flaws testing caught:** Profile's "Install the app" row routed to `/`, which silently does
  nothing for a signed-in user (redirected to /mybar), so the sheet was split into `InstallSheet`
  and now opens in place; and on Android without a live `beforeinstallprompt` the sheet was a dead
  end with no button and no steps. Detection verified against six UA strings incl. iPadOS-13-as-Mac
  and Instagram. Coach row `profile.install`; six-event funnel in TELEMETRY.md.

## Wave D — The engagement channel (his marketing lever)

Content channel **before** delivery — push with nothing to say is worthless.

- [ ] **D1** Admin-published What's new. `announcements` table + admin publish/unpublish; digest reads
  **published unseen rows only**; existing coaches seeded unpublished so a tester isn't handed 7.x
  history. Schema = snapshot + go.
  > **The automatic coaches are OFF in the meantime** (Brian, 2026-09-05): `AUTO_COACHES_ENABLED =
  > false` in `src/lib/coaches.ts` disables both the new-user core tour and the What's new digest,
  > because the digest currently shows whatever the catalog holds and would hand a beta tester the
  > accumulated 7.x/8.x history as news. **Flip that flag back to `true` as part of D1.** Profile >
  > "Replay tutorial" deliberately still works, via a sessionStorage handshake.
- [ ] **D2** Core tour rewrite — it predates Drink and barcode. Search -> barcode -> bottle card ->
  Drink -> My Bar -> Social -> Profile. Replay still replays core only. Short discovery on copy.
  Events: `tour_started` / `tour_completed` / `tour_skipped` / `whatsnew_shown`.
- [x] **D3 Push — DONE 2026-09-05** (`e8bfa90`), pulled ahead of D1/D2 at Brian's call: push is the
  framework he needs before adding features. Schema applied (`sql/push-notifications-*.sql`):
  `push_subscriptions` **per device** keyed on the unique endpoint, plus `users.notify_push`
  (preference) and `users.notify_prompt_optout` ("never ask me again") kept separate because someone
  can be un-nagged yet still notifiable. SW `push` + `notificationclick` with a same-origin deep
  link. Admin ▸ Notify sends to everyone or one user, server-side only.
  **Two hard constraints drove the design:** the OS permission dialog is **one-shot per origin
  forever**, so Brian's "prompt them multiple times" is implemented as repeated showings of OUR
  sheet, spending the single real dialog only on "Turn them on"; and **iOS only supports push for an
  installed PWA on 16.4+**, never a Safari tab, so that case is detected and told to install first.
  Nudges fire at app launch / after first action / on Profile, once per session, never when granted,
  denied or opted out. **Verified:** 401 unauthenticated, 403 for a signed-in non-admin, VAPID keys
  produce a valid aes128gcm payload + JWT, and a policy-blocked browser shows "Blocked in browser"
  with unblock steps rather than a lying toggle.
  **Owed by Brian:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Vercel
  (values in the gitignored `.env.local`). Until then the route returns a clear 503.

## Wave E — Reasons to come back

- [ ] **E1** Get **one real blind tasting onto prod.** Zero have ever happened. Do it before three
  friends do it first. Moves shared global Elo — QA account, clean up after.
- [ ] **E2** Ranked tasting-results view (D.1 follow-up). A tasting posts to Social then simply ends;
  the "click for details" 1st->last view was never built. The core loop's payoff and its most
  shareable moment. Reads `tasting_sessions`/`tasting_results`; no schema.
- [ ] **E3** Badges v1 — awards **retroactively from already-captured history** (`activities` +
  `events`); that data debt is already paid. Strong stickiness per unit effort for 3 engaged testers.

## Wave F — Cost runway (prerequisite for the catalog seed)

- [ ] **F1** Storage orphan purge + Admin usage readout. Nothing purges provisional adds, suggested-edit
  uploads or rejected submissions. Scheduled purge with a grace period + a visible trend.
- [ ] **F2** Catalog seed **design session with Brian, not solo.** Iowa open data = ~6,628 bottles with
  real UPCs (51-56% coverage of ours). **Settle first:** images (Brian's named pinch point — do
  imported rows ship imageless?), whether imports count as verified (6.6k unverified would drown the
  admin queue), name cleanup, dedupe, category mapping. **Import nothing until A2 and F1 are in.**

---

## Explicitly deferred

- **3.4 group tastings** — unblocked by Wave B but needs schema + realtime + multi-device. Not a
  3-person-beta requirement.
- **Elo math B-49 / B-50** — Brian's engine, ask-first; with 0 real tastings there is no pressure.
  Revisit once E1/E2 produce real sessions.
- **Phase 5 polish** (incl. B-44). **6.4 CSV import** — superseded by the F2 seed path.
- **B-30**, **B-23 tier-2**, remaining medium/low (B-62/63/64/65/67/68/69) — none block the beta.
