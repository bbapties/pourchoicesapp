import { supabase } from "@/lib/supabase";
import { resolveDefaultVariantId } from "@/lib/userBottles";

/**
 * Manual star "guess" (Phase 3.1; storage reworked for B-40). A per-(user, variant)
 * evaluation, independent of collection/consumption — display-only, seeds nothing. Lives in
 * its own `user_ratings` table so rating a bottle you neither own nor tasted no longer
 * fabricates a placeholder user_bottles row. Once the user has a blind tasting for that
 * variant, display switches to the Elo-derived (read-only) star and this guess is superseded.
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

  // The guess lives in user_ratings now; personal Elo still lives on user_bottles.
  const [{ data: ratingRows }, { data: ubRows }, tasted] = await Promise.all([
    supabase
      .from("user_ratings")
      .select("stars")
      .eq("user_id", userId)
      .eq("variant_id", vId)
      .limit(1),
    supabase
      .from("user_bottles")
      .select("elo")
      .eq("user_id", userId)
      .eq("bottle_id", bottleId)
      .eq("variant_id", vId)
      .limit(1),
    hasBlindTasted(userId, vId),
  ]);
  const stars = ratingRows?.[0]?.stars;
  return {
    ratingStars: stars == null ? null : Number(stars),
    hasTasted: tasted,
    personalElo: ubRows?.[0]?.elo ?? null,
  };
}

/**
 * Set/update the manual star guess for a (user, bottle, variant). Upserts into user_ratings —
 * a standalone evaluation that does NOT touch user_bottles (no collection row, no My Bar
 * membership, no "had it" earmark). Rounded to 1 decimal, clamped 0-5. (B-40)
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

  const { error } = await supabase
    .from("user_ratings")
    .upsert(
      {
        user_id: opts.userId,
        bottle_id: opts.bottleId,
        variant_id: variantId,
        stars,
        updated_at: now,
      },
      { onConflict: "user_id,variant_id" }
    );
  if (error) return { error: error.message };
  return {};
}
