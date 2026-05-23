"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Plus, ChevronDown, Check, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";

import BottleCard, { type Bottle } from "@/components/BottleCard";
import ProvisionalSheet from "@/components/ProvisionalSheet";
import { type BottleDetails } from "@/lib/types";
import BottleDetailView from "@/components/BottleDetailView";

const DEFAULT_PAGE_SIZE = 30;
const LOAD_MORE_SIZE = 15;

interface SearchClientProps {
  allBottlesElo: Array<{ bottle_elo_global?: number }>;
  totalBottleCount: number;
}

export default function SearchClient({ allBottlesElo, totalBottleCount }: SearchClientProps) {
  const [query, setQuery] = useState("");
  const [bottles, setBottles] = useState<any[]>([]);         // search results
  const [defaultBottles, setDefaultBottles] = useState<any[]>([]); // browse results
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [selectedBottle, setSelectedBottle] = useState<BottleDetails | null>(null);

  // Infinite scroll refs — sync guards (state updates are too slow)
  const isLoadingMoreRef = useRef(false);
  const offsetRef = useRef(0); // tracks current loaded count

  // user_bottles map: bottle_id → array of ownership rows (multiple variants per bottle supported)
  const [userBottlesMap, setUserBottlesMap] = useState<Record<string, Array<{ currently_owned: boolean; variant_id: string | null }>>>({});
  const [publicUserId, setPublicUserId] = useState<string | null>(null);

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
    global: 'Global Ranks', az: 'A–Z', za: 'Z–A', yours: 'My Ranks',
  };

  const [sortBy, setSortBy] = useState<SortOption>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [filter, setFilter] = useState<FilterState>({ step: 'closed', field: null, value: null });

  // Derive Elo range from the full sorted list (server fetched DESC)
  const { minElo, maxElo } = useMemo(() => {
    const valid = allBottlesElo
      .map(b => b.bottle_elo_global)
      .filter((e): e is number => e != null);
    return {
      maxElo: valid[0] ?? 1500,
      minElo: valid[valid.length - 1] ?? 1500,
    };
  }, [allBottlesElo]);

  const calcStars = (elo: number | null | undefined): number | null => {
    if (elo == null || maxElo === minElo) return null;
    return Math.min(5, Math.max(0, ((elo - minElo) / (maxElo - minElo)) * 5));
  };

  const mapBottleResult = (result: any): Bottle => {
    const variantIds: string[] = result.attr_variant_ids || [];
    const batches: string[] = result.attr_batch || [];
    const releaseYears: string[] = result.attr_release_year || [];
    const storePickNames: string[] = result.attr_store_pick_name || [];

    return {
      id: result.bottle_id,
      name: result.bottle_name,
      distillery: result.bottle_distillery,
      category: result.bottle_category,
      image_url: result.attr_frontimage_url,
      elo_global: result.bottle_elo_global,
      provisional: !result.bottle_verified,
      stars: calcStars(result.bottle_elo_global),
      style: result.bottle_style,
      age: result.attr_age,
      proof: result.attr_proof,
      volume: result.attr_volume,
      verified: result.bottle_verified,
      barcode: result.bottle_barcode,
      lastActivity: "Never",
      frontImageUrl: result.attr_frontimage_url,
      backImageUrl: result.attr_backimage_url,
      variants: variantIds
        .map((vid, i) => ({
          variantId: vid,
          releaseYear: releaseYears[i],
          batch: batches[i],
          storePickName: storePickNames[i],
        }))
        .filter(v => v.releaseYear || v.batch || v.storePickName),
      nose: result.attr_nose,
      palate: result.attr_palate,
      finish: result.attr_finish,
      extras: result.attr_extras,
    } as any;
  };

  // Fetch the current user's collection on mount
  useEffect(() => {
    async function fetchUserBottles() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: publicUser, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', session.user.id)
        .single();

      if (userError || !publicUser) {
        console.error('Failed to resolve public user:', userError?.message);
        return;
      }
      setPublicUserId(publicUser.id);

      const { data, error } = await supabase
        .from('user_bottles')
        .select('bottle_id, currently_owned, variant_id')
        .eq('user_id', publicUser.id);

      if (error) {
        console.error('Failed to fetch user collection:', error.message);
        return;
      }

      const map: Record<string, Array<{ currently_owned: boolean; variant_id: string | null }>> = {};
      (data || []).forEach(row => {
        if (!map[row.bottle_id]) map[row.bottle_id] = [];
        map[row.bottle_id].push({ currently_owned: row.currently_owned, variant_id: row.variant_id ?? null });
      });
      setUserBottlesMap(map);
    }

    fetchUserBottles();
  }, []);

  // Load default bottles — reset=true for initial load, false for load-more
  const loadDefaultBottles = useCallback(async (reset: boolean) => {
    if (!reset && isLoadingMoreRef.current) return;
    if (!reset) isLoadingMoreRef.current = true;

    if (reset) {
      setIsLoading(true);
      offsetRef.current = 0;
    } else {
      setIsLoadingMore(true);
    }

    try {
      const offset = offsetRef.current;
      const limit = reset ? DEFAULT_PAGE_SIZE : LOAD_MORE_SIZE;

      const { data, error } = await supabase
        .from("all_bottle_details")
        .select("bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, bottle_elo_global, bottle_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_volume, attr_nose, attr_palate, attr_finish, attr_extras, attr_variant_ids, attr_batch, attr_release_year, attr_store_pick_name")
        .order("bottle_elo_global", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (error) { console.error("Browse load error:", error.message); return; }

      const mapped = (data || []).map(mapBottleResult);

      if (reset) {
        setDefaultBottles(mapped);
        offsetRef.current = mapped.length;
      } else {
        setDefaultBottles(prev => {
          // Dedup by id as a safety net
          const seen = new Set(prev.map((b: any) => b.id));
          const fresh = mapped.filter((b: any) => !seen.has(b.id));
          offsetRef.current = prev.length + fresh.length;
          return [...prev, ...fresh];
        });
      }

      setHasMore((data || []).length === limit);
    } finally {
      if (reset) setIsLoading(false);
      else { setIsLoadingMore(false); isLoadingMoreRef.current = false; }
    }
  }, [minElo, maxElo]);

  // Initial browse load
  useEffect(() => {
    loadDefaultBottles(true);
  }, [loadDefaultBottles]);

  // Infinite scroll — listen on the AppShell <main> scroll container.
  // IntersectionObserver won't work here because scroll happens inside overflow-y:auto <main>,
  // not the viewport, so the sentinel never intersects the viewport root.
  useEffect(() => {
    if (query.trim()) return;

    const scrollEl = document.querySelector('main');
    if (!scrollEl) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < 300 && hasMore) {
        loadDefaultBottles(false); // guard ref inside prevents concurrent calls
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [query, hasMore, loadDefaultBottles]);

  // Annotate + filter + sort
  const sortedBottles = useMemo(() => {
    const base = query.trim() ? bottles : defaultBottles;

    let annotated = base.map(bottle => ({
      ...bottle,
      inCollection: bottle.id in userBottlesMap,
      currentlyOwned: userBottlesMap[bottle.id]?.some(r => r.currently_owned) ?? false,
    }));

    // Apply filter
    if (filter.field && filter.value) {
      if (filter.field === 'category') {
        annotated = annotated.filter(b => b.category === filter.value);
      } else if (filter.field === 'verified') {
        const wantVerified = filter.value === 'Verified';
        annotated = annotated.filter(b => (b.provisional === false) === wantVerified);
      }
    }

    if (sortBy === 'az') return [...annotated].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'za') return [...annotated].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    return annotated; // global/null = server Elo order
  }, [bottles, defaultBottles, query, sortBy, filter, userBottlesMap]);

  const handleSortSelect = (option: SortOption) => {
    if (option === 'yours') {
      toast("Taste some bottles to unlock your personal rankings");
      setShowSortMenu(false);
      return;
    }
    setSortBy(option);
    setShowSortMenu(false);
  };

  const filterActive = !!(filter.field && filter.value);
  const filterValueOptions = filter.field === 'category' ? CATEGORY_VALUES : VERIFIED_VALUES;
  const sortActive = sortBy !== null && sortBy !== 'yours';

  const handleFilterButtonClick = () => {
    setFilter(f => ({ ...f, step: f.step === 'closed' ? 'field' : 'closed' }));
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

  const handleBottleClick = (bottle: any) => setSelectedBottle(bottle);

  const searchBottles = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setBottles([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data: searchResults, error } = await supabase
        .from("all_bottle_details")
        .select("bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, bottle_elo_global, bottle_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_volume, attr_nose, attr_palate, attr_finish, attr_extras, attr_variant_ids, attr_batch, attr_release_year, attr_store_pick_name")
        .or(`bottle_name.ilike.%${searchTerm}%,bottle_distillery.ilike.%${searchTerm}%,bottle_category.ilike.%${searchTerm}%,bottle_style.ilike.%${searchTerm}%,bottle_barcode.ilike.%${searchTerm}%,attr_age.ilike.%${searchTerm}%,attr_nose.ilike.%${searchTerm}%,attr_palate.ilike.%${searchTerm}%,attr_finish.ilike.%${searchTerm}%`)
        .order("bottle_elo_global", { ascending: false, nullsFirst: false })
        .limit(50);

      const filteredResults = (searchResults || []).filter((bottle) => {
        const termLower = searchTerm.toLowerCase();
        if (bottle.bottle_name?.toLowerCase().includes(termLower)) return true;
        if (bottle.bottle_distillery?.toLowerCase().includes(termLower)) return true;
        if (bottle.bottle_category?.toLowerCase().includes(termLower)) return true;
        if (bottle.bottle_style?.toLowerCase().includes(termLower)) return true;
        if (bottle.bottle_barcode?.toLowerCase().includes(termLower)) return true;
        if (bottle.attr_age?.toLowerCase().includes(termLower)) return true;
        if ((bottle.attr_batch as string[])?.some((v: string) => v?.toLowerCase().includes(termLower))) return true;
        if ((bottle.attr_store_pick_name as string[])?.some((v: string) => v?.toLowerCase().includes(termLower))) return true;
        if (bottle.attr_nose?.toLowerCase().includes(termLower)) return true;
        if (bottle.attr_palate?.toLowerCase().includes(termLower)) return true;
        if (bottle.attr_finish?.toLowerCase().includes(termLower)) return true;
        return false;
      });

      if (error) { setBottles([]); return; }

      setBottles((filteredResults || []).map(mapBottleResult));
    } catch (error) {
      console.error("Unexpected error:", error);
      setBottles([]);
      toast.error("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [allBottlesElo, minElo, maxElo]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchBottles(query);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [query, searchBottles]);

  const handleBottleAdded = useCallback((newBottle?: any) => {
    if (newBottle) {
      newBottle.stars = calcStars(newBottle.elo_global ?? 1500);
      if (query.trim()) {
        setBottles((prev) => [newBottle, ...prev]);
      } else {
        setDefaultBottles((prev) => [newBottle, ...prev]);
      }
    }
    if (query.trim()) {
      searchBottles(query);
    }
  }, [query, searchBottles]);

  const handleAddToBar = useCallback(async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId) { toast.error("Not logged in"); return; }

    const existing = userBottlesMap[bottleId];
    const now = new Date().toISOString();
    const vid = variantId ?? null;

    if (vid === null) {
      // Standard (no variant) — re-activate finished row if exists, otherwise insert
      const noVariantRow = existing?.find(r => r.variant_id === null);
      if (noVariantRow && !noVariantRow.currently_owned) {
        const { error } = await supabase
          .from('user_bottles')
          .update({ currently_owned: true, updated_at: now })
          .eq('user_id', publicUserId)
          .eq('bottle_id', bottleId)
          .is('variant_id', null);
        if (error) { toast.error("Failed to add to My Bar"); return; }
      } else if (!noVariantRow) {
        const { error } = await supabase
          .from('user_bottles')
          .insert({ user_id: publicUserId, bottle_id: bottleId, currently_owned: true, variant_id: null, created_at: now, updated_at: now });
        if (error) { toast.error("Failed to add to My Bar"); return; }
      }
    } else {
      // Variant row — always insert (partial index enforces uniqueness per variant)
      const { error } = await supabase
        .from('user_bottles')
        .insert({ user_id: publicUserId, bottle_id: bottleId, currently_owned: true, variant_id: vid, created_at: now, updated_at: now });
      if (error) { toast.error("Failed to add to My Bar"); return; }
    }

    setUserBottlesMap(prev => {
      const rows = prev[bottleId] ?? [];
      const updated = vid === null
        ? rows.some(r => r.variant_id === null)
          ? rows.map(r => r.variant_id === null ? { ...r, currently_owned: true } : r)
          : [...rows, { currently_owned: true, variant_id: null }]
        : [...rows, { currently_owned: true, variant_id: vid }];
      return { ...prev, [bottleId]: updated };
    });
    toast.success("Added to My Bar!");
  }, [publicUserId, userBottlesMap]);

  const handleToggleOwnership = useCallback(async (bottleId: string) => {
    if (!publicUserId) return;
    const rows = userBottlesMap[bottleId];
    if (!rows?.length) return;

    // Toggle the first (no-variant) row as the primary ownership indicator
    const primaryRow = rows.find(r => r.variant_id === null) ?? rows[0];
    const newOwned = !primaryRow.currently_owned;
    const { error } = await supabase
      .from('user_bottles')
      .update({ currently_owned: newOwned, updated_at: new Date().toISOString() })
      .eq('user_id', publicUserId)
      .eq('bottle_id', bottleId)
      .is('variant_id', primaryRow.variant_id);

    if (error) { toast.error("Failed to update"); return; }

    setUserBottlesMap(prev => ({
      ...prev,
      [bottleId]: prev[bottleId].map(r =>
        r.variant_id === primaryRow.variant_id ? { ...r, currently_owned: newOwned } : r
      ),
    }));
    toast.success(newOwned ? "Back in Your Bar!" : "Marked as Finished");
  }, [publicUserId, userBottlesMap]);

  const handleDeleteFromBar = useCallback(async (bottleId: string) => {
    if (!publicUserId) return;

    const { error } = await supabase
      .from('user_bottles')
      .delete()
      .eq('user_id', publicUserId)
      .eq('bottle_id', bottleId);

    if (error) { toast.error("Failed to remove from collection"); return; }

    setUserBottlesMap(prev => {
      const next = { ...prev };
      delete next[bottleId]; // removes all rows for this bottle
      return next;
    });

    toast.success("Removed from collection");
  }, [publicUserId]);

  // DB-level count for filtered browse mode — needed because defaultBottles is paginated
  const [filteredBrowseCount, setFilteredBrowseCount] = useState<number | null>(null);

  useEffect(() => {
    // Only needed when browsing (no query) with a filter active
    if (query.trim() || !filterActive) {
      setFilteredBrowseCount(null);
      return;
    }

    async function fetchCount() {
      let q = supabase
        .from('all_bottle_details')
        .select('*', { count: 'exact', head: true });

      if (filter.field === 'category') {
        q = (q as any).eq('bottle_category', filter.value);
      } else if (filter.field === 'verified') {
        q = (q as any).eq('bottle_verified', filter.value === 'Verified');
      }

      const { count } = await q;
      setFilteredBrowseCount(count ?? 0);
    }

    fetchCount();
  }, [filter, query, filterActive]);

  // Count shown in banner
  // - No query, no filter: total DB count (from server prop)
  // - No query, filter active: DB count for that filter (separate query)
  // - Query active: count of in-memory search results (bounded to 50)
  const displayCount = query.trim()
    ? sortedBottles.length
    : filterActive && filteredBrowseCount !== null
    ? filteredBrowseCount
    : totalBottleCount;

  return (
    <>
      {/* Fixed Header with Search Bar */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-ivory border-b border-charcoal z-20 p-2">
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal w-4 h-4" />
          <Input
            type="text"
            placeholder="Search bottles, distilleries, categories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-full pl-10 h-10 text-base border-charcoal focus:border-charcoal bg-ivory text-charcoal placeholder:text-charcoal placeholder:opacity-60"
          />
        </div>
      </header>

      {/* Results banner: Filter By | Count | Sort By — z-30 so dropdowns clear lower fixed rows */}
      <header className="fixed top-14 left-0 right-0 h-9 bg-ivory border-b border-charcoal z-30 flex items-center justify-between px-4 gap-2">

        {/* Filter By */}
        <div className="relative flex-shrink-0">
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

        {/* Bottle count — center */}
        <span className="flex-1 text-center text-sm text-charcoal font-medium tabular-nums">
          {displayCount.toLocaleString()} Bottles
        </span>

        {/* Sort By */}
        <div className="relative flex-shrink-0">
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
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[140px] py-1 overflow-hidden">
                {sortBy !== null && (
                  <button
                    onClick={() => { setSortBy(null); setShowSortMenu(false); }}
                    className="w-full flex items-center px-4 py-2 text-sm text-left text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                  >
                    Clear sort
                  </button>
                )}
                {(['global', 'yours', 'az', 'za'] as SortOption[]).map((option) => (
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
      </header>

      {/* Scrollable Content */}
      <div className="px-4 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center p-3 border-b border-gray-300">
                <Skeleton className="w-12 h-12 rounded flex-shrink-0 bg-gray-300" />
                <div className="ml-3 flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4 bg-gray-300" />
                  <Skeleton className="h-3 w-1/2 bg-gray-300" />
                </div>
              </div>
            ))}
          </div>
        ) : query.trim() && bottles.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🥃</div>
            <h3 className="text-lg font-semibold mb-2 text-charcoal">
              Bottle not found? Add it!
            </h3>
          </div>
        ) : (
          <div>
            <div className="space-y-0">
              {sortedBottles.map((bottle) => (
                <div key={bottle.id || bottle.name} onClick={() => handleBottleClick(bottle)} className="cursor-pointer">
                  <BottleCard bottle={bottle} />
                </div>
              ))}
            </div>

            {/* Load-more indicator — only in browse mode */}
            {!query.trim() && isLoadingMore && (
              <div className="h-8 flex items-center justify-center">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Provisional Add Sheet */}
      <ProvisionalSheet
        open={showAddSheet}
        onOpenChange={setShowAddSheet}
        onBottleAdded={handleBottleAdded}
      />

      {/* FAB for Add Bottle */}
      {query.length > 0 && (
        <Button
          onClick={() => setShowAddSheet(true)}
          style={{ backgroundColor: '#2F2F2F', color: '#FFFFFF' }}
          className="!bg-charcoal !text-ivory !opacity-100 !hover:bg-gray-700 fixed bottom-20 left-1/2 -translate-x-1/2 rounded-full z-30 shadow-lg w-12 h-12 flex items-center justify-center"
          variant={null}
          aria-label="Add new bottle"
        >
          <Plus className="w-6 h-6" />
        </Button>
      )}

      <Toaster position="top-center" style={{ top: '96px' }} />

      {selectedBottle && (
        <BottleDetailView
          bottle={selectedBottle}
          onClose={() => setSelectedBottle(null)}
          inCollection={selectedBottle.id in userBottlesMap}
          currentlyOwned={userBottlesMap[selectedBottle.id]?.some(r => r.currently_owned) ?? false}
          publicUserId={publicUserId ?? undefined}
          onAddToBar={handleAddToBar}
          onToggleOwnership={handleToggleOwnership}
          onDeleteFromBar={handleDeleteFromBar}
        />
      )}
    </>
  );
}
