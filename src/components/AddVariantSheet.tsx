"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type BottleDetails } from "@/lib/types";

interface AddVariantSheetProps {
  bottle: BottleDetails;
  publicUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: Partial<BottleDetails>) => void;
}

export default function AddVariantSheet({ bottle, publicUserId, open, onOpenChange, onSaved }: AddVariantSheetProps) {
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingVariantId, setExistingVariantId] = useState<string | null>(null);

  const [proof, setProof] = useState('');
  const [age, setAge] = useState('');
  const [batch, setBatch] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [storePickName, setStorePickName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;

    // Seed from bottle defaults
    setProof(bottle.proof?.toString() ?? '');
    setAge(bottle.age ?? '');
    setBatch(bottle.variants[0]?.batch ?? '');
    setReleaseYear(bottle.variants[0]?.releaseYear ?? '');
    setStorePickName(bottle.variants[0]?.storePickName ?? '');
    setNotes(bottle.variants[0]?.notes ?? '');
    setExistingVariantId(null);

    // Fetch user's existing variant to override defaults
    setIsFetching(true);
    supabase
      .from('bottle_variants')
      .select('id, proof, age, batch, release_year, store_pick_name, notes')
      .eq('bottles_id', bottle.id)
      .eq('created_by', publicUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingVariantId(data.id);
          if (data.proof != null) setProof(data.proof.toString());
          if (data.age) setAge(data.age);
          if (data.batch) setBatch(data.batch);
          if (data.release_year) setReleaseYear(data.release_year);
          if (data.store_pick_name) setStorePickName(data.store_pick_name);
          if (data.notes) setNotes(data.notes);
        }
        setIsFetching(false);
      });
  }, [open, bottle.id, publicUserId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const variantData = {
        bottles_id: bottle.id,
        created_by: publicUserId,
        proof: proof ? parseFloat(proof) : null,
        age: age.trim() || null,
        batch: batch.trim() || null,
        release_year: releaseYear.trim() || null,
        store_pick_name: storePickName.trim() || null,
        notes: notes.trim() || null,
      };

      if (existingVariantId) {
        const { error } = await supabase
          .from('bottle_variants')
          .update(variantData)
          .eq('id', existingVariantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bottle_variants')
          .insert([variantData]);
        if (error) throw error;
      }

      onSaved({
        variants: [{
          variantId: existingVariantId ?? undefined,
          batch: batch.trim() || undefined,
          releaseYear: releaseYear.trim() || undefined,
          storePickName: storePickName.trim() || undefined,
          notes: notes.trim() || undefined,
        }],
      });

      toast.success('Variant saved!');
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Failed to save variant');
      console.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full border border-charcoal rounded px-3 py-2 text-sm bg-ivory text-charcoal placeholder:text-charcoal placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-charcoal";
  const labelClass = "block text-xs font-medium text-charcoal mb-1";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: '#FDF6E3', color: '#2F2F2F' }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-charcoal text-left">Your Variant</SheetTitle>
          <p className="text-xs text-gray-500">
            Log the specific details of your bottle. These are saved privately and don&apos;t affect other users.
          </p>
        </SheetHeader>

        {isFetching ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            Loading your variant...
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            {/* Row: Proof + Age */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>Proof / ABV (%)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 45"
                  value={proof}
                  onChange={e => setProof(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Age</label>
                <input
                  type="text"
                  placeholder="e.g. 12 Year"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Row: Release Year + Batch */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>Release Year</label>
                <input
                  type="text"
                  placeholder="e.g. 2023"
                  value={releaseYear}
                  onChange={e => setReleaseYear(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Batch</label>
                <input
                  type="text"
                  placeholder="e.g. Batch 9"
                  value={batch}
                  onChange={e => setBatch(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Store Pick Name */}
            <div>
              <label className={labelClass}>Store Pick Name</label>
              <input
                type="text"
                placeholder="e.g. Total Wine Single Barrel"
                value={storePickName}
                onChange={e => setStorePickName(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Personal Notes */}
            <div>
              <label className={labelClass}>Personal Notes</label>
              <textarea
                rows={3}
                placeholder="Your thoughts on this specific bottle..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 rounded border border-charcoal text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#2F2F2F', color: '#FDF6E3' }}
            >
              {isSaving ? 'Saving...' : existingVariantId ? 'Update Variant' : 'Save Variant'}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
