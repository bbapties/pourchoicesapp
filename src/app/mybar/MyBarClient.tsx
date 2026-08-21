"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import BottleCardMedium from "@/components/BottleCardMedium";
import BottleDetailView from "@/components/BottleDetailView";
import { type BottleDetails } from "@/lib/types";

interface MyBarClientProps {
  ownedCollection: any[];
  emptyCollection: any[];
  allBottlesElo: Array<{ bottle_elo_global?: number }>;
  publicUserId: string;
}

type TabOption = 'owned' | 'empty' | 'tasted';
type SortOption = 'global' | 'az' | 'za' | 'yours' | null;
type FilterField = 'category' | 'verified';

interface FilterState {
  step: 'closed' | 'field' | 'value';
  field: FilterField | null;
  value: string | null;
}

const CATEGORY_VALUES = ['Whiskey', 'Gin', 'Rum', 'Vodka', 'Tequila', 'Other'];
const VERIFIED_VALUES = ['Verified', 'Community Added'];

const SORT_LABELS: Record<NonNullable<SortOption>, string> = {
  global: 'Global Ranks',
  az: 'A–Z',
  za: 'Z–A',
  yours: 'My Ranks',
};

function calcStarsFromElo(elo: number | null | undefined, minElo: number, maxElo: number): number | null {
  if (elo == null || maxElo === minElo) return null;
  return Math.min(5, Math.max(0, ((elo - minElo) / (maxElo - minElo)) * 5));
}


function mapToCardData(d: any, minElo: number, maxElo: number, currentlyOwned: boolean) {
  return {
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
    currentlyOwned,
  };
}

export default function MyBarClient({ ownedCollection: initialOwned, emptyCollection: initialEmpty, allBottlesElo, publicUserId }: MyBarClientProps) {
  const { minElo, maxElo } = useMemo(() => {
    const valid = allBottlesElo.map(b => b.bottle_elo_global).filter((e): e is number => e != null);
    return { maxElo: valid[0] ?? 1500, minElo: valid[valid.length - 1] ?? 1500 };
  }, [allBottlesElo]);

  const [rawOwned, setRawOwned] = useState<any[]>(initialOwned);
  const [rawEmpty, setRawEmpty] = useState<any[]>(initialEmpty);

  const [activeTab, setActiveTab] = useState<TabOption>('owned');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [filter, setFilter] = useState<FilterState>({ step: 'closed', field: null, value: null });
  const [selectedBottle, setSelectedBottle] = useState<BottleDetails | null>(null);

  const activeRaw = activeTab === 'owned' ? rawOwned : activeTab === 'empty' ? rawEmpty : [];

  // Shared filter logic — used for both active tab cards and per-tab counts
  const applySearchAndFilter = useCallback((raw: any[], isOwned: boolean) => {
    let cards = raw.map(d => mapToCardData(d, minElo, maxElo, isOwned));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      cards = cards.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.distillery?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q)
      );
    }
    if (filter.field && filter.value) {
      if (filter.field === 'category') {
        cards = cards.filter(c => c.category === filter.value);
      } else if (filter.field === 'verified') {
        const wantVerified = filter.value === 'Verified';
        cards = cards.filter(c => (c.provisional === false) === wantVerified);
      }
    }
    return cards;
  }, [searchQuery, filter, minElo, maxElo]);

  // Counts for each tab — always reflect active search + filter
  const tabCounts = useMemo(() => ({
    owned: applySearchAndFilter(rawOwned, true).length,
    empty: applySearchAndFilter(rawEmpty, false).length,
  }), [rawOwned, rawEmpty, applySearchAndFilter]);

  const filteredCards = useMemo(() => {
    const isOwned = activeTab === 'owned';
    const cards = applySearchAndFilter(activeRaw, isOwned);
    if (sortBy === 'az') return [...cards].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'za') return [...cards].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    return cards; // global/null = server Elo order
  }, [activeRaw, activeTab, applySearchAndFilter, sortBy]);

  const handleCardClick = (bottleId: string) => {
    const raw = activeRaw.find(r => r.bottle_id === bottleId);
    if (!raw) return;
    const variantIds: string[] = raw.attr_variant_ids || [];
    const batches: string[] = raw.attr_batch || [];
    const releaseYears: string[] = raw.attr_release_year || [];
    const storePickNames: string[] = raw.attr_store_pick_name || [];
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
      variants: variantIds
        .map((vid, i) => ({
          variantId: vid,
          releaseYear: releaseYears[i],
          batch: batches[i],
          storePickName: storePickNames[i],
        }))
        .filter(v => v.releaseYear || v.batch || v.storePickName),
      nose: raw.attr_nose,
      palate: raw.attr_palate,
      finish: raw.attr_finish,
      extras: raw.attr_extras,
    });
  };

  const handleAddToBar = useCallback(async (bottleId: string, variantId?: string | null) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('user_bottles')
      .insert({
        user_id: publicUserId,
        bottle_id: bottleId,
        currently_owned: true,
        variant_id: variantId ?? null,
        created_at: now,
        updated_at: now,
      });

    let addedNewRow = !error;
    if (error) {
      // PK is still (user_id, bottle_id) for some rows — fall back to re-activating the empty one.
      const { error: upErr } = await supabase
        .from('user_bottles')
        .update({ currently_owned: true, updated_at: now, variant_id: variantId ?? null })
        .eq('user_id', publicUserId)
        .eq('bottle_id', bottleId);
      if (upErr) {
        toast.error("Failed to add to My Bar");
        return;
      }
      addedNewRow = false;
    }

    const row = rawEmpty.find(r => r.bottle_id === bottleId) || rawOwned.find(r => r.bottle_id === bottleId);
    if (row) {
      setRawOwned(prev => prev.some(r => r.bottle_id === bottleId) ? prev : [...prev, { ...row, addedAt: now }]);
      if (!addedNewRow) {
        setRawEmpty(prev => prev.filter(r => r.bottle_id !== bottleId));
      }
    }
    toast.success("Added to My Bar!");
  }, [publicUserId, rawEmpty, rawOwned]);

  const handleToggleOwnership = useCallback(async (bottleId: string) => {
    const { error } = await supabase
      .from('user_bottles')
      .update({ currently_owned: false, updated_at: new Date().toISOString() })
      .eq('user_id', publicUserId)
      .eq('bottle_id', bottleId);

    if (error) { toast.error("Failed to update"); return; }

    const row = rawOwned.find(r => r.bottle_id === bottleId);
    if (row) {
      setRawOwned(prev => prev.filter(r => r.bottle_id !== bottleId));
      setRawEmpty(prev => [...prev, { ...row, addedAt: new Date().toISOString() }]);
    }
    setSelectedBottle(null);
    toast.success("Marked as Finished");
  }, [publicUserId, rawOwned]);

  const handleDeleteFromBar = useCallback(async (bottleId: string) => {
    const { error } = await supabase
      .from('user_bottles')
      .delete()
      .eq('user_id', publicUserId)
      .eq('bottle_id', bottleId);

    if (error) { toast.error("Failed to remove"); return; }

    setRawOwned(prev => prev.filter(r => r.bottle_id !== bottleId));
    setRawEmpty(prev => prev.filter(r => r.bottle_id !== bottleId));
    setSelectedBottle(null);
    toast.success("Removed from collection");
  }, [publicUserId]);

  // Filter dropdown handlers
  const filterActive = !!(filter.field && filter.value);

  const handleFilterButtonClick = () => {
    setFilter(f => ({
      ...f,
      step: f.step === 'closed' ? 'field' : 'closed',
    }));
  };

  const handleFilterFieldSelect = (field: FilterField) => {
    setFilter({ step: 'value', field, value: null });
  };

  const handleFilterValueSelect = (value: string) => {
    setFilter(f => ({ ...f, step: 'closed', value }));
  };

  const handleClearFilter = () => {
    setFilter({ step: 'closed', field: null, value: null });
  };

  // Sort handlers
  const handleSortSelect = (option: SortOption) => {
    if (option === 'yours') {
      toast("Taste some bottles to unlock your personal rankings");
      setShowSortMenu(false);
      return;
    }
    setSortBy(option);
    setShowSortMenu(false);
  };

  const filterValueOptions = filter.field === 'category' ? CATEGORY_VALUES : VERIFIED_VALUES;
  const sortActive = sortBy !== null && sortBy !== 'yours';

  return (
    <>
      {/* Row 1: Search bar (h-14) */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-ivory border-b border-charcoal z-20 p-2">
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal w-4 h-4" />
          <Input
            type="text"
            placeholder="Search your collection..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-full pl-10 h-10 text-base border-charcoal focus:border-charcoal bg-ivory text-charcoal placeholder:text-charcoal placeholder:opacity-60"
          />
        </div>
      </header>

      {/* Row 2: Filter By + Sort By (h-9) — z-30 so dropdowns clear the z-20 tabs row */}
      <div className="fixed top-14 left-0 right-0 h-9 bg-ivory border-b border-charcoal z-30 flex items-center justify-between px-4">

        {/* Filter By */}
        <div className="relative">
          <button
            onClick={handleFilterButtonClick}
            className="flex items-center gap-1 text-sm rounded-full px-3 py-0.5 border border-charcoal transition-colors"
            style={filterActive ? { backgroundColor: '#2F2F2F', color: '#FFFFFF', borderColor: '#2F2F2F' } : { color: '#2F2F2F' }}
          >
            {filterActive ? filter.value : 'Filter by'}
            {filterActive
              ? <X size={11} onClick={(e) => { e.stopPropagation(); handleClearFilter(); }} />
              : <ChevronDown size={13} />
            }
          </button>

          {filter.step !== 'closed' && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFilter(f => ({ ...f, step: 'closed' }))} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] py-1">
                {filter.step === 'field' && (
                  <>
                    {filterActive && (
                      <button
                        onClick={handleClearFilter}
                        className="w-full flex items-center px-4 py-2 text-sm text-left text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                      >
                        Clear filter
                      </button>
                    )}
                    {(['category', 'verified'] as FilterField[]).map(f => (
                      <button
                        key={f}
                        onClick={() => handleFilterFieldSelect(f)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-50"
                      >
                        <span>{f === 'category' ? 'Category' : 'Verified Status'}</span>
                        <ChevronDown size={13} className="rotate-[-90deg] text-gray-400" />
                      </button>
                    ))}
                  </>
                )}
                {filter.step === 'value' && (
                  <>
                    <button
                      onClick={() => setFilter(f => ({ ...f, step: 'field' }))}
                      className="w-full flex items-center px-4 py-2 text-sm text-left text-gray-400 hover:bg-gray-50 border-b border-gray-100 gap-1"
                    >
                      <ChevronDown size={13} className="rotate-90" />
                      {filter.field === 'category' ? 'Category' : 'Verified Status'}
                    </button>
                    {filterValueOptions.map(val => (
                      <button
                        key={val}
                        onClick={() => handleFilterValueSelect(val)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-50"
                      >
                        <span>{val}</span>
                        {filter.value === val && <Check size={13} className="text-charcoal" />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Sort By */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(v => !v)}
            className="flex items-center gap-1 text-sm rounded-full px-3 py-0.5 border border-charcoal transition-colors"
            style={sortActive ? { backgroundColor: '#2F2F2F', color: '#FFFFFF', borderColor: '#2F2F2F' } : { color: '#2F2F2F' }}
          >
            {sortBy && sortBy !== 'yours' ? SORT_LABELS[sortBy] : 'Sort by'}
            <ChevronDown size={13} />
          </button>

          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[140px] py-1">
                {sortBy !== null && (
                  <button
                    onClick={() => { setSortBy(null); setShowSortMenu(false); }}
                    className="w-full flex items-center px-4 py-2 text-sm text-left text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                  >
                    Clear sort
                  </button>
                )}
                {(['global', 'yours', 'az', 'za'] as SortOption[]).map(option => (
                  <button
                    key={option}
                    onClick={() => handleSortSelect(option)}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    <span>{SORT_LABELS[option!]}</span>
                    {sortBy === option && <Check size={13} className="text-charcoal" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 3: Tabs (h-10) */}
      <div className="fixed top-[92px] left-0 right-0 h-10 bg-ivory border-b border-charcoal z-20 flex">
        {(['owned', 'empty', 'tasted'] as TabOption[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
            className={`flex-1 text-xs px-1 py-2 border-b-2 transition-colors truncate
              ${activeTab === tab ? 'border-charcoal font-semibold text-charcoal' : 'border-transparent text-gray-400'}`}
          >
            {tab === 'owned'
              ? `In My Bar (${tabCounts.owned})`
              : tab === 'empty'
              ? `Empty Bottles (${tabCounts.empty})`
              : 'Tasted (0)'}
          </button>
        ))}
      </div>

      {/* Scrollable content — AppShell already applies marginTop: 132px */}
      <div>
        {activeTab === 'tasted' ? (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <div className="text-5xl mb-4">🥃</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No tastings yet</h3>
            <p className="text-gray-500 text-sm">Complete blind tastings to see your results here</p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <div className="text-5xl mb-4">🥃</div>
            {activeTab === 'owned' ? (
              <>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {searchQuery || filterActive ? 'No bottles match' : 'Your bar is empty'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {searchQuery || filterActive ? 'Try adjusting your search or filters' : 'Head to Search to find your first bottle'}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {searchQuery || filterActive ? 'No bottles match' : 'No empty bottles yet'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {searchQuery || filterActive ? 'Try adjusting your search or filters' : 'Bottles you finish will appear here'}
                </p>
              </>
            )}
          </div>
        ) : (
          <div>
            {filteredCards.map(card => (
              <div key={card.id} onClick={() => handleCardClick(card.id)} className="cursor-pointer">
                <BottleCardMedium bottle={card} />
              </div>
            ))}
          </div>
        )}
      </div>

      <Toaster position="top-center" style={{ top: '132px' }} />

      {selectedBottle && (
        <BottleDetailView
          bottle={selectedBottle}
          onClose={() => setSelectedBottle(null)}
          inCollection={true}
          currentlyOwned={activeTab === 'owned'}
          publicUserId={publicUserId}
          onAddToBar={handleAddToBar}
          onToggleOwnership={handleToggleOwnership}
          onDeleteFromBar={handleDeleteFromBar}
          onEditSaved={(updated) => {
            // Variant edits only update the variants array on the open detail view
            // Canonical fields (proof, age, volume, images) live on bottles and aren't user-editable
            setSelectedBottle(prev => prev ? { ...prev, variants: updated.variants ?? prev.variants } : prev);
          }}
        />
      )}
    </>
  );
}
