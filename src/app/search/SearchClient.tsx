"use client"

import { useState, useEffect, useCallback } from "react";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";

import BottleCard, { type Bottle } from "@/components/BottleCard";
import ProvisionalSheet from "@/components/ProvisionalSheet";

interface SearchClientProps {
  allBottlesElo: Array<{ bottle_elo_global?: number }>;
  totalBottleCount: number;
}

export default function SearchClient({ allBottlesElo, totalBottleCount }: SearchClientProps) {
  const [query, setQuery] = useState("");
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);

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
        .select("bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, bottle_elo_global, bottle_verified, attr_frontimage_url, attr_age, attr_batch, attr_store_pick_name, attr_notes, attr_extras")
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

        if (bottle.bottle_name?.toLowerCase().startsWith(termLower)) hasValidMatch = true;
        if (bottle.bottle_distillery?.toLowerCase().startsWith(termLower)) hasValidMatch = true;
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
        if (bottle.bottle_name?.toLowerCase().startsWith(termLower)) matches.push(`bottle_name start: "${bottle.bottle_name}"`);
        if (bottle.bottle_distillery?.toLowerCase().startsWith(termLower)) matches.push(`bottle_distillery start: "${bottle.bottle_distillery}"`);
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
        console.error("Search error:", error);
        setBottles([]);
        return;
      }

      // Transform to our Bottle interface and calculate global ranks
      let rankedBottles: Bottle[] = [];
      if (filteredResults && filteredResults.length > 0) {
        rankedBottles = filteredResults.map((result) => {
          // Find the global rank by finding this bottle's elo_global in the sorted list
          const globalRank = allBottlesElo.findIndex(
            (globalBottle) => globalBottle.bottle_elo_global === result.bottle_elo_global
          ) + 1;

          return {
            id: result.bottle_id,
            name: result.bottle_name,
            distillery: result.bottle_distillery,
            category: result.bottle_category,
            image_url: result.attr_frontimage_url,
            elo_global: result.bottle_elo_global,
            provisional: !result.bottle_verified,
            rank: globalRank,
            total_count: totalBottleCount,
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
      newBottle.rank = totalBottleCount + 1;
      newBottle.total_count = totalBottleCount + 1;
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

      {/* Sticky Sub-Header - fixed top-[56px] h-7, 90% width centered, vertically centered text */}
      {/* Centered sub-header text, narrowed width, solidified FAB per feedback */}
      <header className="fixed top-14 left-0 right-0 h-7 bg-ivory border-b border-charcoal z-20 flex items-center justify-start px-6">
        {bottles.length > 0 && (
          <div className="max-w-[90%] mx-auto">
            <p className="text-charcoal text-sm">
              Found {bottles.length} bottle{bottles.length !== 1 ? 's' : ''}
            </p>
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
              {bottles.map((bottle) => (
                <BottleCard key={bottle.id || bottle.name} bottle={bottle} />
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

      <Toaster />
    </>
  );
}
