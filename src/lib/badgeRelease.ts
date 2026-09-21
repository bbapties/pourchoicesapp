import { supabase } from "@/lib/supabase";

/**
 * Which badges are LIVE for a person (Brian, 2026-09-21). Every badge is built and the engine
 * keeps counting credit for all of them, but a badge only shows as earnable - and only reveals -
 * once its art is done and Brian has released it. Until then it sits under "Coming soon".
 *
 * The switch is the `badge_releases` table, NOT code: a row per badge, with `user_id` NULL for
 * everyone or set for one person (so a badge can go to Brian alone on prod first). Written from
 * psql only - the runbook is docs/BADGE_RELEASE.md. `released_badges(user)` resolves it.
 */
const cache = new Map<string, { at: number; ids: Set<string> }>();
const TTL_MS = 60_000;

export async function fetchReleased(userId: string, force = false): Promise<Set<string>> {
  const hit = cache.get(userId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  try {
    const { data, error } = await supabase.rpc("released_badges", { p_user: userId });
    if (error) return hit?.ids ?? new Set();
    const ids = new Set<string>((data as any[] | null)?.map((r) => (typeof r === "string" ? r : r.released_badges)) ?? []);
    cache.set(userId, { at: Date.now(), ids });
    return ids;
  } catch {
    return hit?.ids ?? new Set();
  }
}
