"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Plus, ChevronDown, Check, X, ScanLine } from "lucide-react";
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
import { isVariantVisibleToViewer } from "@/lib/variants";
import BarcodeScannerSheet from "@/components/BarcodeScannerSheet";
import { lookupBottleByBarcode } from "@/lib/barcode";
import { addOrRestockUserBottle, formatLastActivity, removeUserBottle, type UserBottleRow } from "@/lib/userBottles";
import { logActivity } from "@/lib/activities";
import { logEvent, logClick } from "@/lib/events";

const DEFAULT_PAGE_SIZE = 30;
const LOAD_MORE_SIZE = 15;

type ViewMode = 'bottles' | 'variants';

const BOTTLE_SELECT =
  "bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, bottle_elo_global, bottle_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_volume, attr_nose, attr_palate, attr_finish, attr_extras, attr_variant_ids, attr_batch, attr_release_year, attr_store_pick_name, attr_variant_created_by, default_variant_elo, default_variant_id, variant_count";
const VARIANT_SELECT =
  "variant_id, bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, variant_is_default, variant_elo_global, variant_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_batch, attr_release_year, attr_store_pick_name, attr_nose, attr_palate, attr_finish, attr_notes";

interface SearchClientProps {
  bottlesElo: number[];       // default-variant Elo distribution (Bottles mode star scaling)
  variantsElo: number[];      // per-variant Elo distribution (All Variants mode star scaling)
  totalBottleCount: number;
  totalVariantCount: number;
}

export default function SearchClient({ bottlesElo, variantsElo, totalBottleCount, totalVariantCount }: SearchClientProps) {
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>('bottles');
  const [bottles, setBottles] = useState<any[]>([]);         // search results (active mode)
  const [defaultBottles, setDefaultBottles] = useState<any[]>([]); // browse results (active mode)
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [selectedBottle, setSelectedBottle] = useState<BottleDetails | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>(undefined);

  // Infinite scroll refs — sync guards (state updates are too slow)
  const isLoadingMoreRef = useRef(false);
  const offsetRef = useRef(0); // tracks current loaded count

  // user_bottles map: bottle_id → array of ownership rows (multiple variants per bottle supported)
  const [userBottlesMap, setUserBottlesMap] = useState<Record<string, UserBottleRow[]>>({});
  const [publicUserId, setPublicUserId] = useState<string | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);

  // 7.9: store picks are private to their creator. Scope an all_variant_details query to
  // global variants + the viewer's own store picks. Match auth id OR public id — created_by is
  // stored inconsistently across rows. (Column names are the *_details view's.)
  const myIds = useMemo(() => [authId, publicUserId].filter(Boolean) as string[], [authId, publicUserId]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeVariantQuery = (q: any) =>
    myIds.length ? q.or(`attr_store_pick_name.is.null,variant_created_by.in.(${myIds.join(",")})`) : q.is("attr_store_pick_name", null);

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

  // Elo range for star scaling — depends on the active mode's distribution (server fetched DESC).
  const { minElo, maxElo } = useMemo(() => {
    const valid = viewMode === 'bottles' ? bottlesElo : variantsElo;
    return {
      maxElo: valid[0] ?? 1500,
      minElo: valid[valid.length - 1] ?? 1500,
    };
  }, [viewMode, bottlesElo, variantsElo]);

  const calcStars = (elo: number | null | undefined): number | null => {
    if (elo == null || maxElo === minElo) return null;
    return Math.min(5, Math.max(0, ((elo - minElo) / (maxElo - minElo)) * 5));
  };

  // Per-variant subtitle tag for the All Variants view.
  const variantTag = (result: any): string => {
    if (result.variant_is_default) return 'Default';
    const parts = [
      result.attr_store_pick_name,
      result.attr_release_year != null ? String(result.attr_release_year) : null,
      result.attr_batch ? `Batch ${result.attr_batch}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Variant';
  };

  // Bottles view: one card per SKU, scored from the default variant's Elo.
  const mapBottleResult = (result: any): Bottle => {
    const variantIds: string[] = result.attr_variant_ids || [];
    const batches: string[] = result.attr_batch || [];
    const releaseYears: string[] = result.attr_release_year || [];
    const storePickNames: string[] = result.attr_store_pick_name || [];
    const createdBys: string[] = result.attr_variant_created_by || [];
    const elo = result.default_variant_elo ?? result.bottle_elo_global;

    // 7.9: "N versions" badge counts global variants + only the viewer's own store picks
    // (created_by may be an auth id or a public id — match either).
    const visibleVariantCount = variantIds.length
      ? variantIds.filter((_v, i) => !storePickNames[i] || createdBys[i] === authId || createdBys[i] === publicUserId).length
      : (result.variant_count ?? 0);

    return {
      id: result.bottle_id,
      bottleId: result.bottle_id,
      name: result.bottle_name,
      distillery: result.bottle_distillery,
      category: result.bottle_category,
      image_url: result.attr_frontimage_url,
      elo_global: elo,
      provisional: !result.bottle_verified,
      stars: calcStars(elo),
      variantCount: visibleVariantCount,
      style: result.bottle_style,
      age: result.attr_age,
      proof: result.attr_proof,
      volume: result.attr_volume,
      verified: result.bottle_verified,
      barcode: result.bottle_barcode,
      frontImageUrl: result.attr_frontimage_url,
      backImageUrl: result.attr_backimage_url,
      variants: variantIds
        .map((vid, i) => ({
          variantId: vid,
          releaseYear: releaseYears[i],
          batch: batches[i],
          storePickName: storePickNames[i],
        }))
        // B-10: hide other users' private store picks in the seed (globals + own picks only).
        .filter((v, i) => (v.releaseYear || v.batch || v.storePickName)
          && isVariantVisibleToViewer(v.storePickName, createdBys[i], [authId, publicUserId])),
      nose: result.attr_nose,
      palate: result.attr_palate,
      finish: result.attr_finish,
      extras: result.attr_extras,
    } as any;
  };

  // All Variants view: one card per variant, scored from the variant's own Elo.
  // id = variant_id (unique card key); bottleId = SKU id (detail + collection lookup).
  const mapVariantResult = (result: any): Bottle => {
    const elo = result.variant_elo_global;
    return {
      id: result.variant_id,
      bottleId: result.bottle_id,
      variantId: result.variant_id,
      name: result.bottle_name,
      distillery: result.bottle_distillery,
      category: result.bottle_category,
      image_url: result.attr_frontimage_url,
      elo_global: elo,
      provisional: !result.variant_verified,
      stars: calcStars(elo),
      variantLabel: variantTag(result),
      style: result.bottle_style,
      age: result.attr_age,
      proof: result.attr_proof,
      verified: result.variant_verified,
      barcode: result.bottle_barcode,
      frontImageUrl: result.attr_frontimage_url,
      backImageUrl: result.attr_backimage_url,
      nose: result.attr_nose,
      palate: result.attr_palate,
      finish: result.attr_finish,
    } as any;
  };

  // Fetch the current user's collection on mount
  useEffect(() => {
    async function fetchUserBottles() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      setAuthId(session.user.id);

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
        .select('bottle_id, currently_owned, variant_id, times_had, created_at, updated_at')
        .eq('user_id', publicUser.id);

      if (error) {
        console.error('Failed to fetch user collection:', error.message);
        return;
      }

      const map: Record<string, UserBottleRow[]> = {};
      (data || []).forEach(row => {
        if (!map[row.bottle_id]) map[row.bottle_id] = [];
        map[row.bottle_id].push({
          currently_owned: row.currently_owned,
          variant_id: row.variant_id ?? null,
          times_had: row.times_had ?? 1,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      });
      setUserBottlesMap(map);
    }

    fetchUserBottles();
  }, []);

  // Load browse results for the active mode — reset=true for initial load, false for load-more
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

      const isBottles = viewMode === 'bottles';
      // Cast to any: a union table name overflows Supabase's typed query builder.
      let q = (supabase.from(isBottles ? "all_bottle_details" : "all_variant_details") as any)
        .select(isBottles ? BOTTLE_SELECT : VARIANT_SELECT);
      if (!isBottles) q = scopeVariantQuery(q);
      const { data, error } = await q
        .order(isBottles ? "default_variant_elo" : "variant_elo_global", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (error) { console.error("Browse load error:", error.message); return; }

      const mapFn = isBottles ? mapBottleResult : mapVariantResult;
      const mapped = (data || []).map(mapFn);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, minElo, maxElo, authId, publicUserId]);

  // Initial browse load (re-runs when the mode changes)
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

    let annotated = base.map(bottle => {
      const skuId = bottle.bottleId ?? bottle.id; // collection is tracked at the SKU level
      return {
        ...bottle,
        // "In collection" = an OWNERSHIP row exists (owned now, or finished/was-owned).
        // Tasting-only rows (times_had = 0) do not count as being in the collection.
        inCollection: userBottlesMap[skuId]?.some(r => r.currently_owned || (r.times_had ?? 0) >= 1) ?? false,
        currentlyOwned: userBottlesMap[skuId]?.some(r => r.currently_owned) ?? false,
      };
    });

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
      toast("My Ranks sorting is coming soon");
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

  const handleModeChange = (mode: ViewMode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
  };

  const handleBottleClick = (bottle: any) => {
    const skuId = bottle.bottleId ?? bottle.id;
    // B-12: only an ownership row (owned, or previously owned via times_had >= 1) drives
    // "my last activity" — a tasting-only row (times_had = 0, never owned) must not
    // render as "Finished". Previously took an unordered [0], which could be that row.
    const skuRows = userBottlesMap[skuId];
    const row = skuRows?.find(r => r.currently_owned)
      ?? skuRows?.find(r => (r.times_had ?? 0) >= 1);
    logClick("bottle_open", { userId: publicUserId, surface: "/search", targetId: skuId, metadata: { mode: viewMode } });
    setSelectedBottle({
      ...bottle,
      id: skuId, // detail view fetches variants + collection status by SKU id
      timesHad: row?.times_had,
      lastActivity: formatLastActivity(row),
    });
  };

  // Open a bottle straight from its SKU id (used by the barcode scanner).
  const openBottleById = async (bottleId: string) => {
    const { data, error } = await (supabase.from("all_bottle_details") as any)
      .select(BOTTLE_SELECT)
      .eq("bottle_id", bottleId)
      .maybeSingle();
    if (error || !data) { toast.error("Couldn't open that bottle"); return; }
    handleBottleClick(mapBottleResult(data));
  };

  // Barcode scan result: open the matching bottle, or jump to Add Bottle prefilled.
  const handleScan = async (code: string) => {
    setShowScanner(false);
    const match = await lookupBottleByBarcode(code);
    logClick("barcode_scan", {
      userId: publicUserId,
      surface: "/search",
      targetId: match?.id,
      metadata: { matched: !!match },
    });
    if (match) {
      toast.success(`Found: ${match.name}`);
      await openBottleById(match.id);
    } else {
      toast.message("No match — add this bottle");
      setScannedBarcode(code);
      setShowAddSheet(true);
    }
  };

  const searchBottles = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setBottles([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const isBottles = viewMode === 'bottles';
      // B-13: quote + escape the value so commas, parentheses, apostrophes, or quotes
      // in the term (e.g. "Maker's Mark", "batch 1, 2") don't break the PostgREST .or().
      const v = `"%${searchTerm.replace(/[\\"]/g, (c) => "\\" + c)}%"`;
      const fields = isBottles
        ? ["bottle_name", "bottle_distillery", "bottle_category", "bottle_style", "bottle_barcode", "attr_age", "attr_nose", "attr_palate", "attr_finish"]
        : ["bottle_name", "bottle_distillery", "bottle_category", "bottle_style", "bottle_barcode", "attr_age", "attr_batch", "attr_store_pick_name", "attr_nose", "attr_palate", "attr_finish"];
      const orClause = fields.map((f) => `${f}.ilike.${v}`).join(",");

      // Cast to any: a union table name + .or() overflows Supabase's typed query builder.
      let sq = (supabase.from(isBottles ? "all_bottle_details" : "all_variant_details") as any)
        .select(isBottles ? BOTTLE_SELECT : VARIANT_SELECT)
        .or(orClause);
      if (!isBottles) sq = scopeVariantQuery(sq);
      const { data: searchResults, error } = await sq
        .order(isBottles ? "default_variant_elo" : "variant_elo_global", { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) { setBottles([]); toast.error("Couldn't run that search — try different terms."); return; }

      const termLower = searchTerm.toLowerCase();
      const filteredResults = (searchResults || []).filter((row: any) => {
        if (row.bottle_name?.toLowerCase().includes(termLower)) return true;
        if (row.bottle_distillery?.toLowerCase().includes(termLower)) return true;
        if (row.bottle_category?.toLowerCase().includes(termLower)) return true;
        if (row.bottle_style?.toLowerCase().includes(termLower)) return true;
        if (row.bottle_barcode?.toLowerCase().includes(termLower)) return true;
        if (row.attr_age?.toLowerCase().includes(termLower)) return true;
        if (row.attr_nose?.toLowerCase().includes(termLower)) return true;
        if (row.attr_palate?.toLowerCase().includes(termLower)) return true;
        if (row.attr_finish?.toLowerCase().includes(termLower)) return true;
        if (isBottles) {
          // Bottle view: batch / store-pick arrive as arrays aggregated across variants.
          if ((row.attr_batch as string[])?.some((v: string) => v?.toLowerCase().includes(termLower))) return true;
          if ((row.attr_store_pick_name as string[])?.some((v: string) => v?.toLowerCase().includes(termLower))) return true;
        } else {
          // Variant view: batch / store-pick are scalar per variant.
          if (row.attr_batch?.toLowerCase?.().includes(termLower)) return true;
          if (row.attr_store_pick_name?.toLowerCase?.().includes(termLower)) return true;
        }
        return false;
      });

      const mapFn = isBottles ? mapBottleResult : mapVariantResult;
      setBottles(filteredResults.map(mapFn));

      logEvent({
        eventType: "search",
        userId: publicUserId,
        surface: "/search",
        metadata: { query: searchTerm, result_count: filteredResults.length, mode: viewMode },
      });
    } catch (error) {
      console.error("Unexpected error:", error);
      setBottles([]);
      toast.error("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, minElo, maxElo, authId, publicUserId]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchBottles(query);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [query, searchBottles]);

  const handleBottleAdded = useCallback((newBottle?: any) => {
    // ProvisionalSheet creates a SKU (bottle + default variant). Optimistically show it
    // in Bottles mode; in Variants mode just re-run the search to pick it up cleanly.
    if (newBottle && viewMode === 'bottles') {
      newBottle.stars = calcStars(newBottle.elo_global ?? 1500);
      newBottle.bottleId = newBottle.bottleId ?? newBottle.id;
      if (query.trim()) {
        setBottles((prev) => [newBottle, ...prev]);
      } else {
        setDefaultBottles((prev) => [newBottle, ...prev]);
      }
    }
    if (query.trim()) {
      searchBottles(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchBottles, viewMode]);

  const handleAddToBar = useCallback(async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId) { toast.error("Not logged in"); return; }

    const ownedRow = userBottlesMap[bottleId]?.find(r => r.currently_owned || (r.times_had ?? 0) >= 1);
    const result = await addOrRestockUserBottle({
      userId: publicUserId,
      bottleId,
      variantId: variantId ?? ownedRow?.variant_id ?? null,
    });
    if ("error" in result) {
      toast.error("Failed to add to My Bar");
      return;
    }

    const now = new Date().toISOString();
    // Use the variant the DB actually wrote (B-35) — not a possibly-null local guess —
    // so the optimistic row matches the persisted row and doesn't leave a phantom.
    const resolvedVariant = result.variantId;
    setUserBottlesMap(prev => {
      const rows = prev[bottleId] ? [...prev[bottleId]] : [];
      const idx = rows.findIndex(r => r.variant_id === resolvedVariant);
      const nextRow: UserBottleRow = {
        currently_owned: true,
        variant_id: resolvedVariant,
        times_had: result.timesHad,
        created_at: idx >= 0 ? rows[idx].created_at ?? now : now,
        updated_at: now,
      };
      if (idx >= 0) rows[idx] = nextRow; else rows.push(nextRow);
      return { ...prev, [bottleId]: rows };
    });
    toast.success("Added to My Bar!");
  }, [publicUserId, userBottlesMap]);

  const handleToggleOwnership = useCallback(async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId) return;
    const rows = userBottlesMap[bottleId];
    if (!rows?.length) return;

    // Toggle the VISIBLE variant's row (B-15), falling back to the ownership row
    // (owned, else finished/was-owned), scoped to its variant so tasting-only rows
    // (times_had = 0) are never flipped.
    const primaryRow = (variantId ? rows.find(r => r.variant_id === variantId) : undefined)
      ?? rows.find(r => r.currently_owned)
      ?? rows.find(r => (r.times_had ?? 0) >= 1)
      ?? rows[0];
    const newOwned = !primaryRow.currently_owned;
    let updateQuery = supabase
      .from('user_bottles')
      .update({ currently_owned: newOwned, updated_at: new Date().toISOString() })
      .eq('user_id', publicUserId)
      .eq('bottle_id', bottleId);
    updateQuery = primaryRow.variant_id
      ? updateQuery.eq('variant_id', primaryRow.variant_id)
      : updateQuery.is('variant_id', null);
    const { error } = await updateQuery;

    if (error) { toast.error("Failed to update"); return; }

    await logActivity({
      userId: publicUserId,
      bottleId,
      action: newOwned ? "added_to_collection" : "finished",
    });

    setUserBottlesMap(prev => ({
      ...prev,
      [bottleId]: prev[bottleId].map(r =>
        r.variant_id === primaryRow.variant_id
          ? { ...r, currently_owned: newOwned, updated_at: new Date().toISOString() }
          : r
      ),
    }));
    toast.success(newOwned ? "Back in Your Bar!" : "Marked as Finished");
  }, [publicUserId, userBottlesMap]);

  const handleDeleteFromBar = useCallback(async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId) return;

    // Remove the VISIBLE variant's row (B-15), falling back to the ownership row.
    const ownedRow = (variantId ? userBottlesMap[bottleId]?.find(r => r.variant_id === variantId) : undefined)
      ?? userBottlesMap[bottleId]?.find(r => r.currently_owned || (r.times_had ?? 0) >= 1);
    const result = await removeUserBottle({ userId: publicUserId, bottleId, variantId: ownedRow?.variant_id ?? null });
    if (result.error) { toast.error("Failed to remove from collection"); return; }

    // Drop only the ownership row for that variant; keep any tasting-only rows.
    setUserBottlesMap(prev => {
      const remaining = (prev[bottleId] ?? []).filter(r => r.variant_id !== (ownedRow?.variant_id ?? null));
      const next = { ...prev };
      if (remaining.length) next[bottleId] = remaining;
      else delete next[bottleId];
      return next;
    });

    toast.success("Removed from collection");
  }, [publicUserId, userBottlesMap]);

  // DB-level count for filtered browse mode — needed because the list is paginated
  const [filteredBrowseCount, setFilteredBrowseCount] = useState<number | null>(null);

  useEffect(() => {
    // Only needed when browsing (no query) with a filter active
    if (query.trim() || !filterActive) {
      setFilteredBrowseCount(null);
      return;
    }

    async function fetchCount() {
      const isBottles = viewMode === 'bottles';
      let q: any = (supabase.from(isBottles ? 'all_bottle_details' : 'all_variant_details') as any)
        .select('*', { count: 'exact', head: true });
      if (!isBottles) q = scopeVariantQuery(q);

      if (filter.field === 'category') {
        q = q.eq('bottle_category', filter.value);
      } else if (filter.field === 'verified') {
        const col = isBottles ? 'bottle_verified' : 'variant_verified';
        q = q.eq(col, filter.value === 'Verified');
      }

      const { count } = await q;
      setFilteredBrowseCount(count ?? 0);
    }

    fetchCount();
  }, [filter, query, filterActive, viewMode, authId, publicUserId]);

  // Count shown in banner
  // - No query, no filter: total DB count for the mode (from server prop)
  // - No query, filter active: DB count for that filter (separate query)
  // - Query active: count of in-memory search results (bounded to 50)
  const totalCount = viewMode === 'bottles' ? totalBottleCount : totalVariantCount;
  const displayCount = query.trim()
    ? sortedBottles.length
    : filterActive && filteredBrowseCount !== null
    ? filteredBrowseCount
    : totalCount;

  return (
    <>
      {/* Fixed Header with Search Bar */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-ivory border-b border-charcoal z-20 p-2">
        <div className="relative max-w-md mx-auto" data-coach="search.input">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal w-4 h-4" />
          <Input
            type="text"
            placeholder="Search bottles, distilleries, categories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-full pl-10 pr-11 h-10 text-base border-charcoal focus:border-charcoal bg-ivory text-charcoal placeholder:text-charcoal placeholder:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            aria-label="Scan barcode"
            data-coach="search.scan"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-charcoal rounded-full hover:bg-charcoal/10"
          >
            <ScanLine className="w-5 h-5" />
          </button>
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
          {displayCount.toLocaleString()} {viewMode === 'bottles' ? 'Bottles' : 'Variants'}
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

      {/* Bottles | All Variants toggle — own row beneath the filter/sort bar */}
      <div className="fixed top-[92px] left-0 right-0 h-9 bg-ivory border-b border-charcoal z-20 flex items-center justify-center px-4">
        <div className="inline-flex border border-charcoal rounded-full overflow-hidden text-sm">
          <button
            onClick={() => handleModeChange('bottles')}
            className="px-4 py-0.5 transition-colors"
            style={viewMode === 'bottles' ? { backgroundColor: '#2F2F2F', color: '#FFFFFF' } : { color: '#2F2F2F' }}
          >
            Bottles
          </button>
          <button
            onClick={() => handleModeChange('variants')}
            className="px-4 py-0.5 border-l border-charcoal transition-colors"
            style={viewMode === 'variants' ? { backgroundColor: '#2F2F2F', color: '#FFFFFF' } : { color: '#2F2F2F' }}
          >
            All Variants
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="px-4 py-4" data-coach="search.list">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center p-3 border-b border-gray-300">
                <Skeleton className="w-8 h-16 rounded flex-shrink-0 bg-gray-300" />
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

      {/* Barcode scanner */}
      <BarcodeScannerSheet
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={handleScan}
      />

      {/* Provisional Add Sheet */}
      <ProvisionalSheet
        open={showAddSheet}
        onOpenChange={(o) => { setShowAddSheet(o); if (!o) setScannedBarcode(undefined); }}
        onBottleAdded={handleBottleAdded}
        initialBarcode={scannedBarcode}
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

      <Toaster position="top-center" style={{ top: '132px' }} />

      {selectedBottle && (
        <BottleDetailView
          bottle={selectedBottle}
          onClose={() => setSelectedBottle(null)}
          inCollection={userBottlesMap[selectedBottle.id]?.some(r => r.currently_owned || (r.times_had ?? 0) >= 1) ?? false}
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
