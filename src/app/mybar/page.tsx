import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import MyBarClient from "./MyBarClient";

export default async function MyBarPage() {
  const supabase = await createSupabaseServerClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) redirect('/');

  // Resolve public.users.id from auth_id
  const { data: publicUser } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', session.user.id)
    .single();

  if (!publicUser) redirect('/');

  const ownedSelect = 'bottle_id, variant_id, created_at, updated_at, times_had';
  const emptySelect = 'bottle_id, variant_id, created_at, updated_at, times_had';
  let { data: ownedBottles, error: ownedErr } = await supabase
    .from('user_bottles')
    .select(ownedSelect)
    .eq('user_id', publicUser.id)
    .eq('currently_owned', true);
  let { data: emptyBottles, error: emptyErr } = await supabase
    .from('user_bottles')
    .select(emptySelect)
    .eq('user_id', publicUser.id)
    .eq('currently_owned', false);
  if (ownedErr || emptyErr) {
    ({ data: ownedBottles } = await supabase
      .from('user_bottles')
      .select('bottle_id, variant_id, created_at')
      .eq('user_id', publicUser.id)
      .eq('currently_owned', true));
    ({ data: emptyBottles } = await supabase
      .from('user_bottles')
      .select('bottle_id, variant_id, created_at, updated_at')
      .eq('user_id', publicUser.id)
      .eq('currently_owned', false));
  }

  const ownedIds = (ownedBottles || []).map(r => r.bottle_id);
  const emptyIds = (emptyBottles || []).map(r => r.bottle_id);

  const detailFields = `
    bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style,
    bottle_elo_global, bottle_verified,
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
      .order('bottle_elo_global', { ascending: false, nullsFirst: false });

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
      .order('bottle_elo_global', { ascending: false, nullsFirst: false });

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

  // Fetch all Elos for star scaling
  const { data: allBottlesElo } = await supabase
    .from('all_bottle_details')
    .select('bottle_elo_global')
    .order('bottle_elo_global', { ascending: false, nullsFirst: false });

  return (
    <MyBarClient
      ownedCollection={ownedCollection}
      emptyCollection={emptyCollection}
      allBottlesElo={allBottlesElo || []}
      publicUserId={publicUser.id}
    />
  );
}
