"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  created_at: string;
  avatar_url: string | null;
  bottleCount: number;
  sessionCount: number;
  /** null = notifications not enabled at all; a number = enabled, with this many registered devices. */
  pushDevices: number | null;
  /** newest page_view (admin_last_seen) - "is this person even opening the app" (Brian, 2026-09-21) */
  lastSeen: string | null;
  pageViews: number;
};

/** "2m ago" / "3h ago" / "5d ago", with the exact stamp in the title. */
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function UsersTab({ currentPublicUserId }: { currentPublicUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmFor, setConfirmFor] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);

    // Push reachability comes from /api/admin/push-recipients, not a client query: RLS gives an
    // admin no read on other users' push_subscriptions rows, so counting them here would report
    // every other user as 0 devices (B-59). The route returns only users with notify_push = true,
    // which is exactly the distinction the bell draws -- absent means "not enabled".
    const [usersRes, bottlesRes, sessionsRes, pushRes, seenRes] = await Promise.all([
      supabase.from("users").select("id, username, email, role, created_at, avatar_url"),
      // #7: one row per variant since the per-variant re-key, and tasting-only rows (times_had 0,
      // nothing owned) are bookkeeping, not a bottle in My Bar. Count distinct bottles a person
      // actually owns or has had, which is what "N bottles" and the delete warning both mean.
      supabase.from("user_bottles").select("user_id, bottle_id, currently_owned, times_had"),
      supabase.from("tasting_sessions").select("user_id"),
      fetch("/api/admin/push-recipients")
        .then((r) => (r.ok ? r.json() : { recipients: [] }))
        .catch(() => ({ recipients: [] })),
      supabase.rpc("admin_last_seen"), // newest page_view per person; RLS makes it admin-only
    ]);

    if (usersRes.error) {
      toast.error(`Failed to load users: ${usersRes.error.message}`);
      setLoading(false);
      return;
    }

    const bottlesByUser = new Map<string, Set<string>>();
    (bottlesRes.data || []).forEach((r) => {
      if (!r.currently_owned && (r.times_had ?? 0) < 1) return;
      if (!bottlesByUser.has(r.user_id)) bottlesByUser.set(r.user_id, new Set());
      bottlesByUser.get(r.user_id)!.add(r.bottle_id);
    });
    const bottleCounts = new Map<string, number>();
    bottlesByUser.forEach((set, userId) => bottleCounts.set(userId, set.size));
    const pushDevices = new Map<string, number>();
    ((pushRes as { recipients?: { id: string; devices: number }[] }).recipients ?? []).forEach((r) =>
      pushDevices.set(r.id, r.devices)
    );

    const lastSeen = new Map<string, { at: string; n: number }>();
    ((seenRes.data as { user_id: string; last_seen: string; page_views: number }[] | null) || []).forEach((r) =>
      lastSeen.set(r.user_id, { at: r.last_seen, n: Number(r.page_views) })
    );

    const sessionCounts = new Map<string, number>();
    (sessionsRes.data || []).forEach((r) => {
      sessionCounts.set(r.user_id, (sessionCounts.get(r.user_id) || 0) + 1);
    });

    const merged: AdminUser[] = (usersRes.data || []).map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role ?? "user",
      created_at: u.created_at,
      avatar_url: u.avatar_url ?? null,
      bottleCount: bottleCounts.get(u.id) || 0,
      sessionCount: sessionCounts.get(u.id) || 0,
      pushDevices: pushDevices.has(u.id) ? pushDevices.get(u.id)! : null,
      lastSeen: lastSeen.get(u.id)?.at ?? null,
      pageViews: lastSeen.get(u.id)?.n ?? 0,
    }));

    // most recently seen first - the list doubles as "who is opening the app"
    merged.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") || (a.created_at < b.created_at ? 1 : -1));
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  const openConfirm = (u: AdminUser) => {
    setConfirmFor(u);
    setConfirmText("");
  };

  const closeConfirm = () => {
    if (deleting) return;
    setConfirmFor(null);
    setConfirmText("");
  };

  const confirmMatches = confirmFor && confirmText === confirmFor.username;

  const handleDelete = async () => {
    if (!confirmFor || !confirmMatches) return;
    setDeleting(true);

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPublicUserId: confirmFor.id }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(body.error || "Delete failed");
      setDeleting(false);
      return;
    }

    toast.success(`Deleted ${confirmFor.username}`);
    setConfirmFor(null);
    setConfirmText("");
    setDeleting(false);
    load();
  };

  if (loading) {
    return <div className="text-sm text-cream-mute">Loading users…</div>;
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search username or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-brass-line rounded px-3 py-2 text-sm bg-panel"
      />

      <div className="text-xs text-cream-mute">
        {filtered.length} of {users.length} users
      </div>

      <ul className="divide-y divide-edge border border-edge rounded bg-panel">
        {filtered.map((u) => {
          const isSelf = u.id === currentPublicUserId;
          return (
            <li key={u.id} className="px-3 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {/* the name jumps to their page (Brian, 2026-09-21) */}
                  <Link href={`/u/${encodeURIComponent(u.username)}`} className="font-semibold text-sm text-cream truncate underline underline-offset-2 decoration-brass-line hover:decoration-brass-hi">
                    {u.username}
                  </Link>
                  {u.role === "admin" && (
                    <span className="text-[10px] uppercase tracking-wide pc-brass bg-brass text-engrave px-1.5 py-0.5 rounded">
                      admin
                    </span>
                  )}
                  {isSelf && (
                    <span className="text-[10px] uppercase tracking-wide bg-panel-3 text-cream px-1.5 py-0.5 rounded">
                      you
                    </span>
                  )}
                  {/*
                    Notification state at a glance (#65). Three distinct states, because the
                    difference between them is the whole bug: a filled bell is genuinely
                    reachable, a struck-through bell wants notifications but has no registered
                    device (their Profile used to claim "On" anyway), and no bell means they
                    never turned them on.
                  */}
                  {u.pushDevices !== null &&
                    (u.pushDevices > 0 ? (
                      <span
                        className="flex items-center gap-0.5 text-cream"
                        title={`Notifications on — ${u.pushDevices} device${u.pushDevices === 1 ? "" : "s"}`}
                        aria-label={`Notifications on, ${u.pushDevices} device${u.pushDevices === 1 ? "" : "s"}`}
                      >
                        <Bell className="w-3.5 h-3.5" fill="currentColor" strokeWidth={1.5} />
                        {u.pushDevices > 1 && (
                          <span className="text-[10px] tabular-nums">{u.pushDevices}</span>
                        )}
                      </span>
                    ) : (
                      <span
                        className="text-cream-faint"
                        title="Notifications enabled, but no registered device — they cannot receive one"
                        aria-label="Notifications enabled but unreachable"
                      >
                        <BellOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </span>
                    ))}
                </div>
                <div className="text-xs text-cream-mute truncate">{u.email}</div>
                <div className="text-xs text-cream-faint mt-1">
                  {u.bottleCount} bottles · {u.sessionCount} sessions · joined{" "}
                  {new Date(u.created_at).toLocaleDateString()}
                </div>
                <div className="text-xs mt-0.5">
                  {u.lastSeen ? (
                    <span className="text-cream-mute" title={new Date(u.lastSeen).toLocaleString()}>
                      Last seen {ago(u.lastSeen)} · {new Date(u.lastSeen).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {u.pageViews} views
                    </span>
                  ) : (
                    <span className="text-cream-faint">Never opened the app</span>
                  )}
                </div>
              </div>
              {u.avatar_url && (
                <button
                  onClick={async () => {
                    const res = await fetch("/api/admin/reset-avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetPublicUserId: u.id }) });
                    if (!res.ok) { toast.error("Couldn't reset the avatar"); return; }
                    toast.success(`Avatar reset for ${u.username}`);
                    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, avatar_url: null } : x)));
                  }}
                  className="text-xs px-3 py-1.5 border border-edge text-cream rounded mr-2"
                  title="Clear their photo; the initials disc takes over"
                >
                  Reset avatar
                </button>
              )}
              <button
                disabled={isSelf}
                onClick={() => openConfirm(u)}
                className="text-xs px-3 py-1.5 border border-red-600 text-red-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-cream-faint">No users match.</li>
        )}
      </ul>

      {confirmFor && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeConfirm}
        >
          <div
            className="bg-panel rounded-lg w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-semibold text-cream">Delete user</h2>
              <p className="text-sm text-cream-mute mt-1">
                This will permanently remove <span className="font-semibold">{confirmFor.username}</span>,
                their {confirmFor.bottleCount} bottles in My Bar, {confirmFor.sessionCount} tasting sessions,
                and their auth record. This cannot be undone.
              </p>
            </div>

            <div>
              <label className="text-xs text-cream-mute">
                Type <span className="font-mono">{confirmFor.username}</span> to confirm
              </label>
              <input
                autoFocus
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full border border-brass-line rounded px-3 py-2 text-sm mt-1"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={closeConfirm}
                disabled={deleting}
                className="px-3 py-2 text-sm text-cream-mute"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!confirmMatches || deleting}
                className="px-3 py-2 text-sm bg-red-600 text-cream rounded disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
