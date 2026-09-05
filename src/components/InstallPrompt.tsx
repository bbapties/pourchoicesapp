"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import InstallSheet from "@/components/InstallSheet";
import { logEvent } from "@/lib/events";
import { detectPlatform, hasDismissedInstall, isInstalledOnDevice, isStandalone } from "@/lib/pwa";
import { getDeferredPrompt, subscribeToInstallState } from "@/lib/installPromptStore";

/**
 * Decides WHEN to ask, on first visit (Phase 10 C3). The sheet itself is `InstallSheet`.
 *
 * WHY IT ASKS BEFORE SIGNUP. If a tester signs up in Safari and installs afterwards, the installed
 * app opens in its own storage partition with no session -- so their first act inside the "app" is
 * logging in again. Installing first means the account they create belongs to the thing on their
 * home screen.
 *
 * Mounted from the root layout so `installPromptStore` is imported (and therefore listening for
 * `beforeinstallprompt`) as early as possible. It only ever surfaces on the login route.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const onLoginRoute = pathname === "/";

  useEffect(() => {
    if (!onLoginRoute) return;
    // Running inside the installed app, or already told us no: never ask.
    if (isStandalone() || hasDismissedInstall()) return;

    const platform = detectPlatform();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const show = () => {
      if (cancelled) return;
      setOpen(true);
      logEvent({ eventType: "pwa_prompt_shown", surface: "/", metadata: { platform } });
    };

    // Already on the device, just being browsed in Chrome? `display-mode` cannot see that, so ask
    // the platform. Without this an installed user is prompted to install on every first visit.
    isInstalledOnDevice().then((installed) => {
      if (cancelled || installed) return;

      // Android: only ask once Chrome confirms it is installable. The event may ALREADY have fired
      // and be sitting in the store, so check before subscribing.
      if (getDeferredPrompt()) {
        show();
        return;
      }
      unsubscribe = subscribeToInstallState(() => {
        if (getDeferredPrompt()) show();
      });

      // iOS can never fire that event, so fall back to a short delay -- long enough that the 1.5s
      // splash has settled and we are not talking over the first impression.
      if (platform === "ios" || platform === "in-app-browser") {
        timer = setTimeout(show, 2500);
      }
    });

    const onInstalled = () => {
      setOpen(false);
      logEvent({ eventType: "pwa_installed", surface: "/", metadata: { platform } });
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      cancelled = true;
      window.removeEventListener("appinstalled", onInstalled);
      if (unsubscribe) unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [onLoginRoute]);

  if (!onLoginRoute) return null;

  return <InstallSheet open={open} onOpenChange={setOpen} surface="/" />;
}
