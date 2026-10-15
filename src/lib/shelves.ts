import { supabase } from "@/lib/supabase";
import { FEED_HIDDEN_FILTER } from "@/lib/activities";

/**
 * The Home screen ("The Cabinet", #82) — the shelf registry and its queries.
 *
 * A shelf is DATA, not markup: `{ id, label, tab, href, empty, fetchPage }`. v1 ships a fixed
 * array of three and no settings UI, but #84 (let a user choose, order and filter their own
 * shelves) only stays cheap if shelves never get hardcoded into JSX. Adding a shelf should mean
 * adding an entry here and nothing else.
 *
 * Home is a ZOOMED-OUT VIEW OF THE OTHER TABS — every shelf is one tab seen from across the room
 * and its label plate is the door into it. That is why every shelf carries an `href`.
 *
 * Paging is KEYSET, not offset. A shelf is walked sideways while people are adding bottles and
 * logging drinks underneath it; an offset would silently repeat or skip rows as the underlying
 * list shifts. Each shelf returns the cursor its own ordering column ended on.
 */

/** Bottles fetched per batch as you walk along a shelf. The only lever on what Home costs to load. */
export const SHELF_PAGE_SIZE = 12;

export type ShelfId = "mybar" | "friendsbar" | "friendswish" | "social" | "verified";

/** A person standing behind a bottle on a friend shelf. Shown only on the All view. */
export type ShelfPerson = {
  userId: string;
  username: string;
  avatarUrl: string | null;
};

/**
 * How the viewer stands with this bottle — rendered as the pool of light on the deck beneath it.
 * The one piece of colour on an otherwise greyscale screen, because here it is information.
 * Precedence is deliberate: owning beats having tasted, which beats the shelf's own reason for
 * showing it.
 */
export type BottleStatus = "owned" | "tasted" | "verified" | "none";

/**
 * Why a bottle may not be able to show its real photograph (#83). Not stored as two columns —
 * derived — because they are two different jobs: one needs a picture taken, the other needs the
 * background cut out of a picture that already exists.
 */
export type ImageState = "ready" | "unready" | "missing";

export type ShelfBottle = {
  /** Stable React key. A SKU can appear once per shelf, so bottle+variant is enough. */
  key: string;
  bottleId: string;
  variantId: string | null;
  name: string;
  distillery: string | null;
  /** Only ever rendered when imageState is "ready". Otherwise a ghost bottle stands here. */
  imageUrl: string | null;
  imageState: ImageState;
  status: BottleStatus;
  /** Not verified yet. Drives the same yellow mark the bottle cards already use. */
  provisional: boolean;
  /** Real-world bottle height in MILLIMETRES, when known. This is what makes a squat Blanton's
   *  read as squat beside a tall bourbon — a cut-out's pixel height only describes its crop. */
  heightMm: number | null;
  /** #113: on the Social shelf, the post that put this bottle here - who and what. */
  post?: ShelfPost;
  /** Friend shelves, All only: whose bottle this is. A single friend does not set it. */
  owner?: ShelfPerson;
};

export type ShelfPost = {
  activityId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  action: string;
};

export type ShelfPage = {
  bottles: ShelfBottle[];
  /** Feed back as `cursor` for the next page. Null means the run has ended. */
  nextCursor: string | null;
};

export type ShelfEmptyState = {
  title: string;
  body: string;
  /** Only shelf one has a one-tap way out of empty. The others just say what is true. */
  cta?: { label: string; action: "scan" };
};

export type ShelfFetchOpts = {
  /** public.users.id — NOT auth.uid(). Null when the viewer is not resolved yet. */
  viewerId: string | null;
  cursor: string | null;
  limit?: number;
  /** #111: the Social shelf in Following mode - only these posters. Empty = an empty shelf. */
  onlyUserIds?: string[] | null;
  /** #111: muted posters, never shown. */
  excludeUserIds?: string[] | null;
  /** Friend shelves: whose bars or wishlists to stand up. Empty = an empty run. */
  friendIds?: string[] | null;
  /** When set, each bottle wears that person's picture. Pass this only for All. */
  friendDirectory?: ShelfPerson[] | null;
};

export type ShelfDef = {
  /** Home shelves use ShelfId; user-page shelves (#110) build their own ids. */
  id: ShelfId | string;
  /** Engraved on the front lip of the shelf. */
  label: string;
  /** Where the label plate goes. */
  href: string;
  empty: ShelfEmptyState;
  fetchPage(opts: ShelfFetchOpts): Promise<ShelfPage>;
  /** Length of the whole run, engraved on the plate. Null when it can't be determined. */
  fetchCount(viewerId: string | null): Promise<number | null>;
};

/* ------------------------------------------------------------------ helpers */

export type Seed = {
  bottleId: string;
  /** The variant the row actually names, when it names one. Null falls back to the default. */
  variantId: string | null;
  /** Carried through buildPage untouched (#113). */
  post?: ShelfPost;
  /** Carried through buildPage. Included in the key so two friends can own the same bottle. */
  owner?: ShelfPerson;
};

type VariantImage = { variantId: string; imageUrl: string | null; shelfReady: boolean; heightMm: number | null };

/**
 * Resolve one image per seed: the variant it names, or the SKU's default variant.
 *
 * A store pick or a specific batch has its own bottle on the shelf; everything else stands in
 * with the SKU's default. Two queries at most, both `in (...)` over a single page.
 */
function variantImageKey(variantId: string) {
  return `v:${variantId}`;
}
function bottleImageKey(bottleId: string) {
  return `b:${bottleId}`;
}

/**
 * Named variants and default variants live under different keys.
 *
 * Friend shelves can stand the same whiskey twice (two friends, or two wishlist
 * versions). Keying only by bottle id made the last variant win, so both cards
 * drew one picture and could collapse to one React key.
 */
async function resolveImages(seeds: Seed[]): Promise<Map<string, VariantImage>> {
  const images = new Map<string, VariantImage>();
  if (!seeds.length) return images;

  const named = [...new Set(seeds.map((s) => s.variantId).filter(Boolean))] as string[];
  const needDefault = [...new Set(seeds.filter((s) => !s.variantId).map((s) => s.bottleId))];

  const pack = (v: { id: string; frontimage_url: string | null; shelf_ready: boolean | null; bottle_height: number | null }): VariantImage => ({
    variantId: v.id,
    imageUrl: v.frontimage_url ?? null,
    shelfReady: Boolean(v.shelf_ready),
    heightMm: v.bottle_height == null ? null : Number(v.bottle_height),
  });

  if (named.length) {
    const { data } = await supabase
      .from("bottle_variants")
      .select("id, bottles_id, frontimage_url, shelf_ready, bottle_height")
      .in("id", named);
    for (const v of data || []) {
      images.set(variantImageKey(v.id as string), pack(v as { id: string; frontimage_url: string | null; shelf_ready: boolean | null; bottle_height: number | null }));
    }
  }

  if (needDefault.length) {
    const { data } = await supabase
      .from("bottle_variants")
      .select("id, bottles_id, frontimage_url, shelf_ready, bottle_height")
      .in("bottles_id", needDefault)
      .eq("is_default", true);
    for (const v of data || []) {
      images.set(bottleImageKey(v.bottles_id as string), pack(v as { id: string; frontimage_url: string | null; shelf_ready: boolean | null; bottle_height: number | null }));
    }
  }

  return images;
}

function imageFor(images: Map<string, VariantImage>, seed: Seed): VariantImage | undefined {
  if (seed.variantId) {
    const named = images.get(variantImageKey(seed.variantId));
    if (named) return named;
  }
  return images.get(bottleImageKey(seed.bottleId));
}

function imageState(v?: VariantImage): ImageState {
  if (!v || !v.imageUrl) return "missing";   // nobody has photographed it
  return v.shelfReady ? "ready" : "unready"; // photographed, but not cut out yet
}

/** Names, houses and verification state for a page of bottle ids. */
async function resolveNames(bottleIds: string[]) {
  const map = new Map<string, { name: string; distillery: string | null; verified: boolean }>();
  if (!bottleIds.length) return map;
  const { data } = await supabase
    .from("bottles")
    .select("id, name, distillery, verified")
    .in("id", bottleIds);
  for (const b of data || []) {
    map.set(b.id as string, {
      name: (b.name as string) ?? "Unknown bottle",
      distillery: (b.distillery as string | null) ?? null,
      verified: Boolean(b.verified),
    });
  }
  return map;
}

/**
 * The viewer's standing with a page of bottles, for the status light.
 *
 * `owned_count > 0` rather than `currently_owned`, matching how My Bar decides what is on the
 * shelf (B-32). A row that exists but is neither owned nor tasted is not a status — it is a
 * leftover — so it reads as "none".
 */
async function resolveStatus(
  viewerId: string | null,
  bottleIds: string[],
  fallback: BottleStatus
): Promise<Map<string, BottleStatus>> {
  const map = new Map<string, BottleStatus>();
  if (!viewerId || !bottleIds.length) return map;

  const { data } = await supabase
    .from("user_bottles")
    .select("bottle_id, owned_count, tasted_at, blind_tasted_at")
    .eq("user_id", viewerId)
    .in("bottle_id", bottleIds);

  for (const r of data || []) {
    const id = r.bottle_id as string;
    const owned = (r.owned_count as number | null) ?? 0;
    const tasted = Boolean(r.tasted_at || r.blind_tasted_at);
    const next: BottleStatus = owned > 0 ? "owned" : tasted ? "tasted" : fallback;
    // A SKU can carry several rows (one per variant). Owning any of them owns the SKU.
    const prev = map.get(id);
    if (prev === "owned") continue;
    if (prev === "tasted" && next !== "owned") continue;
    map.set(id, next);
  }
  return map;
}

/** Assemble a page from its seeds. One place, so every shelf renders the same shape. */
export async function buildPage(
  seeds: Seed[],
  nextCursor: string | null,
  viewerId: string | null,
  fallbackStatus: BottleStatus
): Promise<ShelfPage> {
  const bottleIds = seeds.map((s) => s.bottleId);
  const [images, names, statuses] = await Promise.all([
    resolveImages(seeds),
    resolveNames(bottleIds),
    resolveStatus(viewerId, bottleIds, fallbackStatus),
  ]);

  const bottles: ShelfBottle[] = seeds.map((s) => {
    const img = imageFor(images, s);
    const nm = names.get(s.bottleId);
    return {
      key: `${s.owner ? s.owner.userId + ":" : ""}${s.bottleId}:${s.variantId ?? img?.variantId ?? "default"}`,
      bottleId: s.bottleId,
      variantId: img?.variantId ?? s.variantId ?? null,
      name: nm?.name ?? "Unknown bottle",
      distillery: nm?.distillery ?? null,
      imageUrl: img?.imageUrl ?? null,
      imageState: imageState(img),
      status: statuses.get(s.bottleId) ?? fallbackStatus,
      provisional: nm ? !nm.verified : false,
      heightMm: img?.heightMm ?? null,
      post: s.post,
      owner: s.owner,
    };
  });

  return { bottles, nextCursor };
}

/* ------------------------------------------------------------------ shelves */

/**
 * Shelf 1 — "What do I have?" The viewer's collection, newest first. The shelf seen every single
 * time the app opens.
 */
async function fetchMyBar({ viewerId, cursor, limit = SHELF_PAGE_SIZE }: ShelfFetchOpts): Promise<ShelfPage> {
  if (!viewerId) return { bottles: [], nextCursor: null };

  let q = supabase
    .from("user_bottles")
    .select("bottle_id, variant_id, created_at")
    .eq("user_id", viewerId)
    .gt("owned_count", 0)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) {
    console.error("shelf mybar:", error.message);
    return { bottles: [], nextCursor: null };
  }

  const rows = (data || []) as { bottle_id: string; variant_id: string | null; created_at: string }[];
  // One card per SKU, as the My Bar tab does (B-31) — a SKU owned in two variants is one bottle
  // on the shelf, keeping the first row's variant so the image is the one the user actually owns.
  const seen = new Set<string>();
  const seeds: Seed[] = [];
  for (const r of rows) {
    if (seen.has(r.bottle_id)) continue;
    seen.add(r.bottle_id);
    seeds.push({ bottleId: r.bottle_id, variantId: r.variant_id });
  }

  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
  return buildPage(seeds, nextCursor, viewerId, "owned");
}

/**
 * Shelf 2 — "What is everyone drinking?" Bottles carrying recent activity, most recent first.
 * The bottle is the unit here, not the post: several people drinking the same thing is one
 * bottle on the shelf, standing where its latest activity puts it.
 *
 * Over-fetches because deduplication happens after the read — a busy bottle can hold many
 * consecutive rows, and a page of activities is not a page of bottles.
 */
async function fetchSocial({ viewerId, cursor, limit = SHELF_PAGE_SIZE, onlyUserIds, excludeUserIds }: ShelfFetchOpts): Promise<ShelfPage> {
  const window = limit * 4;
  if (onlyUserIds && onlyUserIds.length === 0) return { bottles: [], nextCursor: null };

  let q = supabase
    .from("activities")
    .select("id, action, user_id, bottle_id, variant_id, session_id, created_at, users!activities_user_id_fkey!inner(account_type, username, avatar_url)")
    .eq("users.account_type", "human")
    // Same exclusion as the Social tab -- the shelf is that tab seen from across the room, so a
    // bottle that only ever got verified must not appear on it either.
    .not("action", "in", FEED_HIDDEN_FILTER)
    // A free-text post with no bottle tagged has nothing to stand on a shelf (Brian, 2026-09-21).
    .not("bottle_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(window);
  if (cursor) q = q.lt("created_at", cursor);
  if (onlyUserIds) q = q.in("user_id", onlyUserIds);
  if (excludeUserIds && excludeUserIds.length) q = q.not("user_id", "in", `(${excludeUserIds.join(",")})`);

  const { data, error } = await q;
  if (error) {
    console.error("shelf social:", error.message);
    return { bottles: [], nextCursor: null };
  }

  const rows = (data || []) as any[];

  // A blind tasting is ONE activity row naming the winner, but on the shelf it is every bottle
  // that was in the lineup, standing together in finishing order (Brian, 2026-09-13). The podium
  // read is the SECURITY DEFINER RPC so other people's tastings expand too; a session that
  // cannot be read just shows its winner, as before.
  const sessionIds = [...new Set(rows.filter((r) => r.action === "tasted" && r.session_id).map((r) => r.session_id as string))];
  const podiums = new Map<string, { bottle_id: string; variant_id: string | null }[]>();
  await Promise.all(
    sessionIds.map(async (sid) => {
      const { data: glasses } = await supabase.rpc("tasting_podium", { p_session_id: sid });
      if (glasses?.length) podiums.set(sid, (glasses as any[]).sort((a, b) => a.rank - b.rank));
    }),
  );

  const seen = new Set<string>();
  const seeds: Seed[] = [];
  let consumed = 0;
  outer: for (const r of rows) {
    consumed++;
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    // The LATEST post for this bottle is the one that put it at this spot on the shelf.
    const post = { activityId: r.id, userId: r.user_id, username: u?.username ?? "Someone", avatarUrl: u?.avatar_url ?? null, action: r.action };
    const lineup = (r.action === "tasted" && r.session_id && podiums.get(r.session_id)) || null;
    const members = lineup
      ? lineup.map((g: { bottle_id: string; variant_id: string | null }) => ({ bottleId: g.bottle_id, variantId: g.variant_id ?? null }))
      : [{ bottleId: r.bottle_id as string | null, variantId: r.variant_id as string | null }];
    for (const m of members) {
      if (!m.bottleId || seen.has(m.bottleId)) continue;
      seen.add(m.bottleId);
      seeds.push({ bottleId: m.bottleId, variantId: m.variantId, post });
      if (seeds.length === limit) break outer;
    }
  }

  // Resume from the last activity row actually read, not the last bottle kept — otherwise the
  // duplicates skipped at the end of this page are read again at the start of the next.
  const exhausted = rows.length < window;
  const nextCursor = exhausted && consumed >= rows.length ? null : rows[consumed - 1]?.created_at ?? null;
  return buildPage(seeds, nextCursor, viewerId, "none");
}

/**
 * Shelf 3 — "What's new in here?" Recently verified bottles, newest first. Shows the catalogue is
 * alive, and puts the verification work on the wall where it can be seen.
 */
async function fetchVerified({ viewerId, cursor, limit = SHELF_PAGE_SIZE }: ShelfFetchOpts): Promise<ShelfPage> {
  let q = supabase
    .from("bottles")
    .select("id, updated_at")
    .eq("verified", true)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (cursor) q = q.lt("updated_at", cursor);

  const { data, error } = await q;
  if (error) {
    console.error("shelf verified:", error.message);
    return { bottles: [], nextCursor: null };
  }

  const rows = (data || []) as { id: string; updated_at: string }[];
  const seeds: Seed[] = rows.map((r) => ({ bottleId: r.id, variantId: null }));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].updated_at : null;
  return buildPage(seeds, nextCursor, viewerId, "verified");
}

/**
 * A friend's bar or wishlist, newest add on the left.
 *
 * One card per (person, bottle). Two friends owning the same whiskey are two bottles when All
 * is selected, and only then does the bottle carry `owner` so the picture bubble can say whose.
 * A personal list is small, so the whole set is read and then sliced — an offset cursor would
 * skip rows as people add bottles under the shelf.
 */
function friendSeeds(
  rows: { user_id: string; bottle_id: string; variant_id: string | null; created_at: string }[],
  directory: ShelfPerson[] | null | undefined,
  collapseKey: (r: { user_id: string; bottle_id: string; variant_id: string | null }) => string,
): Seed[] {
  const dir = new Map((directory ?? []).map((p) => [p.userId, p]));
  const showOwner = dir.size > 0;
  const best = new Map<string, { bottleId: string; variantId: string | null; at: string; userId: string }>();
  for (const r of rows) {
    const key = collapseKey(r);
    const prev = best.get(key);
    if (!prev || r.created_at > prev.at) {
      best.set(key, { bottleId: r.bottle_id, variantId: r.variant_id, at: r.created_at, userId: r.user_id });
    }
  }
  return [...best.values()]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .map((s) => ({
      bottleId: s.bottleId,
      variantId: s.variantId,
      owner: showOwner ? dir.get(s.userId) : undefined,
    }));
}

function sliceFriendPage(seeds: Seed[], cursor: string | null, limit: number, viewerId: string | null): Promise<ShelfPage> {
  const start = cursor ? Number(cursor) : 0;
  const safe = Number.isFinite(start) && start > 0 ? start : 0;
  const page = seeds.slice(safe, safe + limit);
  const nextCursor = safe + limit < seeds.length ? String(safe + limit) : null;
  return buildPage(page, nextCursor, viewerId, "none");
}

async function fetchFriendBar({ viewerId, cursor, limit = SHELF_PAGE_SIZE, friendIds, friendDirectory }: ShelfFetchOpts): Promise<ShelfPage> {
  const ids = friendIds ?? [];
  if (!ids.length) return { bottles: [], nextCursor: null };
  const { data, error } = await supabase
    .from("user_bottles")
    .select("user_id, bottle_id, variant_id, created_at")
    .in("user_id", ids)
    .gt("owned_count", 0)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("shelf friendsbar:", error.message);
    return { bottles: [], nextCursor: null };
  }
  const seeds = friendSeeds(
    (data || []) as { user_id: string; bottle_id: string; variant_id: string | null; created_at: string }[],
    friendDirectory,
    (r) => `${r.user_id}:${r.bottle_id}`,
  );
  return sliceFriendPage(seeds, cursor, limit, viewerId);
}

async function fetchFriendWishlist({ viewerId, cursor, limit = SHELF_PAGE_SIZE, friendIds, friendDirectory }: ShelfFetchOpts): Promise<ShelfPage> {
  const ids = friendIds ?? [];
  if (!ids.length) return { bottles: [], nextCursor: null };
  const { data, error } = await supabase
    .from("wishlists")
    .select("user_id, bottle_id, variant_id, created_at")
    .in("user_id", ids)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("shelf friendswish:", error.message);
    return { bottles: [], nextCursor: null };
  }
  const seeds = friendSeeds(
    (data || []) as { user_id: string; bottle_id: string; variant_id: string | null; created_at: string }[],
    friendDirectory,
    (r) => `${r.user_id}:${r.variant_id ?? r.bottle_id}`,
  );
  return sliceFriendPage(seeds, cursor, limit, viewerId);
}

export async function countFriendOwned(userIds: string[]): Promise<number | null> {
  if (!userIds.length) return 0;
  const { data, error } = await supabase
    .from("user_bottles")
    .select("user_id, bottle_id")
    .in("user_id", userIds)
    .gt("owned_count", 0);
  if (error) {
    console.error("shelf count friendsbar:", error.message);
    return null;
  }
  return new Set((data || []).map((r: { user_id: string; bottle_id: string }) => `${r.user_id}:${r.bottle_id}`)).size;
}

export async function countFriendWishlist(userIds: string[]): Promise<number | null> {
  if (!userIds.length) return 0;
  const { data, error } = await supabase
    .from("wishlists")
    .select("user_id, variant_id, bottle_id")
    .in("user_id", userIds);
  if (error) {
    console.error("shelf count friendswish:", error.message);
    return null;
  }
  return new Set((data || []).map((r: { user_id: string; variant_id: string | null; bottle_id: string }) => `${r.user_id}:${r.variant_id ?? r.bottle_id}`)).size;
}

/* ------------------------------------------------------------------- counts */

/**
 * The number on the plate. Two of these count distinct bottles, which PostgREST cannot do with a
 * HEAD count, so they read the id column and reduce it here.
 *
 * That is fine at present scale (a collection is tens of rows; activities is in the hundreds) and
 * it is bounded by real limits — but the Social one grows with the whole feed forever. **When the
 * feed gets big, move that one to a SQL count and stop reading ids into the client.**
 */
function distinct(
  label: string,
  res: { data: { bottle_id: string }[] | null; error: { message: string } | null }
): number | null {
  if (res.error) {
    console.error(`shelf count ${label}:`, res.error.message);
    return null;
  }
  return new Set((res.data || []).map((r) => r.bottle_id)).size;
}

async function countMyBar(viewerId: string | null) {
  if (!viewerId) return 0;
  return distinct(
    "mybar",
    await supabase
      .from("user_bottles")
      .select("bottle_id")
      .eq("user_id", viewerId)
      .gt("owned_count", 0)
  );
}

async function countSocial() {
  return distinct(
    "social",
    await supabase
      .from("activities")
      .select("bottle_id, users!activities_user_id_fkey!inner(account_type)")
      .eq("users.account_type", "human")
      .not("action", "in", FEED_HIDDEN_FILTER)
      .not("bottle_id", "is", null)
  );
}

async function countVerified() {
  const { count, error } = await supabase
    .from("bottles")
    .select("id", { count: "exact", head: true })
    .eq("verified", true);
  if (error) {
    console.error("shelf count verified:", error.message);
    return null;
  }
  return count ?? null;
}

/* ----------------------------------------------------------------- registry */

/**
 * The cabinet, top shelf first. Array order IS shelf order — fixed for v1 by Brian's decision;
 * #84 turns this into a per-user preference.
 *
 * Friend shelves sit under My Bar and above Social. Who is on them is chosen on the shelf
 * itself (Home passes friendIds); these entries only know how to read that choice.
 */
export const SHELVES: ShelfDef[] = [
  {
    id: "mybar",
    label: "My Bar",
    href: "/mybar",
    empty: {
      title: "Your bar is empty.",
      body: "Scan your first bottle.",
      cta: { label: "Scan a barcode", action: "scan" },
    },
    fetchPage: fetchMyBar,
    fetchCount: countMyBar,
  },
  {
    id: "friendsbar",
    label: "My Friend's Bar",
    href: "",
    empty: {
      title: "Nothing on this shelf.",
      body: "Pick a friend.",
    },
    fetchPage: fetchFriendBar,
    fetchCount: async () => null,
  },
  {
    id: "friendswish",
    label: "Friends' Wishlists",
    href: "",
    empty: {
      title: "Nothing on this shelf.",
      body: "Pick a friend.",
    },
    fetchPage: fetchFriendWishlist,
    fetchCount: async () => null,
  },
  {
    id: "social",
    label: "Social",
    href: "/social",
    empty: {
      title: "Nothing has happened yet.",
      body: "Add a bottle, or pour one.",
    },
    fetchPage: fetchSocial,
    fetchCount: countSocial,
  },
  {
    id: "verified",
    label: "Recently Verified",
    href: "/search",
    empty: {
      title: "Nothing verified lately.",
      body: "Check back soon.",
    },
    fetchPage: fetchVerified,
    fetchCount: countVerified,
  },
];

export function shelfById(id: ShelfId): ShelfDef | undefined {
  return SHELVES.find((s) => s.id === id);
}
