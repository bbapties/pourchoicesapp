import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Admin: clear a user's avatar (#112). The file stays in storage for audit; only the pointer
// goes, so the generated initials disc takes over everywhere. Same auth shape as delete-user.
export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
  }

  const { targetPublicUserId } = await req.json().catch(() => ({}));
  if (!targetPublicUserId || typeof targetPublicUserId !== "string") {
    return NextResponse.json({ error: "targetPublicUserId required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: caller } = await supabase.from("users").select("id, role").eq("auth_id", user.id).maybeSingle();
  if (!caller || caller.role !== "admin") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.from("users").update({ avatar_url: null }).eq("id", targetPublicUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
