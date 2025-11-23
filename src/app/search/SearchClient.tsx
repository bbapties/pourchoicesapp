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

export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [totalBottleCount, setTotalBottleCount] = useState<number>(0);

  // Fetch total bottle count on mount for percentile calculation
  useEffect(() => {
    const fetchTotalCount = async () => {
      try {
        const { count, error } = await supabase
          .from("bottles")
          .select("*", { count: "exact", head: true });

        if (!error && count !== null) {
          setTotalBottleCount(count);
        }
      } catch (error) {
        console.error("Error fetching total count:", error);
      }
    };

    fetchTotalCount();
  }, []);

  const searchBottles = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setBottles([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Search for bottles matching the query
      const { data: searchResults, error } = await supabase
        .from("bottles")
        .select("id, name, distillery, category, image_url, elo_global, provisional")
        .ilike("name", `%${searchTerm}%`)
        .or(`distillery.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
        .limit(50);

      if (error) {
        console.error("Search error:", error);
        setBottles([]);
        return;
      }

      // Calculate percentiles based on rank
      let rankedBottles: Bottle[] = [];
      if (searchResults && searchResults.length > 0) {
        // Get ranks for these bottles by sorting by elo_global DESC
        const sortedResults = searchResults.sort((a, b) =>
          (b.elo_global || 0) - (a.elo_global || 0)
        );

        rankedBottles = sortedResults.map((bottle, index) => ({
          ...bottle,
          rank: index + 1,
          total_count: totalBottleCount,
        }));
      }

      setBottles(rankedBottles);
    } catch (error) {
      console.error("Unexpected error:", error);
      setBottles([]);
      toast.error("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [totalBottleCount]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchBottles(query);
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimer);
  }, [query, searchBottles]);

  const handleBottleAdded = useCallback(() => {
    // Refresh search after adding a bottle
    searchBottles(query);
    // Also refresh total count
    const fetchTotalCount = async () => {
      try {
        const { count, error } = await supabase
          .from("bottles")
          .select("*", { count: "exact", head: true });

        if (!error && count !== null) {
          setTotalBottleCount(count);
        }
      } catch (error) {
        console.error("Error fetching total count:", error);
      }
    };
    fetchTotalCount();
  }, [query, searchBottles]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#2F2F2F" }}>
      {/* Fixed Search Bar */}
      <div className="bg-[#FDF6E3] border-b border-gray-300 px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="relative max-w-md mx-auto">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5"
            style={{ color: "#2F2F2F" }}
          />
          <Input
            type="text"
            placeholder="Search bottles, distilleries, categories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-12 text-base border-gray-300 focus:border-[#DAA520] focus:ring-[#DAA520]"
            style={{
              backgroundColor: "#FDF6E3",
              color: "#2F2F2F",
              borderColor: "gray-300"
            }}
          />
        </div>
      </div>

      {/* Results */}
      <div className="px-4 py-4">
        {isLoading ? (
          // Loading skeletons
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center p-3 border-b" style={{ borderColor: "gray-300" }}>
                <Skeleton
                  className="w-12 h-12 rounded flex-shrink-0"
                  style={{ backgroundColor: "#FDF6E3/20" }}
                />
                <div className="ml-3 flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" style={{ backgroundColor: "#FDF6E3/20" }} />
                  <Skeleton className="h-3 w-1/2" style={{ backgroundColor: "#FDF6E3/20" }} />
                </div>
                <Skeleton className="w-8 h-5" style={{ backgroundColor: "#FDF6E3/20" }} />
              </div>
            ))}
          </div>
        ) : query.trim() && bottles.length === 0 ? (
          // No results
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🥃</div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: "#FDF6E3" }}>
              Bottle not found?
            </h3>
            <p className="mb-6" style={{ color: "#FDF6E3/80" }}>
              Help us expand our collection by adding new bottles.
            </p>
            <Button
              onClick={() => setShowAddSheet(true)}
              className="gap-2 hover:bg-[#DAA520]/80"
              style={{
                backgroundColor: "#DAA520",
                color: "#FDF6E3"
              }}
            >
              <Plus className="w-4 h-4" />
              Add Bottle
            </Button>
          </div>
        ) : (
          // Results
          <div>
            {bottles.length > 0 && (
              <div className="text-sm mb-3" style={{ color: "#FDF6E3/60" }}>
                Found {bottles.length} bottle{bottles.length !== 1 ? 's' : ''}
              </div>
            )}
            <div className="space-y-0">
              {bottles.map((bottle) => (
                <BottleCard key={bottle.id} bottle={bottle} />
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
