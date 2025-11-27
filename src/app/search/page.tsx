import { createSupabaseServerClient } from "@/lib/supabase-server";
import SearchClient from "@/app/search/SearchClient";

export default async function SearchPage() {
  const supabase = await createSupabaseServerClient();

  // Fetch all bottles for percentile calculation from view
  const { data: allBottles } = await supabase
    .from("all_bottle_details")
    .select("bottle_elo_global")
    .order("bottle_elo_global", { ascending: false, nullsFirst: false });

  const totalBottleCount = allBottles?.length || 0;

  return (
    <SearchClient
      allBottlesElo={allBottles || []}
      totalBottleCount={totalBottleCount}
    />
  );
}
