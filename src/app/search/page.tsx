import { createSupabaseServerClient } from "@/lib/supabase-server";
import SearchClient from "@/app/search/SearchClient";

export default async function SearchPage() {
  const supabase = await createSupabaseServerClient();

  // Two Elo distributions for star scaling — Bottles mode scores by the default
  // variant's Elo, All Variants mode by each variant's own Elo.
  const [{ data: bottleRows }, { data: variantRows }] = await Promise.all([
    supabase
      .from("all_bottle_details")
      .select("default_variant_elo, bottle_elo_global")
      .order("default_variant_elo", { ascending: false, nullsFirst: false }),
    supabase
      .from("all_variant_details")
      .select("variant_elo_global")
      .order("variant_elo_global", { ascending: false, nullsFirst: false }),
  ]);

  const bottlesElo = (bottleRows || [])
    .map((r) => r.default_variant_elo ?? r.bottle_elo_global)
    .filter((e): e is number => e != null);
  const variantsElo = (variantRows || [])
    .map((r) => r.variant_elo_global)
    .filter((e): e is number => e != null);

  return (
    <SearchClient
      bottlesElo={bottlesElo}
      variantsElo={variantsElo}
      totalBottleCount={bottleRows?.length || 0}
      totalVariantCount={variantRows?.length || 0}
    />
  );
}
