import { supabase } from "@/lib/supabase";
import { MIN_PICKS, MAX_PICKS } from "@/lib/tastings";

/**
 * Master switch for the AUTOMATIC coach behaviours: the first-session core tour and the What's new
 * digest.
 *
 * This was OFF between 2026-09-05 and D1 shipping. The reason was the digest: it read every
 * `announce: true` item straight out of this catalog, so it showed whatever the codebase happened
 * to contain and would have handed a brand-new tester the accumulated 7.x/8.x history as if it were
 * news. Turning it back on is safe now because **the digest reads admin-published `announcements`
 * rows instead** -- nothing reaches a tester until Brian publishes it.
 *
 * Profile > "Replay tutorial" works regardless, via the FORCE_REPLAY_KEY handshake, since it is
 * user-initiated rather than a popup.
 */
export const AUTO_COACHES_ENABLED = true;

/**
 * sessionStorage handshake that lets Profile play the tour on demand while the auto behaviour above
 * is off. Set immediately before the reload; CoachHost consumes it once on mount.
 */
export const FORCE_REPLAY_KEY = "pc.coach.forceReplay";

export const CORE_DONE = "core.done";

export type TourStep = {
  route: string;
  anchor: string;
  caption: string;
};

export type CoachItem = {
  id: string;
  title: string;
  body: string;
  route: string;
  core: boolean;
  announce: boolean;
  tour: TourStep[];
};

/**
 * The product's tours. Edit this list; do not append forever.
 *
 * `core: true` = part of the FIRST-SESSION tour, and the order below is the order it plays.
 * `announce: true` is now only a HINT for the admin composer (Phase 10 D1) -- what a tester is
 * actually told about lives in the `announcements` table, not here. A flag in the codebase was
 * never the right place to decide what counts as news.
 */
export const COACH_CATALOG: CoachItem[] = [
  {
    id: "search.browse",
    title: "Search",
    body: "Find a bottle by name, distillery, or category.",
    route: "/search",
    core: true,
    announce: false,
    tour: [
      {
        route: "/search",
        anchor: "search.input",
        caption: "Search bottles by name, distillery, or category.",
      },
      {
        route: "/search",
        anchor: "search.list",
        caption: "Tap a bottle for details, ratings, and actions.",
      },
    ],
  },
  {
    id: "search.barcode",
    title: "Scan a barcode",
    body: "Tap the scan icon in the search bar to find a bottle by its barcode — or add it if it is new.",
    route: "/search",
    core: true,
    announce: true,
    tour: [
      {
        route: "/search",
        anchor: "search.scan",
        caption: "Tap to scan a bottle's barcode with your camera. If we do not have it, you jump straight to adding it.",
      },
    ],
  },
  {
    id: "search.wrong_bottle",
    title: "Scanned the wrong bottle?",
    body: "If a barcode opens a completely different product, tap “Not this bottle?” on the detail and tell us. A store pick or special release of the same bottle is not a mismatch — add that as a version instead.",
    route: "/search",
    core: false,
    announce: true,
    tour: [],
  },
  {
    id: "bottle.have_a_drink",
    title: "Have a drink",
    body: "Log a pour on any bottle — even if it is not in My Bar.",
    route: "/search",
    core: true,
    announce: true,
    tour: [
      {
        route: "/search",
        anchor: "search.list",
        caption: "Open any bottle. Have a drink works even if it is not in your collection.",
      },
      {
        route: "/search",
        anchor: "bottle.have_a_drink",
        caption: "On the detail card: Have a drink logs neat, rocks, mixed, or blind. It does not add the bottle to My Bar.",
      },
    ],
  },
  {
    id: "taste.blind",
    title: "Blind tastings",
    body: `Rank ${MIN_PICKS}-${MAX_PICKS} bottles blind from the Drink tab. Your ranking updates your personal and the global scores.`,
    route: "/taste",
    core: true,
    announce: true,
    tour: [
      {
        route: "/taste",
        anchor: "nav.taste",
        caption: "The Drink tab is for pours and blind tastings.",
      },
      {
        route: "/taste",
        anchor: "taste.start",
        caption: `Start a blind tasting — pick ${MIN_PICKS}-${MAX_PICKS} bottles, rank them blind, and watch the scores update.`,
      },
    ],
  },
  {
    id: "taste.pour",
    title: "Have a drink from Drink",
    body: "Log a neat / rocks / mixed pour from the Drink tab, or start a blind tasting — same choice as on a bottle card.",
    route: "/taste",
    core: false,
    announce: true,
    tour: [
      {
        route: "/taste",
        anchor: "taste.pour",
        caption: `Have a drink logs a pour. Blind tasting ranks ${MIN_PICKS}-${MAX_PICKS} bottles.`,
      },
    ],
  },
  {
    id: "social.feed",
    title: "Social",
    body: "Pours and collection changes from everyone show up here.",
    route: "/social",
    core: true,
    announce: true,
    tour: [
      {
        route: "/social",
        anchor: "nav.social",
        caption: "Social is the activity feed.",
      },
      {
        route: "/social",
        anchor: "social.feed",
        caption: "When someone drinks, adds, finishes, or verifies a bottle, it lands here. Tap a row to open it.",
      },
    ],
  },
  {
    id: "bottle.variants",
    title: "Variants",
    body: "Some bottles have more than one version. Swipe the detail card to see each one.",
    route: "/search",
    core: false,
    announce: true,
    tour: [
      {
        route: "/search",
        anchor: "search.list",
        caption: "A badge like \"2 variants\" means more than one version of that bottle.",
      },
      {
        route: "/search",
        anchor: "bottle.variant.pager",
        caption: "Open it, then swipe the card or use the arrows. Each version has its own image, proof, and rating.",
      },
    ],
  },
  {
    id: "bottle.actions",
    title: "Bottle actions",
    body: "The main button now matches your bar — Add to My Bar, Have a drink, or Add Back — with a More menu for the rest.",
    route: "/search",
    core: false,
    announce: true,
    tour: [
      {
        route: "/search",
        anchor: "search.list",
        caption: "Open any bottle to see its actions.",
      },
      {
        route: "/search",
        anchor: "bottle.have_a_drink",
        caption: "The main button changes with your bar: Add to My Bar, Have a drink, or Add Back. More holds Add another, Mark as Empty, and Remove.",
      },
    ],
  },
  {
    id: "bottle.suggest_edit",
    title: "Suggest an edit",
    body: "Spot something wrong on a bottle? Tap the pencil to fix it in place — corrections go to a quick review.",
    route: "/search",
    core: false,
    announce: true,
    tour: [
      {
        route: "/search",
        anchor: "search.list",
        caption: "Open any bottle to see its details.",
      },
      {
        route: "/search",
        anchor: "bottle.suggest_edit",
        caption: "Tap the pencil to edit fields in place — proof, notes, even the photo. Your own unverified adds apply instantly; everything else goes to an admin for review.",
      },
    ],
  },
  {
    id: "bottle.add_variant",
    title: "Add a version",
    body: "Missing a batch, release, or store pick? Add it — swipe to the + at the end of a bottle's versions.",
    route: "/search",
    core: false,
    announce: true,
    tour: [
      {
        route: "/search",
        anchor: "search.list",
        caption: "Open any bottle.",
      },
      {
        route: "/search",
        anchor: "bottle.add_variant",
        caption: "Swipe to the + at the end of the versions, or tap here, to add a batch/release (everyone sees it) or your own store pick (private to you).",
      },
    ],
  },
  {
    id: "mybar.collection",
    title: "My Bar",
    body: "Your collection — owned now, or finished.",
    route: "/mybar",
    core: true,
    announce: false,
    tour: [
      {
        route: "/mybar",
        anchor: "nav.mybar",
        caption: "My Bar is your collection.",
      },
      {
        route: "/mybar",
        anchor: "mybar.list",
        caption: "Owned bottles live here. Mark one finished when it is empty. Blind-tasted bottles you don't own show under Tasted.",
      },
    ],
  },
  {
    id: "profile.feedback",
    title: "Send feedback",
    body: "Have an idea, or hit a bug? Tell us right from Profile.",
    route: "/profile",
    core: true,
    announce: true,
    tour: [
      {
        route: "/profile",
        anchor: "profile.feedback",
        caption: "Tap here any time to suggest a feature or report a bug. You can type it, speak it, or attach a screenshot — it goes straight to the team.",
      },
    ],
  },
  {
    id: "profile.notifications",
    title: "Notifications",
    body: "Get told when there is something new worth opening the app for.",
    route: "/profile",
    // Not `core`: the app already nudges about notifications at three moments (Phase 10 D3), and
    // the main loop did not change. This row is for the Profile control itself.
    core: false,
    announce: true,
    tour: [
      {
        route: "/profile",
        anchor: "profile.notifications",
        caption: "Turn notifications on or off here. On iPhone they only work once Pour Choices is installed to your home screen - Apple does not allow them in a Safari tab.",
      },
    ],
  },
  {
    id: "profile.install",
    title: "Install Pour Choices",
    body: "Put it on your home screen so it opens full screen, like an app.",
    route: "/profile",
    // Not `core`: the install ask already happens on first visit (Phase 10 C3), and the main loop
    // did not change. This row exists so the Profile entry point is discoverable to people who
    // tapped "Continue in browser" and later changed their mind.
    core: false,
    announce: true,
    tour: [
      {
        route: "/profile",
        anchor: "profile.install",
        caption: "Chose to stay in the browser? Install it here any time - it opens full screen and sits on your home screen like any other app.",
      },
    ],
  },
];

/**
 * The order the first-session tour plays. Explicit, because relying on catalog position made it an
 * accident: My Bar was landing after Social purely because of where it sat in the array. The story
 * is: find a bottle -> scan one -> what you can do with it -> the blind tasting the app is built
 * around -> your own shelf -> what everyone else is doing -> how to tell us it broke.
 * Any `core: true` item missing here still plays, at the end.
 */
const CORE_ORDER = [
  "search.browse",
  "search.barcode",
  "bottle.have_a_drink",
  "taste.blind",
  "mybar.collection",
  "social.feed",
  "profile.feedback",
];

export function coreItems(): CoachItem[] {
  const core = COACH_CATALOG.filter((c) => c.core);
  const rank = (id: string) => {
    const i = CORE_ORDER.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...core].sort((a, b) => rank(a.id) - rank(b.id));
}

export function flattenCoreTour(): TourStep[] {
  return coreItems().flatMap((c) => c.tour);
}

export function announceItems(): CoachItem[] {
  return COACH_CATALOG.filter((c) => c.announce);
}

export function unseenAnnounce(seen: string[]): CoachItem[] {
  const set = new Set(seen);
  return announceItems().filter((c) => !set.has(c.id));
}

export function hasSeen(seen: string[], id: string): boolean {
  return seen.includes(id);
}

export function itemById(id: string): CoachItem | undefined {
  return COACH_CATALOG.find((c) => c.id === id);
}

export async function markCoachSeen(opts: {
  userId: string;
  seen: string[];
  add: string[];
}): Promise<string[]> {
  const next = [...new Set([...opts.seen, ...opts.add])];
  const { error } = await supabase
    .from("users")
    .update({ seen_coach_ids: next })
    .eq("id", opts.userId);
  if (error) {
    console.error("markCoachSeen:", error.message);
    return opts.seen;
  }
  return next;
}
