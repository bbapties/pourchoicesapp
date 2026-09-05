import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Accept either env name — local/docs use SUPABASE_SERVICE_ROLE; some Vercel envs
  // were set as SUPABASE_SERVICE_ROLE_KEY (B-21).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !url) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500 }
    );
  }

  const { targetPublicUserId } = await req.json().catch(() => ({}));
  if (!targetPublicUserId || typeof targetPublicUserId !== "string") {
    return NextResponse.json({ error: "targetPublicUserId required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!caller || caller.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (caller.id === targetPublicUserId) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  // Look up the auth_id BEFORE the cascade nukes the public.users row
  const { data: target, error: targetErr } = await supabase
    .from("users")
    .select("auth_id, username")
    .eq("id", targetPublicUserId)
    .maybeSingle();

  if (targetErr || !target) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  // Service-role client: needed for the auth.users delete below, and for detaching authorship
  // (bottles/bottle_variants are admin-writable but this must not depend on the caller's RLS).
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // B-29 / B-74: release the catalog rows this user authored before the cascade removes their
  // public.users row. `created_by`/`updated_by` hold a public.users.id (B-74), so this keys on
  // targetPublicUserId -- it used to key on auth_id, which no longer matches anything.
  //
  // The foreign keys added by sql/b74-...-part2-migration.sql are ON DELETE SET NULL, so the
  // database already does this atomically as part of the cascade. This stays as belt and braces:
  // it is explicit at the call site, and it also covers a user with no auth_id at all, who never
  // entered the auth-id-conditional block this used to live in.
  await admin.from("bottles").update({ created_by: null }).eq("created_by", targetPublicUserId);
  await admin.from("bottles").update({ updated_by: null }).eq("updated_by", targetPublicUserId);
  await admin.from("bottle_variants").update({ created_by: null }).eq("created_by", targetPublicUserId);
  await admin.from("bottle_variants").update({ updated_by: null }).eq("updated_by", targetPublicUserId);

  // Cascade-delete from public schema via the SECURITY DEFINER RPC
  const { error: rpcErr } = await supabase.rpc("delete_user_cascade", {
    target_user_id: targetPublicUserId,
  });

  if (rpcErr) {
    return NextResponse.json(
      { error: `Cascade failed: ${rpcErr.message}` },
      { status: 500 }
    );
  }

  // Now nuke the auth.users row using the service-role client
  if (target.auth_id) {
    const { error: authErr } = await admin.auth.admin.deleteUser(target.auth_id);
    if (authErr) {
      return NextResponse.json(
        {
          error: `Public schema wiped but auth.users delete failed: ${authErr.message}`,
          partial: true,
          username: target.username,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, username: target.username });
}
