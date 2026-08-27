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

  const userBottleSelect = 'bottle_id, variant_id, created_at, updated_at, times_had';
  const { data: ownedBottles } = await supabase
    .from('user_bottles')
    .select(userBottleSelect)
    .eq('user_id', publicUser.id)
    .eq('currently_owned', true);
  // Empty = finished bottles that were actually owned (times_had >= 1).
  // Tasting-only rows (times_had = 0, created by the Elo trigger for bottles you
  // blind-tasted but never owned) are excluded here — they belong to the Tasted tab.
  const { data: emptyBottles } = await supabase
    .from('user_bottles')
    .select(userBottleSelect)
    .eq('user_id', publicUser.id)
    .eq('currently_owned', false)
    .gte('times_had', 1);

  const ownedIds = (ownedBottles || []).map(r => r.bottle_id);
  const emptyIds = (emptyBottles || []).map(r => r.bottle_id);

  const detailFields = `
    bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style,
    bottle_elo_global, default_variant_elo, bottle_verified,
    attr_frontimage_url, attr_backimage_url,
    attr_proof, attr_volume, attr_age,
    attr_nose, attr_palate, attr_finish, attr_extras,
    attr_variant_ids, attr_batch, attr_release_year, attr_store_pick_name
  `;

  let ownedCollection: any[] = [];
  let emptyCollection: any[] = [];

  if (ownedIds.length > 0) {
    const { data: details } = await supabase
      .from('all_bottle_details')
      .select(detailFields)
      .in('bottle_id', ownedIds)
      .order('default_variant_elo', { ascending: false, nullsFirst: false });

    const addedAtMap: Record<string, string> = {};
    const updatedAtMap: Record<string, string> = {};
    const timesHadMap: Record<string, number> = {};
    (ownedBottles || []).forEach(r => {
      addedAtMap[r.bottle_id] = r.created_at;
      updatedAtMap[r.bottle_id] = r.updated_at || r.created_at;
      timesHadMap[r.bottle_id] = r.times_had ?? 1;
    });

    ownedCollection = (details || []).map(d => ({
      ...d,
      addedAt: addedAtMap[d.bottle_id],
      created_at: addedAtMap[d.bottle_id],
      updated_at: updatedAtMap[d.bottle_id],
      times_had: timesHadMap[d.bottle_id],
    }));
  }

  if (emptyIds.length > 0) {
    const { data: details } = await supabase
      .from('all_bottle_details')
      .select(detailFields)
      .in('bottle_id', emptyIds)
      .order('default_variant_elo', { ascending: false, nullsFirst: false });

    // Use updated_at as "finished on" date if available, else created_at
    const finishedAtMap: Record<string, string> = {};
    const timesHadMap: Record<string, number> = {};
    (emptyBottles || []).forEach(r => {
      finishedAtMap[r.bottle_id] = r.updated_at || r.created_at;
      timesHadMap[r.bottle_id] = r.times_had ?? 1;
    });

    emptyCollection = (details || []).map(d => ({
      ...d,
      addedAt: finishedAtMap[d.bottle_id],
      created_at: (emptyBottles || []).find(r => r.bottle_id === d.bottle_id)?.created_at,
      updated_at: finishedAtMap[d.bottle_id],
      times_had: timesHadMap[d.bottle_id],
    }));
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

  return (
    <MyBarClient
      ownedCollection={ownedCollection}
      emptyCollection={emptyCollection}
      allBottlesElo={allBottlesElo}
      publicUserId={publicUser.id}
    />
  );
}
