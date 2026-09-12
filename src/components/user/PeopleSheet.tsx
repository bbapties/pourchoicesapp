"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import UserAvatar from "@/components/UserAvatar";
import { logClick } from "@/lib/events";
import {
  ALL_KINDS,
  fetchFollowers,
  fetchFollowing,
  fetchMuted,
  fetchMyGraph,
  follow,
  searchUsers,
  unfollow,
  unmute,
  type PersonRow,
} from "@/lib/relationships";

// One sheet for every list of people (#111): someone's followers, who they follow, my muted
// list, and username search. Each row is avatar · @name · one button (Follow / Following /
// Unmute); tapping the row opens their page.

export type PeopleMode = "followers" | "following" | "muted" | "search";

export default function PeopleSheet({ open, onOpenChange, mode, userId, viewerId, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PeopleMode;
  /** Whose list (followers / following). Ignored for muted / search, which are always mine. */
  userId?: string | null;
  viewerId: string | null;
  /** A follow / unfollow / unmute happened - counts behind the sheet may be stale. */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [q, setQ] = useState("");
  const [mine, setMine] = useState<{ following: Set<string>; muted: Set<string> }>({ following: new Set(), muted: new Set() });

  const title = mode === "followers" ? "Followers" : mode === "following" ? "Following" : mode === "muted" ? "Muted users" : "Find people";

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setQ("");
    let live = true;
    (async () => {
      if (viewerId) {
        const g = await fetchMyGraph(viewerId);
        if (live) setMine({ following: new Set(g.following), muted: new Set(g.muted) });
      }
      let list: PersonRow[] = [];
      if (mode === "followers" && userId) list = await fetchFollowers(userId);
      else if (mode === "following" && userId) list = await fetchFollowing(userId);
      else if (mode === "muted" && viewerId) list = await fetchMuted(viewerId);
      if (live) setRows(list);
    })();
    return () => { live = false; };
  }, [open, mode, userId, viewerId]);

  // Search as you type, username only.
  useEffect(() => {
    if (!open || mode !== "search") return;
    const t = setTimeout(async () => {
      const list = await searchUsers(q, viewerId);
      setRows(list);
      if (q.trim().length >= 2) logClick("user_search", { userId: viewerId, surface: "/social", metadata: { length: q.trim().length, results: list.length } });
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, mode, viewerId]);

  const toggleFollow = async (p: PersonRow) => {
    if (!viewerId) return;
    const on = !mine.following.has(p.userId);
    setMine((m) => {
      const f = new Set(m.following);
      if (on) f.add(p.userId); else f.delete(p.userId);
      return { ...m, following: f };
    });
    const res = on ? await follow(viewerId, p.userId, ALL_KINDS) : await unfollow(viewerId, p.userId);
    if (res.error) {
      toast.error("Couldn't save that");
      setMine((m) => {
        const f = new Set(m.following);
        if (on) f.delete(p.userId); else f.add(p.userId);
        return { ...m, following: f };
      });
      return;
    }
    logClick(on ? "user_followed" : "user_unfollowed", { userId: viewerId, targetId: p.userId, surface: "/people", metadata: { from: mode } });
    onChanged?.();
  };

  const doUnmute = async (p: PersonRow) => {
    if (!viewerId) return;
    const res = await unmute(viewerId, p.userId);
    if (res.error) { toast.error("Couldn't unmute"); return; }
    logClick("user_unmuted", { userId: viewerId, targetId: p.userId, surface: "/profile" });
    setRows((prev) => (prev ?? []).filter((r) => r.userId !== p.userId));
    onChanged?.();
  };

  const openUser = (p: PersonRow) => {
    onOpenChange(false);
    router.push(`/u/${encodeURIComponent(p.username)}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="border-t border-charcoal max-h-[85vh] overflow-y-auto" style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}>
        <SheetHeader className="mb-2">
          <SheetTitle className="text-charcoal text-left">{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>

        {mode === "search" && (
          <div className="px-4 pb-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search usernames"
              className="w-full h-11 border border-charcoal rounded-lg px-3 text-sm text-black bg-white"
              data-coach="social.search"
            />
          </div>
        )}

        <div className="px-4 pb-6">
          {rows === null ? (
            <p className="text-sm text-gray-400 py-8 text-center">{mode === "search" ? "" : "Loading…"}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              {mode === "search" ? (q.trim().length < 2 ? "Type at least two letters." : "No one by that name.")
                : mode === "muted" ? "You haven't muted anyone."
                : mode === "followers" ? "No followers yet."
                : "Not following anyone yet."}
            </p>
          ) : (
            rows.map((p) => {
              const isMe = p.userId === viewerId;
              const following = mine.following.has(p.userId);
              return (
                <div key={p.userId} className="flex items-center gap-3 py-2.5 border-b border-gray-200">
                  <button type="button" onClick={() => openUser(p)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <UserAvatar username={p.username} avatarUrl={p.avatarUrl} size={36} />
                    <span className="text-sm font-medium text-charcoal truncate">@{p.username}</span>
                  </button>
                  {mode === "muted" ? (
                    <button type="button" onClick={() => doUnmute(p)} className="h-8 px-3.5 rounded-full border border-gray-400 text-xs font-semibold text-charcoal bg-white">Unmute</button>
                  ) : !isMe && viewerId ? (
                    <button
                      type="button"
                      onClick={() => toggleFollow(p)}
                      className={`h-8 px-3.5 rounded-full text-xs font-semibold ${following ? "border border-gray-400 text-charcoal bg-white" : "text-white"}`}
                      style={following ? undefined : { backgroundColor: "#111" }}
                    >
                      {following ? "Following" : "Follow"}
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
