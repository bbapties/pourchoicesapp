"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronUp, ChevronDown, Check, Wine } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { saveTasting, type TastingPick } from "@/lib/tastings";

type Step = "home" | "mode" | "pick" | "label" | "rank" | "done";

type CatalogBottle = {
  bottleId: string;
  variantId: string;
  name: string;
  distillery: string | null;
};

const MIN_PICKS = 2;
const MAX_PICKS = 5;
const letter = (i: number) => String.fromCharCode(65 + i); // 0 -> A

export default function DrinkClient({ publicUserId }: { publicUserId: string }) {
  const [step, setStep] = useState<Step>("home");
  const [catalog, setCatalog] = useState<CatalogBottle[]>([]);
  const [query, setQuery] = useState("");
  const [picks, setPicks] = useState<CatalogBottle[]>([]);
  const [rankOrder, setRankOrder] = useState<CatalogBottle[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<CatalogBottle[] | null>(null);

  // Load the catalog (one row per SKU, default variant) once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("all_bottle_details")
        .select("bottle_id, bottle_name, bottle_distillery, default_variant_id")
        .order("bottle_name", { ascending: true })
        .limit(300);
      if (cancelled || !data) return;
      const rows: CatalogBottle[] = data
        .filter((d) => d.default_variant_id)
        .map((d) => ({
          bottleId: d.bottle_id,
          variantId: d.default_variant_id as string,
          name: d.bottle_name,
          distillery: d.bottle_distillery,
        }));
      setCatalog(rows);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? catalog.filter(
          (b) => b.name.toLowerCase().includes(q) || (b.distillery ?? "").toLowerCase().includes(q)
        )
      : catalog;
    return base.slice(0, 60);
  }, [catalog, query]);

  const isPicked = (id: string) => picks.some((p) => p.bottleId === id);

  const togglePick = (b: CatalogBottle) => {
    if (isPicked(b.bottleId)) {
      setPicks((prev) => prev.filter((p) => p.bottleId !== b.bottleId));
    } else {
      if (picks.length >= MAX_PICKS) {
        toast(`Up to ${MAX_PICKS} bottles per tasting`);
        return;
      }
      setPicks((prev) => [...prev, b]);
    }
  };

  const startSelf = () => {
    setPicks([]);
    setQuery("");
    setStep("pick");
  };

  const goToLabel = () => {
    if (picks.length < MIN_PICKS) { toast(`Pick at least ${MIN_PICKS} bottles`); return; }
    setStep("label");
  };

  const goToRank = () => {
    setRankOrder([...picks]); // initial order = pick order (A, B, C...)
    setStep("rank");
  };

  const move = (index: number, dir: -1 | 1) => {
    setRankOrder((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const orderedPicks: TastingPick[] = rankOrder.map((b) => ({
        bottleId: b.bottleId,
        variantId: b.variantId,
        name: b.name,
      }));
      const res = await saveTasting({ userId: publicUserId, mode: "self", picks: orderedPicks });
      if ("error" in res) {
        toast.error("Could not save the tasting");
        return;
      }
      setResult([...rankOrder]);
      setConfirming(false);
      setStep("done");
      toast.success("Tasting saved — rankings updated");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPicks([]);
    setRankOrder([]);
    setResult(null);
    setQuery("");
    setStep("home");
  };

  const primaryBtn = "w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-40";
  const secondaryBtn = "w-full rounded-lg border border-charcoal py-3 text-sm font-medium text-charcoal";

  return (
    <div className="max-w-md mx-auto">
      <header className="fixed top-0 left-0 right-0 h-14 bg-ivory border-b border-charcoal z-20 flex items-center px-3">
        {step !== "home" && step !== "done" && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => setStep(step === "pick" ? "mode" : step === "mode" ? "home" : step === "label" ? "pick" : "label")}
            className="p-1 text-charcoal"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <h1 className="flex-1 text-center text-base font-semibold text-charcoal">Blind Tasting</h1>
        {step !== "home" && step !== "done" && <span className="w-6" />}
      </header>

      <div className="p-4">
        {/* HOME */}
        {step === "home" && (
          <div className="flex flex-col items-center text-center pt-10 gap-4">
            <Wine size={48} className="text-charcoal" />
            <h2 className="text-lg font-semibold text-charcoal">Run a blind tasting</h2>
            <p className="text-sm text-gray-500 max-w-xs">
              Rank 2–5 bottles blind. Your ranking updates your personal and the global scores.
            </p>
            <div className="w-full mt-2 space-y-2">
              <button type="button" onClick={() => setStep("mode")} className={primaryBtn} style={{ backgroundColor: "#2F2F2F" }}>
                Start a blind tasting
              </button>
              <button type="button" onClick={() => toast("Joining someone's tasting is coming soon")} className={secondaryBtn}>
                Join a blind (enter code)
              </button>
            </div>
          </div>
        )}

        {/* MODE */}
        {step === "mode" && (
          <div className="pt-4 space-y-3">
            <h2 className="text-base font-semibold text-charcoal mb-1">How are you tasting?</h2>
            <button
              type="button"
              onClick={startSelf}
              className="w-full text-left rounded-lg border border-charcoal p-4"
            >
              <div className="font-semibold text-charcoal">I&apos;ll set it up myself</div>
              <div className="text-sm text-gray-500">Pour into lettered glasses, hide the letters, shuffle, then rank.</div>
            </button>
            <button
              type="button"
              onClick={() => toast("Guest-helper mode is coming soon")}
              className="w-full text-left rounded-lg border border-gray-300 p-4 opacity-70"
            >
              <div className="font-semibold text-charcoal">Someone&apos;s helping me pour</div>
              <div className="text-sm text-gray-500">A helper pours and records the secret order. Coming soon.</div>
            </button>
          </div>
        )}

        {/* PICK */}
        {step === "pick" && (
          <div className="pt-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bottles to add..."
              className="w-full rounded-full border border-charcoal px-4 h-10 text-base bg-ivory text-charcoal mb-3"
            />
            <p className="text-xs text-gray-500 mb-2">
              Selected {picks.length}/{MAX_PICKS} · pick {MIN_PICKS}–{MAX_PICKS}
            </p>
            <div className="space-y-1 mb-24">
              {filtered.map((b) => {
                const picked = isPicked(b.bottleId);
                return (
                  <button
                    key={b.bottleId}
                    type="button"
                    onClick={() => togglePick(b)}
                    className="w-full flex items-center justify-between rounded-lg border p-3 text-left"
                    style={picked ? { backgroundColor: "#2F2F2F", color: "#FFFFFF", borderColor: "#2F2F2F" } : { borderColor: "#D1D5DB" }}
                  >
                    <span>
                      <span className="block text-sm font-medium">{b.name}</span>
                      <span className="block text-xs opacity-70">{b.distillery}</span>
                    </span>
                    {picked && <Check size={18} />}
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No bottles found</p>}
            </div>
            <div className="fixed bottom-16 left-0 right-0 p-3 bg-ivory border-t border-charcoal">
              <div className="max-w-md mx-auto">
                <button type="button" onClick={goToLabel} disabled={picks.length < MIN_PICKS} className={primaryBtn} style={{ backgroundColor: "#2F2F2F" }}>
                  Next · {picks.length} selected
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LABEL */}
        {step === "label" && (
          <div className="pt-2">
            <h2 className="text-base font-semibold text-charcoal mb-1">Label your glasses</h2>
            <p className="text-sm text-gray-500 mb-4">
              Pour each bottle into the matching lettered glass, hide the letters, then shuffle so you can&apos;t tell which is which.
            </p>
            <div className="space-y-2 mb-6">
              {picks.map((b, i) => (
                <div key={b.bottleId} className="flex items-center gap-3 rounded-lg border border-charcoal p-3">
                  <span className="w-8 h-8 flex items-center justify-center rounded-full text-white font-bold" style={{ backgroundColor: "#2F2F2F" }}>
                    {letter(i)}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-charcoal">{b.name}</span>
                    <span className="block text-xs text-gray-500">{b.distillery}</span>
                  </span>
                </div>
              ))}
            </div>
            <button type="button" onClick={goToRank} className={primaryBtn} style={{ backgroundColor: "#2F2F2F" }}>
              I&apos;ve poured &amp; shuffled — rank them
            </button>
          </div>
        )}

        {/* RANK */}
        {step === "rank" && (
          <div className="pt-2">
            <h2 className="text-base font-semibold text-charcoal mb-1">Your ranking</h2>
            <p className="text-sm text-gray-500 mb-4">
              Taste, flip the hidden letters, then put the bottles in order — favorite at the top.
            </p>
            <div className="space-y-2 mb-6">
              {rankOrder.map((b, i) => (
                <div key={b.bottleId} className="flex items-center gap-2 rounded-lg border border-charcoal p-3">
                  <span className="w-6 text-center font-bold text-charcoal">{i + 1}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-charcoal">{b.name}</span>
                    <span className="block text-xs text-gray-500">{b.distillery}</span>
                  </span>
                  <div className="flex flex-col">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-0.5 disabled:opacity-30 text-charcoal">
                      <ChevronUp size={18} />
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === rankOrder.length - 1} onClick={() => move(i, 1)} className="p-0.5 disabled:opacity-30 text-charcoal">
                      <ChevronDown size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setConfirming(true)} className={primaryBtn} style={{ backgroundColor: "#2F2F2F" }}>
              Confirm ranking
            </button>
          </div>
        )}

        {/* DONE */}
        {step === "done" && result && (
          <div className="pt-6 text-center">
            <div className="text-4xl mb-3">🥃</div>
            <h2 className="text-lg font-semibold text-charcoal mb-1">Tasting complete</h2>
            <p className="text-sm text-gray-500 mb-5">Your rankings have been updated.</p>
            <div className="space-y-2 text-left mb-6">
              {result.map((b, i) => (
                <div key={b.bottleId} className="flex items-center gap-3 rounded-lg border border-gray-300 p-3">
                  <span className="w-6 text-center font-bold text-charcoal">{i + 1}</span>
                  <span className="text-sm font-medium text-charcoal">{b.name}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={reset} className={secondaryBtn}>Done</button>
          </div>
        )}
      </div>

      {/* Confirm "Final?" */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => !saving && setConfirming(false)}>
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()} style={{ color: "#2F2F2F" }}>
            <h3 className="text-base font-semibold mb-1">Lock in this ranking?</h3>
            <p className="text-sm text-gray-500 mb-4">This updates your personal and the global scores and can&apos;t be undone.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="flex-1 rounded-lg border border-charcoal py-2.5 text-sm font-medium text-charcoal disabled:opacity-50">
                Not yet
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#2F2F2F" }}>
                {saving ? "Saving..." : "Yes, reveal"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-center" style={{ top: "64px" }} />
    </div>
  );
}
