"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import ActivityCard from "@/components/social/ActivityCard";
import { fetchFeedPage, toggleCheer, type FeedItem } from "@/lib/social";
import BottleDetailView from "@/components/BottleDetailView";
import { type BottleDetails } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { isVariantVisibleToViewer } from "@/lib/variants";
import { logClick } from "@/lib/events";
import {
  addOrRestockUserBottle,
  formatLastActivity,
  removeUserBottle,
  markVariantEmpty,
  type UserBottleRow,
} from "@/lib/userBottles";

const PAGE_SIZE = 40;

const DETAIL_SELECT =
  "bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, bottle_elo_global, bottle_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_volume, attr_nose, attr_palate, attr_finish, attr_extras, attr_variant_ids, attr_batch, attr_release_year, attr_store_pick_name, attr_variant_created_by";

function mapDetail(result: any, row?: UserBottleRow | null, viewerPublicId?: string | null): BottleDetails {
  const variantIds: string[] = result.attr_variant_ids || [];
  const batches: string[] = result.attr_batch || [];
  const releaseYears: string[] = result.attr_release_year || [];
  const storePickNames: string[] = result.attr_store_pick_name || [];
  const createdBys: string[] = result.attr_variant_created_by || [];
  return {
    id: result.bottle_id,
    name: result.bottle_name,
    distillery: result.bottle_distillery,
    category: result.bottle_category,
    style: result.bottle_style,
    age: result.attr_age,
    proof: result.attr_proof,
    volume: result.attr_volume,
    elo_global: result.bottle_elo_global,
    verified: result.bottle_verified,
    barcode: result.bottle_barcode,
    lastActivity: formatLastActivity(row),
    timesHad: row?.times_had,
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
        && isVariantVisibleToViewer(v.storePickName, createdBys[i], viewerPublicId)),
    nose: result.attr_nose,
    palate: result.attr_palate,
    finish: result.attr_finish,
    extras: result.attr_extras,
  };
}

export default function SocialClient() {
  const { publicUserId } = useCurrentUser();
  const [rows, setRows] = useState<FeedItem[]>([]);
  // Raw rows fetched so far - the offset for the next page. Cards collapse runs, so rows.length lies.
  const [fetched, setFetched] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedBottle, setSelectedBottle] = useState<BottleDetails | null>(null);
  const [selectedOwned, setSelectedOwned] = useState<{ inCollection: boolean; currentlyOwned: boolean }>({
    inCollection: false,
    currentlyOwned: false,
  });
  const [selectedRow, setSelectedRow] = useState<UserBottleRow | null>(null);

  const load = useCallback(async (reset: boolean) => {
    if (reset) setIsLoading(true);
    else setIsLoadingMore(true);

    const offset = reset ? 0 : fetched;
    const { items, error, rawCount } = await fetchFeedPage({ offset, limit: PAGE_SIZE, viewerId: publicUserId ?? null });
    if (error) {
      toast.error("Couldn't load activity");
    } else {
      setRows((prev) => (reset ? items : [...prev, ...items]));
      setFetched(offset + rawCount);
      setHasMore(rawCount === PAGE_SIZE);
    }

    setIsLoading(false);
    setIsLoadingMore(false);
  }, [fetched, publicUserId]);

  // Cheers are optimistic: flip the card now, write behind it, roll back on a real error.
  const handleCheer = async (item: FeedItem) => {
    if (!publicUserId) return;
    const on = !item.viewerCheered;
    const patch = (rows: FeedItem[], cheered: boolean, delta: number) =>
      rows.map((r) => (r.id === item.id ? { ...r, viewerCheered: cheered, cheers: Math.max(0, r.cheers + delta) } : r));
    setRows((prev) => patch(prev, on, on ? 1 : -1));
    logClick(on ? "post_cheered" : "post_uncheered", { userId: publicUserId, targetId: item.id, surface: "/social", metadata: { action: item.action } });
    const res = await toggleCheer(item.id, publicUserId, on);
    if (res.error) {
      setRows((prev) => patch(prev, !on, on ? -1 : 1));
      toast.error("Couldn't save that");
    }
  };

  useEffect(() => {
    load(true);
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openBottle = async (bottleId: string) => {
    const { data, error } = await supabase
      .from("all_bottle_details")
      .select(DETAIL_SELECT)
      .eq("bottle_id", bottleId)
      .maybeSingle();
    if (error || !data) {
      toast.error("Couldn't open this bottle");
      return;
    }

    // B-17: if the user context hasn't resolved yet (a quick tap right after load),
    // resolve the ids on demand so we don't show "Add to My Bar" on an owned bottle.
    let uid = publicUserId;
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: u } = await supabase.from("users").select("id").eq("auth_id", user.id).maybeSingle();
        uid = u?.id ?? null;
      }
    }

    let row: UserBottleRow | null = null;
    if (uid) {
      // A (user, bottle) can now have multiple variant rows; prefer the ownership
      // row (owned, then finished/was-owned) over tasting-only rows.
      const { data: ubRows } = await supabase
        .from("user_bottles")
        .select("currently_owned, variant_id, times_had, created_at, updated_at")
        .eq("user_id", uid)
        .eq("bottle_id", bottleId)
        .order("currently_owned", { ascending: false })
        .order("times_had", { ascending: false })
        .limit(1);
      const ub = ubRows?.[0];
      if (ub) {
        row = {
          currently_owned: ub.currently_owned,
          variant_id: ub.variant_id ?? null,
          times_had: ub.times_had ?? 1,
          created_at: ub.created_at,
          updated_at: ub.updated_at,
        };
      }
    }

    setSelectedRow(row);
    setSelectedOwned({
      inCollection: !!row && (row.currently_owned || (row.times_had ?? 0) >= 1),
      currentlyOwned: !!row?.currently_owned,
    });
    setSelectedBottle(mapDetail(data, row, uid));
  };

  const handleAddToBar = async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId) { toast.error("Not logged in"); return; }
    const result = await addOrRestockUserBottle({
      userId: publicUserId,
      bottleId,
      variantId: variantId ?? selectedRow?.variant_id ?? null,
    });
    if ("error" in result) {
      toast.error("Failed to add to My Bar");
      return;
    }
    const now = new Date().toISOString();
    const nextRow: UserBottleRow = {
      currently_owned: true,
      variant_id: result.variantId, // B-35: the variant the DB wrote, not a null guess
      times_had: result.timesHad,
      created_at: selectedRow?.created_at ?? now,
      updated_at: now,
    };
    setSelectedRow(nextRow);
    setSelectedOwned({ inCollection: true, currentlyOwned: true });
    toast.success("Added to My Bar!");
    load(true);
  };

  const handleToggleOwnership = async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId || !selectedRow) return;
    // Scope to the VISIBLE variant (B-15), falling back to the opened row's variant
    // (B-09): user_bottles is one row per (user, variant), so marking empty must
    // target this variant only — not every version of the SKU.
    const vId = variantId ?? selectedRow.variant_id ?? null;
    // B-32 "finish one": owned_count-1, emptied_count+1 (markVariantEmpty logs 'finished').
    const res = await markVariantEmpty({ userId: publicUserId, bottleId, variantId: vId });
    if ("error" in res) { toast.error(`Couldn't mark it empty: ${res.error}`); logEvent({ eventType: "error", userId: publicUserId, surface: "/social", metadata: { kind: "mark_empty_failed", message: res.error } }); return; }
    setSelectedRow({ ...selectedRow, currently_owned: res.ownedCount > 0, updated_at: new Date().toISOString() });
    setSelectedOwned({ inCollection: true, currentlyOwned: res.ownedCount > 0 });
    toast.success("Marked as Finished");
    load(true);
  };

  const handleDeleteFromBar = async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId) return;
    const result = await removeUserBottle({ userId: publicUserId, bottleId, variantId: variantId ?? selectedRow?.variant_id ?? null });
    if (result.error) { toast.error(`Couldn't remove it: ${result.error}`); logEvent({ eventType: "error", userId: publicUserId, surface: "/social", metadata: { kind: "remove_bottle_failed", message: result.error } }); return; }
    setSelectedRow(null);
    setSelectedOwned({ inCollection: false, currentlyOwned: false });
    toast.success("Removed from collection");
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-ivory border-b border-charcoal z-20 flex items-center justify-center" style={{ top: "env(safe-area-inset-top)" }}>
        <h1 className="text-base font-semibold text-charcoal">Social</h1>
      </header>

      <div className="max-w-md mx-auto" data-coach="social.feed">
        {isLoading && rows.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">Loading activity...</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-gray-500 px-6 py-12">
            No activity yet. Have a drink or add a bottle to get the feed started.
          </p>
        ) : (
          <div className="pt-3">
            {rows.map((item) => (
              <ActivityCard
                key={item.id}
                item={item}
                viewerId={publicUserId ?? null}
                onCheer={handleCheer}
                onOpenBottle={(bottleId) => openBottle(bottleId)}
              />
            ))}
            {hasMore && (
              <div className="p-4 text-center">
                <button
                  type="button"
                  onClick={() => load(false)}
                  disabled={isLoadingMore}
                  className="text-sm text-gray-600 underline disabled:opacity-50"
                >
                  {isLoadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Toaster position="top-center" style={{ top: "calc(56px + env(safe-area-inset-top))" }} />

      {selectedBottle && (
        <BottleDetailView
          bottle={selectedBottle}
          onClose={() => setSelectedBottle(null)}
          inCollection={selectedOwned.inCollection}
          currentlyOwned={selectedOwned.currentlyOwned}
          initialVariantId={selectedRow?.variant_id ?? null}
          publicUserId={publicUserId ?? undefined}
          onAddToBar={handleAddToBar}
          onToggleOwnership={handleToggleOwnership}
          onDeleteFromBar={handleDeleteFromBar}
          onActivityLogged={() => load(true)}
        />
      )}
    </>
  );
}
