import { supabase } from "@/lib/supabase";
import { applyDefaultVariant, fetchVariantsForSku } from "@/lib/variants";
import type { BottleDetails } from "@/lib/types";

/**
 * Load one SKU as the shape `BottleDetailView` expects.
 *
 * Search builds this inline from its own result rows; Home has no result rows to build it from —
 * a shelf carries only what it needs to draw a bottle. Rather than teach the shelf to carry a
 * whole BottleDetails, or copy Search's mapper, this fetches the same view Search reads
 * (`all_bottle_details`) and runs the same `applyDefaultVariant` over the same
 * `fetchVariantsForSku`. One bottle, one source of truth, whichever screen asked for it.
 */

const SELECT =
  "bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, " +
  "bottle_elo_global, bottle_verified, attr_frontimage_url, attr_backimage_url, attr_age, " +
  "attr_proof, attr_volume, attr_nose, attr_palate, attr_finish, attr_extras, default_variant_elo, " +
  "default_variant_id";

/** The subset of `all_bottle_details` this needs. The generated client has no type for the
 *  view, so the row is asserted once here rather than at every field. */
type Row = {
  bottle_id: string;
  bottle_name: string;
  bottle_distillery: string | null;
  bottle_category: string | null;
  bottle_style: string | null;
  bottle_barcode: string | null;
  bottle_elo_global: number | null;
  bottle_verified: boolean | null;
  attr_frontimage_url: string | null;
  attr_backimage_url: string | null;
  attr_age: string | null;
  attr_proof: number | null;
  attr_volume: string | null;
  attr_nose: string | null;
  attr_palate: string | null;
  attr_finish: string | null;
  attr_extras: string | null;
  default_variant_elo: number | null;
  default_variant_id: string | null;
};

export async function loadBottleDetails(
  bottleId: string,
  viewerId: string | null
): Promise<BottleDetails | null> {
  const { data: raw, error } = await supabase
    .from("all_bottle_details")
    .select(SELECT)
    .eq("bottle_id", bottleId)
    .maybeSingle();

  if (error || !raw) {
    if (error) console.error("loadBottleDetails:", error.message);
    return null;
  }
  const data = raw as unknown as Row;

  const base: BottleDetails = {
    id: data.bottle_id,
    name: data.bottle_name,
    distillery: data.bottle_distillery ?? undefined,
    category: data.bottle_category ?? undefined,
    style: data.bottle_style ?? undefined,
    age: data.attr_age ?? undefined,
    proof: data.attr_proof ?? undefined,
    volume: data.attr_volume ?? undefined,
    elo_global: data.default_variant_elo ?? data.bottle_elo_global ?? undefined,
    verified: Boolean(data.bottle_verified),
    barcode: data.bottle_barcode ?? undefined,
    frontImageUrl: data.attr_frontimage_url ?? undefined,
    backImageUrl: data.attr_backimage_url ?? undefined,
    nose: data.attr_nose ?? undefined,
    palate: data.attr_palate ?? undefined,
    finish: data.attr_finish ?? undefined,
    extras: data.attr_extras ?? undefined,
    variants: [],
  };

  // Viewer-scoped: another person's private store picks must not appear (B-10).
  const variants = await fetchVariantsForSku(bottleId, viewerId);
  return applyDefaultVariant({ ...base, variants }, variants);
}
