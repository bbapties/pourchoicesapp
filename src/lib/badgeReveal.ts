import { supabase } from "@/lib/supabase";
import { fetchShelf, type ShelfItem } from "@/lib/badges";
import { fetchReleased } from "@/lib/badgeRelease";
import { logEvent } from "@/lib/events";
import { tierFrame, tierStars, type LadderStep } from "@/lib/badgeArt";

/**
 * The reveal queue (Brian, 2026-09-21): a badge is due a reveal when it is released to this
 * person AND `tier > revealed_tier`. The engine awards silently; this is the moment the person
 * finally sees it - next time the app is in front, or the instant it is earned if released.
 * `revealed_tier` lives in the DB (never the device), so a reveal plays once across every phone.
 * Only the CURRENT tier is revealed - a ladder never replays. What shakes first is the plate of
 * `revealedTier` (grey when 0, the old metal on an upgrade).
 */
export type RevealItem = ShelfItem & { upgrade: boolean };

export async function fetchPendingReveals(userId: string): Promise<RevealItem[]> {
  try {
    const [shelf, released] = await Promise.all([fetchShelf(userId), fetchReleased(userId, true)]);
    return shelf
      .filter((i) => released.has(i.def.id) && i.tier > 0 && i.tier > i.revealedTier)
      .sort((a, b) => (a.earnedAt ?? "").localeCompare(b.earnedAt ?? ""))
      .map((i) => ({ ...i, upgrade: i.revealedTier > 0 }));
  } catch {
    return [];
  }
}

export type RevealMode = "animated" | "reveal_all" | "dismissed";

/** Pin revealed_tier = tier on these badges for the signed-in person. Fail-open. */
export async function markRevealed(userId: string, items: RevealItem[], mode: RevealMode, queued: number): Promise<void> {
  if (!items.length) return;
  try {
    await supabase.rpc("reveal_badges", { p_badges: items.map((i) => i.def.id) });
  } catch { /* the reveal simply plays again next open */ }
  for (const i of items) {
    logEvent({ eventType: "badge_revealed", userId, targetType: "badge", targetId: i.def.id, surface: "reveal", metadata: { tier: i.tier, from: i.revealedTier, upgrade: i.upgrade, mode, queued } });
  }
}

/**
 * Which of the three badge moments a reveal is (Brian, 2026-10-08) - each gets its own words on
 * both reveal screens:
 *   new   - first time on this badge (revealed_tier 0)
 *   star  - same plate, more stars (a ladder_version-2 step inside one metal)
 *   level - a new plate: Wood -> Bronze -> ... (every tier of a version-1 badge is one)
 * A jump that crosses a plate is a level-up even if stars changed too.
 */
export type RevealKind = "new" | "star" | "level";

export function revealKind(it: RevealItem, steps: Map<string, LadderStep> | null): { kind: RevealKind; stars: number } {
  if (!it.upgrade) return { kind: "new", stars: 0 };
  const from = tierFrame(steps, it.def.ladderVersion, it.revealedTier, it.def.oneOff, it.def.id);
  const to = tierFrame(steps, it.def.ladderVersion, it.tier, it.def.oneOff, it.def.id);
  if (from !== to) return { kind: "level", stars: 0 };
  const gained = tierStars(steps, it.def.ladderVersion, it.tier, it.def.oneOff) - tierStars(steps, it.def.ladderVersion, it.revealedTier, it.def.oneOff);
  return { kind: "star", stars: Math.max(1, gained) };
}
