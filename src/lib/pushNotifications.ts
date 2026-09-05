"use client";

import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import { isIOS, isStandalone } from "@/lib/pwa";

/**
 * Web Push subscription management (Phase 10 D3).
 *
 * THE ONE-SHOT RULE. `Notification.requestPermission()` shows the OS dialog exactly ONCE per
 * origin, ever. If the user denies it, every later call resolves "denied" immediately with no
 * dialog, and only they can undo it in browser settings. So the dialog must never be spent
 * speculatively -- the app nudges with its own sheet, and only calls this once the user has said
 * yes to us. `canStillAsk()` is what the nudges gate on.
 *
 * THE iOS RULE. iOS 16.4+ supports Web Push, but ONLY for a PWA installed to the home screen.
 * A Safari tab cannot subscribe at all -- `PushManager` is absent. There is no workaround, so we
 * detect it and say so rather than failing silently.
 */

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: "ios-needs-install" | "unsupported" };

/** Can this browser subscribe at all, right now, in this context? */
export function checkPushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, reason: "unsupported" };

  const hasApi =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  // On iPhone the APIs are simply missing outside an installed app. Reporting "unsupported" there
  // would be true but useless -- what they need to hear is "install it first".
  if (!hasApi) {
    return isIOS() && !isStandalone()
      ? { supported: false, reason: "ios-needs-install" }
      : { supported: false, reason: "unsupported" };
  }
  return { supported: true };
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** True while the OS dialog is still available to spend. False once granted or denied. */
export function canStillAsk(): boolean {
  return permissionState() === "default";
}

/** VAPID public keys are base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "ios-needs-install" | "unsupported" | "no-key" | "error"; message?: string };

/**
 * Ask for permission (spending the one dialog) and register a subscription for THIS device.
 * Must be called from a user gesture -- iOS requires it, and Chrome increasingly expects it.
 */
export async function enablePush(publicUserId: string): Promise<SubscribeResult> {
  const support = checkPushSupport();
  if (!support.supported) {
    return { ok: false, reason: support.reason };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.error("enablePush: NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
    return { ok: false, reason: "no-key" };
  }

  try {
    const permission = await Notification.requestPermission();
    logEvent({ eventType: "push_permission", metadata: { result: permission } });
    if (permission !== "granted") return { ok: false, reason: "denied" };

    const registration = await navigator.serviceWorker.ready;

    // Reuse an existing subscription if the browser already has one for this key; re-subscribing
    // with a different key throws, so drop a stale one first.
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const existingKey = subscription.options?.applicationServerKey;
      const wanted = urlBase64ToUint8Array(vapidPublicKey);
      const sameKey =
        !!existingKey &&
        new Uint8Array(existingKey).length === wanted.length &&
        new Uint8Array(existingKey).every((b, i) => b === wanted[i]);
      if (!sameKey) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // required by Chrome; we never send silent pushes
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "error", message: "Incomplete subscription" };
    }

    // Endpoint is globally unique and unique-indexed, so this upsert reassigns a device that
    // changed hands instead of creating a duplicate row.
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: publicUserId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent.slice(0, 400),
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );
    if (error) return { ok: false, reason: "error", message: error.message };

    // Turning it on here is an explicit yes; make sure the stored preference agrees.
    await supabase.from("users").update({ notify_push: true }).eq("id", publicUserId);

    logEvent({ eventType: "push_subscribe", metadata: { standalone: isStandalone() } });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("enablePush:", message);
    return { ok: false, reason: "error", message };
  }
}

/**
 * Turn notifications off. Drops this device's subscription and records the preference.
 * OS permission is deliberately NOT revoked (we cannot), so re-enabling later needs no new dialog.
 */
export async function disablePush(publicUserId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
    }
    const { error } = await supabase
      .from("users")
      .update({ notify_push: false })
      .eq("id", publicUserId);
    if (error) return { ok: false, error: error.message };
    logEvent({ eventType: "push_unsubscribe" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Does THIS device already have a live subscription? */
export async function hasDeviceSubscription(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const registration = await navigator.serviceWorker.ready;
    return !!(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}
