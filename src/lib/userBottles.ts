import { supabase } from "@/lib/supabase";

export type UserBottleRow = {
  currently_owned: boolean;
  variant_id: string | null;
  times_had: number;
};

/** One row per (user, bottle). Restocking an empty bottle increments times_had. */
export async function addOrRestockUserBottle(opts: {
  userId: string;
  bottleId: string;
  variantId?: string | null;
  existing?: UserBottleRow | null;
}): Promise<{ timesHad: number } | { error: string }> {
  const now = new Date().toISOString();
  const variantId = opts.variantId ?? null;

  if (opts.existing) {
    const timesHad = (opts.existing.times_had ?? 1) + 1;
    const withCount = await supabase
      .from("user_bottles")
      .update({
        currently_owned: true,
        updated_at: now,
        variant_id: variantId,
        times_had: timesHad,
      })
      .eq("user_id", opts.userId)
      .eq("bottle_id", opts.bottleId);
    if (withCount.error) {
      const fallback = await supabase
        .from("user_bottles")
        .update({ currently_owned: true, updated_at: now, variant_id: variantId })
        .eq("user_id", opts.userId)
        .eq("bottle_id", opts.bottleId);
      if (fallback.error) return { error: fallback.error.message };
      return { timesHad: opts.existing.times_had ?? 1 };
    }
    return { timesHad };
  }

  const insert = await supabase.from("user_bottles").insert({
    user_id: opts.userId,
    bottle_id: opts.bottleId,
    currently_owned: true,
    variant_id: variantId,
    times_had: 1,
    created_at: now,
    updated_at: now,
  });
  if (!insert.error) return { timesHad: 1 };

  const legacy = await supabase.from("user_bottles").insert({
    user_id: opts.userId,
    bottle_id: opts.bottleId,
    currently_owned: true,
    variant_id: variantId,
    created_at: now,
    updated_at: now,
  });
  if (legacy.error) return { error: legacy.error.message };
  return { timesHad: 1 };
}
