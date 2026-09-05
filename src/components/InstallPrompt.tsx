"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import InstallSheet from "@/components/InstallSheet";
import { logEvent } from "@/lib/events";
import { detectPlatform, hasDismissedInstall, isStandalone } from "@/lib/pwa";

/**
 * Decides WHEN to ask, on first visit (Phase 10 C3). The sheet itself is `InstallSheet`.
 *
 * WHY IT ASKS BEFORE SIGNUP. If a tester signs up in Safari and installs afterwards, the installed
 * app opens in its own storage partition with no session -- so their first act inside the "app" is
 * logging in again. Installing first means the account they create belongs to the thing on their
 * home screen.
 *
 * Mounted from the root layout rather than the login page so the `beforeinstallprompt` listener is
 * attached before Chrome fires it; that event is easy to miss if you wait for a later screen to
 * render. It only ever surfaces on the login route.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const onLoginRoute = pathname === "/";

  useEffect(() => {
    if (!onLoginRoute) return;
    // Already installed, or they already said "continue in browser": never nag.
    if (isStandalone() || hasDismissedInstall()) return;

    const platform = detectPlatform();

    const show = () => {
      setOpen(true);
      logEvent({ eventType: "pwa_prompt_shown", surface: "/", metadata: { platform } });
    };

    // Android/Chrome: only ask once the browser confirms the app is actually installable.
    const onBeforeInstall = () => show();
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS can never fire that event, so fall back to a short delay -- long enough that the 1.5s
    // splash has settled and we are not talking over the first impression.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (platform === "ios" || platform === "in-app-browser") {
      timer = setTimeout(show, 2500);
    }

    // Installed by any route (including Chrome's own menu): stop asking.
    const onInstalled = () => {
      setOpen(false);
      logEvent({ eventType: "pwa_installed", surface: "/", metadata: { platform } });
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, [onLoginRoute]);

  if (!onLoginRoute) return null;

  return <InstallSheet open={open} onOpenChange={setOpen} surface="/" />;
}
