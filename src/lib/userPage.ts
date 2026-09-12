import { supabase } from "@/lib/supabase";
import { buildPage, type Seed, type ShelfDef, type ShelfFetchOpts, type ShelfPage, SHELF_PAGE_SIZE } from "@/lib/shelves";

// The user page's reads (#110, step 5 of #105). All fail-open: a number that cannot load is 0,
// a list that cannot load is empty. Cross-user reads of user_bottles / user_ratings / wishlists
// were opened on 2026-09-12 (sql/social-reads-migration.sql); activities were always readable.

export type PublicUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type UserStats = {
  tried: number;
  blinds: number;
  followers: number;
  following: number;
};

export type TopBottle = {
  bottleId: string;
  variantId: string | null;
  name: string;
  distillery: string | null;
  imageUrl: string | null;
  /** 0-5, half-star steps. Blind-earned: personal Elo scaled to the global range. Manual: their stars. */
  stars: number;
  /** True when the rank comes from a star rating, not a blind tasting. */
  manual: boolean;
};

export async function fetchUserByUsername(username: string): Promise<PublicUser | null> {
  const { data } = await supabase
    .from("users")
    .select("id, username, avatar_url, created_at")
    .ilike("username", username)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, username: data.username, avatarUrl: data.avatar_url ?? null, createdAt: data.created_at };
}

export async function fetchUserById(id: string): Promise<PublicUser | null> {
  const { data } = await supabase.from("users").select("id, username, avatar_url, created_at").eq("id", id).maybeSingle();
  if (!data) return null;
  return { id: data.id, username: data.username, avatarUrl: data.avatar_url ?? null, createdAt: data.created_at };
}

/**
 * Tried = distinct bottles with ANY relationship (B-31): owned now or ever, poured, or blind-
 * tasted. user_bottles covers ownership and the trigger-stamped tasted_at / blind_tasted_at;
 * `drank` activities cover pours on bottles never added to the bar.
 */
export async function fetchUserStats(userId: string): Promise<UserStats> {
  const [ub, drank, blinds, followers, following] = await Promise.all([
    supabase.from("user_bottles").select("bottle_id, currently_owned, times_had, tasted_at, blind_tasted_at").eq("user_id", userId),
    supabase.from("activities").select("bottle_id").eq("user_id", userId).eq("action", "drank"),
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("action", "tasted"),
    supabase.from("user_relationships").select("from_user_id", { count: "exact", head: true }).eq("to_user_id", userId).eq("kind", "follow"),
    supabase.from("user_relationships").select("to_user_id", { count: "exact", head: true }).eq("from_user_id", userId).eq("kind", "follow"),
  ]);
  const tried = new Set<string>();
  (ub.data || []).forEach((r: any) => {
    if (r.currently_owned || (r.times_had ?? 0) >= 1 || r.tasted_at || r.blind_tasted_at) tried.add(r.bottle_id);
  });
  (drank.data || []).forEach((r: { bottle_id: string | null }) => { if (r.bottle_id) tried.add(r.bottle_id); });
  return {
    tried: tried.size,
    blinds: blinds.count ?? 0,
    followers: followers.count ?? 0,
    following: following.count ?? 0,
  };
}

/** Global Elo range, the same scale the bottle detail uses for its star. */
async function globalRange(): Promise<{ min: number; max: number } | null> {
  const [hi, lo] = await Promise.all([
    supabase.from("bottle_variants").select("elo_global").is("store_pick_name", null).not("elo_global", "is", null).order("elo_global", { ascending: false }).limit(1),
    supabase.from("bottle_variants").select("elo_global").is("store_pick_name", null).not("elo_global", "is", null).order("elo_global", { ascending: true }).limit(1),
  ]);
  const max = Number(hi.data?.[0]?.elo_global);
  const min = Number(lo.data?.[0]?.elo_global);
  if (Number.isNaN(max) || Number.isNaN(min) || max === min) return null;
  return { min, max };
}

const half = (n: number) => Math.round(Math.min(5, Math.max(0, n)) * 2) / 2;

/**
 * Top 3: highest personal Elo across their bottles, any source. Ties break on global Elo, then
 * on the most recent row. Star-only entries (never blind-tasted) are flagged `manual`.
 */
export async function fetchTop3(userId: string): Promise<TopBottle[]> {
  const { data } = await supabase
    .from("user_bottles")
    .select("bottle_id, variant_id, elo, blind_tasted_at, updated_at")
    .eq("user_id", userId)
    .order("elo", { ascending: false })
    .limit(60);
  const rows = (data || []) as { bottle_id: string; variant_id: string | null; elo: number | null; blind_tasted_at: string | null; updated_at: string }[];
  if (!rows.length) return [];

  // One entry per bottle - the best variant's row.
  const best = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!best.has(r.bottle_id)) best.set(r.bottle_id, r);
  const ids = [...best.keys()];

  const [{ data: bottles }, { data: ratings }, range] = await Promise.all([
    supabase.from("all_bottle_details").select("bottle_id, bottle_name, bottle_distillery, bottle_elo_global, attr_frontimage_url").in("bottle_id", ids),
    supabase.from("user_ratings").select("bottle_id, stars").eq("user_id", userId).in("bottle_id", ids),
    globalRange(),
  ]);
  const info = new Map<string, any>();
  (bottles || []).forEach((b: any) => info.set(b.bottle_id, b));
  const starOf = new Map<string, number>();
  (ratings || []).forEach((r: { bottle_id: string; stars: number | string | null }) => {
    const s = Number(r.stars);
    if (!Number.isNaN(s)) starOf.set(r.bottle_id, Math.max(starOf.get(r.bottle_id) ?? 0, s));
  });

  const ranked = [...best.values()]
    .map((r) => ({ r, elo: Number(r.elo ?? 1500), global: Number(info.get(r.bottle_id)?.bottle_elo_global ?? 1500) }))
    // A never-touched row sits at the 1500 baseline with no rating: it is not a favourite.
    .filter((x) => x.r.blind_tasted_at || starOf.has(x.r.bottle_id) || x.elo !== 1500)
    .sort((a, b) => b.elo - a.elo || b.global - a.global || (b.r.updated_at > a.r.updated_at ? 1 : -1))
    .slice(0, 3);

  return ranked.map(({ r, elo }) => {
    const manual = !r.blind_tasted_at;
    const scaled = range ? ((elo - range.min) / (range.max - range.min)) * 5 : 2.5;
    const stars = manual ? (starOf.get(r.bottle_id) ?? half(scaled)) : half(scaled);
    const b = info.get(r.bottle_id);
    return {
      bottleId: r.bottle_id,
      variantId: r.variant_id ?? null,
      name: b?.bottle_name ?? "Unknown bottle",
      distillery: b?.bottle_distillery ?? null,
      imageUrl: b?.attr_frontimage_url ?? null,
      stars: half(stars),
      manual,
    };
  });
}

// ---------------------------------------------------------------- shelves

/**
 * Their bar: currently-owned bottles, the most recently touched first - the left edge of the
 * shelf is what they have been reaching for; a bottle they own but never pour trails off the
 * right end. "Touched" = the bottle's latest activities row; untouched rows fall back to when
 * the bottle was added. Cursorless: a personal bar is small enough to sort in one read.
 */
async function fetchOwnedRecent(userId: string, { cursor, limit = SHELF_PAGE_SIZE, viewerId }: ShelfFetchOpts): Promise<ShelfPage> {
  const { data } = await supabase
    .from("user_bottles")
    .select("bottle_id, variant_id, created_at")
    .eq("user_id", userId)
    .gt("owned_count", 0);
  const rows = (data || []) as { bottle_id: string; variant_id: string | null; created_at: string }[];
  if (!rows.length) return { bottles: [], nextCursor: null };

  const ids = [...new Set(rows.map((r) => r.bottle_id))];
  const { data: acts } = await supabase
    .from("activities")
    .select("bottle_id, created_at")
    .eq("user_id", userId)
    .in("bottle_id", ids)
    .order("created_at", { ascending: false });
  const last = new Map<string, string>();
  (acts || []).forEach((a: { bottle_id: string; created_at: string }) => { if (!last.has(a.bottle_id)) last.set(a.bottle_id, a.created_at); });

  const seen = new Set<string>();
  const seeds: (Seed & { at: string })[] = [];
  for (const r of rows) {
    if (seen.has(r.bottle_id)) continue;
    seen.add(r.bottle_id);
    seeds.push({ bottleId: r.bottle_id, variantId: r.variant_id, at: last.get(r.bottle_id) ?? r.created_at });
  }
  seeds.sort((a, b) => (b.at > a.at ? 1 : -1));

  const start = cursor ? Number(cursor) : 0;
  const page = seeds.slice(start, start + limit);
  const nextCursor = start + limit < seeds.length ? String(start + limit) : null;
  // The status light is the VIEWER's standing (green = I have had it), never the owner's - on
  // your own page resolveStatus finds your rows anyway, so "none" is right for both.
  return buildPage(page, nextCursor, viewerId, "none");
}

async function fetchWishlist(userId: string, { cursor, limit = SHELF_PAGE_SIZE, viewerId }: ShelfFetchOpts): Promise<ShelfPage> {
  let q = supabase
    .from("wishlists")
    .select("bottle_id, variant_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (cursor) q = q.lt("created_at", cursor);
  const { data } = await q;
  const rows = (data || []) as { bottle_id: string; variant_id: string | null; created_at: string }[];
  const seeds: Seed[] = rows.map((r) => ({ bottleId: r.bottle_id, variantId: r.variant_id }));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
  return buildPage(seeds, nextCursor, viewerId, "none");
}

/**
 * STUB for the suggestion engine (#110): the five highest global-Elo bottles they have never
 * tried. The real engine matches the taste profile of their top 5; the surface is already the
 * shape it will need, so swapping the query in is the whole change.
 */
export async function getSuggestions(userId: string): Promise<Seed[]> {
  const [{ data: ub }, { data: drank }, { data: top }] = await Promise.all([
    supabase.from("user_bottles").select("bottle_id").eq("user_id", userId),
    supabase.from("activities").select("bottle_id").eq("user_id", userId).eq("action", "drank"),
    supabase
      .from("bottle_variants")
      .select("bottles_id")
      .eq("is_default", true)
      .is("store_pick_name", null)
      .not("elo_global", "is", null)
      .order("elo_global", { ascending: false })
      .limit(60),
  ]);
  const tried = new Set<string>();
  (ub || []).forEach((r: { bottle_id: string }) => tried.add(r.bottle_id));
  (drank || []).forEach((r: { bottle_id: string | null }) => { if (r.bottle_id) tried.add(r.bottle_id); });
  const out: Seed[] = [];
  const seen = new Set<string>();
  for (const v of (top || []) as { bottles_id: string }[]) {
    if (tried.has(v.bottles_id) || seen.has(v.bottles_id)) continue;
    seen.add(v.bottles_id);
    out.push({ bottleId: v.bottles_id, variantId: null });
    if (out.length === 5) break;
  }
  return out;
}

async function fetchSuggested(userId: string, { viewerId }: ShelfFetchOpts): Promise<ShelfPage> {
  const seeds = await getSuggestions(userId);
  return buildPage(seeds, null, viewerId, "none");
}

/** The three shelves on a user page, closed over the page's owner. */
export function userShelves(user: PublicUser, own: boolean): { bar: ShelfDef; wishlist: ShelfDef; suggested: ShelfDef } {
  const who = own ? "your" : `${user.username}'s`;
  return {
    bar: {
      id: `user_bar:${user.id}`,
      label: own ? "My bar" : "Their bar",
      href: own ? "/mybar" : "",
      empty: { title: own ? "Your bar is empty" : `${user.username}'s bar is empty`, body: own ? "Add a bottle from Search." : "Nothing on the shelf yet." },
      fetchPage: (o) => fetchOwnedRecent(user.id, o),
      fetchCount: async () => {
        const { data } = await supabase.from("user_bottles").select("bottle_id").eq("user_id", user.id).gt("owned_count", 0);
        return new Set((data || []).map((r: { bottle_id: string }) => r.bottle_id)).size;
      },
    },
    wishlist: {
      id: `user_wishlist:${user.id}`,
      label: "Wishlist",
      href: own ? "/mybar" : "",
      empty: { title: "No wishlist yet", body: own ? "Wishlist a bottle from its detail card." : `Nothing on ${who} wishlist.` },
      fetchPage: (o) => fetchWishlist(user.id, o),
      fetchCount: async () => {
        const { count } = await supabase.from("wishlists").select("id", { count: "exact", head: true }).eq("user_id", user.id);
        return count ?? 0;
      },
    },
    suggested: {
      id: `user_suggested:${user.id}`,
      label: "Suggested",
      href: "",
      empty: { title: "Nothing to suggest yet", body: "Try a few bottles first." },
      fetchPage: (o) => fetchSuggested(user.id, o),
      fetchCount: async () => (await getSuggestions(user.id)).length,
    },
  };
}
