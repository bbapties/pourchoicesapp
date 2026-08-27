import { supabase } from "@/lib/supabase";
import { resolveDefaultVariantId } from "@/lib/userBottles";

/**
 * Manual star "guess" (Phase 3.1). A per-(user, variant) placeholder rating for a
 * bottle the user has NOT blind-tasted yet — display-only, seeds nothing. Stored in
 * user_bottles.rating_stars. Once the user has a blind tasting for that variant, the
 * star becomes the Elo-derived (read-only) value and this guess is ignored/overridden.
 */

export type UserRatingState = {
  ratingStars: number | null; // manual guess (0-5, 1 decimal), if set
  hasTasted: boolean;         // has a blind tasting for this (user, variant)
  personalElo: number | null; // user_bottles.elo for this (user, variant)
};

/** True if the user has any blind-tasting result for this variant (winner or loser). */
export async function hasBlindTasted(userId: string, variantId: string): Promise<boolean> {
  const { count } = await supabase
    .from("tasting_results")
    .select("id, tasting_sessions!inner(user_id)", { count: "exact", head: true })
    .eq("tasting_sessions.user_id", userId)
    .or(`winner_variant_id.eq.${variantId},loser_variant_id.eq.${variantId}`);
  return (count ?? 0) > 0;
}

/** Read the user's rating state for a (bottle, variant): manual guess, tasted?, personal Elo. */
export async function fetchUserRatingState(
  userId: string,
  bottleId: string,
  variantId: string | null
): Promise<UserRatingState> {
  const vId = variantId ?? (await resolveDefaultVariantId(bottleId));
  if (!vId) return { ratingStars: null, hasTasted: false, personalElo: null };

  const [{ data: rows }, tasted] = await Promise.all([
    supabase
      .from("user_bottles")
      .select("rating_stars, elo")
      .eq("user_id", userId)
      .eq("bottle_id", bottleId)
      .eq("variant_id", vId)
      .limit(1),
    hasBlindTasted(userId, vId),
  ]);
  const row = rows?.[0];
  return {
    ratingStars: row?.rating_stars ?? null,
    hasTasted: tasted,
    personalElo: row?.elo ?? null,
  };
}

/**
 * Set/update the manual star guess for a (user, bottle, variant). No-op-safe: creates
 * a placeholder row (currently_owned=false, times_had=0) if none exists so the guess has
 * somewhere to live without adding the bottle to My Bar. Rounded to 1 decimal, clamped 0-5.
 */
export async function setRatingStars(opts: {
  userId: string;
  bottleId: string;
  variantId?: string | null;
  stars: number;
}): Promise<{ error?: string }> {
  const variantId = opts.variantId ?? (await resolveDefaultVariantId(opts.bottleId));
  if (!variantId) return { error: "no default variant for bottle" };
  const stars = Math.round(Math.min(5, Math.max(0, opts.stars)) * 10) / 10;
  const now = new Date().toISOString();

  const { data: rows, error: readErr } = await supabase
    .from("user_bottles")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("bottle_id", opts.bottleId)
    .eq("variant_id", variantId)
    .limit(1);
  if (readErr) return { error: readErr.message };

  const row = rows?.[0];
  if (row) {
    const { error } = await supabase
      .from("user_bottles")
      .update({ rating_stars: stars, updated_at: now })
      .eq("id", row.id);
    if (error) return { error: error.message };
    return {};
  }

  const { error } = await supabase.from("user_bottles").insert({
    user_id: opts.userId,
    bottle_id: opts.bottleId,
    variant_id: variantId,
    rating_stars: stars,
    currently_owned: false,
    times_had: 0,
    created_at: now,
    updated_at: now,
  });
  if (error) return { error: error.message };
  return {};
}
