import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import HomeClient from "./HomeClient";

/**
 * /home — the Home screen ("The Cabinet", #82).
 *
 * REACHABLE BY URL, DELIBERATELY NOT IN THE BOTTOM NAV until #91. Every task in the epic ships to
 * prod and gets tested on a real phone this way, without changing anything for any user; the nav
 * switch is then one small last commit.
 *
 * Auth-gated the same way My Bar is: resolve public.users.id from auth_id here and hand it down,
 * because the shelf queries key off public.users.id and never auth.uid().
 */
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: publicUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!publicUser) redirect("/");

  return <HomeClient viewerId={publicUser.id} />;
}
