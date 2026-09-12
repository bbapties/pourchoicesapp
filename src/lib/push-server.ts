import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// SERVER ONLY (#114). The one place a Web Push leaves this app. Lifted from the admin send route so
// social pushes (cheers, comments, follows, followed people's activity) go through the same gate:
// VAPID from env, the master switch users.notify_push on the subscription join, dead endpoints
// pruned. Never import from a client component - the private key lives here.

export type PushMessage = { title: string; body: string; url: string };

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function adminClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Send one message to every registered device of the given users. Returns counts; never throws. */
export async function sendPushTo(admin: SupabaseClient, userIds: string[], msg: PushMessage): Promise<{ sent: number; failed: number }> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length || !pushConfigured()) return { sent: 0, failed: 0 };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@pourchoicesapp.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id, users!inner(notify_push)")
    .eq("users.notify_push", true)
    .in("user_id", ids);
  if (!subs?.length) return { sent: 0, failed: 0 };

  const message = JSON.stringify({ title: msg.title.slice(0, 80), body: msg.body.slice(0, 200), url: msg.url.slice(0, 300) });
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message);
        sent += 1;
      } catch (e) {
        failed += 1;
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
      }
    }),
  );
  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  return { sent, failed };
}
