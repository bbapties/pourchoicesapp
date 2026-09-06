import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activities";

/** One bottle in a tasting lineup (a specific variant of a SKU). */
/**
 * How many bottles one blind tasting can cover.
 *
 * Raised 5 -> 6, then 6 -> 10, both on Brian's call (2026-09-05, board #60). Nothing in the engine
 * cares: `saveTasting` builds every pair dynamically (10 bottles = 45 pairs, vs 15 at six), the
 * glass letters are derived from the index so A-J needed no change, and there is no CHECK
 * constraint on any tasting table capping the count. The cap was only ever a UI number.
 *
 * Two consequences of 10 that are NOT visible from this constant:
 *   - Reordering. Up/down chevrons alone would take up to 9 taps to move the last bottle to first,
 *     so the rank step gained drag-to-reorder (`useDragReorder`) in the same change.
 *   - Elo. Each bottle now takes 9 head-to-heads in one sitting instead of 5, so a single session
 *     moves the top and bottom of the lineup roughly 80% further than it did at six. Left as-is
 *     deliberately -- Brian is monitoring the scores and will adjust the math later if needed.
 *     See board #3 for the separate question of the win-rate multiplier.
 *
 * These live here, not in DrinkClient, because the same number appears in the picker, the coach
 * copy and the bottle-card More sheet -- it was hardcoded in six places and had already drifted.
 */
export const MIN_PICKS = 2;
export const MAX_PICKS = 10;

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
  sessionId?: string | null; // reuse an already-created session on retry (B-07 idempotency)
}): Promise<{ sessionId?: string; error?: string }> {
  const picks = opts.picks;
  if (picks.length < 2) return { error: "Need at least 2 bottles" };

  // 1. Session — reuse the one from a prior (failed) attempt so a retry never
  //    creates a second session that would score the same tasting again (B-07).
  let sessionId = opts.sessionId ?? null;
  if (!sessionId) {
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
    sessionId = session.id as string;

    // 2. Details (one per glass; optional notes). Fail-open — details are not
    //    required for scoring. Only on first creation, so a retry can't duplicate them.
    const detailRows = picks.map((p) => ({
      tasting_session_id: sessionId,
      bottle_id: p.bottleId,
      variant_id: p.variantId,
      notes: opts.notes?.[p.variantId] ?? null,
    }));
    await supabase.from("tasting_details").insert(detailRows);
  }

  // 3. Pairwise results — picks[i] ranked above picks[j] (i < j) => i beats j.
  //    All rows in ONE upsert so the Elo trigger runs once over the whole session.
  //    ignoreDuplicates => ON CONFLICT DO NOTHING on the existing unique
  //    (tasting_session_id, winner_bottle_id, loser_bottle_id): re-inserting the
  //    same set into the same session is a no-op, so a retry after a silently-
  //    successful insert (e.g. mobile timeout) adds zero new rows and the trigger
  //    cannot double-score.
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
  const { error: rErr } = await supabase
    .from("tasting_results")
    .upsert(resultRows, {
      onConflict: "tasting_session_id,winner_bottle_id,loser_bottle_id",
      ignoreDuplicates: true,
    });
  // Return sessionId even on failure so the caller can retry against the SAME session.
  if (rErr) return { sessionId, error: rErr.message };

  // B-47: a real blind tasting supersedes any manual star guess -- delete the guess for the
  // tasted variants (the display already switches to the Elo star; this stops a stale guess).
  // Guesses live in user_ratings now (B-40).
  await supabase
    .from("user_ratings")
    .delete()
    .eq("user_id", opts.userId)
    .in("variant_id", picks.map((p) => p.variantId));

  // B-51: post ONE `tasted` activity per session (anchored on the winner bottle) so the tasting
  //   shows on the Social feed + per-variant history. Only on first creation (a reused sessionId
  //   is a retry) so it never double-posts.
  if (!opts.sessionId) {
    await logActivity({
      userId: opts.userId,
      bottleId: picks[0].bottleId,
      action: "tasted",
      variantId: picks[0].variantId,
    });
  }

  return { sessionId };
}
