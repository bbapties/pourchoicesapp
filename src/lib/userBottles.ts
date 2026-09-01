import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activities";

export type UserBottleRow = {
  currently_owned: boolean;
  variant_id: string | null;
  times_had: number;
  owned_count?: number | null; // B-32: current quantity on the shelf
  created_at?: string | null;
  updated_at?: string | null;
};

function formatActivityDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Fallback last-action line from user_bottles when no activities row exists. */
export function formatLastActivity(row?: UserBottleRow | null): string | undefined {
  if (!row) return undefined;
  if (row.currently_owned) {
    const ts = (row.times_had ?? 1) > 1 ? (row.updated_at || row.created_at) : (row.created_at || row.updated_at);
    const date = formatActivityDate(ts);
    return date ? `Added · ${date}` : undefined;
  }
  // B-41: a tasting-only row (never owned: times_had < 1) must not read as "Finished".
  if ((row.times_had ?? 0) < 1) return undefined;
  const date = formatActivityDate(row.updated_at || row.created_at);
  return date ? `Finished · ${date}` : undefined;
}

/**
 * Resolve a bottle's default variant id. Ownership actions that don't name a
 * variant fall back to this so every user_bottles row is variant-keyed
 * (Phase 3.0 re-key: PK is now the surrogate id + partial unique indexes).
 */
export async function resolveDefaultVariantId(bottleId: string): Promise<string | null> {
  const { data } = await supabase
    .from("bottle_variants")
    .select("id")
    .eq("bottles_id", bottleId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Add or restock ONE ownership row, scoped to a specific (user, bottle, variant).
 * Variant-scoped so it can never touch tasting-only rows (times_had = 0) that the
 * Elo trigger creates for other variants of the same bottle. Restocking an
 * already-owned/finished variant bumps times_had; owning a tasting-only row starts it at 1.
 */
export async function addOrRestockUserBottle(opts: {
  userId: string;
  bottleId: string;
  variantId?: string | null;
}): Promise<{ timesHad: number; variantId: string } | { error: string }> {
  const now = new Date().toISOString();
  // Resolve to the real variant UUID up front and return it, so optimistic callers key
  // their local row on the same id the DB row carries (B-35: was keyed variant_id=null
  // while the DB row held the default UUID → a phantom row until refresh).
  const variantId = opts.variantId ?? (await resolveDefaultVariantId(opts.bottleId));
  if (!variantId) return { error: "no default variant for bottle" };

  // Restock an existing (user, bottle, variant) row → bump times_had + owned_count (B-32).
  const restock = async (): Promise<{ timesHad: number; variantId: string } | { error: string }> => {
    const { data: rows, error: readErr } = await supabase
      .from("user_bottles")
      .select("id, currently_owned, times_had, owned_count")
      .eq("user_id", opts.userId)
      .eq("bottle_id", opts.bottleId)
      .eq("variant_id", variantId)
      .limit(1);
    if (readErr) return { error: readErr.message };
    const row = rows?.[0];
    if (!row) return { error: "row not found" };
    // times_had = 0 means the row was tasting-only; owning it starts the count at 1.
    const timesHad = (row.times_had ?? 0) >= 1 ? (row.times_had ?? 1) + 1 : 1;
    const ownedCount = ((row as { owned_count?: number }).owned_count ?? 0) + 1; // one more on the shelf
    const { error } = await supabase
      .from("user_bottles")
      .update({ currently_owned: true, updated_at: now, times_had: timesHad, owned_count: ownedCount })
      .eq("id", row.id);
    if (error) return { error: error.message };
    await logActivity({ userId: opts.userId, bottleId: opts.bottleId, action: "added_to_collection", variantId });
    return { timesHad, variantId };
  };

  const { data: rows, error: readErr } = await supabase
    .from("user_bottles")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("bottle_id", opts.bottleId)
    .eq("variant_id", variantId)
    .limit(1);
  if (readErr) return { error: readErr.message };
  if (rows?.[0]) return restock();

  const { error } = await supabase.from("user_bottles").insert({
    user_id: opts.userId,
    bottle_id: opts.bottleId,
    variant_id: variantId,
    currently_owned: true,
    times_had: 1,
    owned_count: 1, // B-32: one on the shelf
    created_at: now,
    updated_at: now,
  });
  if (error) {
    // Concurrent add of the same (user, bottle, variant) hit the partial unique index
    // (B-36). Recover by restocking the row the other write just created, instead of
    // surfacing a generic "Failed to add".
    if ((error as { code?: string }).code === "23505") return restock();
    return { error: error.message };
  }
  await logActivity({ userId: opts.userId, bottleId: opts.bottleId, action: "added_to_collection", variantId });
  return { timesHad: 1, variantId };
}

/**
 * Remove ONE ownership row, scoped to (user, bottle, variant). If the row carries
 * tasting history (its personal Elo has moved off the 1500 baseline) it is DEMOTED
 * to tasting-only (drops ownership, keeps Elo -> shows under My Bar "Tasted")
 * instead of hard-deleted, so a blind-tasting result is never lost. Otherwise the
 * row is deleted outright. Never touches other variants' rows.
 */
export async function removeUserBottle(opts: {
  userId: string;
  bottleId: string;
  variantId?: string | null;
}): Promise<{ error?: string }> {
  const variantId = opts.variantId ?? (await resolveDefaultVariantId(opts.bottleId));

  let query = supabase
    .from("user_bottles")
    .select("id, elo")
    .eq("user_id", opts.userId)
    .eq("bottle_id", opts.bottleId);
  if (variantId) query = query.eq("variant_id", variantId);
  const { data: rows, error: readErr } = await query.limit(1);
  if (readErr) return { error: readErr.message };

  const row = rows?.[0];
  if (!row) return {}; // nothing to remove

  const hasTasting = row.elo != null && Number(row.elo) !== 1500;
  if (hasTasting) {
    // Remove from the shelf but keep the row (its Elo → Tasted). B-32: clear owned_count too.
    const { error } = await supabase
      .from("user_bottles")
      .update({ currently_owned: false, times_had: 0, owned_count: 0, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return { error: error.message };
    await logActivity({ userId: opts.userId, bottleId: opts.bottleId, action: "removed_from_collection", variantId });
  } else {
    // Mistaken add (no tasting history): hard-delete the row AND erase its "added to collection"
    // feed/history post so the mistake leaves no trace (B.4 cascade). No "removed" post either.
    const { error } = await supabase.from("user_bottles").delete().eq("id", row.id);
    if (error) return { error: error.message };
    let aq = supabase
      .from("activities")
      .select("id")
      .eq("user_id", opts.userId)
      .eq("bottle_id", opts.bottleId)
      .eq("action", "added_to_collection")
      .order("created_at", { ascending: false })
      .limit(1);
    if (variantId) aq = aq.eq("variant_id", variantId);
    const { data: addRows } = await aq;
    if (addRows?.[0]?.id) await supabase.from("activities").delete().eq("id", addRows[0].id);
  }
  return {};
}

/**
 * B-32: "finish one" — decrement the current-owned count by 1 and increment the emptied
 * (lifetime-finished) count. currently_owned is kept in sync (owned_count>0). One (user,
 * bottle, variant) row; a variant can end up In My Bar AND Empty at once. Logs `finished`.
 */
export async function markVariantEmpty(opts: {
  userId: string;
  bottleId: string;
  variantId?: string | null;
}): Promise<{ ownedCount: number; emptiedCount: number } | { error: string }> {
  const variantId = opts.variantId ?? (await resolveDefaultVariantId(opts.bottleId));
  let query = supabase
    .from("user_bottles")
    .select("id, owned_count, emptied_count")
    .eq("user_id", opts.userId)
    .eq("bottle_id", opts.bottleId)
    .eq("currently_owned", true);
  query = variantId ? query.eq("variant_id", variantId) : query.is("variant_id", null);
  const { data: rows, error: readErr } = await query.limit(1);
  if (readErr) return { error: readErr.message };
  const row = rows?.[0] as { id: string; owned_count?: number; emptied_count?: number } | undefined;
  if (!row) return { error: "no owned row to finish" };

  const ownedCount = Math.max(0, (row.owned_count ?? 1) - 1);
  const emptiedCount = (row.emptied_count ?? 0) + 1;
  const { error } = await supabase
    .from("user_bottles")
    .update({
      owned_count: ownedCount,
      emptied_count: emptiedCount,
      currently_owned: ownedCount > 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) return { error: error.message };
  await logActivity({ userId: opts.userId, bottleId: opts.bottleId, action: "finished", variantId });
  return { ownedCount, emptiedCount };
}
