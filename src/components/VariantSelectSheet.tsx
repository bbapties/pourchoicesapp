"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type BottleDetails } from "@/lib/types";

interface BatchVariant {
  id: string;
  batch: string | null;
  release_year: string | null;
  proof: number | null;
}

interface VariantSelectSheetProps {
  bottle: BottleDetails;
  publicUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (variantId: string | null) => Promise<void>;
}

type BottleKind =
  | { kind: "standard" }
  | { kind: "batch"; variantId: string; data: BatchVariant }
  | { kind: "new_variant" };

export default function VariantSelectSheet({
  bottle,
  publicUserId,
  open,
  onOpenChange,
  onAdd,
}: VariantSelectSheetProps) {
  const [isFetching, setIsFetching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [batchVariants, setBatchVariants] = useState<BatchVariant[]>([]);
  const [myStores, setMyStores] = useState<string[]>([]);

  // Section 1: which bottle?
  const [bottleKind, setBottleKind] = useState<BottleKind>({ kind: "standard" });
  const [newProof, setNewProof] = useState("");
  const [newBatch, setNewBatch] = useState("");
  const [newReleaseYear, setNewReleaseYear] = useState("");

  // Section 2: store pick add-on
  const [isStorePick, setIsStorePick] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [isNewStore, setIsNewStore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBottleKind({ kind: "standard" });
    setNewProof("");
    setNewBatch("");
    setNewReleaseYear("");
    setIsStorePick(false);
    setStoreName("");
    setIsNewStore(false);

    setIsFetching(true);
    Promise.all([
      supabase
        .from("bottle_variants")
        .select("id, batch, release_year, proof")
        .eq("bottles_id", bottle.id)
        .or("batch.not.is.null,release_year.not.is.null")
        .is("store_pick_name", null),
      supabase
        .from("bottle_variants")
        .select("store_pick_name")
        .eq("created_by", publicUserId)
        .not("store_pick_name", "is", null),
    ]).then(([batchRes, storeRes]) => {
      setBatchVariants(batchRes.data ?? []);
      const stores = [
        ...new Set(
          (storeRes.data ?? [])
            .map((r: { store_pick_name: string }) => r.store_pick_name)
            .filter(Boolean)
        ),
      ];
      setMyStores(stores);
      setIsFetching(false);
    });
  }, [open, bottle.id, publicUserId]);

  const handleAdd = async () => {
    if (isAdding) return;
    if (isStorePick && !storeName.trim()) {
      toast.error("Please enter a store name");
      return;
    }
    setIsAdding(true);
    try {
      // Simple paths — no variant row needed
      if (bottleKind.kind === "standard" && !isStorePick) {
        await onAdd(null);
        return;
      }
      if (bottleKind.kind === "batch" && !isStorePick) {
        await onAdd(bottleKind.variantId);
        return;
      }

      // All other paths need a user-specific variant row
      const variantData: Record<string, unknown> = {
        bottles_id: bottle.id,
        created_by: publicUserId,
        store_pick_name: isStorePick ? storeName.trim() : null,
      };

      if (bottleKind.kind === "batch") {
        // Copy the global batch variant's data + add store pick
        variantData.batch = bottleKind.data.batch;
        variantData.proof = bottleKind.data.proof;
        variantData.release_year = bottleKind.data.release_year;
      } else if (bottleKind.kind === "new_variant") {
        variantData.batch = newBatch.trim() || null;
        variantData.proof = newProof ? parseFloat(newProof) : null;
        variantData.release_year = newReleaseYear.trim() || null;
      }
      // standard + store pick: just the store name, no batch/proof

      // For non-new-variant paths, try to reuse an existing matching row
      if (bottleKind.kind !== "new_variant" && isStorePick) {
        const { data: existing } = await supabase
          .from("bottle_variants")
          .select("id")
          .eq("bottles_id", bottle.id)
          .eq("created_by", publicUserId)
          .eq("store_pick_name", storeName.trim())
          .maybeSingle();
        if (existing) {
          await onAdd(existing.id);
          return;
        }
      }

      const { data: created, error } = await supabase
        .from("bottle_variants")
        .insert(variantData)
        .select("id")
        .single();
      if (error) throw error;
      await onAdd(created.id);
    } catch (err: unknown) {
      toast.error("Failed to add bottle");
      console.error(err);
    } finally {
      setIsAdding(false);
    }
  };

  const variantLabel = (v: BatchVariant) => {
    const parts: string[] = [];
    if (v.batch) parts.push(v.batch);
    if (v.release_year) parts.push(v.release_year);
    if (v.proof) parts.push(`${v.proof} proof`);
    return parts.join(" · ");
  };

  const inputClass =
    "w-full border border-charcoal rounded px-3 py-2 text-sm bg-ivory text-charcoal placeholder:text-charcoal placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-charcoal";
  const labelClass = "block text-xs font-medium text-charcoal mb-1";

  // Reusable selection row — solid charcoal fill when selected, transparent/faint when not
  const SelectRow = ({
    isSelected,
    label,
    sublabel,
    onClick,
  }: {
    isSelected: boolean;
    label: string;
    sublabel?: string;
    onClick: () => void;
  }) => (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-all ${
        isSelected
          ? "border-charcoal bg-charcoal"
          : "border-gray-300 bg-transparent hover:bg-charcoal/5"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-semibold truncate ${
            isSelected ? "text-white" : "text-charcoal"
          }`}
        >
          {label}
        </div>
        {sublabel && (
          <div className={`text-xs mt-0.5 ${isSelected ? "text-white/70" : "text-gray-500"}`}>
            {sublabel}
          </div>
        )}
      </div>
      <div
        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
          isSelected ? "bg-white/20" : "border-2 border-gray-300"
        }`}
      >
        {isSelected && (
          <Check className="w-4 h-4 text-white" strokeWidth={3} />
        )}
      </div>
    </div>
  );

  const isAddDisabled =
    isAdding || (isStorePick && !storeName.trim());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "#FDF6E3", color: "#2F2F2F" }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-charcoal text-left">
            Add {bottle.name}
          </SheetTitle>
          <p className="text-xs text-gray-500">
            Which version of this bottle are you adding?
          </p>
        </SheetHeader>

        {isFetching ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-400">
            Loading options...
          </div>
        ) : (
          <div className="space-y-6 pb-6">

            {/* ── Section 1: Which bottle? ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Which bottle?
              </p>

              {/* Standard */}
              <SelectRow
                isSelected={bottleKind.kind === "standard"}
                label="Standard bottle"
                sublabel={
                  [
                    bottle.proof ? `${bottle.proof} proof` : null,
                    bottle.age,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Default version"
                }
                onClick={() => setBottleKind({ kind: "standard" })}
              />

              {/* Known batch variants */}
              {batchVariants.map((v) => (
                <SelectRow
                  key={v.id}
                  isSelected={
                    bottleKind.kind === "batch" &&
                    bottleKind.variantId === v.id
                  }
                  label={variantLabel(v)}
                  sublabel="Known variant"
                  onClick={() =>
                    setBottleKind({ kind: "batch", variantId: v.id, data: v })
                  }
                />
              ))}

              {/* Add new variant — expands inline form */}
              <div
                className={`rounded border cursor-pointer transition-all ${
                  bottleKind.kind === "new_variant"
                    ? "border-charcoal bg-charcoal"
                    : "border-gray-300 bg-transparent hover:bg-charcoal/5"
                }`}
              >
                <div
                  className="flex items-center gap-3 p-3"
                  onClick={() => setBottleKind({ kind: "new_variant" })}
                >
                  <div className="flex-1">
                    <div
                      className={`text-sm font-semibold ${
                        bottleKind.kind === "new_variant"
                          ? "text-white"
                          : "text-charcoal"
                      }`}
                    >
                      + Add new variant
                    </div>
                    <div className={`text-xs mt-0.5 ${bottleKind.kind === "new_variant" ? "text-white/70" : "text-gray-500"}`}>
                      Custom batch, proof, or release year
                    </div>
                  </div>
                  <div
                    className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
                      bottleKind.kind === "new_variant"
                        ? "bg-white/20"
                        : "border-2 border-gray-300"
                    }`}
                  >
                    {bottleKind.kind === "new_variant" && (
                      <Check className="w-4 h-4 text-white" strokeWidth={3} />
                    )}
                  </div>
                </div>

                {bottleKind.kind === "new_variant" && (
                  <div
                    className="px-4 pb-4 space-y-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className={labelClass}>Proof / ABV (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="e.g. 118.2"
                          value={newProof}
                          onChange={(e) => setNewProof(e.target.value)}
                          className={inputClass}
                          autoFocus
                        />
                      </div>
                      <div className="flex-1">
                        <label className={labelClass}>Batch</label>
                        <input
                          type="text"
                          placeholder="e.g. Batch 14"
                          value={newBatch}
                          onChange={(e) => setNewBatch(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Release Year</label>
                      <input
                        type="text"
                        placeholder="e.g. 2024"
                        value={newReleaseYear}
                        onChange={(e) => setNewReleaseYear(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 2: Store pick add-on ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Store pick? <span className="normal-case font-normal">(optional add-on)</span>
              </p>

              {/* Toggle */}
              <div
                onClick={() => {
                  if (!isStorePick) {
                    setIsStorePick(true);
                    if (myStores.length === 0) setIsNewStore(true);
                  } else {
                    setIsStorePick(false);
                    setStoreName("");
                    setIsNewStore(false);
                  }
                }}
                className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-all ${
                  isStorePick
                    ? "border-charcoal bg-charcoal"
                    : "border-gray-300 bg-transparent hover:bg-charcoal/5"
                }`}
              >
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${isStorePick ? "text-white" : "text-charcoal"}`}>
                    This is a store pick
                  </div>
                  <div className={`text-xs mt-0.5 ${isStorePick ? "text-white/70" : "text-gray-500"}`}>
                    A dedicated store allocation or barrel pick
                  </div>
                </div>
                <div
                  className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
                    isStorePick ? "bg-white/20" : "border-2 border-gray-300"
                  }`}
                >
                  {isStorePick && (
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  )}
                </div>
              </div>

              {/* Store name selection — only shown when isStorePick */}
              {isStorePick && (
                <div className="pl-3 space-y-2 pt-1 border-l-2 border-charcoal/20 ml-1">
                  {/* Previous stores */}
                  {myStores.map((store) => (
                    <SelectRow
                      key={store}
                      isSelected={!isNewStore && storeName === store}
                      label={store}
                      sublabel="Previous store pick"
                      onClick={() => {
                        setStoreName(store);
                        setIsNewStore(false);
                      }}
                    />
                  ))}

                  {/* New store input */}
                  <div
                    className={`rounded border cursor-pointer transition-all ${
                      isNewStore
                        ? "border-charcoal bg-charcoal"
                        : "border-gray-300 bg-transparent hover:bg-charcoal/5"
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 p-3"
                      onClick={() => {
                        setIsNewStore(true);
                        setStoreName("");
                      }}
                    >
                      <div className="flex-1">
                        <div className={`text-sm font-semibold ${isNewStore ? "text-white" : "text-charcoal"}`}>
                          + New store
                        </div>
                        <div className={`text-xs mt-0.5 ${isNewStore ? "text-white/70" : "text-gray-500"}`}>
                          Enter the store name
                        </div>
                      </div>
                      <div
                        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
                          isNewStore ? "bg-white/20" : "border-2 border-gray-300"
                        }`}
                      >
                        {isNewStore && (
                          <Check className="w-4 h-4 text-white" strokeWidth={3} />
                        )}
                      </div>
                    </div>
                    {isNewStore && (
                      <div
                        className="px-4 pb-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          placeholder="e.g. Total Wine, Spec's"
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          className={inputClass}
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Add button ── */}
            <button
              onClick={handleAdd}
              disabled={isAddDisabled}
              className="w-full py-3 rounded border border-charcoal text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#2F2F2F", color: "#FDF6E3" }}
            >
              {isAdding ? "Adding..." : "Add to My Bar"}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
