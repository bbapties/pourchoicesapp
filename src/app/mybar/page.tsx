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

  // Fetch currently-owned bottle IDs + add dates
  const { data: userBottles } = await supabase
    .from('user_bottles')
    .select('bottle_id, created_at')
    .eq('user_id', publicUser.id)
    .eq('currently_owned', true);

  const bottleIds = (userBottles || []).map(r => r.bottle_id);

  let collection: any[] = [];

  if (bottleIds.length > 0) {
    const { data: details } = await supabase
      .from('all_bottle_details')
      .select(`
        bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style,
        bottle_elo_global, bottle_verified,
        attr_frontimage_url, attr_backimage_url,
        attr_proof, attr_volume, attr_age,
        attr_notes, attr_release_year, attr_batch, attr_store_pick_name
      `)
      .in('bottle_id', bottleIds)
      .order('bottle_elo_global', { ascending: false, nullsFirst: false });

    // Map addedAt from userBottles onto each detail record
    const addedAtMap: Record<string, string> = {};
    (userBottles || []).forEach(r => { addedAtMap[r.bottle_id] = r.created_at; });

    collection = (details || []).map(d => ({
      ...d,
      addedAt: addedAtMap[d.bottle_id],
    }));
  }

  // Fetch all Elos for star scaling
  const { data: allBottlesElo } = await supabase
    .from('all_bottle_details')
    .select('bottle_elo_global')
    .order('bottle_elo_global', { ascending: false, nullsFirst: false });

  return (
    <MyBarClient
      collection={collection}
      allBottlesElo={allBottlesElo || []}
      publicUserId={publicUser.id}
    />
  );
}
