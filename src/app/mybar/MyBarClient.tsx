"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import BottleCardMedium from "@/components/BottleCardMedium";
import BottleDetailView from "@/components/BottleDetailView";
import { type BottleDetails } from "@/lib/types";

interface MyBarClientProps {
  collection: any[];
  allBottlesElo: Array<{ bottle_elo_global?: number }>;
  publicUserId: string;
}

function calcStarsFromElo(elo: number | null | undefined, minElo: number, maxElo: number): number | null {
  if (elo == null || maxElo === minElo) return null;
  return Math.min(5, Math.max(0, ((elo - minElo) / (maxElo - minElo)) * 5));
}

function parseNotes(notes: string | null | undefined) {
  if (!notes) return { nose: undefined, palate: undefined, finish: undefined };
  const noseMatch = notes.match(/Nose:\s*(.*?)(?=(Palate:|Finish:|$))/is);
  const palateMatch = notes.match(/Palate:\s*(.*?)(?=(Finish:|$))/is);
  const finishMatch = notes.match(/Finish:\s*(.*?)$/is);
  return {
    nose: noseMatch?.[1]?.trim(),
    palate: palateMatch?.[1]?.trim(),
    finish: finishMatch?.[1]?.trim(),
  };
}

export default function MyBarClient({ collection: initialCollection, allBottlesElo, publicUserId }: MyBarClientProps) {
  const { minElo, maxElo } = useMemo(() => {
    const valid = allBottlesElo.map(b => b.bottle_elo_global).filter((e): e is number => e != null);
    return { maxElo: valid[0] ?? 1500, minElo: valid[valid.length - 1] ?? 1500 };
  }, [allBottlesElo]);

  // rawCollection is the single source of truth — raw DB rows, filtered on remove
  const [rawCollection, setRawCollection] = useState<any[]>(initialCollection);

  type SortOption = 'global' | 'az';
  const [sortBy, setSortBy] = useState<SortOption>('global');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedBottle, setSelectedBottle] = useState<BottleDetails | null>(null);

  // Derive sorted card data from raw collection
  const sortedCards = useMemo(() => {
    const cards = rawCollection.map(d => ({
      id: d.bottle_id,
      name: d.bottle_name,
      distillery: d.bottle_distillery,
      category: d.bottle_category,
      style: d.bottle_style,
      proof: d.attr_proof,
      image_url: d.attr_frontimage_url,
      stars: calcStarsFromElo(d.bottle_elo_global, minElo, maxElo),
      addedAt: d.addedAt,
      provisional: !d.bottle_verified,
    }));
    if (sortBy === 'az') {
      return [...cards].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return cards; // global = elo DESC order from server
  }, [rawCollection, sortBy, minElo, maxElo]);

  const handleCardClick = (bottleId: string) => {
    const raw = rawCollection.find(r => r.bottle_id === bottleId);
    if (!raw) return;
    const { nose, palate, finish } = parseNotes(raw.attr_notes);
    setSelectedBottle({
      id: raw.bottle_id,
      name: raw.bottle_name,
      distillery: raw.bottle_distillery,
      category: raw.bottle_category,
      style: raw.bottle_style,
      proof: raw.attr_proof,
      volume: raw.attr_volume,
      age: raw.attr_age,
      elo_global: raw.bottle_elo_global,
      verified: raw.bottle_verified,
      lastActivity: undefined,
      frontImageUrl: raw.attr_frontimage_url,
      backImageUrl: raw.attr_backimage_url,
      variants: [{ releaseYear: raw.attr_release_year, batch: raw.attr_batch, storePickName: raw.attr_store_pick_name }]
        .filter(v => v.releaseYear || v.batch || v.storePickName),
      nose,
      palate,
      finish,
    });
  };

  const handleToggleOwnership = useCallback(async (bottleId: string) => {
    const { error } = await supabase
      .from('user_bottles')
      .update({ currently_owned: false, updated_at: new Date().toISOString() })
      .eq('user_id', publicUserId)
      .eq('bottle_id', bottleId);

    if (error) { toast.error("Failed to update"); console.error(error.message); return; }

    setRawCollection(prev => prev.filter(r => r.bottle_id !== bottleId));
    setSelectedBottle(null);
    toast.success("Marked as Finished");
  }, [publicUserId]);

  const handleDeleteFromBar = useCallback(async (bottleId: string) => {
    const { error } = await supabase
      .from('user_bottles')
      .delete()
      .eq('user_id', publicUserId)
      .eq('bottle_id', bottleId);

    if (error) { toast.error("Failed to remove"); console.error(error.message); return; }

    setRawCollection(prev => prev.filter(r => r.bottle_id !== bottleId));
    setSelectedBottle(null);
    toast.success("Removed from collection");
  }, [publicUserId]);

  return (
    <>
      {/* Fixed banner: count + sort */}
      <header className="fixed top-0 left-0 right-0 h-9 bg-ivory border-b border-charcoal z-20 flex items-center justify-between px-4">
        <span className="text-sm text-charcoal">
          {rawCollection.length} in Your Bar
        </span>

        {rawCollection.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(v => !v)}
              className="flex items-center gap-1 text-sm text-charcoal border border-charcoal rounded-full px-3 py-0.5"
            >
              {sortBy === 'global' ? 'Global' : 'A–Z'}
              <ChevronDown size={13} />
            </button>

            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[130px] py-1">
                  {(['global', 'az'] as SortOption[]).map(option => (
                    <button
                      key={option}
                      onClick={() => { setSortBy(option); setShowSortMenu(false); }}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-50"
                    >
                      <span>{option === 'global' ? 'Global Rank' : 'A–Z'}</span>
                      {sortBy === option && <Check size={13} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {/* Collection list */}
      {sortedCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
          <div className="text-5xl mb-4">🥃</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Your bar is empty</h3>
          <p className="text-gray-500 text-sm">Head to Search to find your first bottle</p>
        </div>
      ) : (
        <div>
          {sortedCards.map(card => (
            <div key={card.id} onClick={() => handleCardClick(card.id)} className="cursor-pointer">
              <BottleCardMedium bottle={card} />
            </div>
          ))}
        </div>
      )}

      <Toaster position="top-center" style={{ top: '36px' }} />

      {selectedBottle && (
        <BottleDetailView
          bottle={selectedBottle}
          onClose={() => setSelectedBottle(null)}
          inCollection={true}
          currentlyOwned={true}
          onToggleOwnership={handleToggleOwnership}
          onDeleteFromBar={handleDeleteFromBar}
        />
      )}
    </>
  );
}
