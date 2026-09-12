import { supabase } from "@/lib/supabase";

// Follow / mute / bells (#111, step 6 of #105). The relationship model from 2026-09-12:
//   Follow is one-way and ungated. Friend = follow rows both ways (never stored).
//   Mute is quiet and one-way: they leave MY feed, shelf and pushes; they are never told.
//   Muting auto-unfollows. Bell on for someone I don't follow auto-follows first.
// notify_kinds on the follow row is the per-person push choice; the master switch is
// users.notify_push. All reads fail open.

export const NOTIFY_KINDS = [
  { id: "drank", label: "Pours a drink" },
  { id: "tasted", label: "Finishes a blind tasting" },
  { id: "added_to_collection", label: "Adds to their bar" },
  { id: "wishlisted", label: "Adds to their wishlist" },
  { id: "badge", label: "Earns a badge" },
] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number]["id"];
export const ALL_KINDS: NotifyKind[] = NOTIFY_KINDS.map((k) => k.id);

export type Relationship = {
  following: boolean;
  notifyKinds: NotifyKind[];
  muted: boolean;
};

export type PersonRow = { userId: string; username: string; avatarUrl: string | null };

export async function fetchRelationship(viewerId: string, targetId: string): Promise<Relationship> {
  const { data } = await supabase
    .from("user_relationships")
    .select("kind, notify_kinds")
    .eq("from_user_id", viewerId)
    .eq("to_user_id", targetId);
  const rows = (data || []) as { kind: string; notify_kinds: string[] }[];
  const follow = rows.find((r) => r.kind === "follow");
  return {
    following: !!follow,
    notifyKinds: (follow?.notify_kinds ?? []) as NotifyKind[],
    muted: rows.some((r) => r.kind === "mute"),
  };
}

export async function follow(viewerId: string, targetId: string, notifyKinds: NotifyKind[] = []): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("user_relationships")
    .upsert({ from_user_id: viewerId, to_user_id: targetId, kind: "follow", notify_kinds: notifyKinds }, { onConflict: "from_user_id,to_user_id,kind" });
  return error ? { error: error.message } : {};
}

export async function unfollow(viewerId: string, targetId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("user_relationships")
    .delete()
    .eq("from_user_id", viewerId)
    .eq("to_user_id", targetId)
    .eq("kind", "follow");
  return error ? { error: error.message } : {};
}

/** Set the bell. Follows first if needed - a bell cannot exist without the follow. */
export async function setNotifyKinds(viewerId: string, targetId: string, kinds: NotifyKind[]): Promise<{ error?: string }> {
  return follow(viewerId, targetId, kinds);
}

export async function mute(viewerId: string, targetId: string): Promise<{ error?: string }> {
  const un = await unfollow(viewerId, targetId);
  if (un.error) return un;
  const { error } = await supabase
    .from("user_relationships")
    .upsert({ from_user_id: viewerId, to_user_id: targetId, kind: "mute", notify_kinds: [] }, { onConflict: "from_user_id,to_user_id,kind" });
  return error ? { error: error.message } : {};
}

export async function unmute(viewerId: string, targetId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("user_relationships")
    .delete()
    .eq("from_user_id", viewerId)
    .eq("to_user_id", targetId)
    .eq("kind", "mute");
  return error ? { error: error.message } : {};
}

/** Ids I follow, and ids I muted - the two sets every feed read needs. */
export async function fetchMyGraph(viewerId: string): Promise<{ following: string[]; muted: string[] }> {
  const { data } = await supabase
    .from("user_relationships")
    .select("to_user_id, kind")
    .eq("from_user_id", viewerId);
  const following: string[] = [];
  const muted: string[] = [];
  (data || []).forEach((r: { to_user_id: string; kind: string }) => (r.kind === "mute" ? muted : following).push(r.to_user_id));
  return { following, muted };
}

async function people(select: string, filter: (q: any) => any): Promise<PersonRow[]> {
  const { data } = await filter(supabase.from("user_relationships").select(select).order("created_at", { ascending: false }));
  return ((data || []) as any[])
    .map((r) => {
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
      return u ? { userId: u.id, username: u.username, avatarUrl: u.avatar_url ?? null } : null;
    })
    .filter(Boolean) as PersonRow[];
}

export function fetchFollowers(userId: string) {
  return people("created_at, users:from_user_id ( id, username, avatar_url )", (q) => q.eq("to_user_id", userId).eq("kind", "follow"));
}
export function fetchFollowing(userId: string) {
  return people("created_at, users:to_user_id ( id, username, avatar_url )", (q) => q.eq("from_user_id", userId).eq("kind", "follow"));
}
export function fetchMuted(userId: string) {
  return people("created_at, users:to_user_id ( id, username, avatar_url )", (q) => q.eq("from_user_id", userId).eq("kind", "mute"));
}

/** Username search only - never email (enumeration). Fuzzy contains, case-insensitive. */
export async function searchUsers(q: string, viewerId: string | null): Promise<PersonRow[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  let query = supabase
    .from("users")
    .select("id, username, avatar_url")
    .eq("account_type", "human")
    .ilike("username", `%${term.replace(/[%_]/g, "")}%`)
    .order("username")
    .limit(20);
  if (viewerId) query = query.neq("id", viewerId);
  const { data } = await query;
  return ((data || []) as any[]).map((u) => ({ userId: u.id, username: u.username, avatarUrl: u.avatar_url ?? null }));
}

// ---------------------------------------------------------------- feed preference

export type FeedScope = "following" | "everyone";

export async function fetchFeedDefault(viewerId: string): Promise<FeedScope> {
  const { data } = await supabase.from("users").select("feed_default").eq("id", viewerId).maybeSingle();
  return data?.feed_default === "following" ? "following" : "everyone";
}

export async function saveFeedDefault(viewerId: string, scope: FeedScope): Promise<void> {
  await supabase.from("users").update({ feed_default: scope }).eq("id", viewerId);
}
