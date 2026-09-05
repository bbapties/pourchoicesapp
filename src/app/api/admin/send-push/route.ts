import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Admin -> Web Push send (Phase 10 D3).
 *
 * SERVER ONLY. The VAPID private key is the credential that lets anyone push to our subscribers;
 * it is read from env here and must never be imported into a client component. Only the PUBLIC key
 * is exposed (NEXT_PUBLIC_VAPID_PUBLIC_KEY).
 *
 * Auth is checked twice on purpose: `getUser()` validates the caller's token against the Auth
 * server, then the admin role is re-read from public.users. The service-role client below bypasses
 * RLS, so nothing here may rely on the client's own claims.
 */

export const runtime = "nodejs"; // web-push needs node crypto, not the edge runtime

type SendBody = {
  title?: string;
  body?: string;
  url?: string;
  audience?: "everyone" | "user";
  targetUserId?: string | null;
};

export async function POST(request: Request) {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@pourchoicesapp.com";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json(
      { error: "Push is not configured: VAPID keys are missing from the server environment." },
      { status: 503 }
    );
  }
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "Server is missing Supabase credentials" }, { status: 500 });
  }

  // 1. Who is calling? getUser() validates the token rather than trusting the cookie.
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

  // 2. Validate the payload. Titles and bodies are shown on a lock screen, so cap them.
  let payload: SendBody;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (payload.title ?? "").trim().slice(0, 80);
  const body = (payload.body ?? "").trim().slice(0, 200);
  const deepLink = (payload.url ?? "/mybar").trim().slice(0, 300);
  const audience = payload.audience === "user" ? "user" : "everyone";
  const targetUserId = audience === "user" ? payload.targetUserId ?? null : null;

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  if (audience === "user" && !targetUserId) {
    return NextResponse.json({ error: "Pick a user to send to" }, { status: 400 });
  }
  // Only same-origin paths: a notification that opens somewhere else is a phishing primitive.
  if (!deepLink.startsWith("/")) {
    return NextResponse.json({ error: "Link must be an in-app path starting with /" }, { status: 400 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  // 3. Recipients. Service role: RLS deliberately gives users no read access to other rows.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id, users!inner(notify_push)")
    // Respect the preference: someone who turned notifications off keeps their subscription row
    // (so re-enabling needs no new OS dialog) but must not be sent to.
    .eq("users.notify_push", true);
  if (audience === "user") query = query.eq("user_id", targetUserId!);

  const { data: subs, error: subsError } = await query;
  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 500 });
  if (!subs?.length) {
    return NextResponse.json({ sent: 0, failed: 0, note: "No subscribed devices matched." });
  }

  // 4. Send. Each device is independent; one dead endpoint must not stop the rest.
  const message = JSON.stringify({ title, body, url: deepLink });
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message
        );
        sent += 1;
      } catch (e) {
        failed += 1;
        // 404/410 mean the push service has permanently dropped this endpoint -- the user
        // uninstalled or cleared data. Prune it, or the list rots and every send looks half-failed.
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
      }
    })
  );

  if (expired.length) {
    await admin.from("push_subscriptions").delete().in("id", expired);
  }
  if (sent) {
    await admin
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", subs.filter((s) => !expired.includes(s.id)).map((s) => s.id));
  }

  // 5. Log what went out, so "did they get it" is answerable later.
  await admin.from("notifications").insert({
    created_by: caller.id,
    title,
    body,
    url: deepLink,
    audience,
    target_user_id: targetUserId,
    sent_count: sent,
    failed_count: failed,
  });

  return NextResponse.json({ sent, failed, pruned: expired.length });
}
