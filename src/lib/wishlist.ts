import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activities";

/** Variant ids the user has wishlisted (BOTTLE_ACTIONS.md B.5). */
export async function fetchWishlistVariantIds(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data, error } = await supabase.from("wishlists").select("variant_id").eq("user_id", userId);
  if (error) {
    console.error("fetchWishlistVariantIds:", error.message);
    return new Set();
  }
  return new Set((data || []).map((r: { variant_id: string }) => r.variant_id));
}

/** Add one variant to the wishlist and post a `wishlisted` activity. Idempotent on the unique key. */
export async function addToWishlist(
  userId: string,
  bottleId: string,
  variantId: string,
): Promise<{ error?: string }> {
  const { error } = await supabase.from("wishlists").insert({ user_id: userId, bottle_id: bottleId, variant_id: variantId });
  if (error && (error as { code?: string }).code !== "23505") return { error: error.message };
  await logActivity({ userId, bottleId, action: "wishlisted", variantId });
  return {};
}

/** Remove one variant from the wishlist (e.g. on auto-clear when added to bar, or manual untoggle). */
export async function removeFromWishlist(userId: string, variantId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("wishlists").delete().eq("user_id", userId).eq("variant_id", variantId);
  if (error) return { error: error.message };
  return {};
}
