"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  created_at: string;
  bottleCount: number;
  sessionCount: number;
};

export default function UsersTab({ currentPublicUserId }: { currentPublicUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmFor, setConfirmFor] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);

    const [usersRes, bottlesRes, sessionsRes] = await Promise.all([
      supabase.from("users").select("id, username, email, role, created_at"),
      supabase.from("user_bottles").select("user_id"),
      supabase.from("tasting_sessions").select("user_id"),
    ]);

    if (usersRes.error) {
      toast.error(`Failed to load users: ${usersRes.error.message}`);
      setLoading(false);
      return;
    }

    const bottleCounts = new Map<string, number>();
    (bottlesRes.data || []).forEach((r) => {
      bottleCounts.set(r.user_id, (bottleCounts.get(r.user_id) || 0) + 1);
    });
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
      bottleCount: bottleCounts.get(u.id) || 0,
      sessionCount: sessionCounts.get(u.id) || 0,
    }));

    merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
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
    return <div className="text-sm text-gray-500">Loading users…</div>;
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search username or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-charcoal rounded px-3 py-2 text-sm bg-white"
      />

      <div className="text-xs text-gray-500">
        {filtered.length} of {users.length} users
      </div>

      <ul className="divide-y divide-gray-200 border border-gray-200 rounded bg-white">
        {filtered.map((u) => {
          const isSelf = u.id === currentPublicUserId;
          return (
            <li key={u.id} className="px-3 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-charcoal truncate">{u.username}</span>
                  {u.role === "admin" && (
                    <span className="text-[10px] uppercase tracking-wide bg-charcoal text-white px-1.5 py-0.5 rounded">
                      admin
                    </span>
                  )}
                  {isSelf && (
                    <span className="text-[10px] uppercase tracking-wide bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                      you
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">{u.email}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {u.bottleCount} bottles · {u.sessionCount} sessions · joined{" "}
                  {new Date(u.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                disabled={isSelf}
                onClick={() => openConfirm(u)}
                className="text-xs px-3 py-1.5 border border-red-600 text-red-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-gray-400">No users match.</li>
        )}
      </ul>

      {confirmFor && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeConfirm}
        >
          <div
            className="bg-white rounded-lg w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-semibold text-charcoal">Delete user</h2>
              <p className="text-sm text-gray-600 mt-1">
                This will permanently remove <span className="font-semibold">{confirmFor.username}</span>,
                their {confirmFor.bottleCount} bottles in My Bar, {confirmFor.sessionCount} tasting sessions,
                and their auth record. This cannot be undone.
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-600">
                Type <span className="font-mono">{confirmFor.username}</span> to confirm
              </label>
              <input
                autoFocus
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full border border-charcoal rounded px-3 py-2 text-sm mt-1"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={closeConfirm}
                disabled={deleting}
                className="px-3 py-2 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!confirmMatches || deleting}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded disabled:opacity-40"
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
