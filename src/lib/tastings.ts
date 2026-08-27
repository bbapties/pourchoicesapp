import { supabase } from "@/lib/supabase";

/** One bottle in a tasting lineup (a specific variant of a SKU). */
export type TastingPick = {
  bottleId: string;
  variantId: string;
  name: string;
  subtitle?: string | null;
};

export type GlassNote = { nose?: string; palate?: string; finish?: string };

/**
 * Persist a completed blind tasting and let the DB Elo trigger score it.
 *
 * `picks` MUST be in final RANKED order (index 0 = 1st place / most preferred).
 * We create the session, write one tasting_details row per glass (optional notes),
 * then insert ALL pairwise winner/loser rows in a SINGLE statement so the
 * statement-level `trig_update_elo_after_session` fires once with the whole set
 * (personal + global variant Elo, store-pick rollup — see sql/3.0-migration.sql).
 *
 * `userId` is the caller's public users.id (RLS resolves auth.uid() -> that id).
 */
export async function saveTasting(opts: {
  userId: string;
  mode: "self" | "helper";
  picks: TastingPick[]; // ranked best -> worst
  notes?: Record<string, GlassNote>; // keyed by variantId (optional)
  name?: string | null;
}): Promise<{ sessionId: string } | { error: string }> {
  const picks = opts.picks;
  if (picks.length < 2) return { error: "Need at least 2 bottles" };

  // 1. Session
  const { data: session, error: sErr } = await supabase
    .from("tasting_sessions")
    .insert({
      user_id: opts.userId,
      is_blind: true,
      mode: opts.mode,
      name: opts.name ?? null,
      bottle_ids: picks.map((p) => p.bottleId),
      variant_ids: picks.map((p) => p.variantId),
    })
    .select("id")
    .single();
  if (sErr || !session) return { error: sErr?.message ?? "Could not create tasting" };
  const sessionId = session.id as string;

  // 2. Details (one per glass; optional notes). Fail-open — details are not required for scoring.
  const detailRows = picks.map((p) => ({
    tasting_session_id: sessionId,
    bottle_id: p.bottleId,
    variant_id: p.variantId,
    notes: opts.notes?.[p.variantId] ?? null,
  }));
  await supabase.from("tasting_details").insert(detailRows);

  // 3. Pairwise results — picks[i] ranked above picks[j] (i < j) => i beats j.
  //    All rows in ONE insert so the Elo trigger runs once over the whole session.
  const resultRows: {
    tasting_session_id: string;
    winner_bottle_id: string;
    loser_bottle_id: string;
    winner_variant_id: string;
    loser_variant_id: string;
  }[] = [];
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      resultRows.push({
        tasting_session_id: sessionId,
        winner_bottle_id: picks[i].bottleId,
        loser_bottle_id: picks[j].bottleId,
        winner_variant_id: picks[i].variantId,
        loser_variant_id: picks[j].variantId,
      });
    }
  }
  const { error: rErr } = await supabase.from("tasting_results").insert(resultRows);
  if (rErr) return { error: rErr.message };

  return { sessionId };
}
