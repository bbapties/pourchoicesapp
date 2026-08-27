import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activities";

export type UserBottleRow = {
  currently_owned: boolean;
  variant_id: string | null;
  times_had: number;
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
}): Promise<{ timesHad: number } | { error: string }> {
  const now = new Date().toISOString();
  const variantId = opts.variantId ?? (await resolveDefaultVariantId(opts.bottleId));
  if (!variantId) return { error: "no default variant for bottle" };

  const { data: rows, error: readErr } = await supabase
    .from("user_bottles")
    .select("id, currently_owned, times_had")
    .eq("user_id", opts.userId)
    .eq("bottle_id", opts.bottleId)
    .eq("variant_id", variantId)
    .limit(1);
  if (readErr) return { error: readErr.message };

  const row = rows?.[0];
  if (row) {
    // times_had = 0 means the row was tasting-only; owning it starts the count at 1.
    const timesHad = (row.times_had ?? 0) >= 1 ? (row.times_had ?? 1) + 1 : 1;
    const { error } = await supabase
      .from("user_bottles")
      .update({ currently_owned: true, updated_at: now, times_had: timesHad })
      .eq("id", row.id);
    if (error) return { error: error.message };
    await logActivity({ userId: opts.userId, bottleId: opts.bottleId, action: "added_to_collection", variantId });
    return { timesHad };
  }

  const { error } = await supabase.from("user_bottles").insert({
    user_id: opts.userId,
    bottle_id: opts.bottleId,
    variant_id: variantId,
    currently_owned: true,
    times_had: 1,
    created_at: now,
    updated_at: now,
  });
  if (error) return { error: error.message };
  await logActivity({ userId: opts.userId, bottleId: opts.bottleId, action: "added_to_collection", variantId });
  return { timesHad: 1 };
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
    const { error } = await supabase
      .from("user_bottles")
      .update({ currently_owned: false, times_had: 0, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("user_bottles").delete().eq("id", row.id);
    if (error) return { error: error.message };
  }
  await logActivity({ userId: opts.userId, bottleId: opts.bottleId, action: "removed_from_collection", variantId });
  return {};
}
