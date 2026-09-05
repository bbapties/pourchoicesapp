"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import { checkPushSupport, enablePush, permissionState } from "@/lib/pushNotifications";

/**
 * The notification ask (Phase 10 D3) -- our own sheet, NOT the OS dialog.
 *
 * THE POINT OF A SOFT ASK. `Notification.requestPermission()` opens the browser's dialog exactly
 * ONCE per origin, for all time. Deny it and there is no second chance: later calls resolve
 * "denied" with no prompt, and only the user can undo it in browser settings. So we ask in our own
 * UI first and only spend the real dialog when they tap "Turn them on". That is what makes it safe
 * to nudge repeatedly -- the thing being repeated is ours, and costs nothing.
 *
 * Three states worth distinguishing, because they need different words:
 *   default  -- never asked; the dialog is still available
 *   denied   -- already spent and refused; we CANNOT re-ask, only explain where the setting is
 *   ios-tab  -- iPhone outside an installed app, where the push APIs do not exist at all
 */
export default function NotificationSheet({
  open,
  onOpenChange,
  publicUserId,
  surface,
  showNeverAsk = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publicUserId: string | null;
  surface: string;
  /** The Profile control hides this: someone who opened it deliberately isn't being nagged. */
  showNeverAsk?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPermission(permissionState());
    const support = checkPushSupport();
    setIosNeedsInstall(!support.supported && support.reason === "ios-needs-install");
  }, [open]);

  const handleEnable = useCallback(async () => {
    if (!publicUserId) return;
    setBusy(true);
    const result = await enablePush(publicUserId);
    setBusy(false);
    setPermission(permissionState());

    if (result.ok) {
      toast.success("Notifications are on.");
      onOpenChange(false);
      return;
    }
    if (result.reason === "denied") {
      // Not a failure we can retry: the one dialog is spent. Leave the sheet open so the
      // "blocked" copy below explains where the setting now lives.
      toast.error("Notifications were blocked.");
      return;
    }
    if (result.reason === "ios-needs-install") {
      setIosNeedsInstall(true);
      return;
    }
    toast.error(
      result.reason === "no-key"
        ? "Notifications aren't configured yet."
        : "Couldn't turn notifications on."
    );
  }, [publicUserId, onOpenChange]);

  const handleNeverAsk = useCallback(async () => {
    if (publicUserId) {
      // Stored on the user, not in localStorage, so "never" survives a new device or a cleared
      // browser. It only stops the NUDGES; the Profile control still works.
      await supabase.from("users").update({ notify_prompt_optout: true }).eq("id", publicUserId);
    }
    logEvent({ eventType: "push_never_ask", surface });
    onOpenChange(false);
  }, [publicUserId, surface, onOpenChange]);

  const handleDismiss = useCallback(() => {
    logEvent({ eventType: "push_prompt_dismissed", surface, metadata: { permission } });
    onOpenChange(false);
  }, [onOpenChange, permission, surface]);

  const blocked = permission === "denied";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <SheetContent side="bottom" className="bg-white text-gray-900 rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left text-lg">
            {blocked ? "Notifications are blocked" : "Turn on notifications"}
          </SheetTitle>
          <SheetDescription className="text-left">
            {blocked
              ? "Your browser is blocking notifications for Pour Choices, so we can't ask again from here."
              : "Get told when there's something new worth opening the app for."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 pt-2 space-y-4">
          {/* iPhone outside an installed app: the push APIs genuinely do not exist, so an
              "allow" button would do nothing. Apple only supports push for installed PWAs. */}
          {iosNeedsInstall && !blocked && (
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                On iPhone, notifications only work once Pour Choices is on your{" "}
                <span className="font-semibold">home screen</span>.
              </p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>In Safari, tap <span className="font-semibold">Share</span>, then <span className="font-semibold">Add to Home Screen</span>.</li>
                <li>Open Pour Choices from the home screen.</li>
                <li>Come back to Profile and turn notifications on.</li>
              </ol>
            </div>
          )}

          {blocked && (
            <div className="text-sm text-gray-700 space-y-2">
              <p>To switch them back on:</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Tap the padlock or <span className="font-semibold">&#8942;</span> menu next to the address bar.</li>
                <li>Open <span className="font-semibold">Site settings</span> &rarr; <span className="font-semibold">Notifications</span>.</li>
                <li>Set it to <span className="font-semibold">Allow</span>, then reload.</li>
              </ol>
            </div>
          )}

          {!blocked && !iosNeedsInstall && (
            <button
              onClick={handleEnable}
              disabled={busy || !publicUserId}
              className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl disabled:opacity-50"
              style={{ minHeight: "44px" }}
            >
              {busy ? "Turning on…" : "Turn them on"}
            </button>
          )}

          <button
            onClick={handleDismiss}
            className="w-full py-3 text-gray-600 font-medium rounded-xl border border-gray-300"
            style={{ minHeight: "44px" }}
          >
            {blocked ? "Got it" : "Not now"}
          </button>

          {showNeverAsk && !blocked && (
            <button
              onClick={handleNeverAsk}
              className="w-full text-xs text-gray-500 underline underline-offset-2 py-2"
            >
              Don&apos;t ask me again
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
