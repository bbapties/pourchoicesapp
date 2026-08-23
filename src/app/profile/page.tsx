"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Toaster } from "@/components/ui/sonner";
import FeedbackSheet from "@/components/FeedbackSheet";
import { updateUsername, resetCoaches, fetchEmail, USERNAME_MAX } from "@/lib/profile";
import { logClick } from "@/lib/events";

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

      <FeedbackSheet
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        userId={publicUserId}
      />

      <Toaster position="top-center" />
    </div>
  );
}
