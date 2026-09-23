/**
 * Photoreal medals (#150). The coin is three layers: a plate from
 * public/badges/frames, the badge's glyph (SVG today, a 3D object cutout later)
 * in the well, stars on top. Frame is NOT `tier === 1` — one-offs pick wood or
 * limited from an allow-list so Founder's Reserve is never Bronze.
 *
 * Two ladder shapes (2026-09-22, `sql/ladder-steps-migration.sql`), both rows in
 * `ladder_steps` rather than hardcoded here, because which shape a badge climbs is now a
 * per-badge choice (`badges.ladder_version`):
 *   version 1 - today's 5 tiers, one metal each, no stars. Every badge defaults to this;
 *     `frameFor` below still serves it directly and nothing using it needs to change.
 *   version 2 - the 22-step Wood->Limited ladder (Brian, 2026-09-22): Wood alone has a bare
 *     0-star rung, every metal above it starts lit at 1 star, Limited Edition caps it at 0
 *     stars. `fetchLadderSteps` / `stepFrame` / `stepStars` read it; nothing calls them yet -
 *     Medal and its callers pick this up when the first badge is actually authored across all
 *     22 steps, not as a blind rewrite ahead of any real content.
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

// --- ladder_version 2: the 22-step Wood->Limited ladder. Not wired into Medal or its callers
// yet (see file header) - this is the read side, ready for whichever badge converts first.

export type LadderStep = { frame: MedalFrame; stars: number };

let ladderStepsCache: Map<string, LadderStep> | null = null;

const stepKey = (ladderVersion: number, step: number) => `${ladderVersion}:${step}`;

/** Every row of `ladder_steps`, both versions, keyed `"version:step"`. Cached for the session. */
export async function fetchLadderSteps(): Promise<Map<string, LadderStep>> {
  if (ladderStepsCache) return ladderStepsCache;
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.from("ladder_steps").select("ladder_version, step, frame, stars");
  const map = new Map<string, LadderStep>();
  (data || []).forEach((r: any) => map.set(stepKey(r.ladder_version, r.step), { frame: r.frame, stars: r.stars }));
  ladderStepsCache = map;
  return map;
}

/** `step` 0 (not started) is always the locked plate, no lookup needed. */
export function stepInfo(steps: Map<string, LadderStep>, ladderVersion: number, step: number): LadderStep {
  if (step <= 0) return { frame: "locked", stars: 0 };
  return steps.get(stepKey(ladderVersion, step)) ?? { frame: "locked", stars: 0 };
}

/** "Wood" / "Silver · 3 stars" / "Limited Edition" - for a tier list row or an aria-label. */
export function stepLabel(info: LadderStep): string {
  const name = info.frame === "limited" ? "Limited Edition" : info.frame.charAt(0).toUpperCase() + info.frame.slice(1);
  return info.stars > 0 ? `${name} · ${info.stars} star${info.stars === 1 ? "" : "s"}` : name;
}
