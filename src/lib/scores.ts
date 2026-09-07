"use client";

import { supabase } from "@/lib/supabase";

/**
 * Reads the scoring views from #72 (`sql/variant-scores-views.sql`).
 *
 * WHY THE STAR COMES FROM THE DATABASE NOW. It used to be scaled in the browser from `elo_global`,
 * which meant every screen re-derived it and none of them agreed about what a star included. The
 * view settles it once: a variant's star blends its Elo-derived star with the manual ratings,
 * weighted by how many people are behind each (Brian, 2026-09-07 -- his worked examples are in the
 * SQL header and reproduce exactly), and a bottle's star applies the same formula across the pooled
 * evidence of its versions, so a parent is weighted rather than averaged.
 *
 * The views are also the only place that can count this correctly: `tasting_results` is readable
 * only for your OWN sessions under RLS, so a browser can never see the global evidence. Anything
 * scaled client-side is necessarily a guess made from one user's slice.
 *
 * Everything here fails open and returns an empty map. A missing star renders as a dash, which is
 * the same thing the app shows for a bottle nobody has an opinion on -- never a wrong number.
 */

export type BottleScore = {
  bottleId: string;
  /** 0-5, or null when nobody has tasted or rated any version yet. */
  star: number | null;
  blindTastings: number;
  manualCount: number;
  /** Versions excluding store picks. */
  versions: number;
};

export type VariantScore = {
  variantId: string;
  bottleId: string;
  star: number | null;
  /** The Elo half alone, before the manual ratings are blended in. Null until a tasting moves it. */
  eloStar: number | null;
  blindTastings: number;
  manualCount: number;
  isCatchall: boolean;
};

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** Rollup scores for a page of search results. Keyed by bottle id. */
export async function fetchBottleScores(bottleIds: string[]): Promise<Record<string, BottleScore>> {
  const ids = [...new Set(bottleIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("bottle_scores")
    .select("bottle_id, star, blind_tastings, manual_count, versions")
    .in("bottle_id", ids);
  if (error || !data) return {};
  const out: Record<string, BottleScore> = {};
  for (const r of data as {
    bottle_id: string; star: number | string | null; blind_tastings: number; manual_count: number; versions: number;
  }[]) {
    out[r.bottle_id] = {
      bottleId: r.bottle_id,
      star: num(r.star),
      blindTastings: r.blind_tastings ?? 0,
      manualCount: r.manual_count ?? 0,
      versions: r.versions ?? 0,
    };
  }
  return out;
}

/** Per-version scores. Keyed by variant id. Store picks come back only for their creator. */
export async function fetchVariantScores(variantIds: string[]): Promise<Record<string, VariantScore>> {
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("variant_scores")
    .select("variant_id, bottle_id, star, elo_star, blind_tastings, manual_count, is_catchall")
    .in("variant_id", ids);
  if (error || !data) return {};
  const out: Record<string, VariantScore> = {};
  for (const r of data as {
    variant_id: string; bottle_id: string; star: number | string | null; elo_star: number | string | null;
    blind_tastings: number; manual_count: number; is_catchall: boolean;
  }[]) {
    out[r.variant_id] = {
      variantId: r.variant_id,
      bottleId: r.bottle_id,
      star: num(r.star),
      eloStar: num(r.elo_star),
      blindTastings: r.blind_tastings ?? 0,
      manualCount: r.manual_count ?? 0,
      isCatchall: !!r.is_catchall,
    };
  }
  return out;
}

/** Every version of one bottle, for the breakdown screen. */
export async function fetchVariantScoresForBottle(bottleId: string): Promise<VariantScore[]> {
  const { data, error } = await supabase
    .from("variant_scores")
    .select("variant_id, bottle_id, star, elo_star, blind_tastings, manual_count, is_catchall")
    .eq("bottle_id", bottleId);
  if (error || !data) return [];
  return (data as {
    variant_id: string; bottle_id: string; star: number | string | null; elo_star: number | string | null;
    blind_tastings: number; manual_count: number; is_catchall: boolean;
  }[]).map((r) => ({
    variantId: r.variant_id,
    bottleId: r.bottle_id,
    star: num(r.star),
    eloStar: num(r.elo_star),
    blindTastings: r.blind_tastings ?? 0,
    manualCount: r.manual_count ?? 0,
    isCatchall: !!r.is_catchall,
  }));
}

/**
 * "12 tastings · 3 ratings", or null when there is nothing behind the star.
 * Shown next to a global star so a 5.0 from one person does not read like a verdict.
 */
export function evidenceLabel(s: { blindTastings: number; manualCount: number } | null | undefined): string | null {
  if (!s) return null;
  const bits: string[] = [];
  if (s.blindTastings > 0) bits.push(`${s.blindTastings} tasting${s.blindTastings === 1 ? "" : "s"}`);
  if (s.manualCount > 0) bits.push(`${s.manualCount} rating${s.manualCount === 1 ? "" : "s"}`);
  return bits.length ? bits.join(" · ") : null;
}

export type MyScore = {
  variantId: string;
  bottleId: string;
  /** The viewer's own 0-5 star: Elo-derived once they have blind-tasted it, else their manual guess. */
  yourStar: number | null;
  tasted: boolean;
};

/**
 * The viewer's OWN stars, per version (#80). Unlike the global views this one is security_invoker,
 * so RLS scopes it to the caller -- it is only ever about them, and no privacy rule has to be
 * restated. Returns everything the caller has, which is bounded by their own collection.
 */
export async function fetchMyScores(): Promise<Record<string, MyScore>> {
  const { data, error } = await supabase
    .from("my_variant_scores")
    .select("variant_id, bottle_id, your_star, tasted");
  if (error || !data) return {};
  const out: Record<string, MyScore> = {};
  for (const r of data as {
    variant_id: string; bottle_id: string; your_star: number | string | null; tasted: boolean;
  }[]) {
    out[r.variant_id] = {
      variantId: r.variant_id,
      bottleId: r.bottle_id,
      yourStar: num(r.your_star),
      tasted: !!r.tasted,
    };
  }
  return out;
}
