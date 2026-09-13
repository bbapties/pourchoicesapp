import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: publicUser } = await supabase
    .from("users")
    .select("id, username, role")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!publicUser || publicUser.role !== "admin") {
    redirect("/mybar");
  }

  return <AdminClient publicUserId={publicUser.id} username={publicUser.username} initialTab={tab} />;
}
