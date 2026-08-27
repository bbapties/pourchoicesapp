import { supabase } from "@/lib/supabase";
import { type BottleDetails, type BottleVariant } from "@/lib/types";

const FULL_SELECT =
  "id, bottles_id, is_default, elo_global, nose, palate, finish, verified, frontimage_url, backimage_url, age, proof, batch, release_year, store_pick_name, notes, created_at";
const LEGACY_SELECT =
  "id, bottles_id, verified, frontimage_url, backimage_url, age, proof, batch, release_year, store_pick_name, notes, created_at";

type VariantRow = {
  id: string;
  bottles_id: string;
  is_default?: boolean | null;
  elo_global?: number | null;
  nose?: string | null;
  palate?: string | null;
  finish?: string | null;
  verified?: boolean | null;
  frontimage_url?: string | null;
  backimage_url?: string | null;
  age?: string | null;
  proof?: number | null;
  batch?: string | null;
  release_year?: number | string | null;
  store_pick_name?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

function mapRow(row: VariantRow): BottleVariant {
  return {
    variantId: row.id,
    isDefault: !!row.is_default,
    elo_global: row.elo_global ?? undefined,
    nose: row.nose ?? undefined,
    palate: row.palate ?? undefined,
    finish: row.finish ?? undefined,
    verified: row.verified ?? undefined,
    frontImageUrl: row.frontimage_url ?? undefined,
    backImageUrl: row.backimage_url ?? undefined,
    age: row.age ?? undefined,
    proof: row.proof ?? undefined,
    releaseYear: row.release_year != null ? String(row.release_year) : undefined,
    batch: row.batch ?? undefined,
    storePickName: row.store_pick_name ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function orderVariants(rows: VariantRow[]): VariantRow[] {
  return [...rows].sort((a, b) => {
    const d = Number(!!b.is_default) - Number(!!a.is_default);
    if (d !== 0) return d;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
}

/**
 * Ordered variants for a SKU — default first. Falls back to pre-7.1 columns if the new ones aren't
 * live yet. 7.9: store picks (`store_pick_name` set) are private to their creator — pass the viewer's
 * id(s) to include their own; without any, only global (non-store-pick) variants are returned.
 * Pass BOTH the auth id and public id: `created_by` is stored inconsistently (auth id on some rows,
 * public id on others), so matching either id makes owner-sees-own robust.
 */
export async function fetchVariantsForSku(
  bottleId: string,
  ownerIds?: (string | null | undefined)[]
): Promise<BottleVariant[]> {
  const ids = (ownerIds ?? []).filter(Boolean) as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any) =>
    ids.length
      ? q.or(`store_pick_name.is.null,created_by.in.(${ids.join(",")})`)
      : q.is("store_pick_name", null);

  const full = await scope(
    supabase.from("bottle_variants").select(FULL_SELECT).eq("bottles_id", bottleId)
  );

  const result = full.error
    ? await scope(supabase.from("bottle_variants").select(LEGACY_SELECT).eq("bottles_id", bottleId))
    : full;

  if (result.error || !result.data) {
    if (result.error) console.error("fetchVariantsForSku:", result.error.message);
    return [];
  }

  return orderVariants(result.data as VariantRow[]).map(mapRow);
}

/**
 * Client-side store-pick privacy check, mirroring `fetchVariantsForSku`'s DB filter
 * (`store_pick_name IS NULL OR created_by IN (ids)`). Use it to filter the variant
 * arrays that seed the carousel from a list row, so another user's private store
 * pick never flashes before the authoritative refetch (B-10). `created_by` may be
 * an auth id OR a public id, so pass both viewer ids.
 */
export function isVariantVisibleToViewer(
  storePickName: string | null | undefined,
  createdBy: string | null | undefined,
  viewerIds: (string | null | undefined)[]
): boolean {
  if (!storePickName) return true;
  return viewerIds.some((id) => !!id && id === createdBy);
}

/** Fields that swap when the detail carousel moves. SKU identity (name/distillery/category) stays put. */
export function fieldsForVariant(bottle: BottleDetails, v?: BottleVariant | null) {
  if (!v) {
    return {
      elo: bottle.elo_global,
      verified: bottle.verified,
      nose: bottle.nose,
      palate: bottle.palate,
      finish: bottle.finish,
      frontImageUrl: bottle.frontImageUrl,
      backImageUrl: bottle.backImageUrl,
      age: bottle.age,
      proof: bottle.proof,
      notes: undefined as string | undefined,
    };
  }
  return {
    elo: v.elo_global ?? bottle.elo_global,
    verified: v.verified ?? bottle.verified,
    nose: v.nose ?? bottle.nose,
    palate: v.palate ?? bottle.palate,
    finish: v.finish ?? bottle.finish,
    frontImageUrl: v.frontImageUrl ?? bottle.frontImageUrl,
    backImageUrl: v.backImageUrl ?? bottle.backImageUrl,
    age: v.age ?? bottle.age,
    proof: v.proof ?? bottle.proof,
    notes: v.notes,
  };
}

/** Overlay the default variant's scored/identity fields onto the SKU card. No-op until a default exists (post-7.1 SQL). */
export function applyDefaultVariant(bottle: BottleDetails, variants: BottleVariant[]): BottleDetails {
  if (!variants.length) return { ...bottle, variants };
  const def = variants.find((v) => v.isDefault);
  if (!def) return { ...bottle, variants };
  return {
    ...bottle,
    variants,
    elo_global: def.elo_global ?? bottle.elo_global,
    verified: def.verified ?? bottle.verified,
    nose: def.nose ?? bottle.nose,
    palate: def.palate ?? bottle.palate,
    finish: def.finish ?? bottle.finish,
    frontImageUrl: def.frontImageUrl ?? bottle.frontImageUrl,
    backImageUrl: def.backImageUrl ?? bottle.backImageUrl,
    age: def.age ?? bottle.age,
    proof: def.proof ?? bottle.proof,
  };
}

/** Best-effort default-variant insert for a newly created bottle. Never fails the parent bottle insert. */
export async function insertDefaultVariant(opts: {
  bottleId: string;
  createdBy: string;
  eloGlobal?: number;
  verified?: boolean;
  frontimageUrl?: string | null;
  backimageUrl?: string | null;
  age?: string | null;
  proof?: number | null;
  nose?: string | null;
  palate?: string | null;
  finish?: string | null;
}): Promise<string | null> {
  const row = {
    bottles_id: opts.bottleId,
    created_by: opts.createdBy,
    is_default: true,
    elo_global: opts.eloGlobal ?? 1500,
    verified: opts.verified ?? false,
    frontimage_url: opts.frontimageUrl ?? null,
    backimage_url: opts.backimageUrl ?? null,
    age: opts.age ?? null,
    proof: opts.proof ?? null,
    nose: opts.nose ?? null,
    palate: opts.palate ?? null,
    finish: opts.finish ?? null,
  };

  const full = await supabase.from("bottle_variants").insert(row).select("id").maybeSingle();
  if (!full.error && full.data?.id) return full.data.id as string;

  const legacy = await supabase
    .from("bottle_variants")
    .insert({
      bottles_id: opts.bottleId,
      created_by: opts.createdBy,
      verified: opts.verified ?? false,
      frontimage_url: opts.frontimageUrl ?? null,
      backimage_url: opts.backimageUrl ?? null,
      age: opts.age ?? null,
      proof: opts.proof ?? null,
    })
    .select("id")
    .maybeSingle();

  if (legacy.error) {
    console.error("insertDefaultVariant:", full.error?.message || legacy.error.message);
    return null;
  }
  return (legacy.data?.id as string) ?? null;
}
