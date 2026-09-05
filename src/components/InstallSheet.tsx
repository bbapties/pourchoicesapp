"use client";

import { useEffect, useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { logEvent } from "@/lib/events";
import {
  detectPlatform,
  rememberDismissedInstall,
  type BeforeInstallPromptEvent,
  type Platform,
} from "@/lib/pwa";

/**
 * The install sheet itself (Phase 10 C3) -- presentational, opened by a caller.
 *
 * Split out from `InstallPrompt` so the same sheet serves both entry points without duplicating the
 * platform copy: the automatic first-visit ask on the login screen, and Profile's "Install the app"
 * row. Profile needs its own instance because a signed-in user is never on `/` -- routing them
 * there just bounces them to /mybar, so the sheet has to open in place.
 *
 * Platform reality, not preference: only Android Chrome can install programmatically. iOS never
 * fires `beforeinstallprompt`, so the instructional steps ARE the feature there. In-app browsers
 * usually cannot install at all and their menus differ, so they are told to open a real browser
 * rather than taught steps that do not exist.
 */
export default function InstallSheet({
  open,
  onOpenChange,
  surface,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the sheet was opened from, for telemetry. */
  surface: string;
}) {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    // Chrome re-fires this on later navigations while the app is still installable, so listening
    // here (rather than only on first visit) is what makes the Profile entry point work on Android.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    logEvent({ eventType: "pwa_install_clicked", surface, metadata: { platform: "android" } });
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    logEvent({ eventType: "pwa_install_choice", surface, metadata: { outcome } });
    setDeferred(null); // single-use; Chrome issues a fresh one if they stay eligible
    onOpenChange(false);
    if (outcome === "dismissed") rememberDismissedInstall();
  }, [deferred, onOpenChange, surface]);

  const handleContinue = useCallback(() => {
    rememberDismissedInstall();
    onOpenChange(false);
    logEvent({ eventType: "pwa_continue_browser", surface, metadata: { platform } });
  }, [onOpenChange, platform, surface]);

  const canPromptDirectly = platform === "android" && !!deferred;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleContinue(); }}>
      <SheetContent side="bottom" className="bg-white text-gray-900 rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left text-lg">Install Pour Choices</SheetTitle>
          <SheetDescription className="text-left">
            {platform === "in-app-browser"
              ? "Open this page in Safari or Chrome to install it."
              : "Add it to your home screen so it opens like an app, full screen and one tap away."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 pt-2 space-y-4">
          {platform === "ios" && (
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>
                Tap the <span className="font-semibold">Share</span> button at the bottom of Safari
                <span className="text-gray-500"> (the square with an arrow)</span>.
              </li>
              <li>
                Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.
              </li>
              <li>
                Tap <span className="font-semibold">Add</span>.
              </li>
            </ol>
          )}

          {platform === "in-app-browser" && (
            <p className="text-sm text-gray-700">
              You are in an app&apos;s built-in browser, which can&apos;t install apps. Tap the menu
              and choose <span className="font-semibold">Open in browser</span>, then try again.
            </p>
          )}

          {platform === "android" && !canPromptDirectly && (
            // Chrome only fires `beforeinstallprompt` when it decides the app is installable, and
            // it fires once. Opening this sheet from Profile can easily land outside that window,
            // which would otherwise leave an Android user a sheet with no button and no way in.
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>
                Tap the <span className="font-semibold">&#8942;</span> menu at the top right of Chrome.
              </li>
              <li>
                Tap <span className="font-semibold">Add to Home screen</span> or{" "}
                <span className="font-semibold">Install app</span>.
              </li>
            </ol>
          )}

          {platform === "desktop" && !canPromptDirectly && (
            <p className="text-sm text-gray-700">
              Pour Choices is built for your phone. Open{" "}
              <span className="font-semibold">www.pourchoicesapp.com</span> there to install it.
            </p>
          )}

          {canPromptDirectly && (
            <button
              onClick={handleInstall}
              className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl"
              style={{ minHeight: "44px" }}
            >
              Install
            </button>
          )}

          <button
            onClick={handleContinue}
            className="w-full py-3 text-gray-600 font-medium rounded-xl border border-gray-300"
            style={{ minHeight: "44px" }}
          >
            {canPromptDirectly ? "Continue in browser" : "Not now"}
          </button>

          {surface !== "/profile" && (
            <p className="text-xs text-gray-500 text-center">You can install later from Profile.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
