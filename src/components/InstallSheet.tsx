"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { logEvent } from "@/lib/events";
import {
  detectPlatform,
  isInstalledOnDevice,
  isIOSNonSafari,
  rememberDismissedInstall,
  type Platform,
} from "@/lib/pwa";
import {
  consumeDeferredPrompt,
  getDeferredPrompt,
  subscribeToInstallState,
} from "@/lib/installPromptStore";

/**
 * The install sheet (Phase 10 C3) -- presentational, opened by a caller.
 *
 * It reads the deferred `beforeinstallprompt` from a module-level store rather than listening
 * itself. Chrome fires that event once and early; a listener attached on mount routinely misses it,
 * which is what previously left Android users looking at manual instructions instead of a button.
 *
 * Four states, because they need genuinely different answers:
 *   ready      Android with a live prompt -> one tap, we do it for them
 *   installed  already on the device -> do NOT teach installing; Chrome will refuse anyway
 *   ios        no programmatic install exists, so the instructions ARE the feature
 *   manual     Android/desktop with no prompt available, or an in-app browser
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
  const [iosOffSafari, setIosOffSafari] = useState(false);
  const [installed, setInstalled] = useState(false);
  // Re-render whenever Chrome hands us (or takes away) a prompt.
  const deferred = useSyncExternalStore(
    subscribeToInstallState,
    getDeferredPrompt,
    () => null // server snapshot
  );

  useEffect(() => {
    setPlatform(detectPlatform());
    setIosOffSafari(isIOSNonSafari());
    if (!open) return;
    // Re-check on every open: they may have installed since the sheet last rendered.
    let cancelled = false;
    isInstalledOnDevice().then((v) => { if (!cancelled) setInstalled(v); });
    return () => { cancelled = true; };
  }, [open]);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    logEvent({ eventType: "pwa_install_clicked", surface, metadata: { platform } });
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    logEvent({ eventType: "pwa_install_choice", surface, metadata: { outcome } });
    consumeDeferredPrompt(); // single-use; Chrome issues a fresh one if they stay eligible
    onOpenChange(false);
    if (outcome === "dismissed") rememberDismissedInstall();
  }, [deferred, onOpenChange, platform, surface]);

  const handleDismiss = useCallback(() => {
    rememberDismissedInstall();
    onOpenChange(false);
    logEvent({ eventType: "pwa_continue_browser", surface, metadata: { platform, installed } });
  }, [installed, onOpenChange, platform, surface]);

  const canPromptDirectly = !!deferred && !installed;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <SheetContent side="bottom" className="bg-white text-gray-900 rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left text-lg">
            {installed ? "You already have it" : "Install Pour Choices"}
          </SheetTitle>
          <SheetDescription className="text-left">
            {installed
              ? "Pour Choices is already installed on this device. Open it from your home screen or app drawer."
              : platform === "in-app-browser"
                ? "Open this page in Chrome or Safari to install it."
                : "Add it to your home screen so it opens like an app, full screen and one tap away."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 pt-2 space-y-4">
          {/* ALREADY INSTALLED. Chrome refuses to offer an install for an app it has already
              installed, so showing "tap the menu, add to home screen" here is advice that cannot
              work. The one thing people actually want in this state is the icon fixed. */}
          {installed && (
            <div className="text-sm text-gray-700 space-y-3">
              <p className="font-medium text-gray-900">Icon looking wrong or out of date?</p>
              <p>
                Android copies the app icon when you install, and doesn&apos;t always pick up a new
                one. To refresh it, remove the old copy and install again:
              </p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Long-press the Pour Choices icon and choose <span className="font-semibold">Uninstall</span>.</li>
                <li>Come back here and tap <span className="font-semibold">Install the app</span> again.</li>
              </ol>
            </div>
          )}

          {/* ONE TAP -- the real thing, when Chrome has given us a prompt to fire. */}
          {canPromptDirectly && (
            <button
              onClick={handleInstall}
              className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl"
              style={{ minHeight: "44px" }}
            >
              Install now
            </button>
          )}

          {!installed && platform === "ios" && iosOffSafari && (
            // Chrome/Firefox/Edge on iOS are WebKit but put Share elsewhere, and older versions hide
            // Add to Home Screen entirely. Safari is the one reliable route.
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                Adding to the home screen only works properly from{" "}
                <span className="font-semibold">Safari</span> on iPhone.
              </p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Open <span className="font-semibold">www.pourchoicesapp.com</span> in Safari.</li>
                <li>
                  Tap <span className="font-semibold">Share</span>, then{" "}
                  <span className="font-semibold">Add to Home Screen</span>.
                </li>
              </ol>
            </div>
          )}

          {!installed && platform === "ios" && !iosOffSafari && (
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>
                Tap the <span className="font-semibold">Share</span> button at the bottom of Safari
                <span className="text-gray-500"> (the square with an arrow)</span>.
              </li>
              <li>Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.</li>
              <li>Tap <span className="font-semibold">Add</span>.</li>
            </ol>
          )}

          {!installed && platform === "in-app-browser" && (
            <p className="text-sm text-gray-700">
              You are in an app&apos;s built-in browser, which can&apos;t install apps. Tap the menu
              and choose <span className="font-semibold">Open in browser</span>, then try again.
            </p>
          )}

          {/* Android/desktop with no live prompt. Chrome only offers one when it decides the app is
              installable, so this is the honest fallback rather than a button that does nothing. */}
          {!installed && !canPromptDirectly && (platform === "android" || platform === "desktop") && (
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                {platform === "android"
                  ? "Chrome hasn't offered a one-tap install yet. You can add it from the menu:"
                  : "Pour Choices is built for your phone — open www.pourchoicesapp.com there. On this computer you can still add it:"}
              </p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>
                  Tap the <span className="font-semibold">&#8942;</span> menu
                  {platform === "android" ? " at the top right of Chrome" : " in your browser"}.
                </li>
                <li>
                  Choose <span className="font-semibold">Add to Home screen</span> or{" "}
                  <span className="font-semibold">Install app</span>.
                </li>
              </ol>
            </div>
          )}

          <button
            onClick={handleDismiss}
            className="w-full py-3 text-gray-600 font-medium rounded-xl border border-gray-300"
            style={{ minHeight: "44px" }}
          >
            {installed ? "Got it" : canPromptDirectly ? "Continue in browser" : "Not now"}
          </button>

          {!installed && surface !== "/profile" && (
            <p className="text-xs text-gray-500 text-center">You can install later from Profile.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
