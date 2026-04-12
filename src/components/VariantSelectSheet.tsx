"use client";

import { useState, useEffect } from "react";
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

type Selection =
  | { type: 'standard' }
  | { type: 'batch'; variantId: string }
  | { type: 'store'; storeName: string }
  | { type: 'new_store' };

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
  const [selection, setSelection] = useState<Selection>({ type: 'standard' });

  // New store pick form state
  const [newStoreName, setNewStoreName] = useState('');
  const [newProof, setNewProof] = useState('');
  const [newBatch, setNewBatch] = useState('');
  const [newReleaseYear, setNewReleaseYear] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelection({ type: 'standard' });
    setNewStoreName('');
    setNewProof('');
    setNewBatch('');
    setNewReleaseYear('');

    setIsFetching(true);
    Promise.all([
      // Global batch/year variants for this bottle
      supabase
        .from('bottle_variants')
        .select('id, batch, release_year, proof')
        .eq('bottles_id', bottle.id)
        .or('batch.not.is.null,release_year.not.is.null')
        .is('store_pick_name', null),

      // User's previously used store names across all their bottles
      supabase
        .from('bottle_variants')
        .select('store_pick_name')
        .eq('created_by', publicUserId)
        .not('store_pick_name', 'is', null),
    ]).then(([batchRes, storeRes]) => {
      setBatchVariants(batchRes.data ?? []);

      // Deduplicate store names
      const stores = [...new Set(
        (storeRes.data ?? [])
          .map((r: any) => r.store_pick_name as string)
          .filter(Boolean)
      )];
      setMyStores(stores);
      setIsFetching(false);
    });
  }, [open, bottle.id, publicUserId]);

  const handleAdd = async () => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      if (selection.type === 'standard') {
        await onAdd(null);
      } else if (selection.type === 'batch') {
        await onAdd(selection.variantId);
      } else if (selection.type === 'store') {
        // Find or create variant for this bottle + store name
        const { data: existing } = await supabase
          .from('bottle_variants')
          .select('id')
          .eq('bottles_id', bottle.id)
          .eq('created_by', publicUserId)
          .eq('store_pick_name', selection.storeName)
          .maybeSingle();

        if (existing) {
          await onAdd(existing.id);
        } else {
          const { data: created, error } = await supabase
            .from('bottle_variants')
            .insert({ bottles_id: bottle.id, created_by: publicUserId, store_pick_name: selection.storeName })
            .select('id')
            .single();
          if (error) throw error;
          await onAdd(created.id);
        }
      } else if (selection.type === 'new_store') {
        if (!newStoreName.trim()) {
          toast.error('Store name is required');
          return;
        }
        const { data: created, error } = await supabase
          .from('bottle_variants')
          .insert({
            bottles_id: bottle.id,
            created_by: publicUserId,
            store_pick_name: newStoreName.trim(),
            proof: newProof ? parseFloat(newProof) : null,
            batch: newBatch.trim() || null,
            release_year: newReleaseYear.trim() || null,
          })
          .select('id')
          .single();
        if (error) throw error;
        await onAdd(created.id);
      }
    } catch (err: any) {
      toast.error('Failed to add bottle');
      console.error(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const variantLabel = (v: BatchVariant) => {
    const parts: string[] = [];
    if (v.batch) parts.push(v.batch);
    if (v.release_year) parts.push(v.release_year);
    if (v.proof) parts.push(`${v.proof} proof`);
    return parts.join(' · ');
  };

  const inputClass = "w-full border border-charcoal rounded px-3 py-2 text-sm bg-ivory text-charcoal placeholder:text-charcoal placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-charcoal";
  const labelClass = "block text-xs font-medium text-charcoal mb-1";

  const radioRow = (isSelected: boolean, label: string, sublabel?: string) => (
    <div className={`flex items-center gap-3 p-3 rounded border transition-colors cursor-pointer ${isSelected ? 'border-charcoal bg-charcoal/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? 'border-charcoal' : 'border-gray-300'}`}>
        {isSelected && <div className="w-2 h-2 rounded-full bg-charcoal" />}
      </div>
      <div>
        <div className="text-sm font-medium text-charcoal">{label}</div>
        {sublabel && <div className="text-xs text-gray-500">{sublabel}</div>}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: '#FDF6E3', color: '#2F2F2F' }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-charcoal text-left">Add {bottle.name}</SheetTitle>
          <p className="text-xs text-gray-500">Which version of this bottle are you adding?</p>
        </SheetHeader>

        {isFetching ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-400">
            Loading options...
          </div>
        ) : (
          <div className="space-y-5 pb-6">
            {/* Standard option */}
            <div
              onClick={() => setSelection({ type: 'standard' })}
            >
              {radioRow(
                selection.type === 'standard',
                'Standard bottle',
                [bottle.proof ? `${bottle.proof} proof` : null, bottle.age].filter(Boolean).join(' · ') || 'Default version'
              )}
            </div>

            {/* Known batch / year variants */}
            {batchVariants.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Known Variants</p>
                <div className="space-y-2">
                  {batchVariants.map(v => (
                    <div key={v.id} onClick={() => setSelection({ type: 'batch', variantId: v.id })}>
                      {radioRow(
                        selection.type === 'batch' && selection.variantId === v.id,
                        variantLabel(v)
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Store pick section */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Store Pick?</p>
              <div className="space-y-2">
                {/* User's known stores */}
                {myStores.map(store => (
                  <div key={store} onClick={() => setSelection({ type: 'store', storeName: store })}>
                    {radioRow(
                      selection.type === 'store' && selection.storeName === store,
                      store,
                      'Your previous store pick'
                    )}
                  </div>
                ))}

                {/* Add new store pick */}
                <div
                  onClick={() => setSelection({ type: 'new_store' })}
                  className={`rounded border transition-colors cursor-pointer ${selection.type === 'new_store' ? 'border-charcoal bg-charcoal/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-3 p-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selection.type === 'new_store' ? 'border-charcoal' : 'border-gray-300'}`}>
                      {selection.type === 'new_store' && <div className="w-2 h-2 rounded-full bg-charcoal" />}
                    </div>
                    <div className="text-sm font-medium text-charcoal">+ Add new store pick</div>
                  </div>

                  {selection.type === 'new_store' && (
                    <div className="px-4 pb-4 space-y-3" onClick={e => e.stopPropagation()}>
                      <div>
                        <label className={labelClass}>Store Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Total Wine, Spec's"
                          value={newStoreName}
                          onChange={e => setNewStoreName(e.target.value)}
                          className={inputClass}
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className={labelClass}>Proof (optional)</label>
                          <input
                            type="number"
                            step="0.1"
                            placeholder="e.g. 118.2"
                            value={newProof}
                            onChange={e => setNewProof(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div className="flex-1">
                          <label className={labelClass}>Batch (optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Batch 14"
                            value={newBatch}
                            onChange={e => setNewBatch(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Release Year (optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. 2024"
                          value={newReleaseYear}
                          onChange={e => setNewReleaseYear(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Add button */}
            <button
              onClick={handleAdd}
              disabled={isAdding || (selection.type === 'new_store' && !newStoreName.trim())}
              className="w-full py-3 rounded border border-charcoal text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#2F2F2F', color: '#FDF6E3' }}
            >
              {isAdding ? 'Adding...' : 'Add to My Bar'}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
