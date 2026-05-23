"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type BottleDetails } from "@/lib/types";

interface EditVariantSheetProps {
  bottle: BottleDetails;
  publicUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: Partial<BottleDetails>) => void;
}

function parseNotes(notes: string | null | undefined) {
  if (!notes) return { nose: '', palate: '', finish: '' };
  const noseMatch = notes.match(/Nose:\s*(.*?)(?=(Palate:|Finish:|$))/is);
  const palateMatch = notes.match(/Palate:\s*(.*?)(?=(Finish:|$))/is);
  const finishMatch = notes.match(/Finish:\s*(.*?)$/is);
  return {
    nose: noseMatch?.[1]?.trim() ?? '',
    palate: palateMatch?.[1]?.trim() ?? '',
    finish: finishMatch?.[1]?.trim() ?? '',
  };
}

export default function EditVariantSheet({ bottle, publicUserId, open, onOpenChange, onSaved }: EditVariantSheetProps) {
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingVariantId, setExistingVariantId] = useState<string | null>(null);

  // Form state — pre-filled from bottle defaults, overridden by user's existing variant
  const [proof, setProof] = useState('');
  const [volume, setVolume] = useState('');
  const [age, setAge] = useState('');
  const [batch, setBatch] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [storePickName, setStorePickName] = useState('');
  const [frontImageUrl, setFrontImageUrl] = useState('');
  const [nose, setNose] = useState('');
  const [palate, setPalate] = useState('');
  const [finish, setFinish] = useState('');
  const [extras, setExtras] = useState('');

  // Seed form from bottle defaults, then overlay existing user variant
  useEffect(() => {
    if (!open) return;

    // Seed from bottle prop (the default attr values)
    setProof(bottle.proof?.toString() ?? '');
    setVolume(bottle.volume ?? '');
    setAge(bottle.age ?? '');
    setBatch(bottle.variants[0]?.batch ?? '');
    setReleaseYear(bottle.variants[0]?.releaseYear ?? '');
    setStorePickName(bottle.variants[0]?.storePickName ?? '');
    setFrontImageUrl(bottle.frontImageUrl ?? '');
    setNose(bottle.nose ?? '');
    setPalate(bottle.palate ?? '');
    setFinish(bottle.finish ?? '');
    setExtras(bottle.extras ?? '');
    setExistingVariantId(null);

    // Fetch user's existing variant to override defaults
    setIsFetching(true);
    supabase
      .from('bottle_attr')
      .select('id, proof, volume, age, batch, release_year, store_pick_name, frontimage_url, notes, extras')
      .eq('bottles_id', bottle.id)
      .eq('created_by', publicUserId)
      .eq('default', false)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingVariantId(data.id);
          if (data.proof != null) setProof(data.proof.toString());
          if (data.volume) setVolume(data.volume);
          if (data.age) setAge(data.age);
          if (data.batch) setBatch(data.batch);
          if (data.release_year) setReleaseYear(data.release_year);
          if (data.store_pick_name) setStorePickName(data.store_pick_name);
          if (data.frontimage_url) setFrontImageUrl(data.frontimage_url);
          if (data.extras) setExtras(data.extras);
          if (data.notes) {
            const parsed = parseNotes(data.notes);
            setNose(parsed.nose);
            setPalate(parsed.palate);
            setFinish(parsed.finish);
          }
        }
        setIsFetching(false);
      });
  }, [open, bottle.id, publicUserId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const notesParts: string[] = [];
      if (nose.trim()) notesParts.push(`Nose: ${nose.trim()}`);
      if (palate.trim()) notesParts.push(`Palate: ${palate.trim()}`);
      if (finish.trim()) notesParts.push(`Finish: ${finish.trim()}`);

      const variantData = {
        bottles_id: bottle.id,
        created_by: publicUserId,
        default: false,
        proof: proof ? parseFloat(proof) : null,
        volume: volume.trim() || null,
        age: age.trim() || null,
        batch: batch.trim() || null,
        release_year: releaseYear.trim() || null,
        store_pick_name: storePickName.trim() || null,
        frontimage_url: frontImageUrl.trim() || null,
        notes: notesParts.length > 0 ? notesParts.join('\n') : null,
        extras: extras.trim() || null,
      };

      if (existingVariantId) {
        const { error } = await supabase
          .from('bottle_attr')
          .update(variantData)
          .eq('id', existingVariantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bottle_attr')
          .insert([variantData]);
        if (error) throw error;
      }

      const updatedVariant = {
        batch: batch.trim() || undefined,
        releaseYear: releaseYear.trim() || undefined,
        storePickName: storePickName.trim() || undefined,
      };

      onSaved({
        proof: proof ? parseFloat(proof) : undefined,
        volume: volume.trim() || undefined,
        age: age.trim() || undefined,
        frontImageUrl: frontImageUrl.trim() || undefined,
        nose: nose.trim() || undefined,
        palate: palate.trim() || undefined,
        finish: finish.trim() || undefined,
        extras: extras.trim() || undefined,
        variants: (updatedVariant.batch || updatedVariant.releaseYear || updatedVariant.storePickName)
          ? [updatedVariant]
          : [],
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
        style={{ backgroundColor: '#FFFFFF', color: '#2F2F2F' }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-charcoal text-left">Edit Your Variant</SheetTitle>
          <p className="text-xs text-gray-500">
            Changes are saved as your personal variant and don&apos;t affect other users.
          </p>
        </SheetHeader>

        {isFetching ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            Loading your variant...
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            {/* Row: Proof + Volume */}
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
                <label className={labelClass}>Volume</label>
                <input
                  type="text"
                  placeholder="e.g. 750ml"
                  value={volume}
                  onChange={e => setVolume(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Row: Age + Release Year */}
            <div className="flex gap-3">
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
            </div>

            {/* Batch */}
            <div>
              <label className={labelClass}>Batch</label>
              <input
                type="text"
                placeholder="e.g. Batch 9"
                value={batch}
                onChange={e => setBatch(e.target.value)}
                className={inputClass}
              />
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

            {/* Image URL */}
            <div>
              <label className={labelClass}>Image URL</label>
              <input
                type="url"
                placeholder="https://..."
                value={frontImageUrl}
                onChange={e => setFrontImageUrl(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Tasting Notes */}
            <div>
              <label className={labelClass}>Nose</label>
              <textarea
                rows={2}
                placeholder="Aromas, first impressions..."
                value={nose}
                onChange={e => setNose(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Palate</label>
              <textarea
                rows={2}
                placeholder="Flavors on the tongue..."
                value={palate}
                onChange={e => setPalate(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Finish</label>
              <textarea
                rows={2}
                placeholder="Lingering notes..."
                value={finish}
                onChange={e => setFinish(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Extras */}
            <div>
              <label className={labelClass}>Additional Notes</label>
              <textarea
                rows={2}
                placeholder="Anything else worth noting..."
                value={extras}
                onChange={e => setExtras(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 rounded border border-charcoal text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#2F2F2F', color: '#FFFFFF' }}
            >
              {isSaving ? 'Saving...' : existingVariantId ? 'Update Variant' : 'Save Variant'}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
