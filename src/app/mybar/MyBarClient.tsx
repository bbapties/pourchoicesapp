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
import { addOrRestockUserBottle, formatLastActivity, removeUserBottle } from "@/lib/userBottles";
import { logActivity } from "@/lib/activities";
import { isVariantVisibleToViewer } from "@/lib/variants";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface MyBarClientProps {
  ownedCollection: any[];
  emptyCollection: any[];
  tastedCollection: any[];
  allBottlesElo: number[];
  publicUserId: string;
}

function eloOf(d: { default_variant_elo?: number | null; bottle_elo_global?: number | null }): number | null {
  const n = d.default_variant_elo ?? d.bottle_elo_global;
  return n == null ? null : Number(n);
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


function variantSubtitle(d: any): string | undefined {
  if (d.attr_store_pick_name) return String(d.attr_store_pick_name);
  if (d.attr_batch) return `Batch ${d.attr_batch}`;
  if (d.attr_release_year) return String(d.attr_release_year);
  return d.bottle_style;
}

function mapToCardData(d: any, minElo: number, maxElo: number, currentlyOwned: boolean, tasted: boolean) {
  return {
    id: tasted ? (d.variant_id || d.bottle_id) : d.bottle_id,
    name: d.bottle_name,
    distillery: d.bottle_distillery,
    category: d.bottle_category,
    style: tasted ? variantSubtitle(d) : d.bottle_style,
    proof: d.attr_proof,
    image_url: d.attr_frontimage_url,
    stars: calcStarsFromElo(eloOf(d), minElo, maxElo),
    addedAt: d.addedAt,
    dateLabel: tasted ? "Tasted" : "Added",
    provisional: !d.bottle_verified,
    currentlyOwned,
    tasted,
  };
}

export default function MyBarClient({ ownedCollection: initialOwned, emptyCollection: initialEmpty, tastedCollection: initialTasted, allBottlesElo, publicUserId }: MyBarClientProps) {
  const { authId } = useCurrentUser(); // for B-10 store-pick visibility (match auth or public id)
  const { minElo, maxElo } = useMemo(() => {
    if (!allBottlesElo.length) return { minElo: 1500, maxElo: 1500 };
    return { maxElo: Math.max(...allBottlesElo), minElo: Math.min(...allBottlesElo) };
  }, [allBottlesElo]);

  const [rawOwned, setRawOwned] = useState<any[]>(initialOwned);
  const [rawEmpty, setRawEmpty] = useState<any[]>(initialEmpty);
  const [rawTasted, setRawTasted] = useState<any[]>(initialTasted);

  const [activeTab, setActiveTab] = useState<TabOption>('owned');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [filter, setFilter] = useState<FilterState>({ step: 'closed', field: null, value: null });
  const [selectedBottle, setSelectedBottle] = useState<BottleDetails | null>(null);

  const activeRaw = activeTab === 'owned' ? rawOwned : activeTab === 'empty' ? rawEmpty : rawTasted;

  // Shared filter logic — used for both active tab cards and per-tab counts
  const applySearchAndFilter = useCallback((raw: any[], isOwned: boolean, tasted: boolean) => {
    let cards = raw.map(d => mapToCardData(d, minElo, maxElo, isOwned, tasted));
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
    owned: applySearchAndFilter(rawOwned, true, false).length,
    empty: applySearchAndFilter(rawEmpty, false, false).length,
    tasted: applySearchAndFilter(rawTasted, false, true).length,
  }), [rawOwned, rawEmpty, rawTasted, applySearchAndFilter]);

  const filteredCards = useMemo(() => {
    const isOwned = activeTab === 'owned';
    const cards = applySearchAndFilter(activeRaw, isOwned, activeTab === 'tasted');
    if (sortBy === 'az') return [...cards].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'za') return [...cards].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    return cards; // global/null = server Elo order
  }, [activeRaw, activeTab, applySearchAndFilter, sortBy]);

  const handleCardClick = (cardId: string) => {
    const raw = activeTab === 'tasted'
      ? activeRaw.find(r => r.variant_id === cardId || r.bottle_id === cardId)
      : activeRaw.find(r => r.bottle_id === cardId);
    if (!raw) return;
    const variantIds: string[] = raw.attr_variant_ids || (raw.variant_id ? [raw.variant_id] : []);
    const batches: string[] = Array.isArray(raw.attr_batch) ? raw.attr_batch : (raw.attr_batch ? [raw.attr_batch] : []);
    const releaseYears: string[] = Array.isArray(raw.attr_release_year) ? raw.attr_release_year : (raw.attr_release_year ? [String(raw.attr_release_year)] : []);
    const storePickNames: string[] = Array.isArray(raw.attr_store_pick_name) ? raw.attr_store_pick_name : (raw.attr_store_pick_name ? [raw.attr_store_pick_name] : []);
    const createdBys: string[] = Array.isArray(raw.attr_variant_created_by) ? raw.attr_variant_created_by : (raw.attr_variant_created_by ? [raw.attr_variant_created_by] : []);
    setSelectedBottle({
      id: raw.bottle_id,
      name: raw.bottle_name,
      distillery: raw.bottle_distillery,
      category: raw.bottle_category,
      style: raw.bottle_style,
      proof: raw.attr_proof,
      volume: raw.attr_volume,
      age: raw.attr_age,
      elo_global: eloOf(raw) ?? undefined,
      verified: raw.bottle_verified,
      lastActivity: activeTab === "tasted"
        ? (raw.addedAt ? `Tasted · ${new Date(raw.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : undefined)
        : formatLastActivity({
            currently_owned: activeTab === "owned",
            variant_id: raw.variant_id ?? null,
            times_had: raw.times_had ?? 1,
            created_at: raw.created_at,
            updated_at: raw.updated_at,
          }),
      timesHad: raw.times_had,
      frontImageUrl: raw.attr_frontimage_url,
      backImageUrl: raw.attr_backimage_url,
      variants: variantIds
        .map((vid, i) => ({
          variantId: vid,
          releaseYear: releaseYears[i],
          batch: batches[i],
          storePickName: storePickNames[i],
          isDefault: !!raw.variant_is_default,
        }))
        // B-10: hide other users' private store picks in the seed (globals + own picks only).
        .filter((v, i) => (v.releaseYear || v.batch || v.storePickName || (activeTab === 'tasted' && v.variantId))
          && isVariantVisibleToViewer(v.storePickName, createdBys[i], [authId, publicUserId])),
      nose: raw.attr_nose,
      palate: raw.attr_palate,
      finish: raw.attr_finish,
      extras: raw.attr_extras,
    });
  };

  const handleAddToBar = useCallback(async (bottleId: string, variantId?: string | null) => {
    const now = new Date().toISOString();
    const existingRow = rawEmpty.find(r => r.bottle_id === bottleId) || rawOwned.find(r => r.bottle_id === bottleId);
    const resolvedVariant = variantId ?? existingRow?.variant_id ?? null;
    const result = await addOrRestockUserBottle({
      userId: publicUserId,
      bottleId,
      variantId: resolvedVariant,
    });
    if ("error" in result) {
      toast.error("Failed to add to My Bar");
      return;
    }

    const row = existingRow;
    if (row) {
      const next = {
        ...row,
        variant_id: resolvedVariant ?? row.variant_id ?? null,
        addedAt: now,
        times_had: result.timesHad,
        created_at: row.created_at || now,
        updated_at: now,
      };
      setRawOwned(prev => prev.some(r => r.bottle_id === bottleId)
        ? prev.map(r => r.bottle_id === bottleId ? next : r)
        : [...prev, next]);
      setRawEmpty(prev => prev.filter(r => r.bottle_id !== bottleId));
    } else {
      const tastedRow = rawTasted.find(r => r.bottle_id === bottleId && (resolvedVariant == null || r.variant_id === resolvedVariant))
        || rawTasted.find(r => r.bottle_id === bottleId);
      if (tastedRow) {
        setRawOwned(prev => [...prev, {
          ...tastedRow,
          variant_id: resolvedVariant ?? tastedRow.variant_id,
          times_had: result.timesHad,
          addedAt: now,
          updated_at: now,
          tasted: false,
        }]);
      }
    }
    setRawTasted(prev => prev.filter(r => {
      if (resolvedVariant) return r.variant_id !== resolvedVariant;
      return r.bottle_id !== bottleId;
    }));
    toast.success("Added to My Bar!");
  }, [publicUserId, rawEmpty, rawOwned, rawTasted]);

  const handleToggleOwnership = useCallback(async (bottleId: string) => {
    // Mark as Empty: flip the ownership row for THIS variant (B-05). Scoping to
    // currently_owned = true leaves tasting-only rows (times_had = 0) untouched.
    const row = rawOwned.find(r => r.bottle_id === bottleId);
    let q = supabase
      .from('user_bottles')
      .update({ currently_owned: false, updated_at: new Date().toISOString() })
      .eq('user_id', publicUserId)
      .eq('bottle_id', bottleId)
      .eq('currently_owned', true);
    if (row?.variant_id) q = q.eq('variant_id', row.variant_id);
    const { error } = await q;

    if (error) { toast.error("Failed to update"); return; }

    await logActivity({
      userId: publicUserId,
      bottleId,
      action: "finished",
      variantId: row?.variant_id ?? null,
    });

    if (row) {
      setRawOwned(prev => prev.filter(r => r.bottle_id !== bottleId));
      setRawEmpty(prev => [...prev, { ...row, addedAt: new Date().toISOString(), updated_at: new Date().toISOString() }]);
    }
    setSelectedBottle(null);
    toast.success("Marked as Finished");
  }, [publicUserId, rawOwned]);

  const handleDeleteFromBar = useCallback(async (bottleId: string) => {
    // Scope removal to the owned variant so tasting-only rows keep their Elo.
    const ownedRow = rawOwned.find(r => r.bottle_id === bottleId) || rawEmpty.find(r => r.bottle_id === bottleId);
    const result = await removeUserBottle({ userId: publicUserId, bottleId, variantId: ownedRow?.variant_id ?? null });
    if (result.error) { toast.error("Failed to remove"); return; }

    setRawOwned(prev => prev.filter(r => r.bottle_id !== bottleId));
    setRawEmpty(prev => prev.filter(r => r.bottle_id !== bottleId));
    setSelectedBottle(null);
    toast.success("Removed from collection");
  }, [publicUserId, rawOwned, rawEmpty]);

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
              : `Tasted (${tabCounts.tasted})`}
          </button>
        ))}
      </div>

      {/* Scrollable content — AppShell already applies marginTop: 132px */}
      <div data-coach="mybar.list">
        {filteredCards.length === 0 ? (
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
            ) : activeTab === 'empty' ? (
              <>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {searchQuery || filterActive ? 'No bottles match' : 'No empty bottles yet'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {searchQuery || filterActive ? 'Try adjusting your search or filters' : 'Bottles you finish will appear here'}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {searchQuery || filterActive ? 'No bottles match' : 'No tastings yet'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {searchQuery || filterActive ? 'Try adjusting your search or filters' : 'Complete a blind tasting to see bottles here. Ones you own stay in My Bar.'}
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
          inCollection={activeTab !== 'tasted'}
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
