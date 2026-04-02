"use client"

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Plus, ChevronDown, Check } from "lucide-react";
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

interface SearchClientProps {
  allBottlesElo: Array<{ bottle_elo_global?: number }>;
  totalBottleCount: number;
}

export default function SearchClient({ allBottlesElo, totalBottleCount }: SearchClientProps) {
  const [query, setQuery] = useState("");
  const [bottles, setBottles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [selectedBottle, setSelectedBottle] = useState<BottleDetails | null>(null);

  type SortOption = 'global' | 'az' | 'yours';
  const [sortBy, setSortBy] = useState<SortOption>('global');
  const [showSortMenu, setShowSortMenu] = useState(false);

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

  const sortLabels: Record<SortOption, string> = { global: 'Global', az: 'A–Z', yours: 'Your Rank' };

  const sortedBottles = useMemo(() => {
    if (sortBy === 'az') {
      return [...bottles].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return bottles;
  }, [bottles, sortBy]);

  const handleSortSelect = (option: SortOption) => {
    if (option === 'yours') {
      toast("Taste some bottles to unlock your personal rankings");
      setShowSortMenu(false);
      return;
    }
    setSortBy(option);
    setShowSortMenu(false);
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
      // Search with substring matching for name/distillery to catch mid-name terms like "Pete" in "St. Pete"
      // Partial for others
      const { data: searchResults, error } = await supabase
        .from("all_bottle_details")
        .select("bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, bottle_elo_global, bottle_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_volume, attr_release_year, attr_batch, attr_store_pick_name, attr_notes, attr_extras")
        .or(`bottle_name.ilike.%${searchTerm}%,bottle_distillery.ilike.%${searchTerm}%,bottle_category.ilike.%${searchTerm}%,bottle_style.ilike.%${searchTerm}%,bottle_barcode.ilike.%${searchTerm}%,attr_age.ilike.%${searchTerm}%,attr_batch.ilike.%${searchTerm}%,attr_store_pick_name.ilike.%${searchTerm}%,attr_notes.ilike.%${searchTerm}%`)
        .order("bottle_elo_global", { ascending: false, nullsFirst: false })
        .limit(50);

      console.log("Query term:", searchTerm);
      console.log("Raw Supabase response:", searchResults);
      console.log("Full error if any:", error?.message, error?.details, error?.hint, error?.code);

      // Log substring matches for each raw result
      (searchResults || []).forEach((bottle, index) => {
        const termLower = searchTerm.toLowerCase();
        const nameIncludes = bottle.bottle_name?.toLowerCase().includes(termLower);
        console.log(`Result ${index}: "${bottle.bottle_name}" includes "${searchTerm}": ${nameIncludes}`);
      });

      // Post-query filter: exclude bottles where only match is in attr_notes labels like "Nose:", "Palate:", "Finish:"
      const filteredResults = (searchResults || []).filter((bottle) => {
        const termLower = searchTerm.toLowerCase();
        let hasValidMatch = false;

        if (bottle.bottle_name?.toLowerCase().includes(termLower)) hasValidMatch = true;
        if (bottle.bottle_distillery?.toLowerCase().includes(termLower)) hasValidMatch = true;
        if (bottle.bottle_category?.toLowerCase().includes(termLower)) hasValidMatch = true;
        if (bottle.bottle_style?.toLowerCase().includes(termLower)) hasValidMatch = true;
        if (bottle.bottle_barcode?.toLowerCase().includes(termLower)) hasValidMatch = true;
        if (bottle.attr_age?.toLowerCase().includes(termLower)) hasValidMatch = true;
        if (bottle.attr_batch?.toLowerCase().includes(termLower)) hasValidMatch = true;
        if (bottle.attr_store_pick_name?.toLowerCase().includes(termLower)) hasValidMatch = true;
        // For attr_notes: check if term appears in cleaned notes (labels stripped)
        if (bottle.attr_notes) {
          const cleanedNotes = bottle.attr_notes
            .replace(/Nose:/gi, '')
            .replace(/Palate:/gi, '')
            .replace(/Finish:/gi, '')
            .toLowerCase();
          if (cleanedNotes.includes(termLower)) hasValidMatch = true;
        }

        return hasValidMatch;
      });

      console.log(`Filtered from ${searchResults?.length || 0} to ${filteredResults.length} results`);

      // Detailed logging: why each filtered result matched (now valid matches only)
      filteredResults.forEach((bottle) => {
        const matches = [];
        const termLower = searchTerm.toLowerCase();
        if (bottle.bottle_name?.toLowerCase().includes(termLower)) matches.push(`bottle_name: "${bottle.bottle_name}"`);
        if (bottle.bottle_distillery?.toLowerCase().includes(termLower)) matches.push(`bottle_distillery: "${bottle.bottle_distillery}"`);
        if (bottle.bottle_category?.toLowerCase().includes(termLower)) matches.push(`bottle_category: "${bottle.bottle_category}"`);
        if (bottle.bottle_style?.toLowerCase().includes(termLower)) matches.push(`bottle_style: "${bottle.bottle_style}"`);
        if (bottle.bottle_barcode?.toLowerCase().includes(termLower)) matches.push(`bottle_barcode: "${bottle.bottle_barcode}"`);
        if (bottle.attr_age?.toLowerCase().includes(termLower)) matches.push(`attr_age: "${bottle.attr_age}"`);
        if (bottle.attr_batch?.toLowerCase().includes(termLower)) matches.push(`attr_batch: "${bottle.attr_batch}"`);
        if (bottle.attr_store_pick_name?.toLowerCase().includes(termLower)) matches.push(`attr_store_pick_name: "${bottle.attr_store_pick_name}"`);
        // Log cleaned notes match
        if (bottle.attr_notes) {
          const cleanedNotes = bottle.attr_notes
            .replace(/Nose:/gi, '')
            .replace(/Palate:/gi, '')
            .replace(/Finish:/gi, '')
            .toLowerCase();
          if (cleanedNotes.includes(termLower)) matches.push(`attr_notes (cleaned): "${bottle.attr_notes}" -> "${cleanedNotes.substring(Math.max(0, cleanedNotes.indexOf(termLower) - 20), cleanedNotes.indexOf(termLower) + termLower.length + 20)}"`); // context snippet
        }
        console.log(`Bottle "${bottle.bottle_name}" included after filter, matched on: ${matches.join(", ")}`);
      });

      if (error) {
        setBottles([]);
        return;
      }

      // Transform to our Bottle interface
      let rankedBottles: Bottle[] = [];
      if (filteredResults && filteredResults.length > 0) {
        rankedBottles = filteredResults.map((result) => {
          const notes = result.attr_notes || '';
          const noseMatch = notes.match(/Nose:\s*(.*?)(?=(Palate:|Finish:|$))/is);
          const palateMatch = notes.match(/Palate:\s*(.*?)(?=(Finish:|$))/is);
          const finishMatch = notes.match(/Finish:\s*(.*?)$/is);

          return {
            id: result.bottle_id,
            name: result.bottle_name,
            distillery: result.bottle_distillery,
            category: result.bottle_category,
            image_url: result.attr_frontimage_url,
            elo_global: result.bottle_elo_global,
            provisional: !result.bottle_verified,
            stars: calcStars(result.bottle_elo_global),
            // BottleDetails fields
            style: result.bottle_style,
            age: result.attr_age,
            proof: result.attr_proof,
            volume: result.attr_volume,
            verified: result.bottle_verified,
            barcode: result.bottle_barcode,
            lastActivity: "Never",
            frontImageUrl: result.attr_frontimage_url,
            backImageUrl: result.attr_backimage_url,
            variants: [{ releaseYear: result.attr_release_year, batch: result.attr_batch, storePickName: result.attr_store_pick_name }].filter(v => v.releaseYear || v.batch || v.storePickName),
            nose: noseMatch?.[1]?.trim(),
            palate: palateMatch?.[1]?.trim(),
            finish: finishMatch?.[1]?.trim(),
          };
        });
      }

      setBottles(rankedBottles);
    } catch (error) {
      console.error("Unexpected error:", error);
      setBottles([]);
      toast.error("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [totalBottleCount, allBottlesElo]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchBottles(query);
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimer);
  }, [query, searchBottles]);

  const handleBottleAdded = useCallback((newBottle?: any) => {
    // Optimistic update: add the new bottle to results after success
    if (newBottle) {
      newBottle.stars = calcStars(newBottle.elo_global ?? 1500);
      if (query.trim()) {
        setBottles((prev) => [newBottle, ...prev]);
      }
    }

    // Refresh search after adding a bottle
    if (query.trim()) {
      searchBottles(query);
    }
  }, [query, searchBottles, totalBottleCount]);

  return (
    <>
      {/* Fixed Header with Search Bar - h-14 ~56px fixed, full width per user spec */}
      {/* Fixed search bar width and icon placement per feedback */}
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

      {/* Results banner with sort dropdown */}
      <header className="fixed top-14 left-0 right-0 h-9 bg-ivory border-b border-charcoal z-20 flex items-center justify-between px-4">
        <span className="text-sm text-charcoal">
          {sortedBottles.length > 0 ? `${sortedBottles.length} Result${sortedBottles.length !== 1 ? 's' : ''}` : ''}
        </span>

        {sortedBottles.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(v => !v)}
              className="flex items-center gap-1 text-sm text-charcoal border border-charcoal rounded-full px-3 py-0.5"
            >
              {sortLabels[sortBy]}
              <ChevronDown size={13} />
            </button>

            {showSortMenu && (
              <>
                {/* Backdrop — closes menu on outside tap */}
                <div className="fixed inset-0 z-30" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[140px] py-1 overflow-hidden">
                  {(['global', 'az', 'yours'] as SortOption[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => handleSortSelect(option)}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-50"
                    >
                      <span>{option === 'global' ? 'Global Rank' : option === 'az' ? 'A–Z' : 'Your Rank'}</span>
                      {sortBy === option && <Check size={13} className="text-charcoal" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {/* Scrollable Middle Content - contained within main flex-1 area google per app shell margins */}
      <div className="px-4 py-4">
        {isLoading ? (
          // Loading skeletons
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center p-3 border-b border-gray-300">
                <Skeleton className="w-12 h-12 rounded flex-shrink-0 bg-gray-300" />
                <div className="ml-3 flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4 bg-gray-300" />
                  <Skeleton className="h-3 w-1/2 bg-gray-300" />
                </div>
                <Skeleton className="w-8 h-5 bg-gray-300" />
              </div>
            ))}
          </div>
        ) : query.trim() && bottles.length === 0 ? (
          // No results
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🥃</div>
            <h3 className="text-lg font-semibold mb-2 text-charcoal">
              Bottle not found? Add it!
            </h3>
          </div>
        ) : (
          // Results
          <div>
            <div className="space-y-0">
              {sortedBottles.map((bottle) => (
                <div key={bottle.id || bottle.name} onClick={() => handleBottleClick(bottle)} className="cursor-pointer">
                  <BottleCard bottle={bottle} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Provisional Add Sheet */}
      <ProvisionalSheet
        open={showAddSheet}
        onOpenChange={setShowAddSheet}
        onBottleAdded={handleBottleAdded}
      />

      {/* Persistent FAB for Add Bottle - fully solid charcoal bg */}
      {/* Overrode Tailwind preflight transparent button bg per inspector layout.css:147 */}
      {query.length > 0 && (
        <Button
          onClick={() => setShowAddSheet(true)}
          style={{ backgroundColor: '#2F2F2F', color: '#FDF6E3' }}
          className="!bg-charcoal !text-ivory !opacity-100 !hover:bg-gray-700 fixed bottom-20 left-1/2 -translate-x-1/2 rounded-full z-30 shadow-lg w-12 h-12 flex items-center justify-center"
          variant={null}
          aria-label="Add new bottle"
        >
          <Plus className="w-6 h-6" />
        </Button>
      )}

      <Toaster position="top-center" style={{ top: '96px' }} />

      {selectedBottle && <BottleDetailView bottle={selectedBottle} onClose={() => setSelectedBottle(null)} />}
    </>
  );
}
