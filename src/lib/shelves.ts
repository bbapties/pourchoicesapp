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

export type ShelfId = "mybar" | "social" | "verified";

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
};

export type ShelfDef = {
  id: ShelfId;
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

type Seed = {
  bottleId: string;
  /** The variant the row actually names, when it names one. Null falls back to the default. */
  variantId: string | null;
};

type VariantImage = { variantId: string; imageUrl: string | null; shelfReady: boolean; heightMm: number | null };

/**
 * Resolve one image per seed: the variant it names, or the SKU's default variant.
 *
 * A store pick or a specific batch has its own bottle on the shelf; everything else stands in
 * with the SKU's default. Two queries at most, both `in (...)` over a single page.
 */
async function resolveImages(seeds: Seed[]): Promise<Map<string, VariantImage>> {
  const byBottle = new Map<string, VariantImage>();
  if (!seeds.length) return byBottle;

  const named = [...new Set(seeds.map((s) => s.variantId).filter(Boolean))] as string[];
  const needDefault = [...new Set(seeds.filter((s) => !s.variantId).map((s) => s.bottleId))];

  if (named.length) {
    const { data } = await supabase
      .from("bottle_variants")
      .select("id, bottles_id, frontimage_url, shelf_ready, bottle_height")
      .in("id", named);
    for (const v of data || []) {
      byBottle.set(v.bottles_id as string, {
        variantId: v.id as string,
        imageUrl: (v.frontimage_url as string | null) ?? null,
        shelfReady: Boolean(v.shelf_ready),
        heightMm: v.bottle_height == null ? null : Number(v.bottle_height),
      });
    }
  }

  if (needDefault.length) {
    const { data } = await supabase
      .from("bottle_variants")
      .select("id, bottles_id, frontimage_url, shelf_ready, bottle_height")
      .in("bottles_id", needDefault)
      .eq("is_default", true);
    for (const v of data || []) {
      // A named variant already won this SKU; don't let the default overwrite it.
      if (byBottle.has(v.bottles_id as string)) continue;
      byBottle.set(v.bottles_id as string, {
        variantId: v.id as string,
        imageUrl: (v.frontimage_url as string | null) ?? null,
        shelfReady: Boolean(v.shelf_ready),
        heightMm: v.bottle_height == null ? null : Number(v.bottle_height),
      });
    }
  }

  return byBottle;
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
async function buildPage(
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
    const img = images.get(s.bottleId);
    const nm = names.get(s.bottleId);
    return {
      key: `${s.bottleId}:${img?.variantId ?? s.variantId ?? "default"}`,
      bottleId: s.bottleId,
      variantId: img?.variantId ?? s.variantId ?? null,
      name: nm?.name ?? "Unknown bottle",
      distillery: nm?.distillery ?? null,
      imageUrl: img?.imageUrl ?? null,
      imageState: imageState(img),
      status: statuses.get(s.bottleId) ?? fallbackStatus,
      provisional: nm ? !nm.verified : false,
      heightMm: img?.heightMm ?? null,
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
async function fetchSocial({ viewerId, cursor, limit = SHELF_PAGE_SIZE }: ShelfFetchOpts): Promise<ShelfPage> {
  const window = limit * 4;

  let q = supabase
    .from("activities")
    .select("bottle_id, variant_id, created_at, users!activities_user_id_fkey!inner(account_type)")
    .eq("users.account_type", "human")
    // Same exclusion as the Social tab -- the shelf is that tab seen from across the room, so a
    // bottle that only ever got verified must not appear on it either.
    .not("action", "in", FEED_HIDDEN_FILTER)
    .order("created_at", { ascending: false })
    .limit(window);
  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) {
    console.error("shelf social:", error.message);
    return { bottles: [], nextCursor: null };
  }

  const rows = (data || []) as { bottle_id: string; variant_id: string | null; created_at: string }[];
  const seen = new Set<string>();
  const seeds: Seed[] = [];
  let consumed = 0;
  for (const r of rows) {
    consumed++;
    if (!r.bottle_id || seen.has(r.bottle_id)) continue;
    seen.add(r.bottle_id);
    seeds.push({ bottleId: r.bottle_id, variantId: r.variant_id });
    if (seeds.length === limit) break;
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
