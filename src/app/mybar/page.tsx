import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import MyBarClient from "./MyBarClient";

export default async function MyBarPage() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // Resolve public.users.id from auth_id
  const { data: publicUser } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .single();

  if (!publicUser) redirect('/');

  const userBottleSelect = 'bottle_id, variant_id, created_at, updated_at, times_had, owned_count, emptied_count';
  type UbRow = {
    bottle_id: string;
    variant_id: string | null;
    created_at: string;
    updated_at: string | null;
    times_had: number | null;
    owned_count: number | null;
    emptied_count: number | null;
  };
  // One SKU card per tab (B-31 still collapses multi-variant). Keep the first
  // user_bottles row's variant_id so Add Back / Remove don't fall back to default (B-05).
  const indexByBottle = (rows: UbRow[]) => {
    const map = new Map<string, UbRow>();
    for (const r of rows) {
      if (!map.has(r.bottle_id)) map.set(r.bottle_id, r);
    }
    return map;
  };
  // B-32: aggregate a count column across a SKU's rows (a SKU may own/empty several variants).
  const sumBySku = (rows: UbRow[], key: 'owned_count' | 'emptied_count') => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.bottle_id, (m.get(r.bottle_id) ?? 0) + (r[key] ?? 0));
    return m;
  };

  // B-32: owned = any owned_count > 0; empty = any emptied_count > 0. A SKU can be in BOTH.
  const { data: ownedBottles } = await supabase
    .from('user_bottles')
    .select(userBottleSelect)
    .eq('user_id', publicUser.id)
    .gt('owned_count', 0);
  const { data: emptyBottles } = await supabase
    .from('user_bottles')
    .select(userBottleSelect)
    .eq('user_id', publicUser.id)
    .gt('emptied_count', 0);

  const ownedIds = (ownedBottles || []).map(r => r.bottle_id);
  const emptyIds = (emptyBottles || []).map(r => r.bottle_id);
  const ownedCountBySku = sumBySku((ownedBottles || []) as UbRow[], 'owned_count');
  const emptiedCountBySku = sumBySku((emptyBottles || []) as UbRow[], 'emptied_count');

  const detailFields = `
    bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style,
    bottle_elo_global, default_variant_elo, bottle_verified,
    attr_frontimage_url, attr_backimage_url,
    attr_proof, attr_volume, attr_age,
    attr_nose, attr_palate, attr_finish, attr_extras,
    attr_variant_ids, attr_batch, attr_release_year, attr_store_pick_name, attr_variant_created_by
  `;

  let ownedCollection: any[] = [];
  let emptyCollection: any[] = [];

  if (ownedIds.length > 0) {
    const { data: details } = await supabase
      .from('all_bottle_details')
      .select(detailFields)
      .in('bottle_id', ownedIds)
      .order('default_variant_elo', { ascending: false, nullsFirst: false });

    const ownedBySku = indexByBottle((ownedBottles || []) as UbRow[]);
    ownedCollection = (details || []).map(d => {
      const ub = ownedBySku.get(d.bottle_id);
      return {
        ...d,
        variant_id: ub?.variant_id ?? null,
        addedAt: ub?.created_at,
        created_at: ub?.created_at,
        updated_at: ub?.updated_at || ub?.created_at,
        times_had: ub?.times_had ?? 1,
        owned_count: ownedCountBySku.get(d.bottle_id) ?? 1, // B-32: current quantity on the shelf
      };
    });
  }

  if (emptyIds.length > 0) {
    const { data: details } = await supabase
      .from('all_bottle_details')
      .select(detailFields)
      .in('bottle_id', emptyIds)
      .order('default_variant_elo', { ascending: false, nullsFirst: false });

    const emptyBySku = indexByBottle((emptyBottles || []) as UbRow[]);
    emptyCollection = (details || []).map(d => {
      const ub = emptyBySku.get(d.bottle_id);
      return {
        ...d,
        variant_id: ub?.variant_id ?? null,
        addedAt: ub?.updated_at || ub?.created_at,
        created_at: ub?.created_at,
        updated_at: ub?.updated_at || ub?.created_at,
        times_had: ub?.times_had ?? 1,
        emptied_count: emptiedCountBySku.get(d.bottle_id) ?? 1, // B-32: lifetime finished for this SKU
      };
    });
  }

  // Star scaling uses default-variant Elo (same as Search). bottles.elo_global is
  // legacy — the 3.0 trigger only writes bottle_variants.elo_global (B-04).
  const { data: eloRows } = await supabase
    .from('all_bottle_details')
    .select('default_variant_elo, bottle_elo_global')
    .order('default_variant_elo', { ascending: false, nullsFirst: false });
  const allBottlesElo = (eloRows || [])
    .map((r) => r.default_variant_elo ?? r.bottle_elo_global)
    .filter((e): e is number => e != null);

  // Tasted = variants this user ranked that they do not own and never finished
  // (tasting-only). Excludes star-guess placeholders (no tasting_results) and
  // bottles already on Owned / Empty. One card per variant.
  let tastedCollection: any[] = [];
  const { data: sessions } = await supabase
    .from("tasting_sessions")
    .select("id")
    .eq("user_id", publicUser.id);
  const sessionIds = (sessions || []).map((s) => s.id as string);
  if (sessionIds.length > 0) {
    const { data: results } = await supabase
      .from("tasting_results")
      .select("winner_variant_id, loser_variant_id, winner_bottle_id, loser_bottle_id, created_at")
      .in("tasting_session_id", sessionIds);

    const lastTastedAt: Record<string, string> = {};
    const variantIds = new Set<string>();
    for (const r of results || []) {
      const stamp = r.created_at as string | null;
      for (const vid of [r.winner_variant_id, r.loser_variant_id] as (string | null)[]) {
        if (!vid) continue;
        variantIds.add(vid);
        if (stamp && (!lastTastedAt[vid] || stamp > lastTastedAt[vid])) lastTastedAt[vid] = stamp;
      }
    }

    const ownedOrEmptyVariant = new Set<string>();
    for (const r of [...(ownedBottles || []), ...(emptyBottles || [])] as UbRow[]) {
      if (r.variant_id) ownedOrEmptyVariant.add(r.variant_id);
    }
    const tastedOnlyIds = [...variantIds].filter((id) => !ownedOrEmptyVariant.has(id));

    if (tastedOnlyIds.length > 0) {
      const { data: vdetails } = await supabase
        .from("all_variant_details")
        .select(
          "variant_id, bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, variant_is_default, variant_elo_global, variant_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_batch, attr_release_year, attr_store_pick_name, attr_nose, attr_palate, attr_finish"
        )
        .in("variant_id", tastedOnlyIds)
        .order("variant_elo_global", { ascending: false, nullsFirst: false });

      tastedCollection = (vdetails || []).map((d: any) => ({
        bottle_id: d.bottle_id,
        variant_id: d.variant_id,
        bottle_name: d.bottle_name,
        bottle_distillery: d.bottle_distillery,
        bottle_category: d.bottle_category,
        bottle_style: d.bottle_style,
        bottle_verified: d.variant_verified,
        default_variant_elo: d.variant_elo_global,
        attr_frontimage_url: d.attr_frontimage_url,
        attr_backimage_url: d.attr_backimage_url,
        attr_age: d.attr_age,
        attr_proof: d.attr_proof,
        attr_nose: d.attr_nose,
        attr_palate: d.attr_palate,
        attr_finish: d.attr_finish,
        attr_batch: d.attr_batch,
        attr_release_year: d.attr_release_year,
        attr_store_pick_name: d.attr_store_pick_name,
        variant_is_default: d.variant_is_default,
        addedAt: lastTastedAt[d.variant_id] ?? null,
        times_had: 0,
        tasted: true,
      }));
    }
  }

  // Wishlist (B.5) = variants the user flagged. One card per variant; opens not-in-collection.
  let wishlistCollection: any[] = [];
  const { data: wishRows } = await supabase
    .from('wishlists')
    .select('variant_id, created_at')
    .eq('user_id', publicUser.id);
  const wishVariantIds = (wishRows || []).map((w) => w.variant_id as string).filter(Boolean);
  if (wishVariantIds.length > 0) {
    const wishAddedAt: Record<string, string> = {};
    for (const w of wishRows || []) if (w.variant_id) wishAddedAt[w.variant_id as string] = w.created_at as string;
    const { data: vdetails } = await supabase
      .from('all_variant_details')
      .select(
        'variant_id, bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, variant_is_default, variant_elo_global, variant_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_batch, attr_release_year, attr_store_pick_name, attr_nose, attr_palate, attr_finish'
      )
      .in('variant_id', wishVariantIds)
      .order('variant_elo_global', { ascending: false, nullsFirst: false });
    wishlistCollection = (vdetails || []).map((d: any) => ({
      bottle_id: d.bottle_id,
      variant_id: d.variant_id,
      bottle_name: d.bottle_name,
      bottle_distillery: d.bottle_distillery,
      bottle_category: d.bottle_category,
      bottle_style: d.bottle_style,
      bottle_verified: d.variant_verified,
      default_variant_elo: d.variant_elo_global,
      attr_frontimage_url: d.attr_frontimage_url,
      attr_backimage_url: d.attr_backimage_url,
      attr_age: d.attr_age,
      attr_proof: d.attr_proof,
      attr_nose: d.attr_nose,
      attr_palate: d.attr_palate,
      attr_finish: d.attr_finish,
      attr_batch: d.attr_batch,
      attr_release_year: d.attr_release_year,
      attr_store_pick_name: d.attr_store_pick_name,
      variant_is_default: d.variant_is_default,
      addedAt: wishAddedAt[d.variant_id] ?? null,
      times_had: 0,
      wishlist: true,
    }));
  }

  return (
    <MyBarClient
      ownedCollection={ownedCollection}
      emptyCollection={emptyCollection}
      tastedCollection={tastedCollection}
      wishlistCollection={wishlistCollection}
      allBottlesElo={allBottlesElo}
      publicUserId={publicUser.id}
    />
  );
}
