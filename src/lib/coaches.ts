import { supabase } from "@/lib/supabase";

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

/** Current product loop + announcements. Edit this list; do not append forever. */
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
    core: false,
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
    title: "Blind tastings are live",
    body: "Rank 2-5 bottles blind from the Drink tab. Your ranking updates your personal and the global scores.",
    route: "/taste",
    core: false,
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
        caption: "Start a blind tasting — pick 2-5 bottles, rank them blind, and watch the scores update.",
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
        caption: "Have a drink logs a pour. Blind tasting ranks 2-5 bottles.",
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
];

export function coreItems(): CoachItem[] {
  return COACH_CATALOG.filter((c) => c.core);
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
