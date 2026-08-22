"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type BottleDetails } from "@/lib/types";
import AddVariantSheet from "@/components/AddVariantSheet";
import VariantSelectSheet from "@/components/VariantSelectSheet";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import PourSheet from "@/components/PourSheet";
import { applyDefaultVariant, fetchVariantsForSku } from "@/lib/variants";
import {
  fetchLastActivityForBottle,
  formatActivityLine,
  logActivity,
  type PourType,
} from "@/lib/activities";

interface BottleDetailViewProps {
  bottle: BottleDetails;
  onClose: () => void;
  inCollection?: boolean;
  currentlyOwned?: boolean;
  publicUserId?: string;
  onAddToBar?: (bottleId: string, variantId?: string | null) => Promise<void>;
  onToggleOwnership?: (bottleId: string) => Promise<void>;
  onDeleteFromBar?: (bottleId: string) => Promise<void>;
  onEditSaved?: (updated: Partial<BottleDetails>) => void;
  onActivityLogged?: () => void;
}

function variantLabel(v: { releaseYear?: string; batch?: string; storePickName?: string }): string {
  const parts = [
    v.storePickName,
    v.releaseYear,
    v.batch ? `Batch ${v.batch}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function BottleDetailView({
  bottle,
  onClose,
  inCollection = false,
  currentlyOwned = false,
  publicUserId,
  onAddToBar,
  onToggleOwnership,
  onDeleteFromBar,
  onEditSaved,
  onActivityLogged,
}: BottleDetailViewProps) {
  const [imageSide, setImageSide] = useState<'front' | 'back'>('front');
  const [variantIndex, setVariantIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [inCollectionLocally, setInCollectionLocally] = useState(inCollection);
  const [ownedLocally, setOwnedLocally] = useState(currentlyOwned);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showVariantSelect, setShowVariantSelect] = useState(false);
  const [showPourSheet, setShowPourSheet] = useState(false);
  const [isPouring, setIsPouring] = useState(false);
  const [lastActivityLabel, setLastActivityLabel] = useState<string | undefined>(bottle.lastActivity);
  const [localBottle, setLocalBottle] = useState<BottleDetails>(bottle);

  const vlist = localBottle.variants || [];
  const hasVariants = vlist.length > 0;
  const currentVariant = vlist[variantIndex] || {};
  const hasBackImage = !!localBottle.backImageUrl;
  const imageUrl = imageSide === 'front' ? localBottle.frontImageUrl : localBottle.backImageUrl;

  const subtitle = hasVariants
    ? (variantLabel(currentVariant) || `Variant ${variantIndex + 1}`)
    : 'Default bottle';
  const identity = [localBottle.distillery, localBottle.category, localBottle.style]
    .filter(Boolean)
    .join(' · ');
  const bareAttrs = [
    localBottle.age,
    localBottle.proof ? `${localBottle.proof} proof` : null,
    localBottle.volume,
  ].filter(Boolean) as string[];
  const hasNotes = !!(localBottle.nose || localBottle.palate || localBottle.finish);
  const showImage = !!imageUrl && !imgError;

  useEffect(() => { setImgError(false); }, [imageUrl]);

  // 7.1 read-switch: overlay the default variant's Elo/notes/images onto the SKU card.
  // Pager still uses labeled (non-default) variants only — carousel of the whole card is 7.4.
  useEffect(() => {
    setLocalBottle(bottle);
    setVariantIndex(0);
    setImageSide("front");
    setImgError(false);
    setInCollectionLocally(inCollection);
    setOwnedLocally(currentlyOwned);
    setLastActivityLabel(bottle.lastActivity);
    let cancelled = false;
    if (publicUserId) {
      fetchLastActivityForBottle(publicUserId, bottle.id).then((label) => {
        if (!cancelled && label) setLastActivityLabel(label);
      });
    }
    fetchVariantsForSku(bottle.id).then((variants) => {
      if (cancelled || !variants.length) return;
      const labeled = variants.filter(
        (v) => !v.isDefault && (v.releaseYear || v.batch || v.storePickName)
      );
      setLocalBottle((prev) => ({
        ...applyDefaultVariant(prev, variants),
        variants: labeled,
      }));
    });
    return () => { cancelled = true; };
  }, [bottle.id, inCollection, currentlyOwned, publicUserId]);

  const goVariant = (dir: number) => {
    if (!hasVariants) return;
    setVariantIndex((i) => (i + dir + vlist.length) % vlist.length);
  };

  const handleMainButton = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Not in collection, or already empty: add a (new) bottle to My Bar.
      // Owned: the split control's "Finished It" calls this to mark empty.
      if (!inCollectionLocally || !ownedLocally) {
        if (!publicUserId) {
          if (!onAddToBar) return;
          await onAddToBar(bottle.id, null);
          setInCollectionLocally(true);
          setOwnedLocally(true);
          return;
        }
        setIsSaving(false);
        setShowVariantSelect(true);
        return;
      }
      if (!onToggleOwnership) return;
      await onToggleOwnership(bottle.id);
      setOwnedLocally(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePour = async (pourType: PourType) => {
    if (!publicUserId || isPouring) return;
    setIsPouring(true);
    try {
      const result = await logActivity({
        userId: publicUserId,
        bottleId: bottle.id,
        action: "drank",
        pourType,
      });
      if (result.error) {
        toast.error("Could not log this pour");
        return;
      }
      const label = formatActivityLine({
        action: "drank",
        pour_type: pourType,
        created_at: new Date().toISOString(),
      });
      if (label) setLastActivityLabel(label);
      setShowPourSheet(false);
      if (pourType === "blind") {
        toast.success("Pour logged. Blind tastings aren't live yet.");
      } else {
        toast.success("Pour logged");
      }
      onActivityLogged?.();
    } finally {
      setIsPouring(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting || !onDeleteFromBar) return;
    setIsDeleting(true);
    try {
      await onDeleteFromBar(bottle.id);
      setInCollectionLocally(false);
      setOwnedLocally(false);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/90 z-50 overflow-y-auto p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white text-black border border-gray-500 rounded-lg p-4 w-full max-w-[375px] mx-auto my-4 relative">
        {/* Top bar: close + suggest-edit */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 flex items-center justify-center border border-gray-500 bg-white hover:bg-gray-200 rounded"
          >
            <X className="w-5 h-5" />
          </button>
          {inCollectionLocally && publicUserId ? (
            <button
              onClick={() => setShowEditSheet(true)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-black px-2 py-1"
              title="Update your variant details (batch, proof, store pick…)"
            >
              <GitBranch className="w-4 h-4" /> Suggest edit
            </button>
          ) : (
            <div className="w-10 h-10" />
          )}
        </div>

        {/* Name + subtitle + identity */}
        <div className="mb-3">
          <h1 className="text-xl font-bold leading-tight">{localBottle.name}</h1>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-sm text-gray-600 truncate">{subtitle}</span>
            {hasVariants && vlist.length > 1 && (
              <span className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => goVariant(-1)} aria-label="Previous variant" className="text-gray-600 hover:text-black">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500">{variantIndex + 1} / {vlist.length}</span>
                <button onClick={() => goVariant(1)} aria-label="Next variant" className="text-gray-600 hover:text-black">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </span>
            )}
          </div>
          {identity && <div className="text-xs text-gray-400 mt-1">{identity}</div>}
        </div>

        {/* Image (portrait) + attributes beside */}
        <div className="flex gap-4 mb-3">
          <div className="w-[116px] flex-shrink-0">
            <button
              onClick={() => showImage && setShowZoom(true)}
              className="relative w-full h-44 flex items-center justify-center bg-gray-100 border border-gray-500 rounded overflow-hidden"
              style={{ cursor: showImage ? 'zoom-in' : 'default' }}
              aria-label="Zoom image"
            >
              {showImage ? (
                <Image
                  src={imageUrl!}
                  alt={`${localBottle.name} ${imageSide} view`}
                  fill
                  style={{ objectFit: 'contain' }}
                  className="rounded"
                  unoptimized
                  onError={() => setImgError(true)}
                />
              ) : (
                <BottlePlaceholderImage />
              )}
            </button>

            {/* Front/Back toggle beneath the image */}
            <div className="flex justify-center mt-2">
              <div className="inline-flex border border-gray-500 rounded-full overflow-hidden">
                <button
                  onClick={() => setImageSide('front')}
                  className={`px-3.5 py-1 text-xs ${imageSide === 'front' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}
                >
                  Front
                </button>
                <button
                  onClick={() => hasBackImage && setImageSide('back')}
                  disabled={!hasBackImage}
                  className={`px-3.5 py-1 text-xs ${imageSide === 'back' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'} disabled:opacity-40`}
                >
                  Back
                </button>
              </div>
            </div>

            {hasVariants && vlist.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {vlist.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setVariantIndex(idx)}
                    aria-label={`Variant ${idx + 1}`}
                    className={`w-2 h-2 rounded-full ${idx === variantIndex ? 'bg-gray-800' : 'bg-gray-300'}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[15px] leading-7">
              {bareAttrs.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-2 pt-2 text-sm space-y-1.5">
              <div>
                <div className="text-[11px] text-gray-500">Global Elo</div>
                <div>{localBottle.elo_global ?? '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Verified</div>
                <div className="flex items-center gap-1.5">
                  {localBottle.verified ? (
                    <><span className="text-green-600">✓</span> Verified</>
                  ) : (
                    <><span className="inline-block w-2 h-2 rounded-full" style={{ background: '#EF9F27' }} /> Unverified</>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* My last activity */}
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-gray-500">My last activity</span>
          <span>{lastActivityLabel || 'None'}</span>
        </div>
        {localBottle.timesHad != null && localBottle.timesHad > 0 && (
          <div className="flex items-center justify-between text-sm mb-3 -mt-1">
            <span className="text-gray-500">Times had</span>
            <span>{localBottle.timesHad}</span>
          </div>
        )}

        {/* Variant note (if present) */}
        {currentVariant.notes && (
          <p className="text-sm text-gray-600 italic border-t border-gray-200 pt-2 mb-3">{currentVariant.notes}</p>
        )}

        {/* Characteristics and tasting notes */}
        <div className="border border-gray-500 rounded mb-4">
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className="w-full text-left p-3 bg-white hover:bg-gray-100 font-medium flex items-center justify-between"
          >
            Characteristics and tasting notes
            <span className="text-gray-500">{notesOpen ? '▲' : '▼'}</span>
          </button>
          {notesOpen && (
            <div className="p-3 pt-1 bg-white text-sm">
              {hasNotes ? (
                <div className="space-y-2">
                  {localBottle.nose && <p><span className="font-medium">Nose</span> — <span className="text-gray-700 whitespace-pre-wrap">{localBottle.nose}</span></p>}
                  {localBottle.palate && <p><span className="font-medium">Palate</span> — <span className="text-gray-700 whitespace-pre-wrap">{localBottle.palate}</span></p>}
                  {localBottle.finish && <p><span className="font-medium">Finish</span> — <span className="text-gray-700 whitespace-pre-wrap">{localBottle.finish}</span></p>}
                </div>
              ) : (
                <p className="text-gray-500">No tasting notes yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-center">
          {!inCollectionLocally || !ownedLocally ? (
            <Button
              onClick={handleMainButton}
              disabled={isSaving || !onAddToBar}
              variant="outline"
              className="border-gray-500 text-black hover:bg-gray-100 disabled:opacity-60 w-full"
              style={{ minHeight: '44px' }}
            >
              {isSaving ? 'Adding...' : 'Add to My Bar'}
            </Button>
          ) : (
            <div className="flex border border-gray-400 rounded overflow-hidden w-full" style={{ minHeight: '44px' }}>
              <button
                type="button"
                disabled
                className="flex-1 px-3 text-sm font-medium bg-gray-800 text-white"
              >
                ✓ In My Bar
              </button>
              <div className="w-px bg-gray-400" />
              <button
                type="button"
                onClick={() => { if (!isSaving) handleMainButton(); }}
                disabled={isSaving}
                className="flex-1 px-3 text-sm font-medium bg-white text-gray-500 hover:bg-gray-50"
              >
                Finished It
              </button>
            </div>
          )}
        </div>

        {publicUserId && (
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPouring}
              onClick={() => setShowPourSheet(true)}
              className="border-gray-500 text-black hover:bg-gray-100 disabled:opacity-60 w-full"
              style={{ minHeight: '44px' }}
              data-coach="bottle.have_a_drink"
            >
              Have a drink
            </Button>
          </div>
        )}

        {/* Remove from collection */}
        {inCollectionLocally && !showDeleteConfirm && (
          <div className="text-center mt-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-gray-400 hover:text-red-500 underline"
            >
              Remove from collection
            </button>
          </div>
        )}
        {inCollectionLocally && showDeleteConfirm && (
          <div className="mt-2 border border-red-300 rounded p-2 bg-red-50 text-xs">
            <p className="text-gray-700 mb-2">
              This removes all tastings and history. Only use if added by mistake.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-600 font-semibold hover:text-red-800 disabled:opacity-50"
              >
                {isDeleting ? 'Removing...' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full-screen image zoom — close control must sit above the image (image used to cover the X). */}
      {showZoom && showImage && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
          onClick={() => setShowZoom(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowZoom(false);
            }}
            aria-label="Close zoom"
            className="absolute top-4 right-4 z-[70] w-10 h-10 flex items-center justify-center bg-white rounded-full text-black"
          >
            <X className="w-6 h-6 pointer-events-none" />
          </button>
          <div
            className="relative w-full max-w-[500px] h-[75vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={imageUrl!}
              alt={`${localBottle.name} ${imageSide} view, enlarged`}
              fill
              style={{ objectFit: 'contain' }}
              unoptimized
            />
          </div>
        </div>
      )}

      {publicUserId && (
        <PourSheet
          open={showPourSheet}
          onOpenChange={setShowPourSheet}
          bottleName={localBottle.name}
          isSaving={isPouring}
          onSelect={handlePour}
        />
      )}

      {/* Variant select sheet — first add to bar */}
      {publicUserId && (
        <VariantSelectSheet
          bottle={localBottle}
          open={showVariantSelect}
          onOpenChange={setShowVariantSelect}
          onAdd={async (variantId) => {
            if (!onAddToBar) return;
            await onAddToBar(bottle.id, variantId);
            setInCollectionLocally(true);
            setOwnedLocally(true);
            setShowVariantSelect(false);
            onClose();
          }}
        />
      )}

      {/* Variant edit sheet — bottles already in collection */}
      {publicUserId && (
        <AddVariantSheet
          bottle={localBottle}
          open={showEditSheet}
          onOpenChange={setShowEditSheet}
          onSaved={(updated) => {
            setLocalBottle((prev) => ({
              ...prev,
              variants: updated.variants !== undefined ? updated.variants : prev.variants,
            }));
            onEditSaved?.(updated);
          }}
        />
      )}
    </div>
  );
}
