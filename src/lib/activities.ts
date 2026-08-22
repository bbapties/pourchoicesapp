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
  | "removed_from_collection";

export type PourType = "neat" | "rocks" | "mixed" | "blind";

export type ActivityRow = {
  id: string;
  action: ActivityAction;
  pourType: PourType | null;
  createdAt: string;
  bottleId: string;
  userId: string;
  username: string;
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

const FEED_SELECT = `
  id, action, pour_type, created_at, bottle_id, user_id,
  users ( username ),
  bottles ( name, distillery, frontimage_url )
`;

export async function fetchActivityFeed(opts: {
  offset: number;
  limit: number;
}): Promise<{ rows: ActivityRow[]; error?: string }> {
  const to = opts.offset + opts.limit - 1;
  const { data, error } = await supabase
    .from("activities")
    .select(FEED_SELECT)
    .order("created_at", { ascending: false })
    .range(opts.offset, to);

  if (error) {
    console.error("fetchActivityFeed:", error.message);
    return { rows: [], error: error.message };
  }

  const rows: ActivityRow[] = (data || []).map((raw: any) => {
    const user = Array.isArray(raw.users) ? raw.users[0] : raw.users;
    const bottle = Array.isArray(raw.bottles) ? raw.bottles[0] : raw.bottles;
    return {
      id: raw.id,
      action: raw.action as ActivityAction,
      pourType: (raw.pour_type as PourType | null) ?? null,
      createdAt: raw.created_at,
      bottleId: raw.bottle_id,
      userId: raw.user_id,
      username: user?.username ?? "Someone",
      bottleName: bottle?.name ?? "Unknown bottle",
      bottleDistillery: bottle?.distillery ?? null,
      bottleImageUrl: bottle?.frontimage_url ?? null,
    };
  });

  return { rows };
}
