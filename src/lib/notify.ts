// Fire-and-forget social pushes (#114). The action already happened; this only asks the server
// to decide who should hear about it. Never awaited by callers, never throws.
export function notify(body: {
  kind: "cheer" | "comment" | "reply" | "follow" | "activity";
  activityId?: string;
  commentId?: string;
  targetUserId?: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    fetch("/api/social/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* fail-open */
  }
}
