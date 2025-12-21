"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type BottleDetails } from "@/lib/types";

interface BottleDetailViewProps {
  bottle: BottleDetails;
  onClose: () => void;
}

export default function BottleDetailView({ bottle, onClose }: BottleDetailViewProps) {
  const [imageSide, setImageSide] = useState<'front' | 'back'>('front');
  const [variantIndex, setVariantIndex] = useState(0);
  const [openSections, setOpenSections] = useState({
    variant: true,
    nose: false,
    palate: false,
    finish: false,
  });

  const currentVariant = bottle.variants[variantIndex] || {};
  const hasBackImage = !!bottle.backImageUrl;
  const imageUrl = imageSide === 'front' ? bottle.frontImageUrl : bottle.backImageUrl;

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const addToCollection = () => {
    // Stub: alert for now
    alert(`Added ${bottle.name} to your collection! (Stub functionality)`);
    // TODO: Insert into user collection via Supabase
  };

  const statsItems = [
    { label: 'Name', value: bottle.name, className: 'text-xl font-bold' },
    { label: 'Distillery', value: bottle.distillery, className: 'text-lg font-semibold' },
    { label: 'Style', value: bottle.style, className: 'text-lg font-semibold' },
    { label: 'Category', value: bottle.category, className: 'text-lg font-semibold' },
    { label: 'Age', value: bottle.age },
    { label: 'Proof', value: bottle.proof ? `${bottle.proof}%` : undefined },
    { label: 'Volume', value: bottle.volume },
    { label: 'ELO Global', value: bottle.elo_global?.toString() },
    { label: 'Verified', value: bottle.verified ? 'Yes' : 'No' },
    { label: 'Barcode', value: bottle.barcode },
    { label: 'Your Last Activity', value: bottle.lastActivity || 'Never' },
  ].filter(item => item.value); // Skip null values

  return (
    <div className="fixed inset-0 bg-gray-900/90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 text-gray-200 border border-gray-500 rounded-lg p-4 max-w-4xl mx-auto max-h-full overflow-auto relative">
        {/* Header with close button */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Bottle Details</h1>
          <button
            onClick={onClose}
            className="p-2 bg-gray-800 border border-gray-500 rounded hover:bg-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        {/* Image and Stats Section */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* Image Section */}
          <div className="relative w-full lg:w-5/12 h-96 flex items-center justify-center bg-gray-700 rounded">
            {imageUrl ? (
              console.log(`Debug imageUrl: ${imageUrl}`),
              (
              <Image
                src={imageUrl}
                alt={`${bottle.name} ${imageSide} view`}
                fill
                style={{ objectFit: 'contain' }}
                className="rounded"
                unoptimized={true}
              />
              )
            ) : (
              <div className="text-gray-400 text-6xl">🍾</div>
            )}

            {/* Toggle Arrows */}
            <button
              onClick={() => setImageSide('front')}
              className={`absolute left-2 top-1/2 -translate-y-1/2 ${imageSide === 'front' ? 'text-gray-200' : 'text-gray-500'} hover:text-gray-300`}
              disabled={!hasBackImage}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button
              onClick={() => setImageSide('back')}
              className={`absolute right-2 top-1/2 -translate-y-1/2 ${imageSide === 'back' ? 'text-gray-200' : 'text-gray-500'} hover:text-gray-300`}
              disabled={!hasBackImage}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </div>

          {/* Stats Section */}
          <div className="flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              {statsItems.map((item, index) => (
                <div key={item.label} className="flex flex-col">
                  <span className="text-gray-400 text-sm">{item.label}</span>
                  <span className={item.className || 'text-base'}>{item.value}</span>
                  {item.label === 'ELO Global' && (
                    <Button
                      onClick={addToCollection}
                      variant="outline"
                      className="mt-2 border-gray-500 text-gray-200 hover:bg-gray-700"
                      style={{ minHeight: '44px' }}
                    >
                      Add to Collection
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Accordion Sections */}
        <div className="space-y-4">
          {/* Variant Section */}
          <div className="border border-gray-500 rounded">
            <button
              onClick={() => toggleSection('variant')}
              className="w-full text-left p-4 bg-gray-700 hover:bg-gray-600 font-semibold flex items-center justify-between"
            >
              Variant
              <span>{openSections.variant ? '▼' : '▶'}</span>
            </button>
            {openSections.variant && (
              <div className="p-4">
                {bottle.variants.length > 0 ? (
                  <div className="overflow-x-auto">
                    {/* Variant dots for swiping */}
                    {bottle.variants.length > 1 && (
                      <div className="flex justify-center gap-2 mb-4">
                        {bottle.variants.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setVariantIndex(idx)}
                            className={`w-3 h-3 rounded-full ${idx === variantIndex ? 'bg-gray-200' : 'bg-gray-600'}`}
                          />
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {currentVariant.releaseYear && <p>Release Year: {currentVariant.releaseYear}</p>}
                      {currentVariant.batch && <p>Batch: {currentVariant.batch}</p>}
                      {currentVariant.storePickName && <p>Store Pick: {currentVariant.storePickName}</p>}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400">No variant information available.</p>
                )}
              </div>
            )}
          </div>

          {/* Nose Section */}
          <div className="border border-gray-500 rounded">
            <button
              onClick={() => toggleSection('nose')}
              className="w-full text-left p-4 bg-gray-700 hover:bg-gray-600 font-semibold flex items-center justify-between"
            >
              Nose
              <span>{openSections.nose ? '▼' : '▶'}</span>
            </button>
            {openSections.nose && (
              <div className="p-4">
                {bottle.nose ? (
                  <p className="whitespace-pre-wrap">{bottle.nose}</p>
                ) : (
                  <p className="text-gray-400">No nose notes available.</p>
                )}
              </div>
            )}
          </div>

          {/* Palate Section */}
          <div className="border border-gray-500 rounded">
            <button
              onClick={() => toggleSection('palate')}
              className="w-full text-left p-4 bg-gray-700 hover:bg-gray-600 font-semibold flex items-center justify-between"
            >
              Palate
              <span>{openSections.palate ? '▼' : '▶'}</span>
            </button>
            {openSections.palate && (
              <div className="p-4">
                {bottle.palate ? (
                  <p className="whitespace-pre-wrap">{bottle.palate}</p>
                ) : (
                  <p className="text-gray-400">No palate notes available.</p>
                )}
              </div>
            )}
          </div>

          {/* Finish Section */}
          <div className="border border-gray-500 rounded">
            <button
              onClick={() => toggleSection('finish')}
              className="w-full text-left p-4 bg-gray-700 hover:bg-gray-600 font-semibold flex items-center justify-between"
            >
              Finish
              <span>{openSections.finish ? '▼' : '▶'}</span>
            </button>
            {openSections.finish && (
              <div className="p-4">
                {bottle.finish ? (
                  <p className="whitespace-pre-wrap">{bottle.finish}</p>
                ) : (
                  <p className="text-gray-400">No finish notes available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
