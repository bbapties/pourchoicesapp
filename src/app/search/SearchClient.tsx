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
import { addOrRestockUserBottle, formatLastActivity, removeUserBottle, markVariantEmpty, type UserBottleRow } from "@/lib/userBottles";
import { logEvent, logClick } from "@/lib/events";

const DEFAULT_PAGE_SIZE = 30;
const LOAD_MORE_SIZE = 15;

type ViewMode = 'bottles' | 'variants';

// Matches no bottle. Used to express "filter to nothing" when the viewer has tried nothing yet,
// because PostgREST rejects an empty `in.()` list outright.
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

// A user_bottles row starts at this Elo. A row still sitting exactly on it has never been ranked,
// so it is not evidence that the viewer has personal rankings.
const DEFAULT_ELO = 1500;

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
  // S3: on a barcode hit, open pinned to the version the viewer already owns (else default-first).
  const [scanPinVariantId, setScanPinVariantId] = useState<string | null>(null);
  // The code that opened the currently shown bottle, if it was opened by a scan.
  // Enables the "not this bottle?" report, which only means anything for a scan.
  const [scanOpenedWith, setScanOpenedWith] = useState<string | null>(null);
  // A.1 two-zone: a barcode hit where the viewer owns NON-default versions shows a chooser
  // (open the standard bottle, or jump straight to an owned version).
  const [scanChoice, setScanChoice] = useState<{ bottleId: string; name: string; barcode: string; versions: { variantId: string; label: string }[] } | null>(null);

  // Infinite scroll refs — sync guards (state updates are too slow)
  const isLoadingMoreRef = useRef(false);
  const offsetRef = useRef(0); // tracks current loaded count

  // user_bottles map: bottle_id → array of ownership rows (multiple variants per bottle supported)
  const [userBottlesMap, setUserBottlesMap] = useState<Record<string, UserBottleRow[]>>({});
  // B-31 earmark: bottle_ids the viewer has drunk or blind-tasted (ownership handled separately).
  const [hadItSet, setHadItSet] = useState<Set<string>>(new Set());
  // S4 My Ranks: skuId -> the viewer's own personal Elo (max across their rows for that SKU).
  // Preferred over stars, because blind tastings move Elo and never write a star.
  const [personalEloMap, setPersonalEloMap] = useState<Record<string, number>>({});
  // S4 My Ranks: skuId -> the viewer's own star rating (max across their rows for that SKU).
  const [personalStarMap, setPersonalStarMap] = useState<Record<string, number>>({});
  const [publicUserId, setPublicUserId] = useState<string | null>(null);

  // 7.9: store picks are private to their creator. Scope an all_variant_details query to
  // global variants + the viewer's own store picks. B-74: `created_by` is a public.users.id,
  // enforced by a foreign key, so this matches one id. (Column names are the *_details view's.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeVariantQuery = (q: any) =>
    publicUserId ? q.or(`attr_store_pick_name.is.null,variant_created_by.eq.${publicUserId}`) : q.is("attr_store_pick_name", null);

  type SortOption = 'global' | 'az' | 'za' | 'yours' | null;
  type FilterField = 'category' | 'verified' | 'hadit';
  interface FilterState {
    step: 'closed' | 'field' | 'value';
    field: FilterField | null;
    value: string | null;
  }

  const CATEGORY_VALUES = ['Whiskey', 'Gin', 'Rum', 'Vodka', 'Tequila', 'Other'];
  const VERIFIED_VALUES = ['Verified', 'Community Added'];
  const HADIT_VALUES = ['Yes', 'No'];
  const FILTER_FIELD_LABELS: Record<FilterField, string> = {
    category: 'Category',
    verified: 'Verified Status',
    hadit: 'Had it before',
  };
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

    // 7.9: "N versions" badge counts global variants + only the viewer's own store picks.
    const visibleVariantCount = variantIds.length
      ? variantIds.filter((_v, i) => !storePickNames[i] || createdBys[i] === publicUserId).length
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
          && isVariantVisibleToViewer(v.storePickName, createdBys[i], publicUserId)),
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
        .select('bottle_id, currently_owned, variant_id, times_had, owned_count, elo, created_at, updated_at')
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
          owned_count: row.owned_count ?? (row.currently_owned ? 1 : 0),
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      });
      setUserBottlesMap(map);

      // My Ranks (S4) is the viewer's OWN ordering, and in this app that ordering comes from Elo --
      // which is what a blind tasting produces. Reading only stars made "My Ranks" invisible to
      // exactly the people who had used the headline feature: Right_Blind had 6 ranked bottles and
      // 0 rows in user_ratings, and was told to "rate some bottles" (2026-09-05).
      const eloMap: Record<string, number> = {};
      (data || []).forEach((row: { bottle_id: string; elo: number | string | null }) => {
        const e = row.elo == null ? null : Number(row.elo);
        if (e == null || Number.isNaN(e) || e === DEFAULT_ELO) return;
        eloMap[row.bottle_id] = Math.max(eloMap[row.bottle_id] ?? -Infinity, e);
      });
      setPersonalEloMap(eloMap);

      // B-40: personal star ("My Ranks" sort + avg-star display) now comes from user_ratings,
      // keyed to the SKU by max across the viewer's rated variants of that bottle.
      const { data: ratingRows } = await supabase
        .from('user_ratings')
        .select('bottle_id, stars')
        .eq('user_id', publicUser.id);
      const starMap: Record<string, number> = {};
      (ratingRows || []).forEach((r: { bottle_id: string; stars: number | string | null }) => {
        const s = r.stars == null ? null : Number(r.stars);
        if (s != null && !Number.isNaN(s)) starMap[r.bottle_id] = Math.max(starMap[r.bottle_id] ?? 0, s);
      });
      setPersonalStarMap(starMap);

      // B-31 earmark: "had it" spans more than ownership — a drink or a blind tasting counts too
      // (BOTTLE_ACTIONS.md). Collect bottle_ids the user drank or tasted. Fail-open: on any error
      // the set stays empty and the earmark simply falls back to ownership.
      const had = new Set<string>();
      const [{ data: drinks }, { data: sess }] = await Promise.all([
        supabase.from('activities').select('bottle_id').eq('user_id', publicUser.id).eq('action', 'drank'),
        supabase.from('tasting_sessions').select('id').eq('user_id', publicUser.id),
      ]);
      (drinks || []).forEach((d: { bottle_id: string | null }) => { if (d.bottle_id) had.add(d.bottle_id); });
      const sessionIds = (sess || []).map((s: { id: string }) => s.id);
      if (sessionIds.length) {
        const { data: results } = await supabase
          .from('tasting_results')
          .select('winner_bottle_id, loser_bottle_id')
          .in('tasting_session_id', sessionIds);
        (results || []).forEach((r: { winner_bottle_id: string | null; loser_bottle_id: string | null }) => {
          if (r.winner_bottle_id) had.add(r.winner_bottle_id);
          if (r.loser_bottle_id) had.add(r.loser_bottle_id);
        });
      }
      setHadItSet(had);
    }

    fetchUserBottles();
  }, []);

  // The bottle_ids this viewer has ANY relationship with: owned now, owned before, drank, or blind
  // tasted (B-31). Defined once here so the server-side filter and the in-list `hadIt` earmark can
  // never drift apart and disagree about the same bottle.
  const hadItIds = useMemo(() => {
    const ids = new Set<string>(hadItSet);
    Object.entries(userBottlesMap).forEach(([bottleId, rows]) => {
      if (rows.some(r => r.currently_owned || (r.times_had ?? 0) >= 1)) ids.add(bottleId);
    });
    return ids;
  }, [userBottlesMap, hadItSet]);

  // Only changes while the "Had it before" filter is actually on, so turning it off (or loading a
  // collection with a different filter active) does not re-fetch the browse list for no reason.
  const hadItKey = filter.field === 'hadit' && filter.value
    ? filter.value + ':' + [...hadItIds].sort().join(',')
    : '';

  // The bottles this viewer has actually ranked, best first. Elo and stars are different scales, so
  // whichever signal they have decides the whole ordering rather than being blended; Elo wins when
  // present because it is the app's real ranking system and is what a blind tasting produces.
  const rankedIds = useMemo(() => {
    const src = Object.keys(personalEloMap).length ? personalEloMap : personalStarMap;
    return Object.entries(src).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [personalEloMap, personalStarMap]);

  const rankedKey = sortBy === 'yours' ? rankedIds.join(',') : '';

  /**
   * My Ranks has to narrow the QUERY, not just reorder what is on screen. The browse list is
   * paginated 30 at a time out of ~90 bottles, so sorting client-side only ever reordered the
   * current page: a viewer's ranked bottles are scattered through the full list and most of them
   * simply were not loaded to be sorted. Measured 2026-09-05: of 4 ranked bottles, 2 were on page
   * one. Same failure shape as B-38.
   *
   * So "My Ranks" means "the bottles I have ranked, best first" -- the only reading that survives
   * pagination, and the one that matches what the sort is for.
   */
  const applyMyRanksToQuery = (q: any) => {
    if (sortBy !== 'yours') return q;
    return rankedIds.length ? q.in('bottle_id', rankedIds) : q.eq('bottle_id', EMPTY_UUID);
  };

  /**
   * Apply the "Had it before" filter to a browse query. It has to run SERVER-side like the other
   * two: the list is paginated, so filtering it in the client would filter only the rows already
   * loaded and put the list back out of step with the banner count -- which is exactly B-38.
   */
  const applyHadItToQuery = (q: any) => {
    if (filter.field !== 'hadit' || !filter.value) return q;
    const ids = [...hadItIds];
    if (filter.value === 'Yes') {
      // Nothing tried yet: match nothing rather than sending `in.()`, which is a syntax error.
      return ids.length ? q.in('bottle_id', ids) : q.eq('bottle_id', EMPTY_UUID);
    }
    return ids.length ? q.not('bottle_id', 'in', `(${ids.join(',')})`) : q;
  };

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
      // B-38: apply the active filter in the QUERY so the paginated list matches the banner
      // count (was filtered client-side on only the first page → count/list mismatch).
      if (filter.field === 'category' && filter.value) {
        q = q.eq('bottle_category', filter.value);
      } else if (filter.field === 'verified' && filter.value) {
        q = q.eq(isBottles ? 'bottle_verified' : 'variant_verified', filter.value === 'Verified');
      }
      q = applyHadItToQuery(q);
      q = applyMyRanksToQuery(q);
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
  }, [viewMode, minElo, maxElo, publicUserId, filter.field, filter.value, hadItKey, sortBy, rankedKey]);

  // Initial browse load (re-runs when the mode changes or the filter changes — B-38)
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
      const inCollection = userBottlesMap[skuId]?.some(r => r.currently_owned || (r.times_had ?? 0) >= 1) ?? false;
      return {
        ...bottle,
        // "In collection" = an OWNERSHIP row exists (owned now, or finished/was-owned).
        // Tasting-only rows (times_had = 0) do not count as being in the collection.
        inCollection,
        currentlyOwned: userBottlesMap[skuId]?.some(r => r.currently_owned) ?? false,
        // "Had it" (earmark) = owned/past OR drank OR blind-tasted — any relationship (B-31).
        hadIt: inCollection || hadItSet.has(skuId),
        // A.2: the list card star is the average of my rating and the global rating (whichever
        // exist); the detail breaks the two apart.
        stars: (() => {
          const mine = personalStarMap[skuId];
          const global = bottle.stars as number | null | undefined;
          if (mine != null && global != null) return (mine + global) / 2;
          return mine ?? global ?? null;
        })(),
      };
    });

    // Apply filter
    if (filter.field && filter.value) {
      if (filter.field === 'category') {
        annotated = annotated.filter(b => b.category === filter.value);
      } else if (filter.field === 'verified') {
        const wantVerified = filter.value === 'Verified';
        annotated = annotated.filter(b => (b.provisional === false) === wantVerified);
      } else if (filter.field === 'hadit') {
        // Typed search results come from a different path than the paginated browse list and are
        // bounded to 50, so they are filtered here rather than in the query.
        const want = filter.value === 'Yes';
        annotated = annotated.filter(b => b.hadIt === want);
      }
    }

    if (sortBy === 'az') return [...annotated].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'za') return [...annotated].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    if (sortBy === 'yours') {
      // My Ranks (S4): the viewer's own ordering, best first; anything they have no opinion on
      // falls to the end.
      //
      // Elo and stars are different scales, so they are not blended -- whichever signal the viewer
      // actually has decides the ordering for the whole list. Elo wins when present because it is
      // the app's real ranking system and reflects head-to-head tastings; stars are the fallback
      // for someone who has only ever rated.
      const useElo = Object.keys(personalEloMap).length > 0;
      const rank = (b: { bottleId?: string; id: string }) => {
        const key = b.bottleId ?? b.id;
        return (useElo ? personalEloMap[key] : personalStarMap[key]) ?? -Infinity;
      };
      return [...annotated].sort((a, b) => rank(b) - rank(a));
    }
    return annotated; // global/null = server Elo order
  }, [bottles, defaultBottles, query, sortBy, filter, userBottlesMap, hadItSet, personalStarMap, personalEloMap]);

  const handleSortSelect = (option: SortOption) => {
    if (option === 'yours' && Object.keys(personalEloMap).length === 0 && Object.keys(personalStarMap).length === 0) {
      // Wording covers both ways in: a blind tasting ranks bottles without ever rating one.
      toast("Rate or blind taste some bottles to use My Ranks");
      setShowSortMenu(false);
      return;
    }
    setSortBy(option);
    setShowSortMenu(false);
  };

  const filterActive = !!(filter.field && filter.value);
  const filterValueOptions =
    filter.field === 'category' ? CATEGORY_VALUES
    : filter.field === 'hadit' ? HADIT_VALUES
    : VERIFIED_VALUES;
  const sortActive = sortBy !== null;

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

  const handleBottleClick = (bottle: any, pinVariantId: string | null = null, fromScanCode: string | null = null) => {
    const skuId = bottle.bottleId ?? bottle.id;
    // B-12: only an ownership row (owned, or previously owned via times_had >= 1) drives
    // "my last activity" — a tasting-only row (times_had = 0, never owned) must not
    // render as "Finished". Previously took an unordered [0], which could be that row.
    const skuRows = userBottlesMap[skuId];
    const row = skuRows?.find(r => r.currently_owned)
      ?? skuRows?.find(r => (r.times_had ?? 0) >= 1);
    logClick("bottle_open", { userId: publicUserId, surface: "/search", targetId: skuId, metadata: { mode: viewMode } });
    setScanPinVariantId(pinVariantId); // S3: default-first unless a scan pinned the owned version
    // Passed explicitly, never left as ambient state: a normal list tap after a scan
    // must NOT inherit the previous code, or "not this bottle?" would report the
    // wrong pairing.
    setScanOpenedWith(fromScanCode);
    setSelectedBottle({
      ...bottle,
      id: skuId, // detail view fetches variants + collection status by SKU id
      timesHad: row?.times_had,
      lastActivity: formatLastActivity(row),
    });
  };

  // Open a bottle straight from its SKU id (used by the barcode scanner).
  const openBottleById = async (bottleId: string, pinVariantId: string | null = null, fromScanCode: string | null = null) => {
    const { data, error } = await (supabase.from("all_bottle_details") as any)
      .select(BOTTLE_SELECT)
      .eq("bottle_id", bottleId)
      .maybeSingle();
    if (error || !data) { toast.error("Couldn't open that bottle"); return; }
    handleBottleClick(mapBottleResult(data), pinVariantId, fromScanCode);
  };

  // Barcode scan result: open the matching bottle (pinned to the version you own, if any),
  // or jump to Add Bottle prefilled.
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
      // A.1 two-zone: fetch the SKU (default id + per-variant labels) so we can single out the
      // NON-default versions the viewer owns. Owning only the default (or nothing) opens the
      // standard bottle directly; owning store picks/batches shows an "in your bar" chooser.
      const { data: sku } = await (supabase.from("all_bottle_details") as any)
        .select(BOTTLE_SELECT).eq("bottle_id", match.id).maybeSingle();
      const defaultVid: string | null = sku?.default_variant_id ?? null;
      const vids: string[] = sku?.attr_variant_ids || [];
      const storePicks: (string | null)[] = sku?.attr_store_pick_name || [];
      const years: (string | number | null)[] = sku?.attr_release_year || [];
      const batches: (string | null)[] = sku?.attr_batch || [];
      const labelFor = (vid: string): string => {
        const i = vids.indexOf(vid);
        if (i < 0) return "Version";
        const parts = [storePicks[i], years[i] != null ? String(years[i]) : null, batches[i] ? `Batch ${batches[i]}` : null].filter(Boolean);
        return parts.length ? parts.join(" · ") : "Version";
      };
      const rows = userBottlesMap[match.id] || [];
      const ownedRows = rows.filter(r => r.currently_owned || (r.times_had ?? 0) >= 1);
      const nonDefaultOwned = ownedRows.filter(r => r.variant_id && r.variant_id !== defaultVid);
      if (nonDefaultOwned.length > 0) {
        setScanChoice({
          bottleId: match.id,
          name: match.name,
          barcode: code,
          versions: nonDefaultOwned.map(r => ({ variantId: r.variant_id as string, label: labelFor(r.variant_id as string) })),
        });
      } else {
        toast.success(ownedRows.length > 0 ? `In your bar: ${match.name}` : `Found: ${match.name}`);
        await openBottleById(match.id, null, code);
      }
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
  }, [viewMode, minElo, maxElo, publicUserId]);

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
    // onToggleOwnership from the detail = "finish one" (B-32): owned_count-1, emptied_count+1.
    const res = await markVariantEmpty({ userId: publicUserId, bottleId, variantId: primaryRow.variant_id ?? null });
    if ("error" in res) { toast.error(`Couldn't mark it empty: ${res.error}`); logEvent({ eventType: "error", userId: publicUserId, surface: "/search", metadata: { kind: "mark_empty_failed", message: res.error } }); return; }

    setUserBottlesMap(prev => ({
      ...prev,
      [bottleId]: prev[bottleId].map(r =>
        r.variant_id === primaryRow.variant_id
          ? { ...r, currently_owned: res.ownedCount > 0, updated_at: new Date().toISOString() }
          : r
      ),
    }));
    toast.success("Marked as Finished");
  }, [publicUserId, userBottlesMap]);

  const handleDeleteFromBar = useCallback(async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId) return;

    // Remove the VISIBLE variant's row (B-15), falling back to the ownership row.
    const ownedRow = (variantId ? userBottlesMap[bottleId]?.find(r => r.variant_id === variantId) : undefined)
      ?? userBottlesMap[bottleId]?.find(r => r.currently_owned || (r.times_had ?? 0) >= 1);
    const result = await removeUserBottle({ userId: publicUserId, bottleId, variantId: ownedRow?.variant_id ?? null });
    if (result.error) { toast.error(`Couldn't remove it: ${result.error}`); logEvent({ eventType: "error", userId: publicUserId, surface: "/search", metadata: { kind: "remove_bottle_failed", message: result.error } }); return; }

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
    if (query.trim() || (!filterActive && sortBy !== 'yours')) {
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
      q = applyHadItToQuery(q);
      q = applyMyRanksToQuery(q);

      const { count } = await q;
      setFilteredBrowseCount(count ?? 0);
    }

    fetchCount();
  }, [filter, query, filterActive, viewMode, publicUserId, hadItKey, sortBy, rankedKey]);

  // Count shown in banner
  // - No query, no filter: total DB count for the mode (from server prop)
  // - No query, filter active: DB count for that filter (separate query)
  // - Query active: count of in-memory search results (bounded to 50)
  const totalCount = viewMode === 'bottles' ? totalBottleCount : totalVariantCount;
  const displayCount = query.trim()
    ? sortedBottles.length
    : (filterActive || sortBy === 'yours') && filteredBrowseCount !== null
    ? filteredBrowseCount
    : totalCount;

  return (
    <>
      {/* Fixed Header with Search Bar */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-ivory border-b border-charcoal z-20 p-2" style={{ top: "env(safe-area-inset-top)" }}>
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
      <header className="fixed top-14 left-0 right-0 h-9 bg-ivory border-b border-charcoal z-30 flex items-center justify-between px-4 gap-2" style={{ top: "calc(56px + env(safe-area-inset-top))" }}>

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
                    {(['category', 'verified', 'hadit'] as FilterField[]).map(f => (
                      <button
                        key={f}
                        onClick={() => handleFilterFieldSelect(f)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-50"
                      >
                        <span>{FILTER_FIELD_LABELS[f]}</span>
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
                      {filter.field ? FILTER_FIELD_LABELS[filter.field] : ''}
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
            {sortBy ? SORT_LABELS[sortBy] : 'Sort by'}
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
      <div className="fixed top-[92px] left-0 right-0 h-9 bg-ivory border-b border-charcoal z-20 flex items-center justify-center px-4" style={{ top: "calc(92px + env(safe-area-inset-top))" }}>
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

      {/* A.1 barcode two-zone chooser: standard bottle + the owned non-default versions */}
      {scanChoice && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setScanChoice(null)}>
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-charcoal mb-0.5">In your bar</h3>
            <p className="text-sm text-gray-500 mb-4 truncate">{scanChoice.name}</p>
            <button
              type="button"
              onClick={() => { const id = scanChoice.bottleId; setScanChoice(null); openBottleById(id, null, scanChoice.barcode); }}
              className="w-full rounded-lg border border-charcoal py-3 text-sm font-medium text-charcoal mb-4"
            >
              Open the standard bottle
            </button>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Versions you own</p>
            <div className="space-y-1">
              {scanChoice.versions.map((v) => (
                <button
                  key={v.variantId}
                  type="button"
                  onClick={() => { const id = scanChoice.bottleId, vid = v.variantId; setScanChoice(null); openBottleById(id, vid, scanChoice.barcode); }}
                  className="w-full text-left rounded-lg border p-3 text-sm text-charcoal"
                  style={{ borderColor: "#D1D5DB" }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
          onClose={() => { setSelectedBottle(null); setScanOpenedWith(null); }}
          inCollection={userBottlesMap[selectedBottle.id]?.some(r => r.currently_owned || (r.times_had ?? 0) >= 1) ?? false}
          currentlyOwned={userBottlesMap[selectedBottle.id]?.some(r => r.currently_owned) ?? false}
          ownershipRows={userBottlesMap[selectedBottle.id]}
          initialVariantId={scanPinVariantId}
          scannedBarcode={scanOpenedWith}
          publicUserId={publicUserId ?? undefined}
          onAddToBar={handleAddToBar}
          onToggleOwnership={handleToggleOwnership}
          onDeleteFromBar={handleDeleteFromBar}
        />
      )}
    </>
  );
}
