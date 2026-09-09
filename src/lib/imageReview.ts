import { supabase } from "@/lib/supabase";

/**
 * Image review for the Home cabinet (#83, part of #82).
 *
 * `shelf_ready` says an image can stand on a shelf. This is the other half: WHY one cannot. A
 * rejection carrying reasons is not a dead end, it is a work order — "every image needing
 * background removal" is one query, so the curation pass doubles as the queue for the cleanup
 * jobs that come later.
 *
 * The four states are DERIVED, never stored. In particular "needs re-review" is just
 * `flagged_at > reviewed_at`, so a user flag reopens a decision without any state machine that
 * can get stuck, and reviewing again clears it by definition.
 */

export type ReviewState = "needs_rereview" | "approved" | "rejected" | "unreviewed";

export type RejectReason = { id: string; slug: string; label: string; sortOrder: number };

export type ReviewBottle = {
  variantId: string;
  bottleId: string;
  name: string;
  distillery: string | null;
  imageUrl: string | null;
  state: ReviewState;
  reasonIds: string[];
  note: string | null;
  flagNote: string | null;
  /** How many people have this on their shelf right now. A bottle somebody owns is one somebody
   *  will actually see on Home, so it is worth reviewing before one nobody has. */
  ownerCount: number;
  /** Most recent activity anywhere on this bottle, for the ordering. Null if never touched. */
  lastActivityAt: string | null;
};

type VariantRow = {
  id: string;
  bottles_id: string;
  frontimage_url: string | null;
  shelf_ready: boolean;
  image_reject_reason_ids: string[] | null;
  image_review_note: string | null;
  image_reviewed_at: string | null;
  image_flagged_at: string | null;
  image_flag_note: string | null;
  bottles: { name: string; distillery: string | null } | { name: string; distillery: string | null }[] | null;
};

function stateOf(r: VariantRow): ReviewState {
  const flagged = r.image_flagged_at;
  if (flagged && (!r.image_reviewed_at || flagged > r.image_reviewed_at)) return "needs_rereview";
  if (r.shelf_ready) return "approved";
  if ((r.image_reject_reason_ids || []).length > 0) return "rejected";
  return "unreviewed";
}


/**
 * Who owns what, across all users — admins can read every `user_bottles` row.
 * Keyed by variant AND by bottle: a person may own a store pick while the image under review is
 * the SKU default, and that still counts as "somebody has this bottle".
 */
async function fetchOwnership(): Promise<{ byVariant: Map<string, number>; byBottle: Map<string, number> }> {
  const byVariant = new Map<string, number>();
  const byBottle = new Map<string, number>();
  const { data, error } = await supabase
    .from("user_bottles")
    .select("bottle_id, variant_id, owned_count")
    .gt("owned_count", 0);
  if (error) {
    console.error("fetchOwnership:", error.message);
    return { byVariant, byBottle };
  }
  for (const r of (data || []) as { bottle_id: string; variant_id: string | null }[]) {
    if (r.variant_id) byVariant.set(r.variant_id, (byVariant.get(r.variant_id) ?? 0) + 1);
    byBottle.set(r.bottle_id, (byBottle.get(r.bottle_id) ?? 0) + 1);
  }
  return { byVariant, byBottle };
}

/**
 * The most recent activity per bottle and per variant.
 *
 * This drives the ORDER of the review shelf: the bottles people are actually drinking, rating and
 * adding are the ones whose images get seen, so they are worth fixing first. Reading the feed
 * newest-first and keeping the first sighting of each id gives the latest without a per-bottle
 * query.
 */
async function fetchLastActivity(): Promise<{ byVariant: Map<string, string>; byBottle: Map<string, string> }> {
  const byVariant = new Map<string, string>();
  const byBottle = new Map<string, string>();
  const { data, error } = await supabase
    .from("activities")
    .select("bottle_id, variant_id, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("fetchLastActivity:", error.message);
    return { byVariant, byBottle };
  }
  for (const r of (data || []) as { bottle_id: string; variant_id: string | null; created_at: string }[]) {
    if (r.variant_id && !byVariant.has(r.variant_id)) byVariant.set(r.variant_id, r.created_at);
    if (r.bottle_id && !byBottle.has(r.bottle_id)) byBottle.set(r.bottle_id, r.created_at);
  }
  return { byVariant, byBottle };
}

export async function fetchRejectReasons(): Promise<RejectReason[]> {
  const { data, error } = await supabase
    .from("image_reject_reasons")
    .select("id, slug, label, sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    console.error("fetchRejectReasons:", error.message);
    return [];
  }
  return (data || []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    label: r.label as string,
    sortOrder: r.sort_order as number,
  }));
}

/**
 * The review queue, **always ordered by most recent activity, newest on the left.**
 *
 * That ordering is the point: the bottles people are drinking, rating and adding are the ones
 * whose images actually get looked at, so fixing those first puts the work where it shows.
 * Bottles nobody has touched sort to the end rather than being hidden.
 *
 * The state list and `ownedOnly` are the slicers. Owning is a strong signal for the same reason —
 * a bottle on somebody's shelf is one somebody will meet on their own Home.
 */
export async function fetchReviewShelf(opts: {
  states: ReviewState[];
  reasonId?: string | null;
  /** Only bottles at least one person has in their bar. */
  ownedOnly?: boolean;
  limit?: number;
}): Promise<ReviewBottle[]> {
  const limit = opts.limit ?? 12;

  // Filtering on derived state cannot be pushed into PostgREST without a view, so this reads a
  // generous window ordered by the queue index and reduces it here. Bounded by the catalogue
  // (133 variants today); revisit if the catalogue reaches thousands.
  const [{ data, error }, ownership, activity] = await Promise.all([
    supabase
      .from("bottle_variants")
      .select(
        "id, bottles_id, frontimage_url, shelf_ready, image_reject_reason_ids, image_review_note, " +
          "image_reviewed_at, image_flagged_at, image_flag_note, bottles(name, distillery)"
      )
      .limit(400),
    fetchOwnership(),
    fetchLastActivity(),
  ]);

  if (error) {
    console.error("fetchReviewShelf:", error.message);
    return [];
  }

  const rows = (data || []) as unknown as VariantRow[];
  const out: ReviewBottle[] = [];
  for (const r of rows) {
    const state = stateOf(r);
    if (!opts.states.includes(state)) continue;
    const reasonIds = r.image_reject_reason_ids || [];
    if (opts.reasonId && !reasonIds.includes(opts.reasonId)) continue;

    const ownerCount =
      (ownership.byVariant.get(r.id) ?? 0) || (ownership.byBottle.get(r.bottles_id) ?? 0);
    if (opts.ownedOnly && ownerCount === 0) continue;

    const b = Array.isArray(r.bottles) ? r.bottles[0] : r.bottles;
    out.push({
      variantId: r.id,
      bottleId: r.bottles_id,
      name: b?.name ?? "Unknown bottle",
      distillery: b?.distillery ?? null,
      imageUrl: r.frontimage_url,
      state,
      reasonIds,
      note: r.image_review_note,
      flagNote: r.image_flag_note,
      ownerCount,
      // A variant's own activity is more specific than the SKU's, so prefer it.
      lastActivityAt: activity.byVariant.get(r.id) ?? activity.byBottle.get(r.bottles_id) ?? null,
    });
  }

  // Newest activity on the left. Never-touched bottles fall to the end rather than disappearing,
  // ranked among themselves by how many people own them.
  //
  // Sorted AFTER filtering and across the whole candidate set, not per page -- otherwise the
  // leftmost bottle would only be the most active one of an arbitrary first slice.
  out.sort((a, b) => {
    if (a.lastActivityAt && b.lastActivityAt) return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
    if (a.lastActivityAt) return -1;
    if (b.lastActivityAt) return 1;
    return b.ownerCount - a.ownerCount;
  });

  return out.slice(0, limit);
}

/** Counts for the slicer, so the tab can show how much work is left without loading it. */
export async function fetchReviewCounts(): Promise<Record<ReviewState, number>> {
  const counts: Record<ReviewState, number> = {
    needs_rereview: 0,
    approved: 0,
    rejected: 0,
    unreviewed: 0,
  };
  const { data, error } = await supabase
    .from("bottle_variants")
    .select("id, bottles_id, frontimage_url, shelf_ready, image_reject_reason_ids, " +
            "image_review_note, image_reviewed_at, image_flagged_at, image_flag_note, bottles(name)");
  if (error) {
    console.error("fetchReviewCounts:", error.message);
    return counts;
  }
  for (const r of (data || []) as unknown as VariantRow[]) counts[stateOf(r)]++;
  return counts;
}

/** Approve: the image goes on the shelf, and any previous rejection is cleared with it. */
export async function approveImage(variantId: string, reviewerId: string) {
  const { error } = await supabase
    .from("bottle_variants")
    .update({
      shelf_ready: true,
      image_reject_reason_ids: [],
      image_review_note: null,
      image_reviewed_at: new Date().toISOString(),
      image_reviewed_by: reviewerId,
    })
    .eq("id", variantId);
  return { error: error?.message };
}

/**
 * Reject with one or more reasons. Several can be true at once, and the second reason is exactly
 * what tells an automated job it cannot fix this image on its own.
 */
export async function rejectImage(
  variantId: string,
  reviewerId: string,
  reasonIds: string[],
  note?: string
) {
  const { error } = await supabase
    .from("bottle_variants")
    .update({
      shelf_ready: false,
      image_reject_reason_ids: reasonIds,
      image_review_note: note?.trim() || null,
      image_reviewed_at: new Date().toISOString(),
      image_reviewed_by: reviewerId,
    })
    .eq("id", variantId);
  return { error: error?.message };
}

/** A reason typed once joins the list, so the vocabulary grows out of the work itself. */
export async function addRejectReason(label: string, createdBy: string): Promise<RejectReason | null> {
  const clean = label.trim();
  if (!clean) return null;
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
  const { data, error } = await supabase
    .from("image_reject_reasons")
    .insert({ slug, label: clean, sort_order: 500, created_by: createdBy })
    .select("id, slug, label, sort_order")
    .single();
  if (error) {
    console.error("addRejectReason:", error.message);
    return null;
  }
  return { id: data.id, slug: data.slug, label: data.label, sortOrder: data.sort_order };
}
