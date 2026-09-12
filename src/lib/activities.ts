import { supabase } from "@/lib/supabase";

// Policy: every user/admin action on a bottle writes an activities row
// until Brian explicitly excludes it. Fail-open — never block the parent action.
// Current exclusion: admin hard-delete of a bottle (FK ON DELETE CASCADE would
// wipe the feed row with the bottle).

export type ActivityAction =
  | "drank"
  | "added_to_collection"
  | "finished"
  | "added_to_db"
  | "suggested_edit"
  | "verified"
  | "removed_from_collection"
  | "wishlisted"
  | "tasted";

export type PourType = "neat" | "rocks" | "mixed" | "blind";

/**
 * Actions that are recorded but NEVER shown socially.
 *
 * Both entries are CATALOGUE ADMIN rather than anything anyone did with a bottle:
 *   `verified`    — Brian ticking a box. 68 of 137 rows.
 *   `added_to_db` — a bottle record being created. A row appearing in the catalogue is not an
 *                   event in anyone's drinking life; adding it to your OWN bar is, and that is
 *                   `added_to_collection`, which stays.
 *
 * Hiding them here rather than not logging them keeps the audit trail whole: `activities` is the
 * record of what happened to a bottle, and both of these DID happen. They just are not news.
 *
 * Filtered at every SOCIAL read (this feed and Home's Social shelf). Per-bottle history and admin
 * screens still show them, which is where they belong. Adding another action is one line.
 */
export const FEED_HIDDEN_ACTIONS: ActivityAction[] = ["verified", "added_to_db"];

/** PostgREST `not.in` list, e.g. `(verified)`. */
export const FEED_HIDDEN_FILTER = `(${FEED_HIDDEN_ACTIONS.join(",")})`;

export type ActivityRow = {
  id: string;
  action: ActivityAction;
  pourType: PourType | null;
  createdAt: string;
  bottleId: string;
  userId: string;
  username: string;
  avatarUrl?: string | null;
  bottleName: string;
  bottleDistillery?: string | null;
  bottleImageUrl?: string | null;
};

function formatActivityDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Detail-card "My last activity" line. */
export function formatActivityLine(row: {
  action: ActivityAction;
  pour_type?: PourType | null;
  created_at: string;
}): string | undefined {
  const date = formatActivityDate(row.created_at);
  if (!date) return undefined;
  switch (row.action) {
    case "drank":
      return `Drank · ${date}`;
    case "added_to_collection":
      return `Added · ${date}`;
    case "finished":
      return `Finished · ${date}`;
    case "added_to_db":
      return `Added to DB · ${date}`;
    case "suggested_edit":
      return `Suggested edit · ${date}`;
    case "verified":
      return `Verified · ${date}`;
    case "removed_from_collection":
      return `Removed · ${date}`;
    case "wishlisted":
      return `Wishlisted · ${date}`;
    case "tasted":
      return `Blind tasting · ${date}`;
    default:
      return date;
  }
}

/** Verb phrase for the Social feed. */
export function formatFeedAction(action: ActivityAction, pourType?: PourType | null): string {
  if (action === "drank") {
    if (pourType === "neat") return "drank it neat";
    if (pourType === "rocks") return "drank it on the rocks";
    if (pourType === "mixed") return "drank it mixed";
    if (pourType === "blind") return "drank it blind";
    return "drank it";
  }
  if (action === "added_to_collection") return "added it to their collection";
  if (action === "finished") return "finished it";
  if (action === "added_to_db") return "added it to the DB";
  if (action === "suggested_edit") return "suggested an edit";
  if (action === "verified") return "verified it";
  if (action === "removed_from_collection") return "removed it from their collection";
  if (action === "wishlisted") return "added it to their wishlist";
  if (action === "tasted") return "did a blind tasting with it";
  return action;
}

export function formatFeedTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Insert an activity. Fail-open: never throws, never blocks the parent action. */
export async function logActivity(opts: {
  userId: string;
  bottleId: string;
  action: ActivityAction;
  pourType?: PourType | null;
  variantId?: string | null;
}): Promise<{ error?: string }> {
  const pourType = opts.action === "drank" ? (opts.pourType ?? null) : null;
  if (opts.action === "drank" && !pourType) {
    return { error: "Pour type is required" };
  }

  const { error } = await supabase.from("activities").insert({
    user_id: opts.userId,
    bottle_id: opts.bottleId,
    variant_id: opts.variantId ?? null,
    action: opts.action,
    pour_type: pourType,
  });

  if (error) {
    console.error("logActivity:", error.message);
    return { error: error.message };
  }
  return {};
}

/**
 * B.4: delete one of the viewer's own hand-logged activities (a pour / add / finished), which
 * also removes it from the Social feed. RLS only permits deleting your own drank/added/finished
 * rows — tastings are permanent.
 */
export async function deleteActivity(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function fetchLastActivityForBottle(
  userId: string,
  bottleId: string
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("activities")
    .select("action, pour_type, created_at")
    .eq("user_id", userId)
    .eq("bottle_id", bottleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("fetchLastActivityForBottle:", error.message);
    return undefined;
  }
  if (!data) return undefined;
  return formatActivityLine({
    action: data.action as ActivityAction,
    pour_type: (data.pour_type as PourType | null) ?? null,
    created_at: data.created_at,
  });
}

// `users!activities_user_id_fkey!inner`: the FK name is spelled out because post_reactions is a
// junction between activities and users, so PostgREST sees two paths and refuses a bare `users`.
// `!inner` is deliberate: the feed is filtered to real people
// (`account_type = 'human'`), and a plain embedded filter would null the embed
// instead of dropping the row. Seeded ranking accounts (`data`) and QA accounts
// (`test`) still move personal + global Elo -- they just never post here.
// This is the ONLY activities read that spans users; every other one is already
// scoped to the viewer's own user_id, so the feed is the only surface to filter.
/**
 * #63: the image comes from the VARIANT, never `bottles.frontimage_url`.
 *
 * That column is the pre-7.1 legacy one. Every other screen resolves an image from the default
 * variant, and `adminUpdateBottleFields` deliberately writes display fields there -- its own
 * comment says writing them to `bottles` would leave the edit invisible in search. So verifying a
 * bottle updated the variant while the feed kept rendering whatever stale value sat on `bottles`,
 * which is exactly what Brian reported: the picture frozen as it was when the post was made.
 * Measured 2026-09-07: 62 bottles disagreed between the two columns, 58 of them present in the
 * feed, and 60 had no legacy image at all despite having a real one.
 *
 * `name` and `distillery` stay on `bottles` on purpose -- those are identity fields and an admin
 * edit writes them there, so they are current.
 */
const FEED_SELECT = `
  id, action, pour_type, created_at, bottle_id, variant_id, user_id,
  users!activities_user_id_fkey!inner ( username, avatar_url ),
  bottles ( name, distillery ),
  bottle_variants ( frontimage_url )
`;

export async function fetchActivityFeed(opts: {
  offset: number;
  limit: number;
}): Promise<{ rows: ActivityRow[]; error?: string }> {
  const to = opts.offset + opts.limit - 1;
  const { data, error } = await supabase
    .from("activities")
    .select(FEED_SELECT)
    .eq("users.account_type", "human")
    .not("action", "in", FEED_HIDDEN_FILTER)
    .order("created_at", { ascending: false })
    .range(opts.offset, to);

  if (error) {
    console.error("fetchActivityFeed:", error.message);
    return { rows: [], error: error.message };
  }

  const raws = (data || []) as any[];

  // Just over half of the feed predates per-variant activity logging and carries no variant_id, so
  // those rows need the bottle's DEFAULT variant image. all_bottle_details already resolves exactly
  // that, and reusing it means the feed cannot drift from what search shows.
  const needDefault = [...new Set(
    raws.filter((r) => !r.variant_id).map((r) => r.bottle_id as string).filter(Boolean)
  )];
  const defaultImages = new Map<string, string | null>();
  if (needDefault.length) {
    const { data: defs } = await supabase
      .from("all_bottle_details")
      .select("bottle_id, attr_frontimage_url")
      .in("bottle_id", needDefault);
    (defs || []).forEach((d: { bottle_id: string; attr_frontimage_url: string | null }) =>
      defaultImages.set(d.bottle_id, d.attr_frontimage_url)
    );
  }

  const rows: ActivityRow[] = raws.map((raw: any) => {
    const user = Array.isArray(raw.users) ? raw.users[0] : raw.users;
    const bottle = Array.isArray(raw.bottles) ? raw.bottles[0] : raw.bottles;
    const variant = Array.isArray(raw.bottle_variants) ? raw.bottle_variants[0] : raw.bottle_variants;
    return {
      id: raw.id,
      action: raw.action as ActivityAction,
      pourType: (raw.pour_type as PourType | null) ?? null,
      createdAt: raw.created_at,
      bottleId: raw.bottle_id,
      userId: raw.user_id,
      username: user?.username ?? "Someone",
      avatarUrl: user?.avatar_url ?? null,
      bottleName: bottle?.name ?? "Unknown bottle",
      bottleDistillery: bottle?.distillery ?? null,
      // The version the post was actually about, when it names one -- a store pick or a specific
      // batch should show its own bottle, not the SKU's stand-in.
      bottleImageUrl: variant?.frontimage_url ?? defaultImages.get(raw.bottle_id) ?? null,
    };
  });

  return { rows };
}
