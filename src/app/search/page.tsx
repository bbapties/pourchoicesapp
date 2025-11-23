"use client"

import { useState, useEffect, useCallback } from "react";
import { Search, Plus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";

import BottleCard, { type Bottle } from "@/components/BottleCard";
import ProvisionalSheet from "@/components/ProvisionalSheet";

export default function SearchPage() {
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
      const { data, error } = await supabase
        .from("bottles")
        .select("id, name, distillery, category, image_url, elo_global")
        .ilike("name", `%${searchTerm}%`)
        .or(`distillery.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
        .limit(50);

      if (error) {
        console.error("Search error:", error);
        setBottles([]);
      } else {
        setBottles(data || []);
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      setBottles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchBottles(query);
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimer);
  }, [query, searchBottles]);

  const handleBottleAdded = useCallback(() => {
    // Refresh search after adding a bottle
    searchBottles(query);
  }, [query, searchBottles]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Fixed Search Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search bottles, distilleries, categories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>
      </div>

      {/* Results */}
      <div className="px-4 py-4">
        {isLoading ? (
          // Loading skeletons
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center p-3 border-b border-gray-200">
                <Skeleton className="w-12 h-12 rounded flex-shrink-0" />
                <div className="ml-3 flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="w-8 h-5" />
              </div>
            ))}
          </div>
        ) : query.trim() && bottles.length === 0 ? (
          // No results
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🥃</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Bottle not found?
            </h3>
            <p className="text-gray-600 mb-6">
              Help us expand our collection by adding new bottles.
            </p>
            <Button onClick={() => setShowAddSheet(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Bottle
            </Button>
          </div>
        ) : (
          // Results
          <div>
            {bottles.length > 0 && (
              <div className="text-sm text-gray-500 mb-3">
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
