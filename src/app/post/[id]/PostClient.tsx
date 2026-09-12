"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import ActivityCard from "@/components/social/ActivityCard";
import UserAvatar from "@/components/UserAvatar";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { logClick } from "@/lib/events";
import { formatFeedTime } from "@/lib/activities";
import { addOrRestockUserBottle, resolveDefaultVariantId } from "@/lib/userBottles";
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

  return (
    <div className="min-h-full flex flex-col">
      <header
        className="fixed top-0 left-0 right-0 h-14 bg-ivory border-b border-charcoal z-20 flex items-center justify-center"
        style={{ top: "env(safe-area-inset-top)" }}
      >
        <button type="button" onClick={() => router.back()} className="absolute left-3 w-10 h-10 flex items-center justify-center" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2F2F2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-base font-semibold text-charcoal">{title}</h1>
      </header>

      <div className="max-w-md w-full mx-auto pt-[calc(56px+env(safe-area-inset-top))] pb-28 flex-1">
        {missing ? (
          <p className="text-center text-sm text-gray-500 px-6 py-12">This post is gone.</p>
        ) : !item ? (
          <p className="text-center text-sm text-gray-400 py-12">Loading…</p>
        ) : (
          <>
            <div className="pt-3">
              <ActivityCard item={item} viewerId={publicUserId ?? null} onCheer={handleCheer} detail onComment={() => inputRef.current?.focus()} />
            </div>

            {rank && (
              <p className="px-4 -mt-1 mb-2 text-xs text-gray-500">
                #{rank.rank} of @{item.username}&apos;s {rank.of}
              </p>
            )}

            {publicUserId && publicUserId !== item.userId && item.action !== "tasted" && (
              <div className="flex gap-2.5 px-4 py-2">
                <button type="button" onClick={addToBar} className="flex-1 h-11 rounded-lg border border-gray-400 bg-white text-sm font-semibold text-charcoal">Add to my bar</button>
                <button type="button" onClick={wishlist} className="flex-1 h-11 rounded-lg border border-gray-400 bg-white text-sm font-semibold text-charcoal">Wishlist</button>
              </div>
            )}

            {item.cheers > 0 && (
              <div className="px-4 py-2">
                <button type="button" onClick={showCheerers} className="text-xs text-gray-600 underline underline-offset-2">
                  {item.cheers} cheer{item.cheers === 1 ? "" : "s"}
                </button>
                {cheerers && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {cheerers.map((u) => (
                      <span key={u.userId} className="inline-flex items-center gap-1.5 text-xs text-charcoal">
                        <UserAvatar username={u.username} avatarUrl={u.avatarUrl} size={20} />@{u.username}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-charcoal">Comments</div>
            {roots.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500">No comments yet.</p>
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
          className="fixed left-0 right-0 bg-white border-t border-gray-300 px-3 py-2 z-20"
          style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}
        >
          {replyTo && (
            <div className="flex items-center justify-between text-xs text-gray-600 px-1 pb-1">
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
              className="flex-1 border border-gray-400 rounded-2xl px-3.5 py-2 text-sm text-black bg-white resize-none"
              style={{ minHeight: 40 }}
              data-coach="social.comment"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy || !draft.trim()}
              className="h-10 px-4 rounded-full text-sm font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: "#2F2F2F" }}
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
          <span className="font-semibold text-charcoal">@{c.username}</span>
          <span className="text-gray-400"> · {formatFeedTime(c.createdAt)}</span>
        </div>
        {c.deleted ? (
          <p className="text-[13px] text-gray-400 italic mt-0.5">Comment removed</p>
        ) : (
          <p className="text-[13px] leading-snug text-gray-800 mt-0.5 whitespace-pre-wrap">{c.body}</p>
        )}
        {!c.deleted && (
          <div className="flex gap-3 mt-1 text-[11px] text-gray-500">
            <button type="button" onClick={onReply} className="underline-offset-2 hover:underline">Reply</button>
            {canDelete && <button type="button" onClick={onDelete} className="underline-offset-2 hover:underline">Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}
