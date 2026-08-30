# BOTTLE_ACTIONS.md — The bottle-interaction model

**Purpose.** A greenfield, agreed-from-scratch spec of every action a user can take on a
bottle, and exactly how each one is stored, rated, displayed, and surfaced socially. We
designed the *ideal* model here first; the "fix / enhance / change vs. the current app"
analysis happens **after** the model is locked.

> Status: **model complete — all six buckets walked and agreed (2026-08-29 → 2026-08-30).**
> Items marked ✅ are agreed; ⏸ parked; ❌ cut. A few sub-points are flagged as build-time
> decisions (storage-vs-derived, exact icons/placement). **Next step: diff the current app
> against this model** and reshape the bug queue (B-31/32/33 and beyond) accordingly.

---

## Scope

All six buckets are in scope, including the new concepts raised in discovery:

- **A. Find & look** — search/scan, view, browse versions
- **B. Collection** — add, empty/finish, restock, remove, **wishlist** (new)
- **C. Consumption** — log a pour; pour context (parked)
- **D. Evaluation** — blind tasting, quick rating, personal notes (new), flavor tags (parked)
- **E. Contribute** — add bottle, add version, suggest edit, upload image, verify
- **F. Social & meta** — activity trail; favorite/bookmark (cut — same as wishlist)

## The rubric (answered for every action)

1. **Entry points** — where the user triggers it
2. **What it means** — plain-language definition
3. **Stored** — what persists, and where
4. **Elo** — does it move a rating?
5. **Screens** — Search card · Bottle detail · My Bar · Drink flow · Social feed · Profile
6. **Activity trail** — feed event? what does it read as?
7. **Edge cases / interactions** — collisions with other actions

## Standing model decisions (apply everywhere)

- **One default bottle per SKU, keyed by barcode.** The barcode identifies the SKU; its scan
  target is always the *default* bottle. **Variations** (store picks, batches, year releases)
  sit on top of that SKU. If store picks/variations ever get their own distinct barcodes and
  cause duplicate SKUs, that's a **later enhancement** — for now, default = one SKU,
  barcode-driven.
- **The "default" is just the first/standard bottle; variants are genuinely different
  bottles.** A variant (special edition, batch, store pick) has its **own flavor profile,
  images, verified status, and ratings** — not a cosmetic label on the same liquid.
- **Almost everything is per-variant.** Ratings, ownership counts, wishlist, history, tags — all
  attach to the **specific variant** (the default is just one of them). The search list is the
  one SKU-first surface; everything on the detail card and in My Bar is per-variant.
- **Ownership is two per-variant counts, not a flag.** Per (user, variant) we track a
  **currently-owned count** (how many on the shelf now) and an **emptied/finished count** (how
  many I've killed). "Lifetime had" = owned + emptied (+ any pour/tasting). These may be
  **derived** from the activity history rather than stored counters (resolved at build). A
  single variant can appear in **both** My Bar sub-tabs at once (e.g. own 1, emptied 1).
- **"Had it" = any relationship.** True when the viewer has **owned it (now or in the past),
  poured a drink of it, or blind-tasted it** — any version counts.
- **Hard deletes truly erase, and cascade to the social feed.** See B.4.
- **Blind tastings are permanent** — never deletable, anywhere (they moved shared/global Elo).

---

## A. Find & look

### ✅ A.1 — Search / scan
*(agreed 2026-08-29; tag + min-fields reconciled 2026-08-30)*

1. **Entry points:** the Search screen (text field + barcode-scan button). A scan button also
   appears wherever the user is looking for a bottle to act on (My Bar add, Drink picker).
2. **Means:** find an existing catalog bottle, or discover it isn't in the catalog yet.
3. **Stored:** the search/scan is telemetry only (an `events` row: query, result count, mode).
   Nothing is written to the bottle. A barcode miss doesn't get its own log — it routes into the
   "add it now" flow below.
4. **Elo:** none.
5. **Screens (results):**
   - **Text search** → one card per **SKU** (the default bottle), with an "N versions" hint,
     the **4-state earmark tag** (verified × had-it — see B.1), and the **averaged star** (A.2).
   - **Barcode hit** → a **two-zone** result:
     - **Primary:** the default SKU card (open it / add it / add a different version).
     - **"In your bar" callout:** lists the specific **non-default** versions of this SKU the
       user already owns — each by its store-pick / variant **name**, each tappable to open
       *that* version directly. Multiple owned non-default versions → list them all.
     - **If the only thing owned is the default itself** (no variations/store picks): skip the
       callout — the primary card just reads "in your bar" (it's just "open it").
   - **Barcode miss** (decoded a valid number, no SKU matches) → the **"add it now" flow** below.
6. **Activity trail:** none — searching/scanning is private. (Adding the missed bottle emits the
   normal catalog-contribution activity — that belongs to E.)
7. **Edge cases:**
   - Owning only a store pick / odd variant still shows the **default SKU card** in text search
     (with the had-it earmark) — search stays SKU-first. Per-version detail is on the card's
     carousel and (for barcode) in the "in your bar" callout.
   - **No-decode** (scanner never resolved any barcode): nothing to prefill — stay on the
     scanner / retry / search by name. No frame capture, no miss log.

#### Barcode miss → "add it now"
We do **not** keep a separate scan-miss table. A decoded-but-no-match turns the miss directly
into a catalog contribution — self-healing the catalog and seeding the barcode in one step:
- On a valid barcode with no match, pop: **"We don't have that bottle — add it now?"**
- **Yes** → open the provisional add form with the **barcode pre-filled**. Required: **name +
  photo** (everything else optional).
- Lands as **provisional / unverified** → the admin verify queue (E.1), barcode already attached
  so the next scanner gets a hit.

### ✅ A.2 — View a bottle's detail
*(agreed 2026-08-29)*

1. **Entry points:** tapping a search card, a My Bar card, a Social feed row, a barcode hit, or
   a deep link.
2. **Means:** the hub — everything about the bottle and its versions, and the launch point for
   most other actions (add, pour, taste, contribute).
3. **Stored:** viewing is telemetry only (a `bottle_open` event). **No user-visible "recently
   viewed"** anywhere — pure telemetry.
4. **Elo:** none — it only *displays* stars derived from Elo (see rating display below).
5. **Screens:** it *is* a screen — the version carousel (default + variants/store picks). Opens
   **pinned to the version you came from** (My Bar / Social / barcode "in your bar" callout) or
   **default-first** (text search of the SKU, deep link with no version context). Shows: image
   (front/back), attributes, the rating display, your personal relationship (own / empty /
   tasted), state-aware actions, wishlist toggle, history icon, and the notes accordion.
6. **Activity trail:** none — viewing is private.
7. **Edge cases:** the pin-vs-default landing rule is the B-31 fix.

#### Rating display (mechanics live in Bucket D)
Every rating is stored as an Elo and shown only as a **0–5 star** (the Elo number stays hidden).
- **Detail page:** shows **two** stars — a **Global rating** (community, from the variant's
  global Elo) and a **My rating** (personal). "My rating" is **clickable to edit only while I
  have no real Elo yet** (a best-guess I can keep tweaking) and **locks to display-only** once I
  have a true personal Elo. Both stars always shown.
- **Search list card (SKU-first):** a **single star = the average of my rating and the global
  rating** for the **default** version. The detail view breaks the two apart and shows
  per-variant ratings. *(Accepted tradeoff: averaging a subjective guess with the community
  score is semantically loose and a brand-new user's guesses tilt their own list; chosen for a
  clean compact card.)*
- "My rating" on a SKU card always refers to the **default** version.

### ✅ A.3 — Browse a bottle's versions
*(agreed 2026-08-30)*

1. **Entry points:** on the detail, flip across the version carousel; plus a "+ Add a version"
   slide at the end.
2. **Means:** move across the **default + its variants/store picks** to see each version's own
   image, attributes, ratings, and your relationship to it.
3. **Stored:** nothing on the bottle (optional lightweight telemetry on variant view).
4. **Elo:** none — each slide just *displays* that version's global + my stars.
5. **Screens:** inside the detail card. Each slide = one version.
   - **Which versions you see:** the default + all **global** variants + **your own** store
     picks. **Others' store picks are never shown** — a user only ever sees store picks they
     created, including while browsing from search. (Standing rule, reaffirmed.)
   - **Order:** **default → global variants (A–Z) → your store picks (A–Z).**
   - **"+ Add a version" slide:** **always available**, but a **small, clearly secondary** slide
     so a single-version bottle doesn't read as mostly "add."
6. **Activity trail:** none.
7. **Edge cases:** per-version ownership state is the B-31 fix (each slide shows its own
   ownership, not the SKU's).

#### Interaction — full-card "book page" swipe
The current image-only swipe + dots feels unintuitive. Intended model: the **entire card** is a
horizontal pager — each version is a **page**, you flip the whole card left/right like a book.
Keep a light page indicator for orientation, but the gesture acts on the full card, not just the
image. *(Interaction pattern, not visual polish — refined in build.)*

---

## B. Collection

### ✅ B.1 — Add to my bar
*(agreed 2026-08-30)*

1. **Entry points:** "Add to My Bar" on the detail card (when you don't own the viewed version);
   the barcode "add it now" path; possibly a quick-add on the search card (TBD). **What gets
   added = the version you're viewing** — normally the **default**.
2. **Means:** "I physically have this specific version on my shelf right now." Adding the default
   does **not** create a variant. Creating a variant is a **separate, explicit** contribution
   (Bucket E), only when the user says it's a special version. Not every bottle has variants
   (e.g. Jim Beam Black 7yr) — adding it just adds the default.
3. **Stored:** an ownership record for (user, version). **Current quantity** and **lifetime
   count** are both meaningful but **need not be stored counters** — they can be **derived** from
   the activity history. *(Storage-vs-derived resolved at build.)*
4. **Elo:** none. Pure shelf action, zero rating/pour implication.
5. **Screens:**
   - **Search card:** the 4-state earmark tag (below) + the averaged star (A.2).
   - **Detail:** actions switch to the owned state for the viewed version; the currently-owned #
     shows.
   - **My Bar ▸ In My Bar:** the specific owned version.
6. **Activity trail:** emits **"added to collection"** → Social "so-and-so added [version of] X."
7. **Edge cases / interactions:**
   - Adding a version you had only **tasted** before upgrades that tasting-only record to owned.
   - Adding one you **already own** = restock (B.3).
   - **Global variant vs store pick:** global variants need admin verification; store picks stay
     private to the creator (Bucket E).

#### Tags & relationship display — supersedes the old B-31 tag copy
**Search results list — the earmark tag encodes two dimensions (verified × had-it):**

| Verified? | Had it? | Tag |
|---|---|---|
| verified | never had | **no tag** |
| unverified | never had | **yellow dot** |
| verified | had it | **green earmark corner + white check** |
| unverified | had it | **green earmark corner + yellow check** |

- **No quantity info on the search list.** (Verified here = the default/SKU's verified status;
  "had it" spans any version of the SKU.)

**Detail view (per variant):**
1. **Same 4-state tag**, per-variant, and may render as an **intuitive text version**.
2. **Currently owned = #** — a current-quantity number when you own **1 or more** of that variant
   now.
3. **Wishlist icon** — toggle; colored when selected, b/w when not (B.5).
4. **History icon** (e.g. a calendar) — appears when you've had **any** interaction with the
   **viewed variant**. Tapping opens a **scrollable modal**: high-level **counts** at the top,
   then a **timeline** of all your interactions/activities with **that variant**. **Per-variant.**

### ✅ B.2 — Mark as empty / finished
*(agreed 2026-08-30)*

1. **Entry points:** detail card action on an owned version; My Bar owned-card action. Always
   **finishes a single bottle** ("finish one").
2. **Means:** "I killed one bottle of this version." Leaves my shelf, stays in my history.
3. **Stored:** **currently-owned −1** and **emptied +1** for that (user, variant). Lifetime "had
   it" preserved.
4. **Elo:** none.
5. **Screens:**
   - Search tag: still **"had it"** — finishing never erases history.
   - Detail: currently-owned # decrements; history icon + tag remain.
   - **My Bar — the split:** currently-owned shows in **In My Bar**; emptied shows in **Empty
     Bottles**. The **same variant can appear in both at once.** Example: own **2** → In My Bar:
     2. Mark one empty → owned **1**. Now **In My Bar: 1** *and* **Empty: 1** for that variant.
6. **Activity trail:** emits **"finished"** → Social "so-and-so finished X."
7. **Edge cases:** own 3 → finish one → owned 2 (still In My Bar), emptied 1 (now also in Empty).
   Finishing when owned is 0 isn't offered.

> **Correct model for B-32.** A variant in both sub-tabs is **intended** (owned + emptied counts
> are independent). The B-32 *bug* was the accidental version — SKU-level collapse with
> last-write-wins. Fix = drive both tabs off the per-variant owned/emptied counts, not prevent
> the dual appearance.

### ✅ B.3 — Restock / re-buy
*(agreed 2026-08-30)*

1. **Entry points:** "Add another" on a version you own; "Re-buy / Add back" from the Empty tab;
   or plain "Add to My Bar" when owned is 0 but you've had it before.
2. **Means:** "I got another bottle of this version."
3. **Stored:** **currently-owned +1.** Emptied count untouched.
4. **Elo:** none.
5. **Screens:** owned # increments. Re-buying something you'd fully emptied puts it in **both**
   tabs — In My Bar (new owned) *and* Empty (historical emptied persists).
6. **Activity trail:** **"added to collection"** — same event as a first add (no separate
   "restocked" event).
7. **Edge cases:** first-add and restock are the same increment; only entry point/label differ.

### ✅ B.4 — Remove / correct a mistake
*(agreed 2026-08-30)*

Remove exists **only to undo mistakes** on the three hand-logged actions: an **add**, an
**empty**, or a **pour**. **Blind tastings are permanent and can never be deleted** — no Remove
is ever offered on a tasting, anywhere.

Guiding rule: **a "hard delete" truly erases** — the record leaves the user's history/timeline
**and** its entry is removed from the **social feed** (not merely hidden). *(This is a real
change from the current append-only `activities` policy — flag for the fix-analysis.)*

Per sub-tab / state:
1. **In My Bar → "Oops — mistakenly added":** a **hard delete** of that add. Owned −1; if it
   clears the record it's gone entirely, **and** the "added to collection" activity is removed
   from the feed + history. Scoped to the erroneous add — a separate tasting/pour on the same
   variant is untouched.
2. **Empty → "This isn't empty":** **not** a hard delete — a **reversal** (owned **+1**, emptied
   **−1**) that puts the bottle back on the shelf. Distinct from **Re-buy (B.3)**: re-buy keeps
   the emptied history; "this isn't empty" removes the erroneous empty. The erroneous
   **"finished" activity is also removed** from the feed + history.
3. **Pour → hard delete:** removes the pour from the user's history **and** the social timeline.
4. **Blind tasting:** no delete. Permanent.
5. **Elo:** removing an add/empty/pour never touched a rating — nothing to unwind.
6. **Where:** add-correction and empty-reversal from the relevant My Bar sub-tab / detail state;
   **pour deletion from the per-variant history-modal timeline** (pours have no card of their
   own).

### ✅ B.5 — Wishlist
*(agreed 2026-08-30; per variant)*

1. **Entry points:** the wishlist toggle icon on the detail card (per variant) — colored when
   on, b/w when off.
2. **Means:** "I want this version" (aspirational). Store-pick wishlist only applies to your own
   store picks — edge case, allowed.
3. **Stored:** a wishlist flag per (user, variant); pure toggle.
4. **Elo:** none.
5. **Screens:**
   - Detail: the colored/b-w toggle.
   - **My Bar gains a Wishlist sub-tab.** Sub-tabs: **In My Bar · Empty · Tasted · Wishlist.**
   - **Search list: no wishlist indicator** — stays strictly the 4-tag earmark system.
6. **Activity trail:** **emits a social post** ("added X to their wishlist") — valuable once the
   feed can be filtered to friends.
7. **Edge cases:**
   - **Adding a wishlisted version to your bar auto-clears** the flag ("you got it!").
   - A user **may re-add** to wishlist even while they own it ("I want another"). Wishlist and
     owned are independent; owning just auto-clears once.

---

## C. Consumption

### ✅ C.1 — Log a pour (neat / rocks / mixed)
*(agreed 2026-08-30)*

1. **Entry points:** "Have a drink" on the detail card (the viewed variant); the Drink tab's
   "Have a drink" flow.
2. **Means:** "I drank some of this version on one occasion." Not ownership, not a rating.
3. **Stored:** an activity/event record (user, variant, **pour type**, timestamp). Does **not**
   touch owned/emptied counts, does **not** move Elo. **Makes "had it" true.**
4. **Elo:** none.
5. **Screens:**
   - Search tag: **"had it"** becomes true.
   - Detail: history icon/timeline updates; "my last activity" can read "Drank · date."
   - **My Bar: none.** A pour never lands in any sub-tab — it's a social item + "had it" history.
6. **Activity trail:** emits **"drank / poured"** → Social shows **user, when, which bottle, and
   style** — as already coded.
7. **Edge cases:**
   - Pouring something you own does **not** decrement owned (only Mark as Empty does).
   - **Pour types = neat / rocks / mixed only.** "Blind" is **not** a pour — it routes into a
     blind tasting (D.1).

#### Post-pour rating prompt
After a pour: **if the user has never blind-tasted that variant**, pull up the **manual star
rating** (guess, D.2) to populate/update. **If they've already blind-tasted it**, no prompt.

### ⏸ C.2 — Pour context (parked)
Extended context (where / with whom / how much) is **out for now.** A pour shows in social with
only the already-coded fields: user, when, which bottle, style. Revisit later.

---

## D. Evaluation

> The Elo **math** (trigger, K-factor, win-rate dampener, store-pick rollup) is the built,
> gated engine — **not** redesigned here. This bucket specs how ratings are stored, displayed,
> and surfaced.

### ✅ D.1 — Blind tasting
*(agreed 2026-08-30)*

1. **Entry points:** Drink tab → "Start a blind tasting"; the "blind" shortcut from a bottle's
   Have-a-drink / More.
2. **Means:** a structured **blind** comparison of 2–5 bottles producing **true ratings**.
   Modes: **self-serve** (report-only) and **guest-helper** (in-app reveal); group is future
   (3.4).
3. **Stored:** tasting sessions/details/pairwise results. The Elo-moving action — **personal**
   Elo per (user, variant) + **global** Elo per variant (store-pick rollup to parent default).
4. **Elo:** yes — and **permanent** (never deletable, B.4).
5. **Screens:**
   - Search + detail: that variant's **global star** and your **My rating** star update; **"had
     it" becomes true and the earmark updates**; your My-rating star **locks** to the real Elo.
   - **Tasted tab:** variants you tasted but **don't own** appear here; owned ones stay in In My
     Bar and just carry the rating.
   - History timeline: shows as a **tasting** interaction (not a separate pour).
6. **Activity trail:** **one post per session** — **"so-and-so did a blind tasting — click here
   for details."** Tapping opens a **ranked results view** (1st → last). Both modes post the
   same. *(New surface: a tasting-results detail view.)*
7. **Edge cases:**
   - Completing a tasting **supersedes any manual guess** (D.2) — the guess disappears; the
     Elo-derived My-rating shows and can no longer be hand-edited.
   - A blind tasting **counts as "having had it"** but is **not** logged as a separate pour.

### ✅ D.2 — Quick rating (manual star "guess")
*(agreed 2026-08-30)*

1. **Entry points:** the **My rating** star on the detail (while you have no real Elo); the
   post-pour prompt (C.1).
2. **Means:** a subjective best-guess before a true blind tasting — editable until a real tasting
   replaces it.
3. **Gated to prior contact.** Set/edit a guess **only if you have any history with the variant —
   own it, had it, poured it, or blind-tasted it.** You cannot rate a bottle you've never
   interacted with. (The gate already implies "had it.")
4. **Stored:** a personal guess per (user, variant), shown as the **My rating** star.
5. **Elo / global:**
   - A guess is a **personal placeholder** — it does **not** move the global/community Elo.
   - **Global fallback:** if a variant has **no blind tasting yet**, its **global rating = the
     average of all users' personal guesses** for that variant, until the first blind tasting is
     done — then global switches to the Elo engine. *(Computed display rule; reconcile with the
     engine at build.)*
6. **Screens:** the My-rating star on detail; feeds the search list's **(my rating + global)/2**
   averaged star.
7. **Activity trail:** **none** — private, never social.
8. **Edge cases:** superseded by real Elo on first tasting (D.1).

### ✅ D.3 — Personal notes (per variant)
*(agreed 2026-08-30)*

- **Means:** my own **private, free-form single note** on a version — separate from the catalog's
  *shared* tasting notes (nose/palate/finish), which are contributed + verified data.
- **Stored:** free text per (user, variant); private; instant-save; no moderation.
- **Screens:** a "My notes" section on the detail card (per variant); may also surface in the
  history modal.
- **Elo:** none. **Social:** none — private.

### ⏸ D.4 — Flavor tags → charts (parked)
Structured flavor tagging during tastings, aggregated into per-section flavor bar charts
(BACKLOG + memory `tasting-flavor-tags-and-charts`). **Parked** — depends on a solid tasting
flow. **D.3's free-form note is the temporary stand-in** until this is built.

---

## E. Contribute to the catalog
*(agreed 2026-08-30 — mostly already built; confirmed under the new model)*

- **E.1 — Add a new bottle** (provisional). Entry: the barcode "add it now" miss (A.1) or a
  manual add. **Required: name + photo** (barcode auto-filled if scanned; everything else
  optional). Lands **unverified → admin verify queue.**
- **E.2 — Add a version:**
  - **Global variant** (batch / limited edition / year release) → **a photo is REQUIRED as
    validation proof**, then **admin verification** (photo + research) before **all** users see
    it.
  - **Store pick** → **private to creator, no photo required, no verification.**
  - Both offer the save choice: **database-only** vs **add-to-my-bar**.
- **E.3 — Suggest an edit.** Inline edit on the detail over the viewed version's fields. Per-field
  gate: **mine + unverified → applies directly; else pending → admin.** Append-only.
- **E.4 — Upload / replace an image.** Verified image → admin-only; **missing/broken → any user
  can replace** (flips to unverified, re-review).
- **E.5 — Verify (admin).** The queue: per-field / per-variant Approve / Reject with optional
  reason.

**Social:** catalog contributions (**add bottle, add variant, admin verify**) **post to Social
for now** — may be pulled back later.

---

## F. Social & meta

### ✅ F.1 — Activity trail (the feed)
*(consolidated 2026-08-30 from the per-action decisions)*

**Posts to Social:**
- Added to collection (add + restock) — "added to collection"
- Finished (empty) — "finished"
- Added to wishlist *(new)*
- Poured a drink — user, when, bottle, style (neat/rocks/mixed)
- Did a blind tasting — **"so-and-so did a blind tasting — click for details"** → ranked results
  view (one post per session; both modes post)
- Catalog: added a bottle, added a variant, admin verified *(for now; may be pulled later)*

**Never social:** search / scan, view, manual guess/rating, personal notes, pour context.

**Deletions cascade to the feed:** a hard-deleted erroneous **add** or **pour**, and a reversed
mistaken **empty**, **remove the corresponding feed post**. (Blind tastings never delete.)

**Build items:**
- **Social tab gets a search bar** (near-term).
- **Friends-only feed** filtering (long-term) — the rationale for emitting low-stakes posts like
  wishlist.

### ❌ F.2 — Favorite / bookmark — CUT
Favorite and wishlist are **the same thing.** Use **"wishlist"** (B.5) going forward; there is no
separate favorite concept.
