/**
 * Photoreal medals (#150). The coin is three layers: a plate from
 * public/badges/frames, the badge's glyph (SVG today, a 3D object cutout later)
 * in the well, stars on top. Frame is NOT `tier === 1` — one-offs pick wood or
 * limited from an allow-list so Founder's Reserve is never Bronze.
 */

export type MedalTier = 0 | 1 | 2 | 3 | 4 | 5;
export type MedalFrame = "locked" | "wood" | "bronze" | "silver" | "gold" | "diamond" | "limited";

export const TIER_NAME: Record<MedalTier, string> = {
  0: "Locked",
  1: "Wood",
  2: "Bronze",
  3: "Silver",
  4: "Gold",
  5: "Diamond",
};

const LADDER_FRAME: Record<MedalTier, MedalFrame> = {
  0: "locked",
  1: "wood",
  2: "bronze",
  3: "silver",
  4: "gold",
  5: "diamond",
};

/** One-offs that ship on the stained-wood + onyx plate. Everyone else one-off is wood. */
const LIMITED_IDS = new Set(["founders_reserve"]);

/**
 * Badges whose 3D object cutout exists at public/badges/objects/<id>.webp. Medal draws that
 * image OVER the plate instead of the SVG glyph (the FR eagle's wings cross the inner ring, so
 * the object sits in front, not behind). Built by scripts/founders_reserve_medal.mjs and its
 * successors; one id per shipped object, never the whole catalog at once (docs/BADGE_ART.md).
 */
const OBJECT_IDS = new Set(["founders_reserve"]);
export const hasObject = (badgeId: string) => OBJECT_IDS.has(badgeId);

export function frameFor(tier: MedalTier, oneOff: boolean, badgeId: string): MedalFrame {
  if (tier === 0) return "locked";
  if (oneOff) return LIMITED_IDS.has(badgeId) ? "limited" : "wood";
  return LADDER_FRAME[tier];
}
