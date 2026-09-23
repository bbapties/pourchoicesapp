import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import type { MedalTier } from "@/lib/badgeArt";

/**
 * Badges (#21 epic; #138-#141). The database is the engine: `award_badges(user)` recomputes a
 * person from history and returns what went UP; this file reads the shelf, runs the engine
 * after the actions that can earn something, and - once Brian turns it on - makes a moment of
 * a new tier. Everything is fail-open: a badge is never worth breaking a pour over.
 */

/**
 * The earn moment (#141): an `activities.badge_earned` row (so it lands on Social and the
 * earner's page) and a push through /api/social/notify. OFF until Brian has reviewed the
 * backfilled shelves (2026-09-18: "don't send any notifications for back dated badges yet").
 * Flip to true to go live; the backfill never fires it regardless, because award_badges only
 * reports tiers that went up in THIS call and the backfill already ran.
 */
export const BADGE_MOMENTS_ENABLED = false;

export type BadgeDef = {
  id: string;
  family: string;
  name: string;
  glyph: string;
  feature: string | null;
  hint: string | null;
  oneOff: boolean;
  category: string | null;
  sort: number;
  tiers: { tier: number; threshold: number }[];
  /** Which shape of src/lib/badgeArt.ts's `ladder_steps` this badge climbs (2026-09-22).
   * 1 = today's 5 metal tiers (every badge, until Brian redoes one across all 22 steps). */
  ladderVersion: number;
};

export type UserBadge = {
  badgeId: string;
  tier: MedalTier;
  subTier: number;
  progress: number;
  earnedAt: string | null;
  /** the highest tier this person has been SHOWN the reveal for (0 = never); see badgeReveal.ts */
  revealedTier: MedalTier;
};

export type ShelfItem = {
  def: BadgeDef;
  tier: MedalTier;
  subTier: number;
  progress: number;
  earnedAt: string | null;
  /** the next rung, or null on the top one */
  next: { tier: number; threshold: number } | null;
  revealedTier: MedalTier;
};

export type Level = { points: number; title: string; nextTitle: string | null; nextPoints: number | null };

let catalogCache: BadgeDef[] | null = null;

/** The catalog with its ladders. Cached for the session; it changes when categories do. */
export async function fetchBadgeCatalog(force = false): Promise<BadgeDef[]> {
  if (catalogCache && !force) return catalogCache;
  const [{ data: badges }, { data: tiers }] = await Promise.all([
    supabase.from("badges").select("id, family, name, glyph, feature, hint, one_off, category, sort, ladder_version").eq("active", true).order("sort").order("id"),
    supabase.from("badge_tiers").select("badge_id, tier, threshold").order("tier"),
  ]);
  const byBadge = new Map<string, { tier: number; threshold: number }[]>();
  (tiers || []).forEach((t: { badge_id: string; tier: number; threshold: number }) => {
    if (!byBadge.has(t.badge_id)) byBadge.set(t.badge_id, []);
    byBadge.get(t.badge_id)!.push({ tier: t.tier, threshold: t.threshold });
  });
  catalogCache = (badges || []).map((b: any) => ({
    id: b.id, family: b.family, name: b.name, glyph: b.glyph, feature: b.feature ?? null, hint: b.hint ?? null,
    oneOff: !!b.one_off, category: b.category ?? null, sort: b.sort ?? 0, tiers: byBadge.get(b.id) ?? [],
    ladderVersion: b.ladder_version ?? 1,
  }));
  return catalogCache;
}

/** Someone's shelf: every active badge, with their tier / progress on it (0 / 0 when untouched). */
export async function fetchShelf(userId: string): Promise<ShelfItem[]> {
  const [catalog, { data: mine }] = await Promise.all([
    fetchBadgeCatalog(),
    supabase.from("user_badges").select("badge_id, tier, sub_tier, progress, earned_at, revealed_tier").eq("user_id", userId),
  ]);
  const have = new Map<string, UserBadge>();
  (mine || []).forEach((r: any) => have.set(r.badge_id, { badgeId: r.badge_id, tier: r.tier as MedalTier, subTier: r.sub_tier ?? 0, progress: r.progress ?? 0, earnedAt: r.earned_at ?? null, revealedTier: (r.revealed_tier ?? 0) as MedalTier }));
  return catalog
    .filter((def) => def.family !== "hound" || have.has(def.id)) // a Hound you have never started is noise, not a hint
    .map((def) => {
      const ub = have.get(def.id);
      const tier = (ub?.tier ?? 0) as MedalTier;
      const next = def.tiers.find((t) => t.tier === tier + 1) ?? null;
      return { def, tier, subTier: ub?.subTier ?? 0, progress: ub?.progress ?? 0, earnedAt: ub?.earnedAt ?? null, next, revealedTier: ub?.revealedTier ?? 0 };
    });
}

export async function fetchLevel(userId: string): Promise<Level | null> {
  const { data, error } = await supabase.rpc("user_level", { p_user: userId });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return { points: Number(row.points ?? 0), title: row.title ?? "Regular", nextTitle: row.next_title ?? null, nextPoints: row.next_points ?? null };
}

export type LevelBand = { title: string; minPoints: number };

let levelBandsCache: LevelBand[] | null = null;

/** The six level bands, low to high. Cached for the session - they change only when Brian retunes them. */
export async function fetchLevelBands(): Promise<LevelBand[]> {
  if (levelBandsCache) return levelBandsCache;
  const { data } = await supabase.from("level_bands").select("title, min_points").order("sort");
  levelBandsCache = (data || []).map((r: any) => ({ title: r.title, minPoints: r.min_points }));
  return levelBandsCache;
}

export type Awarded = { badgeId: string; tier: MedalTier; earnedAt: string | null; progress: number; wentUp: boolean };

/**
 * Re-run the engine for one person and return what went up. Called after every action that can
 * earn something (logActivity, cheer, comment, follow, wishlist) and on their own Profile.
 * Fail-open and fire-and-forget at every call site.
 */
export async function runAwards(userId: string | null | undefined): Promise<Awarded[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase.rpc("award_badges", { p_user: userId });
    if (error || !data) return [];
    const rows: Awarded[] = (data as any[]).map((r) => ({ badgeId: r.badge_id, tier: r.tier as MedalTier, earnedAt: r.earned_at ?? null, progress: r.progress ?? 0, wentUp: !!r.went_up }));
    const up = rows.filter((r) => r.wentUp);
    if (up.length) {
      void celebrate(userId, up);
      // a badge earned mid-session reveals right now if it is released (BadgeReveal listens)
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pc:badge-check"));
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * The moment (#141). Logged as telemetry always (so we can see what WOULD have fired); the
 * activity row + push only once BADGE_MOMENTS_ENABLED is true.
 */
async function celebrate(userId: string, up: Awarded[]) {
  for (const a of up) {
    logEvent({ eventType: "badge_tier_up", userId, targetType: "badge", targetId: a.badgeId, metadata: { tier: a.tier, progress: a.progress, fired: BADGE_MOMENTS_ENABLED } });
  }
  if (!BADGE_MOMENTS_ENABLED) return;
  const { logBadgeEarned } = await import("@/lib/activities");
  for (const a of up) await logBadgeEarned(userId, a.badgeId, a.tier);
}

/** `points` is rate*100 internally (so level_bands.min_points stays a plain integer) - never
 * shown as-is. Every display reads it back as the weekly rate a user actually recognizes. */
export function weeklyRate(points: number): string {
  return (points / 100).toFixed(1);
}

/** Title + weekly rate + distance to the next band, for the plate under the username. */
export function levelLine(l: Level | null): string {
  if (!l) return "";
  return l.nextTitle && l.nextPoints != null
    ? `${l.title} · ${weeklyRate(l.points)}/wk · ${weeklyRate(l.nextPoints - l.points)} to ${l.nextTitle}`
    : `${l.title} · ${weeklyRate(l.points)}/wk`;
}
