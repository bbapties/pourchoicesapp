"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Toaster } from "@/components/ui/sonner";
import FeedbackSheet from "@/components/FeedbackSheet";
import { updateUsername, resetCoaches, fetchEmail, USERNAME_MAX } from "@/lib/profile";
import { clearDismissedInstall, isStandalone } from "@/lib/pwa";
import { FORCE_REPLAY_KEY } from "@/lib/coaches";
import InstallSheet from "@/components/InstallSheet";
import NotificationSheet from "@/components/NotificationSheet";
import { checkPushSupport, disablePush, permissionState } from "@/lib/pushNotifications";
import { logClick, logEvent } from "@/lib/events";

export default function ProfilePage() {
  const router = useRouter();
  const { publicUserId, username, loading } = useCurrentUser();

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Hidden only when running INSIDE the installed app -- offering "install" in there is the kind of
  // detail that makes an app feel unfinished. In a browser tab the row stays, even if the app is
  // installed on the device, because that is where the sheet explains how to refresh a stale icon.
  const [installed, setInstalled] = useState(false);
  useEffect(() => { setInstalled(isStandalone()); }, []);

  /**
   * Re-offer the install prompt. C3 remembers "continue in browser" so it does not nag; this is the
   * documented way back in. The sheet opens HERE rather than routing to the login screen, because a
   * signed-in user sent to "/" is redirected to /mybar and would never see it.
   */
  const [installOpen, setInstallOpen] = useState(false);

  // Notifications. Three independent facts decide what this row says: the OS permission (one-shot,
  // see pushNotifications.ts), whether push is usable in this context at all (iPhone Safari tabs
  // cannot), and the user's stored preference.
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [pushBlocked, setPushBlocked] = useState(false);

  useEffect(() => {
    setPushBlocked(permissionState() === "denied");
    if (!publicUserId) return;
    let cancelled = false;
    supabase
      .from("users")
      .select("notify_push")
      .eq("id", publicUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // "On" means BOTH: they want it and the browser actually granted it. Showing a toggle as on
        // while the OS blocks delivery would be a lie.
        setNotifyOn(!!data?.notify_push && permissionState() === "granted");
      });
    return () => { cancelled = true; };
  }, [publicUserId]);

  const handleToggleNotifications = async () => {
    if (!publicUserId) return;
    if (notifyOn) {
      setNotifyBusy(true);
      const res = await disablePush(publicUserId);
      setNotifyBusy(false);
      if (res.ok) { setNotifyOn(false); toast.success("Notifications turned off."); }
      else toast.error("Couldn't turn notifications off.");
      return;
    }
    // Turning ON always goes through the sheet: it owns the permission request, the blocked-state
    // explanation, and the iPhone "install first" case.
    setNotifyOpen(true);
  };
  const handleInstallAgain = () => {
    clearDismissedInstall();
    logEvent({ eventType: "pwa_install_reopened", surface: "/profile" });
    setInstallOpen(true);
  };

  // Seed display name once the user resolves.
  useEffect(() => {
    if (username != null) setDisplayName(username);
  }, [username]);

  // Load the account email.
  useEffect(() => {
    if (!publicUserId) return;
    fetchEmail(publicUserId).then(setEmail);
  }, [publicUserId]);

  const startEdit = () => {
    setDraft(displayName);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
  };

  const saveEdit = async () => {
    if (!publicUserId) return;
    if (draft.trim() === displayName) { setEditing(false); return; }
    setSaving(true);
    const { error } = await updateUsername({ userId: publicUserId, username: draft });
    setSaving(false);
    if (error) { toast.error(error); return; }
    setDisplayName(draft.trim());
    setEditing(false);
    logClick("username_saved", { userId: publicUserId, surface: "/profile" });
    toast.success("Username updated.");
  };

  const handleReplayTutorial = async () => {
    if (!publicUserId) return;
    setResetting(true);
    const { error } = await resetCoaches(publicUserId);
    if (error) { setResetting(false); toast.error(error); return; }
    logClick("replay_tutorial", { userId: publicUserId, surface: "/profile" });
    // The automatic coach behaviours are currently off (coaches.ts AUTO_COACHES_ENABLED), so an
    // explicit replay has to say so. CoachHost consumes this once on its next mount.
    try { sessionStorage.setItem(FORCE_REPLAY_KEY, "1"); } catch { /* private mode: replay just no-ops */ }
    // Full reload so CoachHost re-runs the core tour from a clean mount.
    window.location.assign("/search");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 text-charcoal">
      <h1 className="text-xl font-semibold mb-6">Profile</h1>

      {/* Username */}
      <div className="border border-gray-300 rounded p-4 mb-3">
        <div className="text-xs text-gray-500 mb-1">Username</div>
        {editing ? (
          <div>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={USERNAME_MAX}
              autoFocus
              className="w-full border border-gray-400 rounded px-3 py-2 text-sm text-black"
              placeholder="Your username"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              3–{USERNAME_MAX} characters · letters, numbers, - and _
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveEdit}
                className="px-3 py-1.5 text-sm rounded bg-gray-900 text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={cancelEdit}
                className="px-3 py-1.5 text-sm rounded border border-gray-400 bg-white text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-black truncate">
              {loading ? "…" : displayName || "—"}
            </span>
            <button
              type="button"
              onClick={startEdit}
              className="text-xs px-2 py-1 rounded border border-gray-400 bg-white text-gray-700 shrink-0"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Email (read-only) */}
      <div className="border border-gray-300 rounded p-4 mb-6">
        <div className="text-xs text-gray-500 mb-1">Email</div>
        <span className="text-sm text-black break-words">{email ?? "—"}</span>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          type="button"
          disabled={resetting}
          onClick={handleReplayTutorial}
          className="w-full py-3 text-sm font-medium rounded border border-gray-400 bg-white text-gray-900 disabled:opacity-50"
          style={{ minHeight: "44px" }}
        >
          {resetting ? "Restarting…" : "Replay tutorial"}
        </button>

        <button
          type="button"
          data-coach="profile.notifications"
          disabled={notifyBusy}
          onClick={handleToggleNotifications}
          className="w-full py-3 text-sm font-medium rounded border border-gray-400 bg-white text-gray-900 disabled:opacity-50 flex items-center justify-between px-4"
          style={{ minHeight: "44px" }}
        >
          <span>Notifications</span>
          <span className="text-xs text-gray-600">
            {notifyBusy
              ? "…"
              : notifyOn
                ? "On"
                : pushBlocked
                  ? "Blocked in browser"
                  : checkPushSupport().supported
                    ? "Off"
                    : "Needs the app installed"}
          </span>
        </button>

        {!installed && (
          <button
            type="button"
            data-coach="profile.install"
            onClick={handleInstallAgain}
            className="w-full py-3 text-sm font-medium rounded border border-gray-400 bg-white text-gray-900"
            style={{ minHeight: "44px" }}
          >
            Install the app
          </button>
        )}

        <button
          type="button"
          data-coach="profile.feedback"
          onClick={() => setFeedbackOpen(true)}
          className="w-full py-3 text-sm font-medium rounded border border-gray-400 bg-white text-gray-900"
          style={{ minHeight: "44px" }}
        >
          Send Feedback / Report a Bug
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full py-3 text-sm font-semibold rounded bg-gray-900 text-white"
          style={{ minHeight: "44px" }}
        >
          Sign Out
        </button>
      </div>

      <NotificationSheet open={notifyOpen} onOpenChange={(o) => { setNotifyOpen(o); if (!o) setNotifyOn(permissionState() === "granted"); }} publicUserId={publicUserId} surface="/profile" showNeverAsk={false} />

      <InstallSheet open={installOpen} onOpenChange={setInstallOpen} surface="/profile" />

      <FeedbackSheet
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        userId={publicUserId}
      />

      <Toaster position="top-center" />
    </div>
  );
}
