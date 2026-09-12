import { supabase } from "@/lib/supabase";
import {
  FEED_SELECT,
  FEED_HIDDEN_FILTER,
  fetchActivityFeed,
  mapFeedRow,
  type ActivityRow,
} from "@/lib/activities";

// The social layer's reads and writes (#109, step 4 of #105): the feed as CARDS (with cheer /
// comment counts and the viewer's own cheer), the post detail, cheers, comments, and the blind
// tasting podium. Every read here is fail-open - a count that cannot load is 0, a podium that
// cannot load is null - because a card must never take the feed down with it.

export type FeedItem = ActivityRow & {
  cheers: number;
  comments: number;
  viewerCheered: boolean;
  /** Adds / wishlists by the same person within an hour collapse into one card. */
  group?: ActivityRow[];
};

export type Comment = {
  id: string;
  activityId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  parentId: string | null;
  body: string;
  createdAt: string;
  deleted: boolean;
};

export type PodiumGlass = {
  rank: number;
  bottleId: string;
  variantId: string | null;
  name: string;
  distillery: string | null;
  imageUrl: string | null;
  glassLetter: string | null;
  notes: { nose?: string; palate?: string; finish?: string } | null;
};

const COLLAPSE_ACTIONS = new Set(["added_to_collection", "wishlisted"]);
const COLLAPSE_WINDOW_MS = 60 * 60 * 1000;

/** Attach reaction / comment counts and the viewer's cheer to a page of rows. */
export async function enrichRows(rows: ActivityRow[], viewerId: string | null): Promise<FeedItem[]> {
  const ids = rows.map((r) => r.id);
  const cheers = new Map<string, number>();
  const mine = new Set<string>();
  const comments = new Map<string, number>();
  if (ids.length) {
    const [{ data: re }, { data: co }] = await Promise.all([
      supabase.from("post_reactions").select("activity_id, user_id").in("activity_id", ids),
      supabase.from("post_comments").select("activity_id").in("activity_id", ids).is("deleted_at", null),
    ]);
    (re || []).forEach((r: { activity_id: string; user_id: string }) => {
      cheers.set(r.activity_id, (cheers.get(r.activity_id) ?? 0) + 1);
      if (viewerId && r.user_id === viewerId) mine.add(r.activity_id);
    });
    (co || []).forEach((c: { activity_id: string }) => {
      comments.set(c.activity_id, (comments.get(c.activity_id) ?? 0) + 1);
    });
  }
  return rows.map((r) => ({
    ...r,
    cheers: cheers.get(r.id) ?? 0,
    comments: comments.get(r.id) ?? 0,
    viewerCheered: mine.has(r.id),
  }));
}

/**
 * Fold a run of the same person's adds (or wishlists) inside one hour into a single card, so a
 * restock of six bottles is one post, not six. Reactions attach to the FIRST row of the run.
 */
export function collapseRuns(items: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (
      prev &&
      COLLAPSE_ACTIONS.has(it.action) &&
      prev.action === it.action &&
      prev.userId === it.userId &&
      Math.abs(new Date(prev.createdAt).getTime() - new Date(it.createdAt).getTime()) < COLLAPSE_WINDOW_MS
    ) {
      prev.group = [...(prev.group ?? [prev]), it];
      continue;
    }
    out.push({ ...it });
  }
  return out;
}

export async function fetchFeedPage(opts: {
  offset: number;
  limit: number;
  viewerId: string | null;
  /** Following scope (#111): only these posters. Null/undefined = everyone. */
  userIds?: string[] | null;
  excludeUserIds?: string[] | null;
}): Promise<{ items: FeedItem[]; error?: string; rawCount: number }> {
  const { rows, error } = await fetchActivityFeed({ offset: opts.offset, limit: opts.limit, userIds: opts.userIds, excludeUserIds: opts.excludeUserIds });
  if (error) return { items: [], error, rawCount: 0 };
  const items = await enrichRows(rows, opts.viewerId);
  return { items: collapseRuns(items), rawCount: rows.length };
}

/** One person's posts (the user page's Recent activity, step 5). */
export async function fetchUserFeed(opts: {
  userId: string;
  offset: number;
  limit: number;
  viewerId: string | null;
}): Promise<{ items: FeedItem[]; error?: string; rawCount: number }> {
  const { data, error } = await supabase
    .from("activities")
    .select(FEED_SELECT)
    .eq("user_id", opts.userId)
    .not("action", "in", FEED_HIDDEN_FILTER)
    .order("created_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (error) return { items: [], error: error.message, rawCount: 0 };
  const rows = ((data || []) as any[]).map((raw) => mapFeedRow(raw));
  const items = await enrichRows(rows, opts.viewerId);
  return { items: collapseRuns(items), rawCount: rows.length };
}

export async function fetchPost(activityId: string, viewerId: string | null): Promise<{ item?: FeedItem; error?: string }> {
  const { data, error } = await supabase
    .from("activities")
    .select(FEED_SELECT)
    .eq("id", activityId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "not found" };
  const row = mapFeedRow(data);
  if (!row.bottleImageUrl) {
    const { data: def } = await supabase
      .from("all_bottle_details")
      .select("attr_frontimage_url")
      .eq("bottle_id", row.bottleId)
      .maybeSingle();
    row.bottleImageUrl = def?.attr_frontimage_url ?? null;
  }
  const [item] = await enrichRows([row], viewerId);
  return { item };
}

// ---------------------------------------------------------------- cheers

export async function toggleCheer(activityId: string, userId: string, on: boolean): Promise<{ error?: string }> {
  const q = on
    ? supabase.from("post_reactions").insert({ activity_id: activityId, user_id: userId })
    : supabase.from("post_reactions").delete().eq("activity_id", activityId).eq("user_id", userId);
  const { error } = await q;
  // A duplicate insert (double tap) is not an error worth showing; RLS refusals (muted) are silent
  // by design - the mute contract says the muted person is never told.
  if (error && !/duplicate|row-level security/i.test(error.message)) return { error: error.message };
  return {};
}

export async function fetchCheerers(activityId: string): Promise<{ userId: string; username: string; avatarUrl: string | null }[]> {
  const { data } = await supabase
    .from("post_reactions")
    .select("user_id, users ( username, avatar_url )")
    .eq("activity_id", activityId)
    .order("created_at", { ascending: false });
  return ((data || []) as any[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return { userId: r.user_id, username: u?.username ?? "Someone", avatarUrl: u?.avatar_url ?? null };
  });
}

// ---------------------------------------------------------------- comments

export async function fetchComments(activityId: string): Promise<Comment[]> {
  const { data } = await supabase
    .from("post_comments")
    .select("id, activity_id, user_id, parent_id, body, created_at, deleted_at, users ( username, avatar_url )")
    .eq("activity_id", activityId)
    .order("created_at", { ascending: true });
  return ((data || []) as any[]).map((c) => {
    const u = Array.isArray(c.users) ? c.users[0] : c.users;
    return {
      id: c.id,
      activityId: c.activity_id,
      userId: c.user_id,
      username: u?.username ?? "Someone",
      avatarUrl: u?.avatar_url ?? null,
      parentId: c.parent_id ?? null,
      body: c.deleted_at ? "" : c.body,
      createdAt: c.created_at,
      deleted: !!c.deleted_at,
    };
  });
}

export async function addComment(opts: {
  activityId: string;
  userId: string;
  body: string;
  parentId?: string | null;
}): Promise<{ id?: string; error?: string; muted?: boolean }> {
  const body = opts.body.trim().slice(0, 2000);
  if (!body) return { error: "empty" };
  const { data, error } = await supabase
    .from("post_comments")
    .insert({ activity_id: opts.activityId, user_id: opts.userId, body, parent_id: opts.parentId ?? null })
    .select("id")
    .single();
  if (error) {
    if (/row-level security/i.test(error.message)) return { muted: true };
    return { error: error.message };
  }
  return { id: data.id };
}

export async function deleteComment(commentId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("post_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  return error ? { error: error.message } : {};
}

// ---------------------------------------------------------------- blind tasting podium

/**
 * The ranked glasses of a tasting. Tries the SECURITY DEFINER `tasting_podium` RPC (so other
 * people's tastings are readable); falls back to a direct read, which RLS allows only for your
 * own sessions. Null when neither works - the card then says the ranking is not available.
 */
export async function fetchPodium(sessionId: string): Promise<PodiumGlass[] | null> {
  const { data: rpc, error: rpcErr } = await supabase.rpc("tasting_podium", { p_session_id: sessionId });
  let rows: any[] | null = rpcErr ? null : (rpc as any[]);
  if (!rows) {
    const { data } = await supabase
      .from("tasting_details")
      .select("rank, bottle_id, variant_id, glass_letter, notes, bottles ( name, distillery ), bottle_variants ( frontimage_url )")
      .eq("tasting_session_id", sessionId)
      .order("rank", { ascending: true });
    rows = (data as any[]) ?? null;
  }
  if (!rows || rows.length === 0) return null;
  return rows.map((r, i) => {
    const b = Array.isArray(r.bottles) ? r.bottles[0] : r.bottles;
    const v = Array.isArray(r.bottle_variants) ? r.bottle_variants[0] : r.bottle_variants;
    return {
      rank: typeof r.rank === "number" ? r.rank : i,
      bottleId: r.bottle_id,
      variantId: r.variant_id ?? null,
      name: r.name ?? b?.name ?? "Unknown bottle",
      distillery: r.distillery ?? b?.distillery ?? null,
      imageUrl: r.image_url ?? v?.frontimage_url ?? null,
      glassLetter: r.glass_letter ?? null,
      notes: r.notes ?? null,
    };
  });
}

/**
 * "#7 of their 112": where this bottle sits in the poster's own ladder. Readable only for your
 * own bottles until the user-page read policies land (step 5); null means "don't show it".
 */
export async function fetchPersonalRank(userId: string, bottleId: string): Promise<{ rank: number; of: number } | null> {
  const { data, error } = await supabase
    .from("user_bottles")
    .select("bottle_id, elo")
    .eq("user_id", userId);
  if (error || !data || data.length === 0) return null;
  const best = new Map<string, number>();
  data.forEach((r: { bottle_id: string; elo: number | null }) => {
    const e = r.elo ?? 1500;
    if (e > (best.get(r.bottle_id) ?? -Infinity)) best.set(r.bottle_id, e);
  });
  const mine = best.get(bottleId);
  if (mine === undefined) return null;
  let rank = 1;
  best.forEach((e) => { if (e > mine) rank++; });
  return { rank, of: best.size };
}
