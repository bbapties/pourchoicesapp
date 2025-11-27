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
      // Search for bottles matching the query using all_bottle_details view
      const { data: searchResults, error } = await supabase
        .from("all_bottle_details")
        .select("bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, bottle_elo_global, bottle_verified, attr_frontimage_url, attr_age, attr_batch, attr_store_pick_name, attr_notes, attr_extras")
        .ilike("bottle_name", `%${searchTerm}%`)
        .or(`bottle_distillery.ilike.%${searchTerm}%, bottle_category.ilike.%${searchTerm}%, bottle_style.ilike.%${searchTerm}%, bottle_barcode.ilike.%${searchTerm}%, attr_age.ilike.%${searchTerm}%, attr_batch.ilike.%${searchTerm}%, attr_store_pick_name.ilike.%${searchTerm}%, attr_notes.ilike.%${searchTerm}%, attr_extras::text.ilike.%${searchTerm}%`)
        .order("bottle_elo_global", { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) {
        console.error("Search error:", error);
        setBottles([]);
        return;
      }

      // Transform to our Bottle interface and calculate global ranks
      let rankedBottles: Bottle[] = [];
      if (searchResults && searchResults.length > 0) {
        rankedBottles = searchResults.map((result) => {
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
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Fixed Search Bar */}
      <div className="bg-gray-50 border-b border-gray-300 px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search bottles, distilleries, categories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-12 text-base border-gray-300 focus:border-gray-400 bg-gray-50 text-gray-900"
          />
        </div>
      </div>

      {/* Results */}
      <div className="px-4 py-4">
        {isLoading ? (
          // Loading skeletons
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center p-3 border-b border-gray-300">
                <Skeleton className="w-12 h-12 rounded flex-shrink-0 bg-gray-200" />
                <div className="ml-3 flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4 bg-gray-200" />
                  <Skeleton className="h-3 w-1/2 bg-gray-200" />
                </div>
                <Skeleton className="w-8 h-5 bg-gray-200" />
              </div>
            ))}
          </div>
        ) : query.trim() && bottles.length === 0 ? (
          // No results
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🥃</div>
            <h3 className="text-lg font-semibold mb-2 text-gray-900">
              Bottle not found?
            </h3>
            <p className="mb-6 text-gray-600">
              Add it!
            </p>
            <Button
              onClick={() => setShowAddSheet(true)}
              className="gap-2 bg-gray-900 text-gray-50 hover:bg-gray-800"
            >
              <Plus className="w-4 h-4" />
              Add Bottle
            </Button>
          </div>
        ) : (
          // Results
          <div>
            {bottles.length > 0 && (
              <div className="text-sm mb-3 text-gray-600">
                Found {bottles.length} bottle{bottles.length !== 1 ? 's' : ''}
              </div>
            )}
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

      <Toaster />
    </div>
  );
}
