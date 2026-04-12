"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type BottleDetails } from "@/lib/types";
import AddVariantSheet from "@/components/AddVariantSheet";
import VariantSelectSheet from "@/components/VariantSelectSheet";

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
}: BottleDetailViewProps) {
  const [imageSide, setImageSide] = useState<'front' | 'back'>('front');
  const [variantIndex, setVariantIndex] = useState(0);
  const [openSections, setOpenSections] = useState({
    variant: true,
    nose: false,
    palate: false,
    finish: false,
  });
  const [inCollectionLocally, setInCollectionLocally] = useState(inCollection);
  const [ownedLocally, setOwnedLocally] = useState(currentlyOwned);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showVariantSelect, setShowVariantSelect] = useState(false);
  const [localBottle, setLocalBottle] = useState<BottleDetails>(bottle);

  const currentVariant = localBottle.variants[variantIndex] || {};
  const hasBackImage = !!localBottle.backImageUrl;
  const imageUrl = imageSide === 'front' ? localBottle.frontImageUrl : localBottle.backImageUrl;

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleMainButton = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (!inCollectionLocally) {
        // Open variant selection sheet — it handles the actual add
        setIsSaving(false);
        setShowVariantSelect(true);
        return;
      } else {
        // Toggle currently_owned
        if (!onToggleOwnership) return;
        await onToggleOwnership(bottle.id);
        setOwnedLocally(prev => !prev);
      }
    } finally {
      setIsSaving(false);
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

  const statsItems = [
    { label: 'Distillery', value: localBottle.distillery },
    { label: 'Category', value: localBottle.category },
    { label: 'Style', value: localBottle.style },
    { label: 'Age', value: localBottle.age },
    { label: 'Proof', value: localBottle.proof ? `${localBottle.proof}%` : null },
    { label: 'Volume', value: localBottle.volume },
    { label: 'Global ELO', value: localBottle.elo_global?.toString() },
    { label: 'Verified', value: localBottle.verified ? 'Yes' : 'No' },
    { label: 'Barcode', value: localBottle.barcode },
    { label: 'Last Activity', value: localBottle.lastActivity },
  ].filter(item => item.value);

  return (
    <div className="fixed inset-0 bg-gray-900/90 flex items-center justify-center z-50 p-4">
      <div className="bg-white text-black border border-gray-500 rounded-lg p-4 w-[375px] max-h-[812px] overflow-auto relative">
        {/* Header: [X] | action buttons | [✏️ or spacer] */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            {/* Close */}
            <button
              onClick={onClose}
              className="w-11 h-11 flex-shrink-0 flex items-center justify-center border border-gray-500 bg-white hover:bg-gray-200 rounded"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Action buttons — centered */}
            <div className="flex-1 flex justify-center">
              {!inCollectionLocally ? (
                <Button
                  onClick={handleMainButton}
                  disabled={isSaving}
                  variant="outline"
                  className="border-gray-500 text-black hover:bg-gray-100 disabled:opacity-60"
                  style={{ minHeight: '44px' }}
                >
                  {isSaving ? 'Adding...' : 'Add to My Bar'}
                </Button>
              ) : (
                <div className="flex border border-gray-400 rounded overflow-hidden" style={{ minHeight: '44px' }}>
                  <button
                    onClick={() => { if (!ownedLocally && !isSaving) handleMainButton(); }}
                    disabled={isSaving}
                    className={`px-3 text-sm font-medium transition-colors ${ownedLocally ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    ✓ In My Bar
                  </button>
                  <div className="w-px bg-gray-400" />
                  <button
                    onClick={() => { if (ownedLocally && !isSaving) handleMainButton(); }}
                    disabled={isSaving}
                    className={`px-3 text-sm font-medium transition-colors ${!ownedLocally ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    Finished It
                  </button>
                </div>
              )}
            </div>

            {/* Edit or spacer to balance X */}
            {inCollectionLocally && publicUserId ? (
              <button
                onClick={() => setShowEditSheet(true)}
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center border border-gray-500 bg-white hover:bg-gray-200 rounded"
                title="Update your variant details (batch, proof, store pick…)"
              >
                <GitBranch className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-11 h-11 flex-shrink-0" />
            )}
          </div>

          {/* Bottle name */}
          <h1 className="text-center text-xl font-bold leading-tight px-2">{localBottle.name}</h1>

          {/* Remove from collection / delete confirm */}
          {inCollectionLocally && !showDeleteConfirm && (
            <div className="text-center mt-1">
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
        {/* Image and Stats Section */}
        <div className="flex gap-4 mb-6">
          {/* Image Section */}
          <div className="relative w-2/5 h-64 flex items-center justify-center bg-gray-100 border border-gray-500 rounded">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={`${bottle.name} ${imageSide} view`}
                fill
                style={{ objectFit: 'contain' }}
                className="rounded"
                unoptimized={true}
              />
            ) : (
              <div className="text-gray-600 text-6xl">🍾</div>
            )}

            {/* Toggle Arrows */}
            <button
              onClick={() => setImageSide('front')}
              className={`absolute left-2 top-1/2 -translate-y-1/2 ${imageSide === 'front' ? 'text-black' : 'text-gray-500'} hover:text-gray-600`}
              disabled={!hasBackImage}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button
              onClick={() => setImageSide('back')}
              className={`absolute right-2 top-1/2 -translate-y-1/2 ${imageSide === 'back' ? 'text-black' : hasBackImage ? 'text-black' : 'text-gray-500'} hover:text-gray-600`}
              disabled={!hasBackImage}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </div>

          {/* Stats Section */}
          <div className="flex-1 flex flex-col space-y-1">
            {statsItems.map((item) => (
              <div key={item.label} className="flex justify-between items-center py-1">
                <span className="font-medium text-base">{item.label}</span>
                <span className="text-base">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Accordion Sections */}
        <div className="space-y-4">
          {/* Variant Section */}
          <div className="border border-gray-500 rounded">
            <button
              onClick={() => toggleSection('variant')}
              className="w-full text-left p-4 bg-white hover:bg-gray-100 font-semibold flex items-center justify-between"
            >
              Variant
              <span>{openSections.variant ? '▼' : '▶'}</span>
            </button>
            {openSections.variant && (
              <div className="p-4 bg-white">
                {localBottle.variants.length > 0 ? (
                  <div className="overflow-x-auto">
                    {localBottle.variants.length > 1 && (
                      <div className="flex justify-center gap-2 mb-4">
                        {localBottle.variants.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setVariantIndex(idx)}
                            className={`w-3 h-3 rounded-full ${idx === variantIndex ? 'bg-gray-800' : 'bg-gray-300'}`}
                          />
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {currentVariant.releaseYear && <p>Release Year: {currentVariant.releaseYear}</p>}
                      {currentVariant.batch && <p>Batch: {currentVariant.batch}</p>}
                      {currentVariant.storePickName && <p>Store Pick: {currentVariant.storePickName}</p>}
                      {currentVariant.notes && (
                        <p className="mt-2 text-sm text-gray-600 italic border-t border-gray-200 pt-2">{currentVariant.notes}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600">No variant information available.</p>
                )}
              </div>
            )}
          </div>

          {/* Nose Section */}
          <div className="border border-gray-500 rounded">
            <button
              onClick={() => toggleSection('nose')}
              className="w-full text-left p-4 bg-white hover:bg-gray-100 font-semibold flex items-center justify-between"
            >
              Nose
              <span>{openSections.nose ? '▼' : '▶'}</span>
            </button>
            {openSections.nose && (
              <div className="p-4 bg-white">
                {localBottle.nose ? (
                  <p className="whitespace-pre-wrap">{localBottle.nose}</p>
                ) : (
                  <p className="text-gray-600">No nose notes available.</p>
                )}
              </div>
            )}
          </div>

          {/* Palate Section */}
          <div className="border border-gray-500 rounded">
            <button
              onClick={() => toggleSection('palate')}
              className="w-full text-left p-4 bg-white hover:bg-gray-100 font-semibold flex items-center justify-between"
            >
              Palate
              <span>{openSections.palate ? '▼' : '▶'}</span>
            </button>
            {openSections.palate && (
              <div className="p-4 bg-white">
                {localBottle.palate ? (
                  <p className="whitespace-pre-wrap">{localBottle.palate}</p>
                ) : (
                  <p className="text-gray-600">No palate notes available.</p>
                )}
              </div>
            )}
          </div>

          {/* Finish Section */}
          <div className="border border-gray-500 rounded">
            <button
              onClick={() => toggleSection('finish')}
              className="w-full text-left p-4 bg-white hover:bg-gray-100 font-semibold flex items-center justify-between"
            >
              Finish
              <span>{openSections.finish ? '▼' : '▶'}</span>
            </button>
            {openSections.finish && (
              <div className="p-4 bg-white">
                {localBottle.finish ? (
                  <p className="whitespace-pre-wrap">{localBottle.finish}</p>
                ) : (
                  <p className="text-gray-600">No finish notes available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Variant select sheet — shown when adding to bar for the first time */}
      {publicUserId && (
        <VariantSelectSheet
          bottle={localBottle}
          publicUserId={publicUserId}
          open={showVariantSelect}
          onOpenChange={setShowVariantSelect}
          onAdd={async (variantId) => {
            if (!onAddToBar) return;
            await onAddToBar(bottle.id, variantId);
            setShowVariantSelect(false);
            onClose();
          }}
        />
      )}

      {/* Variant edit sheet — shown for bottles already in collection */}
      {publicUserId && (
        <AddVariantSheet
          bottle={localBottle}
          publicUserId={publicUserId}
          open={showEditSheet}
          onOpenChange={setShowEditSheet}
          onSaved={(updated) => {
            setLocalBottle(prev => ({
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
