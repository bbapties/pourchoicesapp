"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";

/**
 * Admin > Variants — the triage queue (#76, design in #70).
 *
 * WHY THIS SCREEN EXISTS. Brian could verify a bottle and delete a bottle, and that was all. The
 * variant model needs a third judgement made per bottle — is this one bottling, a family of real
 * variations, or the same whiskey entered twice? — and there was nowhere to make it.
 *
 * IT DELIBERATELY GUESSES NOTHING. There are no duplicate barcodes and no duplicate bottle names in
 * this catalog, so nothing is inferable. 14 bottles have "batch" in the name and nearly all are
 * "Small Batch", a product name rather than a variant axis; auto-detecting on it would be wrong more
 * often than right. So the screen sorts by how likely a bottle is to NEED a decision and then gets
 * out of the way. The ordering is a reading order, never a recommendation.
 *
 * SPLITTING IS ONE-WAY IN PRACTICE. It declares the axis and turns the main record into a rollup
 * parent, so the confirm step spells out what changes. The split itself is
 * `split_bottle_into_variants()` — one implementation shared with anything else that ever splits a
 * bottle, so two callers cannot drift apart.
 */

type Axis = "release_year" | "batch" | "rickhouse" | "barrel" | "custom";
type Triage = "split" | "single" | "needs_merge";

const AXIS_LABEL: Record<Axis, string> = {
  release_year: "Release year",
  batch: "Batch",
  rickhouse: "Rickhouse / floor",
  barrel: "Barrel number",
  custom: "Custom (free text)",
};

/** What the picker asks someone adding a version, once this axis is declared. */
const AXIS_QUESTION: Record<Axis, string> = {
  release_year: "Which year is this?",
  batch: "Which batch is this?",
  rickhouse: "Which rickhouse or floor?",
  barrel: "Which barrel?",
  custom: "Which version is this?",
};

type VariantRow = {
  id: string;
  isDefault: boolean;
  isCatchall: boolean;
  storePickName: string | null;
  batch: string | null;
  releaseYear: number | null;
  age: string | null;
  proof: number | null;
};

type BottleRow = {
  id: string;
  name: string;
  axis: Axis | null;
  triage: Triage | null;
  variants: VariantRow[];
  interactions: number;
};

/** Describes a variant in one line, using whatever actually distinguishes it. */
function variantLabel(v: VariantRow): string {
  if (v.storePickName) return `Store pick — ${v.storePickName}`;
  const bits = [
    v.batch ? `batch ${v.batch}` : null,
    v.releaseYear ? `${v.releaseYear}` : null,
    v.age,
    v.proof ? `${v.proof} proof` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "no distinguishing details";
}

/**
 * Reading order, not a recommendation. Bottles with several variants are where the model actually
 * bites; a name carrying a year or a barrel code is worth a look; everything else can wait.
 * "Small Batch" is excluded on purpose — it is a product name, and matching it would drag a dozen
 * perfectly ordinary bourbons to the top of the queue.
 */
function suspicionScore(b: BottleRow): number {
  const real = b.variants.filter((v) => !v.storePickName).length;
  if (real > 1) return 100 + real;
  const name = b.name.toLowerCase();
  const hasYear = /(19|20)\d{2}/.test(b.name);
  const hasBatchWord = /\bbatch\b/.test(name) && !/small batch/.test(name);
  const hasBarrelWord = /\b(single barrel|barrel proof|rickhouse|floor)\b/.test(name);
  if (hasYear || hasBatchWord) return 50;
  if (hasBarrelWord) return 20;
  return 0;
}

export default function VariantsTab({ publicUserId }: { publicUserId: string }) {
  const [bottles, setBottles] = useState<BottleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ bottle: BottleRow; axis: Axis } | null>(null);
  const [axisDraft, setAxisDraft] = useState<Record<string, Axis>>({});

  /**
   * #68: merge a duplicate into the real bottle. Lives here rather than in the delete dialog
   * because this is the screen where Brian decides something IS a duplicate -- "Needs merge" and
   * the merge itself should be one step apart, not one screen apart.
   *
   * Version mapping is deliberately manual (his call): the admin says where each version goes, or
   * brings it across whole. No auto-matching on proof/age/label.
   */
  const [mergeFor, setMergeFor] = useState<BottleRow | null>(null);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeTarget, setMergeTarget] = useState<BottleRow | null>(null);
  const [mergeMap, setMergeMap] = useState<Record<string, string>>({});
  const [mergeConfirm, setMergeConfirm] = useState("");
  const [merging, setMerging] = useState(false);

  const closeMerge = () => {
    if (merging) return;
    setMergeFor(null); setMergeQuery(""); setMergeTarget(null);
    setMergeMap({}); setMergeConfirm("");
  };

  const mergeCandidates = useMemo(() => {
    const q = mergeQuery.trim().toLowerCase();
    if (!mergeFor || q.length < 2) return [];
    return bottles.filter((b) => b.id !== mergeFor.id && b.name.toLowerCase().includes(q)).slice(0, 8);
  }, [bottles, mergeQuery, mergeFor]);

  const runMerge = async () => {
    if (!mergeFor || !mergeTarget) return;
    setMerging(true);
    const { data, error } = await supabase.rpc("merge_bottle", {
      p_source: mergeFor.id,
      p_target: mergeTarget.id,
      p_variant_map: mergeMap,
      p_confirm_name: mergeConfirm,
    });
    setMerging(false);
    if (error) { toast.error(`Merge failed: ${error.message}`); return; }
    const res = data as { merged: string; into: string; versions_folded: number; versions_moved: number } | null;
    logEvent({
      eventType: "bottle_merge",
      surface: "admin_variants",
      metadata: { source: mergeFor.id, target: mergeTarget.id, map: mergeMap },
    });
    toast.success(
      `Merged ${res?.merged} into ${res?.into} — ${res?.versions_folded ?? 0} version(s) folded, ${res?.versions_moved ?? 0} brought across. Scores rebuilt.`
    );
    closeMerge();
    load();
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [bottlesRes, variantsRes, ubRes, actRes] = await Promise.all([
      supabase.from("bottles").select("id, name, variant_axis, variant_triage"),
      supabase
        .from("bottle_variants")
        .select("id, bottles_id, is_default, is_catchall, store_pick_name, batch, release_year, age, proof"),
      supabase.from("user_bottles").select("bottle_id"),
      supabase.from("activities").select("bottle_id"),
    ]);

    if (bottlesRes.error) {
      toast.error(`Could not load bottles: ${bottlesRes.error.message}`);
      setLoading(false);
      return;
    }

    // Interaction count is only ever shown to say "this bottle has history, be careful" — an
    // approximate sum is honest enough for that and avoids four more round trips.
    const counts = new Map<string, number>();
    const bump = (id: string | null) => { if (id) counts.set(id, (counts.get(id) ?? 0) + 1); };
    (ubRes.data ?? []).forEach((r: { bottle_id: string }) => bump(r.bottle_id));
    (actRes.data ?? []).forEach((r: { bottle_id: string | null }) => bump(r.bottle_id));

    const byBottle = new Map<string, VariantRow[]>();
    (variantsRes.data ?? []).forEach((v: {
      id: string; bottles_id: string; is_default: boolean; is_catchall: boolean;
      store_pick_name: string | null; batch: string | null; release_year: number | null;
      age: string | null; proof: number | null;
    }) => {
      const list = byBottle.get(v.bottles_id) ?? [];
      list.push({
        id: v.id,
        isDefault: !!v.is_default,
        isCatchall: !!v.is_catchall,
        storePickName: v.store_pick_name,
        batch: v.batch,
        releaseYear: v.release_year,
        age: v.age,
        proof: v.proof,
      });
      byBottle.set(v.bottles_id, list);
    });

    const rows: BottleRow[] = (bottlesRes.data ?? []).map((b: {
      id: string; name: string; variant_axis: Axis | null; variant_triage: Triage | null;
    }) => ({
      id: b.id,
      name: b.name,
      axis: b.variant_axis,
      triage: b.variant_triage,
      variants: (byBottle.get(b.id) ?? []).sort(
        (x, y) => Number(y.isDefault) - Number(x.isDefault) || variantLabel(x).localeCompare(variantLabel(y))
      ),
      interactions: counts.get(b.id) ?? 0,
    }));

    rows.sort((a, b) => suspicionScore(b) - suspicionScore(a) || a.name.localeCompare(b.name));
    setBottles(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bottles.filter((b) => {
      if (!showDone && b.triage) return false;
      if (q && !b.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [bottles, search, showDone]);

  const pending = bottles.filter((b) => !b.triage).length;

  const markTriage = async (b: BottleRow, triage: Triage) => {
    setBusyId(b.id);
    const { error } = await supabase
      .from("bottles")
      .update({
        variant_triage: triage,
        variant_triaged_at: new Date().toISOString(),
        variant_triaged_by: publicUserId,
      })
      .eq("id", b.id);
    setBusyId(null);
    if (error) { toast.error(`Could not save: ${error.message}`); return; }
    logEvent({ eventType: "variant_triage", surface: "admin_variants", metadata: { bottleId: b.id, triage } });
    toast.success(triage === "single" ? "Marked as a single bottling." : "Flagged for merge.");
    load();
  };

  const doSplit = async () => {
    if (!confirming) return;
    const { bottle, axis } = confirming;
    setBusyId(bottle.id);
    // One implementation of the split, shared with anything else that ever splits a bottle.
    const { error } = await supabase.rpc("split_bottle_into_variants", {
      p_bottle: bottle.id,
      p_axis: axis,
    });
    if (error) {
      setBusyId(null);
      toast.error(`Split failed: ${error.message}`);
      return;
    }
    await supabase
      .from("bottles")
      .update({
        variant_triage: "split",
        variant_triaged_at: new Date().toISOString(),
        variant_triaged_by: publicUserId,
      })
      .eq("id", bottle.id);
    setBusyId(null);
    setConfirming(null);
    logEvent({ eventType: "variant_split", surface: "admin_variants", metadata: { bottleId: bottle.id, axis } });
    toast.success(`Split on ${AXIS_LABEL[axis].toLowerCase()}.`);
    load();
  };

  if (loading) return <div className="text-sm text-gray-500">Loading bottles…</div>;

  return (
    <div className="space-y-3">
      <div className="border border-gray-400 rounded p-3 bg-white space-y-2">
        <h2 className="font-semibold text-sm">Variant triage</h2>
        <p className="text-xs text-gray-600">
          One decision per bottle: is it a single bottling, a family with real variations, or the
          same whiskey entered twice? Nothing is guessed — the order below is just a reading order,
          bottles most likely to need a decision first.
        </p>
        <p className="text-xs text-gray-500">
          <span className="font-semibold">{pending}</span> of {bottles.length} bottles still to look
          at.
        </p>
      </div>

      <input
        type="text"
        placeholder="Search bottle name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-charcoal rounded px-3 py-2 text-sm bg-white"
      />

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
        Show bottles already decided
      </label>

      <ul className="space-y-2">
        {visible.map((b) => {
          const realVariants = b.variants.filter((v) => !v.storePickName);
          const picks = b.variants.filter((v) => v.storePickName);
          const busy = busyId === b.id;
          return (
            <li key={b.id} className="border border-gray-300 rounded bg-white p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-charcoal">{b.name}</div>
                  <div className="text-xs text-gray-500">
                    {realVariants.length} version{realVariants.length === 1 ? "" : "s"}
                    {picks.length > 0 && ` · ${picks.length} store pick${picks.length === 1 ? "" : "s"}`}
                    {b.interactions > 0 && ` · ${b.interactions} interactions`}
                  </div>
                </div>
                {b.triage && (
                  <span className="text-[10px] uppercase tracking-wide bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                    {b.triage === "split" ? `split · ${b.axis}` : b.triage === "single" ? "single" : "needs merge"}
                  </span>
                )}
              </div>

              <ul className="text-xs text-gray-600 space-y-0.5">
                {b.variants.map((v) => (
                  <li key={v.id} className="flex items-center gap-1.5">
                    <span className="text-gray-400">•</span>
                    <span>{variantLabel(v)}</span>
                    {v.isCatchall && <span className="text-[10px] text-gray-500">(catch-all)</span>}
                    {v.isDefault && !v.isCatchall && <span className="text-[10px] text-gray-500">(main)</span>}
                  </li>
                ))}
              </ul>

              {!b.axis && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <select
                    value={axisDraft[b.id] ?? ""}
                    onChange={(e) =>
                      setAxisDraft((d) => ({ ...d, [b.id]: e.target.value as Axis }))
                    }
                    className="border border-gray-400 rounded px-2 py-1.5 text-xs"
                  >
                    <option value="">Varies by…</option>
                    {(Object.keys(AXIS_LABEL) as Axis[]).map((a) => (
                      <option key={a} value={a}>{AXIS_LABEL[a]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !axisDraft[b.id]}
                    onClick={() => setConfirming({ bottle: b, axis: axisDraft[b.id] })}
                    className="text-xs px-3 py-1.5 rounded bg-gray-900 text-white disabled:opacity-30"
                  >
                    Split
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => markTriage(b, "single")}
                    className="text-xs px-3 py-1.5 rounded border border-gray-400 disabled:opacity-30"
                  >
                    Single bottling
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => markTriage(b, "needs_merge")}
                    className="text-xs px-3 py-1.5 rounded border border-amber-600 text-amber-700 disabled:opacity-30"
                  >
                    Needs merge
                  </button>
                </div>
              )}

              {/* #68: available whether or not it has been flagged -- deciding it is a duplicate
                  and acting on that should not be two visits. */}
              {(b.triage === "needs_merge" || !b.triage) && (
                <button
                  type="button"
                  onClick={() => { setMergeFor(b); setMergeConfirm(""); }}
                  className="text-xs underline decoration-dotted underline-offset-2 text-amber-700"
                >
                  Merge this into another bottle…
                </button>
              )}
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="text-center text-sm text-gray-400 py-8">
            {showDone ? "No bottles match." : "Nothing left to triage."}
          </li>
        )}
      </ul>

      {mergeFor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
             onClick={closeMerge}>
          <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-4 my-8" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="font-semibold text-charcoal">Merge {mergeFor.name}</h2>
              <p className="text-sm text-gray-600 mt-1">
                Everything attached to it moves to the bottle you pick — bar entries add up, the
                most recent star rating wins, tastings are repointed rather than deleted — and every
                score is rebuilt afterwards. This bottle then stops existing.
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-600">Merge into</label>
              {mergeTarget ? (
                <div className="flex items-center justify-between border border-charcoal rounded px-3 py-2 mt-1">
                  <span className="text-sm font-medium">{mergeTarget.name}</span>
                  <button type="button" onClick={() => { setMergeTarget(null); setMergeMap({}); }}
                          className="text-xs text-gray-500 underline">change</button>
                </div>
              ) : (
                <>
                  <input
                    autoFocus
                    value={mergeQuery}
                    onChange={(e) => setMergeQuery(e.target.value)}
                    placeholder="Search for the bottle to keep"
                    className="mt-1 w-full border border-gray-400 rounded px-2 py-2 text-sm"
                  />
                  <ul className="mt-1 space-y-1">
                    {mergeCandidates.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setMergeTarget(c)}
                                className="w-full text-left text-sm border border-gray-200 rounded px-2 py-1.5 hover:bg-gray-50">
                          {c.name}
                          <span className="text-xs text-gray-500">
                            {" "}· {c.variants.filter((v) => !v.storePickName).length} version(s)
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {mergeTarget && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  Where does each version go? Nothing is guessed — leave one as &ldquo;bring it
                  across&rdquo; if the survivor has no equivalent.
                </p>
                {mergeFor.variants.map((v) => (
                  <div key={v.id} className="text-xs">
                    <div className="text-charcoal">{variantLabel(v)}</div>
                    <select
                      value={mergeMap[v.id] ?? ""}
                      onChange={(e) => setMergeMap((m) => ({ ...m, [v.id]: e.target.value }))}
                      className="mt-1 w-full border border-gray-400 rounded px-2 py-1.5"
                    >
                      <option value="">Bring it across as its own version</option>
                      {mergeTarget.variants.map((tv) => (
                        <option key={tv.id} value={tv.id}>Fold into: {variantLabel(tv)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {mergeTarget && (
              <label className="block text-xs text-gray-600">
                Type <span className="font-mono font-semibold">{mergeFor.name}</span> to confirm
                <input
                  value={mergeConfirm}
                  onChange={(e) => setMergeConfirm(e.target.value)}
                  className="mt-1 w-full border border-charcoal rounded px-2 py-1.5 text-sm"
                />
              </label>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={closeMerge} disabled={merging} className="px-3 py-2 text-sm text-gray-600">
                Cancel
              </button>
              <button
                onClick={runMerge}
                disabled={merging || !mergeTarget || mergeConfirm !== mergeFor.name}
                className="px-3 py-2 text-sm bg-gray-900 text-white rounded disabled:opacity-40"
              >
                {merging ? "Merging…" : "Merge and rebuild scores"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { if (!busyId) setConfirming(null); }}
        >
          <div className="bg-white rounded-lg w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="font-semibold text-charcoal">
                Split {confirming.bottle.name}
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                It varies by <span className="font-semibold">{AXIS_LABEL[confirming.axis].toLowerCase()}</span>,
                so anyone adding a version will be asked{" "}
                <span className="italic">&ldquo;{AXIS_QUESTION[confirming.axis]}&rdquo;</span>.
              </p>
              <ul className="text-sm text-gray-600 mt-3 space-y-1 list-disc pl-5">
                <li>Its existing history becomes the <strong>{confirming.axis} unknown</strong> version. Nothing moves.</li>
                <li>The bottle itself stops being something people interact with — it becomes a rollup of its versions.</li>
                <li>Any store pick on it becomes a pick of that unknown version.</li>
              </ul>
              <p className="text-xs text-gray-500 mt-3">
                The axis is declared once. Choose a different one and it has to be undone by hand.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                disabled={!!busyId}
                className="px-3 py-2 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={doSplit}
                disabled={!!busyId}
                className="px-3 py-2 text-sm bg-gray-900 text-white rounded disabled:opacity-40"
              >
                {busyId ? "Splitting…" : "Split it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
