import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// SERVER ONLY (#114). The one place a Web Push leaves this app. Lifted from the admin send route so
// social pushes (cheers, comments, follows, followed people's activity) go through the same gate:
// VAPID from env, the master switch users.notify_push on the subscription join, dead endpoints
// pruned. Never import from a client component - the private key lives here.

export type PushMessage = {
  /** which notify kind produced it (social route); for the log */
  kind?: string; title: string; body: string; url: string };

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function adminClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Send one message to every registered device of the given users. Returns counts; never throws.
 *
 * `actorId` is the person whose action this is about. They are never a recipient, and neither
 * is any DEVICE that also holds a subscription for them: Brian runs two accounts on one phone,
 * and a pour as one account buzzed the same phone as the other (2026-09-20). A device is the
 * push endpoint - one endpoint per browser profile, shared by whichever accounts signed in there.
 */
export async function sendPushTo(admin: SupabaseClient, userIds: string[], msg: PushMessage, actorId?: string | null): Promise<{ sent: number; failed: number }> {
  const ids = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (!ids.length || !pushConfigured()) return { sent: 0, failed: 0 };
  let ownEndpoints = new Set<string>();
  if (actorId) {
    const { data: own } = await admin.from("push_subscriptions").select("endpoint").eq("user_id", actorId);
    ownEndpoints = new Set((own || []).map((r: { endpoint: string }) => r.endpoint));
  }
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
  const targets = (subs || []).filter((s: any) => !ownEndpoints.has(s.endpoint));
  if (!targets.length) return { sent: 0, failed: 0 };

  const message = JSON.stringify({ title: msg.title.slice(0, 80), body: msg.body.slice(0, 200), url: msg.url.slice(0, 300) });
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  await Promise.all(
    targets.map(async (s: any) => {
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
  // Every send leaves a trail (2026-09-20: Brian got a push he could not place, and nothing
  // recorded who was sent what). Ids only; the title is what the phone showed.
  try {
    await admin.from("events").insert({
      user_id: actorId ?? null,
      event_type: "push_send",
      surface: "social",
      target_type: msg.kind ?? null,
      metadata: { title: msg.title.slice(0, 80), url: msg.url, recipients: [...new Set(targets.map((s: any) => s.user_id))], devices: targets.length, sent, failed },
    });
  } catch { /* fail-open */ }
  return { sent, failed };
}
