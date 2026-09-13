"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import ActivityCard from "@/components/social/ActivityCard";
import BottleDetailView, { type OwnershipRow } from "@/components/BottleDetailView";
import { loadBottleDetails } from "@/lib/bottleDetails";
import { supabase } from "@/lib/supabase";
import type { BottleDetails } from "@/lib/types";
import UserAvatar from "@/components/UserAvatar";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { logClick } from "@/lib/events";
import { formatFeedTime } from "@/lib/activities";
import { addOrRestockUserBottle, resolveDefaultVariantId } from "@/lib/userBottles";
import { notify } from "@/lib/notify";
import { addToWishlist } from "@/lib/wishlist";
import {
  addComment,
  deleteComment,
  fetchCheerers,
  fetchComments,
  fetchPersonalRank,
  fetchPost,
  toggleCheer,
  type Comment,
  type FeedItem,
} from "@/lib/social";

// The post detail (#109). The card in detail mode, the poster's personal rank for this bottle,
// Add to my bar / Wishlist for the viewer, who cheered, and the comment thread - flat with one
// level of replies, soft-deleted comments shown as a stub so a thread never loses its shape.

export default function PostClient({ activityId }: { activityId: string }) {
  const router = useRouter();
  const { publicUserId, role } = useCurrentUser();
  const [item, setItem] = useState<FeedItem | null>(null);
  const [missing, setMissing] = useState(false);
  const [rank, setRank] = useState<{ rank: number; of: number } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [cheerers, setCheerers] = useState<{ userId: string; username: string; avatarUrl: string | null }[] | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  // "Join them in a drink": the chooser is inline; a pour opens the bottle as an overlay with its
  // pour sheet already up (the same delegation Home uses), a blind hands off to /taste pre-seeded.
  const [joining, setJoining] = useState(false);
  const [joinBottle, setJoinBottle] = useState<{ details: BottleDetails; rows: OwnershipRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    const { item, error } = await fetchPost(activityId, publicUserId ?? null);
    if (error || !item) {
      if (error && error !== "not found") console.error("fetchPost:", error);
      setMissing(true);
      return;
    }
    setItem(item);
    setComments(await fetchComments(activityId));
    if (item.action === "drank" || item.action === "finished") {
      fetchPersonalRank(item.userId, item.bottleId).then(setRank);
    }
  }, [activityId, publicUserId]);

  useEffect(() => {
    load();
    logClick("post_opened", { userId: publicUserId, targetId: activityId, surface: "/post" });
  }, [load, activityId, publicUserId]);

  const handleCheer = async (it: FeedItem) => {
    if (!publicUserId) return;
    const on = !it.viewerCheered;
    setItem({ ...it, viewerCheered: on, cheers: Math.max(0, it.cheers + (on ? 1 : -1)) });
    setCheerers(null);
    logClick(on ? "post_cheered" : "post_uncheered", { userId: publicUserId, targetId: it.id, surface: "/post", metadata: { action: it.action } });
    const res = await toggleCheer(it.id, publicUserId, on);
    if (!res.error && on) notify({ kind: "cheer", activityId: it.id });
    if (res.error) {
      setItem(it);
      toast.error("Couldn't save that");
    }
  };

  const showCheerers = async () => {
    if (!item || item.cheers === 0) return;
    setCheerers(await fetchCheerers(item.id));
  };

  const submit = async () => {
    if (!publicUserId || !item || busy) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const res = await addComment({ activityId: item.id, userId: publicUserId, body, parentId: replyTo?.id ?? null });
    setBusy(false);
    if (res.muted) {
      // The mute contract: the muted person is never told. Clear the box as if it posted.
      setDraft("");
      setReplyTo(null);
      return;
    }
    if (res.error) {
      toast.error("Couldn't post your comment");
      return;
    }
    logClick("comment_posted", { userId: publicUserId, targetId: item.id, surface: "/post", metadata: { reply: !!replyTo } });
    if (res.id) notify({ kind: replyTo ? "reply" : "comment", activityId: item.id, commentId: res.id });
    setDraft("");
    setReplyTo(null);
    setComments(await fetchComments(item.id));
    setItem((prev) => (prev ? { ...prev, comments: prev.comments + 1 } : prev));
  };

  const remove = async (c: Comment) => {
    if (!publicUserId) return;
    const res = await deleteComment(c.id);
    if (res.error) {
      toast.error("Couldn't remove that");
      return;
    }
    logClick("comment_deleted", { userId: publicUserId, targetId: c.id, surface: "/post" });
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, deleted: true, body: "" } : x)));
    setItem((prev) => (prev ? { ...prev, comments: Math.max(0, prev.comments - 1) } : prev));
  };

  const addToBar = async () => {
    if (!publicUserId || !item) return;
    const res = await addOrRestockUserBottle({ userId: publicUserId, bottleId: item.bottleId, variantId: item.variantId ?? null });
    if ("error" in res) toast.error("Couldn't add it");
    else toast.success("Added to My Bar");
  };

  const joinWithDrink = async () => {
    if (!publicUserId || !item) return;
    logClick("join_drink", { userId: publicUserId, targetId: item.id, surface: "/post", metadata: { choice: "pour", bottle_id: item.bottleId } });
    const [details, { data: rows }] = await Promise.all([
      loadBottleDetails(item.bottleId, publicUserId),
      supabase.from("user_bottles").select("variant_id, currently_owned, times_had, owned_count").eq("user_id", publicUserId).eq("bottle_id", item.bottleId),
    ]);
    if (!details) { toast.error("Couldn't open that bottle"); return; }
    setJoining(false);
    setJoinBottle({ details, rows: (rows || []) as OwnershipRow[] });
  };

  const joinWithBlind = () => {
    if (!publicUserId || !item) return;
    logClick("join_drink", { userId: publicUserId, targetId: item.id, surface: "/post", metadata: { choice: "blind", bottle_id: item.bottleId } });
    const params = new URLSearchParams({ bottle: item.bottleId });
    if (item.variantId) params.set("variant", item.variantId);
    router.push(`/taste?${params.toString()}`);
  };

  const wishlist = async () => {
    if (!publicUserId || !item) return;
    const variantId = item.variantId ?? (await resolveDefaultVariantId(item.bottleId));
    if (!variantId) { toast.error("Couldn't wishlist it"); return; }
    const res = await addToWishlist(publicUserId, item.bottleId, variantId);
    if (res.error) toast.error("Couldn't wishlist it");
    else toast.success("Added to your wishlist");
  };

  const canDelete = (c: Comment) =>
    !!publicUserId && !c.deleted && (c.userId === publicUserId || item?.userId === publicUserId || role === "admin");

  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  const title = item ? (item.action === "tasted" ? "Blind tasting" : item.action === "drank" ? "Pour" : "Post") : "Post";

  if (joinBottle && publicUserId && item) {
    return (
      <BottleDetailView
        bottle={joinBottle.details}
        publicUserId={publicUserId}
        initialVariantId={item.variantId ?? null}
        ownershipRows={joinBottle.rows}
        autoOpenPour
        onAddToBar={async (bottleId, variantId) => {
          const res = await addOrRestockUserBottle({ userId: publicUserId, bottleId, variantId: variantId ?? null });
          if ("error" in res) toast.error("Couldn't add it");
          else toast.success("Added to My Bar");
        }}
        onClose={() => setJoinBottle(null)}
      />
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      <header
        className="fixed top-0 left-0 right-0 h-14 pc-wood pc-rail-bottom z-20 shadow-[0_6px_14px_rgba(0,0,0,.55)] flex items-center justify-center"
        style={{ top: "env(safe-area-inset-top)" }}
      >
        <button type="button" onClick={() => router.back()} className="absolute left-3 w-10 h-10 flex items-center justify-center" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f6ecd9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="font-display text-lg font-bold tracking-wide pc-brass-text">{title}</h1>
      </header>

      <div className="max-w-md w-full mx-auto pt-[calc(56px+env(safe-area-inset-top))] pb-28 flex-1">
        {missing ? (
          <p className="text-center text-sm text-cream-mute px-6 py-12">This post is gone.</p>
        ) : !item ? (
          <p className="text-center text-sm text-cream-faint py-12">Loading…</p>
        ) : (
          <>
            <div className="pt-3">
              <ActivityCard item={item} viewerId={publicUserId ?? null} onCheer={handleCheer} detail onComment={() => inputRef.current?.focus()} onOpenUser={(_, username) => router.push(`/u/${encodeURIComponent(username)}`)} />
            </div>

            {rank && (
              <p className="px-4 -mt-1 mb-2 text-xs text-cream-mute">
                #{rank.rank} of @{item.username}&apos;s {rank.of}
              </p>
            )}

            {publicUserId && publicUserId !== item.userId && item.action !== "tasted" && (
              <div className="px-4 pt-2">
                {joining ? (
                  <div className="flex gap-2.5">
                    <button type="button" onClick={joinWithDrink} className="flex-1 h-11 rounded-lg pc-brass bg-brass text-engrave text-sm font-semibold">Pour this bottle</button>
                    <button type="button" onClick={joinWithBlind} className="flex-1 h-11 rounded-lg pc-brass bg-brass text-engrave text-sm font-semibold">Start a blind with this</button>
                    <button type="button" onClick={() => setJoining(false)} className="h-11 px-3 rounded-lg border border-edge text-sm text-cream-mute" aria-label="Never mind">✕</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setJoining(true)} className="w-full h-11 rounded-lg pc-brass bg-brass text-engrave text-sm font-semibold">
                    Join @{item.username} in a drink
                  </button>
                )}
              </div>
            )}

            {publicUserId && publicUserId !== item.userId && item.action !== "tasted" && (
              <div className="flex gap-2.5 px-4 py-2">
                <button type="button" onClick={addToBar} className="flex-1 h-11 rounded-lg border border-edge bg-panel text-sm font-semibold text-cream">Add to my bar</button>
                <button type="button" onClick={wishlist} className="flex-1 h-11 rounded-lg border border-edge bg-panel text-sm font-semibold text-cream">Wishlist</button>
              </div>
            )}

            {item.cheers > 0 && (
              <div className="px-4 py-2">
                <button type="button" onClick={showCheerers} className="text-xs text-cream-mute underline underline-offset-2">
                  {item.cheers} cheer{item.cheers === 1 ? "" : "s"}
                </button>
                {cheerers && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {cheerers.map((u) => (
                      <span key={u.userId} className="inline-flex items-center gap-1.5 text-xs text-cream">
                        <UserAvatar username={u.username} avatarUrl={u.avatarUrl} size={20} />@{u.username}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-cream">Comments</div>
            {roots.length === 0 ? (
              <p className="px-4 py-3 text-sm text-cream-mute">No comments yet.</p>
            ) : (
              <div className="pb-2">
                {roots.map((c) => (
                  <div key={c.id}>
                    <CommentRow c={c} canDelete={canDelete(c)} onReply={() => { setReplyTo(c); inputRef.current?.focus(); }} onDelete={() => remove(c)} />
                    {repliesOf(c.id).map((r) => (
                      <CommentRow key={r.id} c={r} indent canDelete={canDelete(r)} onReply={() => { setReplyTo(c); inputRef.current?.focus(); }} onDelete={() => remove(r)} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {item && publicUserId && (
        <div
          className="fixed left-0 right-0 bg-panel border-t border-edge px-3 py-2 z-20"
          style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}
        >
          {replyTo && (
            <div className="flex items-center justify-between text-xs text-cream-mute px-1 pb-1">
              <span>Replying to @{replyTo.username}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="underline underline-offset-2">Cancel</button>
            </div>
          )}
          <div className="max-w-md mx-auto flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              maxLength={2000}
              placeholder="Add a comment"
              className="flex-1 border border-edge rounded-2xl px-3.5 py-2 text-sm text-cream bg-panel resize-none"
              style={{ minHeight: 40 }}
              data-coach="social.comment"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy || !draft.trim()}
              className="h-10 px-4 rounded-full text-sm font-semibold text-cream disabled:opacity-40"
              style={{ backgroundColor: "#bd9436" }}
            >
              Post
            </button>
          </div>
        </div>
      )}

      <Toaster position="top-center" style={{ top: "calc(56px + env(safe-area-inset-top))" }} />
    </div>
  );
}

function CommentRow({ c, indent = false, canDelete, onReply, onDelete }: { c: Comment; indent?: boolean; canDelete: boolean; onReply: () => void; onDelete: () => void }) {
  return (
    <div className={`flex gap-2.5 px-4 py-2.5 ${indent ? "pl-12" : ""}`}>
      <UserAvatar username={c.username} avatarUrl={c.avatarUrl} size={28} />
      <div className="flex-1 min-w-0">
        <div className="text-xs">
          <span className="font-semibold text-cream">@{c.username}</span>
          <span className="text-cream-faint"> · {formatFeedTime(c.createdAt)}</span>
        </div>
        {c.deleted ? (
          <p className="text-[13px] text-cream-faint italic mt-0.5">Comment removed</p>
        ) : (
          <p className="text-[13px] leading-snug text-cream mt-0.5 whitespace-pre-wrap">{c.body}</p>
        )}
        {!c.deleted && (
          <div className="flex gap-3 mt-1 text-[11px] text-cream-mute">
            <button type="button" onClick={onReply} className="underline-offset-2 hover:underline">Reply</button>
            {canDelete && <button type="button" onClick={onDelete} className="underline-offset-2 hover:underline">Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}
