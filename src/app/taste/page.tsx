import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import DrinkClient from "./DrinkClient";

export default async function TastePage({
  searchParams,
}: {
  searchParams: Promise<{ bottle?: string; variant?: string }>;
}) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: publicUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single();
  if (!publicUser) redirect("/");

  const sp = await searchParams;
  return (
    <DrinkClient
      publicUserId={publicUser.id}
      seedBottleId={sp.bottle ?? null}
      seedVariantId={sp.variant ?? null}
    />
  );
}
