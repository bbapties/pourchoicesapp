import { supabase } from "@/lib/supabase";

/** One row in the per-variant interaction timeline (BOTTLE_ACTIONS.md B.1 history modal). */
export type HistoryItem = {
  kind: "added" | "emptied" | "drank" | "removed" | "tasted" | "edit" | "wishlisted";
  pourType?: string | null;
  at: string; // ISO
  label: string;
  activityId?: string; // set for deletable hand-logged items (pours) — B.4
};

export type VariantHistory = {
  counts: {
    added: number;
    emptied: number;
    pours: number;
    tastings: number;
  };
  timeline: HistoryItem[];
};

const ACTION_LABEL: Record<string, string> = {
  added_to_collection: "Added to bar",
  finished: "Marked empty",
  removed_from_collection: "Removed from bar",
  suggested_edit: "Suggested an edit",
  wishlisted: "Wishlisted",
};

/**
 * Read-only per-(user, variant) history: every logged interaction with one version, for the
 * detail card's history modal. Fail-open — returns an empty history on any error so the modal
 * never breaks the card. No writes, no schema.
 */
export async function fetchVariantHistory(
  userId: string,
  bottleId: string,
  variantId: string | null,
): Promise<VariantHistory> {
  const empty: VariantHistory = { counts: { added: 0, emptied: 0, pours: 0, tastings: 0 }, timeline: [] };
  if (!userId || !variantId) return empty;

  try {
    const [{ data: acts }, { data: sessions }] = await Promise.all([
      supabase
        .from("activities")
        .select("id, action, pour_type, created_at")
        .eq("user_id", userId)
        .eq("bottle_id", bottleId)
        .eq("variant_id", variantId)
        .order("created_at", { ascending: false }),
      supabase.from("tasting_sessions").select("id").eq("user_id", userId),
    ]);

    const timeline: HistoryItem[] = [];
    const counts = { added: 0, emptied: 0, pours: 0, tastings: 0 };

    for (const a of acts || []) {
      const action = a.action as string;
      const at = a.created_at as string;
      if (action === "added_to_collection") counts.added += 1;
      else if (action === "finished") counts.emptied += 1;
      else if (action === "drank") counts.pours += 1;

      if (action === "drank") {
        timeline.push({ kind: "drank", pourType: a.pour_type, at, label: `Poured${a.pour_type ? ` · ${a.pour_type}` : ""}`, activityId: (a as { id?: string }).id });
      } else if (action === "added_to_collection") {
        timeline.push({ kind: "added", at, label: ACTION_LABEL[action] });
      } else if (action === "finished") {
        timeline.push({ kind: "emptied", at, label: ACTION_LABEL[action] });
      } else if (action === "removed_from_collection") {
        timeline.push({ kind: "removed", at, label: ACTION_LABEL[action] });
      } else if (action === "suggested_edit") {
        timeline.push({ kind: "edit", at, label: ACTION_LABEL[action] });
      } else if (action === "wishlisted") {
        timeline.push({ kind: "wishlisted", at, label: ACTION_LABEL[action] });
      }
    }

    const sessionIds = (sessions || []).map((s: { id: string }) => s.id);
    if (sessionIds.length) {
      const { data: results } = await supabase
        .from("tasting_results")
        .select("winner_variant_id, loser_variant_id, tasting_session_id, created_at")
        .in("tasting_session_id", sessionIds);
      // Count distinct sessions that involved this variant; one timeline row per such session.
      const perSession = new Map<string, string>();
      for (const r of results || []) {
        if (r.winner_variant_id === variantId || r.loser_variant_id === variantId) {
          const sid = r.tasting_session_id as string;
          const at = r.created_at as string;
          if (!perSession.has(sid) || at < perSession.get(sid)!) perSession.set(sid, at);
        }
      }
      counts.tastings = perSession.size;
      for (const at of perSession.values()) {
        timeline.push({ kind: "tasted", at, label: "Blind tasting" });
      }
    }

    timeline.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { counts, timeline };
  } catch {
    return empty;
  }
}
