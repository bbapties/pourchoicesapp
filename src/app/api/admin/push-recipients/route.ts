import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Admin -> who can actually receive a push (B-59).
 *
 * WHY THIS ROUTE EXISTS. Notify used to count devices with a plain client query on
 * push_subscriptions. That runs under RLS as the admin, and sql/push-notifications-migration.sql
 * deliberately grants only "Select own subscriptions" -- there is no admin SELECT policy, because
 * sending happens server-side under the service role. So the admin saw only their OWN devices,
 * every other user computed as `devices: 0`, and "One user" disabled every option in the picker
 * even for a tester who had demonstrably subscribed.
 *
 * The fix reads the counts here under the service role instead of widening RLS. That keeps the
 * migration's stated intent -- users never read each other's subscription rows -- and matches how
 * /api/admin/send-push already resolves recipients, so the picker and the send agree on who is
 * reachable.
 *
 * Auth is checked twice, same as send-push: getUser() validates the caller's token against the
 * Auth server, then the admin role is re-read from public.users. The service-role client bypasses
 * RLS, so nothing here may rely on the client's own claims.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Recipient = { id: string; username: string; devices: number };

export async function GET() {
  // Accept either env name -- local/docs use SUPABASE_SERVICE_ROLE; some Vercel envs
  // were set as SUPABASE_SERVICE_ROLE_KEY (B-21).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "Server is missing Supabase credentials" }, { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: caller } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!caller || caller.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // notify_push is the preference; a subscription row is the device. Both are needed to be
  // reachable, and they are separate states -- see the migration header.
  const [{ data: users, error: usersError }, { data: subs, error: subsError }] = await Promise.all([
    admin.from("users").select("id, username").eq("notify_push", true),
    admin.from("push_subscriptions").select("user_id"),
  ]);
  if (usersError || subsError) {
    return NextResponse.json(
      { error: (usersError ?? subsError)!.message },
      { status: 500 }
    );
  }

  const counts = new Map<string, number>();
  (subs ?? []).forEach((s: { user_id: string }) =>
    counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1)
  );

  const recipients: Recipient[] = (users ?? [])
    .map((u: { id: string; username: string }) => ({
      id: u.id,
      username: u.username,
      devices: counts.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.devices - a.devices || a.username.localeCompare(b.username));

  return NextResponse.json({ recipients });
}
