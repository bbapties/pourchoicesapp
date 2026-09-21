import type { BadgeDef } from "@/lib/badges";

/**
 * How you earn each badge, in plain English, for the badge sheet. Written from the rules in
 * badge_timeline() (sql/badges-migration.sql) - if a rule changes there, change the sentence here.
 * Hound badges are generated per category, so they share one template.
 */
const HOW: Record<string, string> = {
  regular_pour: "Log a pour from any bottle - neat, rocks, however you take it. Every pour you log counts, so the same bottle can carry you up the ladder.",
  night_owl: "Pour on back-to-back days. The badge tracks your longest run of consecutive days with at least one pour logged (days turn over at midnight, Central).",
  blindfold: "Finish a blind tasting: pour, hide the labels, rank the glasses, reveal. Every completed blind counts, solo or with a helper.",
  big_flight: "Blind more glasses in one sitting. The rung is the most bottles you have ever ranked in a single blind tasting - three in one flight for Wood, ten for Diamond.",
  helper: "Have a friend pour for you. Finish a blind tasting in helper mode, where someone else sets the glasses so you cannot know which is which.",
  collector: "Bring bottles home. Counts every distinct bottle that has ever been in your bar - owned, had, or emptied - not just what is on the shelf today.",
  dead_soldiers: "Kill a bottle. Mark one in My Bar as empty; each bottle you finish counts once.",
  well_travelled: "Own more kinds of spirit. Counts the distinct categories - bourbon, rye, scotch, tequila and so on - among the bottles in your bar.",
  barcode_bandit: "Scan a barcode from Search. Every scan counts, whether or not we already knew the bottle.",
  someday: "Add a bottle to your wishlist from its bottle page. Each wishlisted bottle counts once.",
  cheers: "Cheer a post in Social. Every cheer you give counts.",
  barstool: "Comment on a post in Social. Every comment you leave counts (deleted ones do not).",
  crowd: "Get followed. The badge grows with the number of people following you.",
  contributor: "Add a bottle we do not have, or suggest a fix to one we do. A new bottle counts on the spot; a suggested edit counts once an admin approves it.",
  early_adopter: "Be here before the app hits the stores. Every account created before the App Store / Play Store launch has it.",
  installed: "Put Pour Choices on your home screen and open it from there once.",
  tastemaker: "Add a bottle to the catalog that an admin then verifies as a real product.",
  founders_reserve: "Granted to the original Testers who put up with all the early builds and help us build what we have today!",
};

export function howToEarn(def: BadgeDef): string {
  if (def.family === "hound") {
    return `Try different ${def.category ?? ""} bottles. A bottle counts once, the first time you own it, taste it, or log a pour of it.`;
  }
  return HOW[def.id] ?? (def.hint ? def.hint.charAt(0).toUpperCase() + def.hint.slice(1) + "." : "");
}
