"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import { COACH_CATALOG } from "@/lib/coaches";
import {
  fetchAllAnnouncements,
  createAnnouncement,
  setPublished,
  deleteAnnouncement,
  type Announcement,
} from "@/lib/announcements";

/**
 * Admin -> send a push notification (Phase 10 D3).
 *
 * The actual send happens in /api/admin/send-push, because the VAPID private key must never reach
 * a browser. This screen only composes and reports.
 */

type Recipient = { id: string; username: string; devices: number };

/**
 * Admin > Notify. Two ways to reach people, deliberately on one screen:
 *   - Push, delivered to a device (Phase 10 D3)
 *   - What's new, shown inside the app on next open (Phase 10 D1)
 * They answer the same question -- "tell the testers something" -- and pairing them makes
 * "publish it AND push it" one action instead of two screens.
 *
 * The push send itself happens in /api/admin/send-push; the VAPID private key must never reach a
 * browser. That route derives the acting admin from the validated session, which is why this
 * component takes no publicUserId prop for pushing.
 */
export default function NotifyTab({ publicUserId }: { publicUserId: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/mybar");
  const [audience, setAudience] = useState<"everyone" | "user">("everyone");
  const [targetUserId, setTargetUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [history, setHistory] = useState<
    { id: string; title: string; body: string; audience: string; sent_count: number; failed_count: number; created_at: string }[]
  >([]);

  // --- What's new (D1) ---
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annCoachId, setAnnCoachId] = useState("");
  const [annAudience, setAnnAudience] = useState<Announcement["audience"]>("all");
  const [annBusy, setAnnBusy] = useState(false);

  const loadAnns = useCallback(async () => setAnns(await fetchAllAnnouncements()), []);

  const handleCreateAnnouncement = async () => {
    if (!annTitle.trim() || !annBody.trim()) {
      toast.error("Title and body are both required.");
      return;
    }
    setAnnBusy(true);
    const { error } = await createAnnouncement({
      title: annTitle,
      body: annBody,
      coachId: annCoachId || null,
      audience: annAudience,
      createdBy: publicUserId,
    });
    setAnnBusy(false);
    if (error) { toast.error(error); return; }
    // Created as a DRAFT on purpose -- publishing is a second, deliberate click.
    toast.success("Saved as a draft.");
    setAnnTitle(""); setAnnBody(""); setAnnCoachId("");
    loadAnns();
  };

  const handleTogglePublish = async (a: Announcement) => {
    const { error } = await setPublished(a.id, !a.published);
    if (error) { toast.error(error); return; }
    toast.success(a.published ? "Unpublished." : "Published - testers see it on next open.");
    logEvent({ eventType: "whatsnew_publish", surface: "admin_notify", metadata: { id: a.id, published: !a.published } });
    loadAnns();
  };

  const handleDeleteAnnouncement = async (a: Announcement) => {
    const { error } = await deleteAnnouncement(a.id);
    if (error) { toast.error(error); return; }
    toast.success("Deleted.");
    loadAnns();
  };

  const load = useCallback(async () => {
    // Who can actually receive one? A user with no subscribed device cannot, and saying so up
    // front beats sending into the void and reading "0 sent".
    const [{ data: subs }, { data: users }, { data: sent }] = await Promise.all([
      supabase.from("push_subscriptions").select("user_id"),
      supabase.from("users").select("id, username, notify_push"),
      supabase
        .from("notifications")
        .select("id, title, body, audience, sent_count, failed_count, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const counts = new Map<string, number>();
    (subs ?? []).forEach((s: { user_id: string }) =>
      counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1)
    );
    setRecipients(
      (users ?? [])
        .filter((u: { notify_push: boolean }) => u.notify_push)
        .map((u: { id: string; username: string }) => ({
          id: u.id,
          username: u.username,
          devices: counts.get(u.id) ?? 0,
        }))
        .sort((a, b) => b.devices - a.devices || a.username.localeCompare(b.username))
    );
    setHistory(sent ?? []);
  }, []);

  useEffect(() => { load(); loadAnns(); }, [load, loadAnns]);

  const reachable = recipients.filter((r) => r.devices > 0);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message are both required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/mybar",
          audience,
          targetUserId: audience === "user" ? targetUserId : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Send failed");
        return;
      }
      toast.success(
        json.sent
          ? `Sent to ${json.sent} device${json.sent === 1 ? "" : "s"}${json.failed ? `, ${json.failed} failed` : ""}.`
          : json.note ?? "No devices matched."
      );
      logEvent({
        eventType: "push_send",
        surface: "admin_notify",
        metadata: { audience, sent: json.sent, failed: json.failed },
      });
      setTitle("");
      setBody("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-gray-400 rounded p-4 space-y-3 bg-white">
        <h2 className="font-semibold">Send a notification</h2>

        <p className="text-xs text-gray-600">
          {reachable.length} of {recipients.length} user{recipients.length === 1 ? "" : "s"} can
          receive one right now.{" "}
          {reachable.length === 0 && "Nobody has granted permission on a device yet."}
        </p>

        <label className="block text-sm">
          <span className="text-gray-700">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="New bottles added"
            className="mt-1 w-full border border-gray-400 rounded px-2 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-700">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="Twelve new bourbons are in the catalog — come rate them."
            className="mt-1 w-full border border-gray-400 rounded px-2 py-2 text-sm"
          />
          <span className="text-xs text-gray-500">{body.length}/200</span>
        </label>

        <label className="block text-sm">
          <span className="text-gray-700">Opens</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/mybar"
            className="mt-1 w-full border border-gray-400 rounded px-2 py-2 text-sm font-mono"
          />
          <span className="text-xs text-gray-500">
            An in-app path, e.g. <code>/search</code> or <code>/social</code>. Must start with /.
          </span>
        </label>

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setAudience("everyone")}
            className={`flex-1 py-2 rounded border ${audience === "everyone" ? "bg-gray-900 text-white border-gray-900" : "border-gray-400"}`}
          >
            Everyone
          </button>
          <button
            type="button"
            onClick={() => setAudience("user")}
            className={`flex-1 py-2 rounded border ${audience === "user" ? "bg-gray-900 text-white border-gray-900" : "border-gray-400"}`}
          >
            One user
          </button>
        </div>

        {audience === "user" && (
          <select
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            className="w-full border border-gray-400 rounded px-2 py-2 text-sm"
          >
            <option value="">Pick a user…</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id} disabled={r.devices === 0}>
                {r.username} {r.devices === 0 ? "(no devices)" : `(${r.devices})`}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          disabled={sending}
          onClick={handleSend}
          className="w-full py-3 rounded bg-gray-900 text-white font-semibold disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="border border-gray-400 rounded p-4 space-y-3 bg-white">
        <h2 className="font-semibold">What&apos;s new</h2>
        <p className="text-xs text-gray-600">
          Shown inside the app on a tester&apos;s next open. Nothing appears until you publish it,
          which is why the digest can no longer dump the whole changelog on a new user.
        </p>

        <input
          value={annTitle}
          onChange={(e) => setAnnTitle(e.target.value)}
          maxLength={120}
          placeholder="Blind tastings are live"
          className="w-full border border-gray-400 rounded px-2 py-2 text-sm"
        />
        <textarea
          value={annBody}
          onChange={(e) => setAnnBody(e.target.value)}
          maxLength={400}
          rows={2}
          placeholder="Pick 2-6 bottles, rank them blind, and see how they really stack up."
          className="w-full border border-gray-400 rounded px-2 py-2 text-sm"
        />

        <div className="flex gap-2">
          <select
            value={annCoachId}
            onChange={(e) => setAnnCoachId(e.target.value)}
            className="flex-1 border border-gray-400 rounded px-2 py-2 text-sm"
          >
            <option value="">No walkthrough</option>
            {COACH_CATALOG.filter((c) => c.tour.length > 0).map((c) => (
              <option key={c.id} value={c.id}>Show me: {c.title}</option>
            ))}
          </select>
          <select
            value={annAudience}
            onChange={(e) => setAnnAudience(e.target.value as Announcement["audience"])}
            className="flex-1 border border-gray-400 rounded px-2 py-2 text-sm"
          >
            <option value="all">Everyone</option>
            <option value="new">New users only</option>
            <option value="existing">Existing users only</option>
          </select>
        </div>

        <button
          type="button"
          disabled={annBusy}
          onClick={handleCreateAnnouncement}
          className="w-full py-2 rounded border border-gray-500 text-sm font-medium disabled:opacity-50"
        >
          {annBusy ? "Saving…" : "Save as draft"}
        </button>

        {anns.length === 0 ? (
          <p className="text-sm text-gray-600">Nothing written yet.</p>
        ) : (
          <ul className="space-y-2 text-sm pt-1">
            {anns.map((a) => (
              <li key={a.id} className="border-t border-gray-200 pt-2 first:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {a.title}{" "}
                      <span className={a.published ? "text-xs text-green-700" : "text-xs text-gray-500"}>
                        {a.published ? "· published" : "· draft"}
                      </span>
                    </div>
                    <div className="text-gray-600">{a.body}</div>
                    <div className="text-xs text-gray-500">
                      {a.audience === "all" ? "everyone" : a.audience + " only"}
                      {a.coachId ? ` · walkthrough: ${a.coachId}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePublish(a)}
                      className="text-xs px-2 py-1 border border-gray-500 rounded"
                    >
                      {a.published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnouncement(a)}
                      className="text-xs px-2 py-1 border border-gray-400 rounded text-gray-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border border-gray-400 rounded p-4 bg-white">
        <h2 className="font-semibold mb-2">Recently sent</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-600">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((n) => (
              <li key={n.id} className="border-b border-gray-200 pb-2 last:border-0">
                <div className="font-medium">{n.title}</div>
                <div className="text-gray-600">{n.body}</div>
                <div className="text-xs text-gray-500">
                  {new Date(n.created_at).toLocaleString()} · {n.audience} · {n.sent_count} sent
                  {n.failed_count ? `, ${n.failed_count} failed` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
