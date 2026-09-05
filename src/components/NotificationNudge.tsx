"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NotificationSheet from "@/components/NotificationSheet";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import { canStillAsk, checkPushSupport } from "@/lib/pushNotifications";
import { isStandalone } from "@/lib/pwa";

/**
 * Decides WHEN to nudge about notifications (Phase 10 D3). The sheet is `NotificationSheet`.
 *
 * Brian's call: ask more than once, because one ask gets missed. Three moments:
 *   1. Opening the INSTALLED app -- they just committed to it, so it is a fair time to ask.
 *   2. After their first real action -- they have seen the app do something useful.
 *   3. Landing on Profile -- where notification settings live anyway.
 *
 * This is only safe because the thing being repeated is OUR sheet. The OS dialog is one-shot per
 * origin forever, so it is only spent when someone taps "Turn them on" inside the sheet. See
 * `pushNotifications.ts`.
 *
 * Guards, so "repeatedly" never becomes "constantly":
 *   - at most once per browser session (sessionStorage)
 *   - never once permission is granted or denied (a denied user cannot be re-asked at all)
 *   - never if they ticked "Don't ask me again" (users.notify_prompt_optout)
 *   - never if they deliberately turned notifications off (users.notify_push = false)
 */

const SESSION_KEY = "pc.push.nudged";

function nudgedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markNudged(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Private mode: worst case we ask again next navigation. Acceptable.
  }
}

export default function NotificationNudge() {
  const pathname = usePathname();
  const { publicUserId, loading } = useCurrentUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !publicUserId) return;
    if (pathname === "/") return; // the install ask owns the login screen; don't stack sheets
    if (nudgedThisSession()) return;

    // A denied user cannot be re-asked by anyone, so nudging them is pure annoyance. A granted
    // user has nothing to do. Only "default" is worth a word.
    if (!canStillAsk()) return;

    // On an iPhone Safari tab the push APIs do not exist. Nudging there would send them to a sheet
    // whose only advice is "install first" -- worth saying on Profile, not as an interruption.
    const support = checkPushSupport();
    if (!support.supported && support.reason !== "ios-needs-install") return;
    if (!support.supported && pathname !== "/profile") return;

    let cancelled = false;

    (async () => {
      const { data: prefs } = await supabase
        .from("users")
        .select("notify_push, notify_prompt_optout")
        .eq("id", publicUserId)
        .maybeSingle();
      if (cancelled) return;
      if (!prefs || prefs.notify_prompt_optout || prefs.notify_push === false) return;

      // Moment 1: opening the installed app. Moment 3: Profile.
      let trigger: string | null = null;
      if (pathname === "/profile") trigger = "profile";
      else if (isStandalone()) trigger = "app_launch";
      else {
        // Moment 2: "after their first real action". Rather than instrumenting every action path,
        // check whether they have any activity yet -- which makes this fire on the navigation
        // right after their first add, pour or tasting.
        const { count } = await supabase
          .from("activities")
          .select("id", { count: "exact", head: true })
          .eq("user_id", publicUserId);
        if (cancelled) return;
        if ((count ?? 0) > 0) trigger = "after_first_action";
      }

      if (!trigger) return;
      markNudged();
      setOpen(true);
      logEvent({ eventType: "push_prompt_shown", surface: pathname, metadata: { trigger } });
    })();

    return () => { cancelled = true; };
  }, [loading, publicUserId, pathname]);

  return (
    <NotificationSheet
      open={open}
      onOpenChange={setOpen}
      publicUserId={publicUserId}
      surface={pathname}
    />
  );
}
