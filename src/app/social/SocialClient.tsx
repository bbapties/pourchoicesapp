"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import BottleDetailView from "@/components/BottleDetailView";
import { type BottleDetails } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { isVariantVisibleToViewer } from "@/lib/variants";
import {
  fetchActivityFeed,
  formatFeedAction,
  formatFeedTime,
  logActivity,
  type ActivityRow,
} from "@/lib/activities";
import {
  addOrRestockUserBottle,
  formatLastActivity,
  removeUserBottle,
  type UserBottleRow,
} from "@/lib/userBottles";

const PAGE_SIZE = 40;

const DETAIL_SELECT =
  "bottle_id, bottle_name, bottle_distillery, bottle_category, bottle_style, bottle_barcode, bottle_elo_global, bottle_verified, attr_frontimage_url, attr_backimage_url, attr_age, attr_proof, attr_volume, attr_nose, attr_palate, attr_finish, attr_extras, attr_variant_ids, attr_batch, attr_release_year, attr_store_pick_name, attr_variant_created_by";

function mapDetail(result: any, row?: UserBottleRow | null, viewerIds: (string | null | undefined)[] = []): BottleDetails {
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
        && isVariantVisibleToViewer(v.storePickName, createdBys[i], viewerIds)),
    nose: result.attr_nose,
    palate: result.attr_palate,
    finish: result.attr_finish,
    extras: result.attr_extras,
  };
}

export default function SocialClient() {
  const { publicUserId, authId } = useCurrentUser();
  const [rows, setRows] = useState<ActivityRow[]>([]);
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

    const offset = reset ? 0 : rows.length;
    const { rows: next, error } = await fetchActivityFeed({ offset, limit: PAGE_SIZE });
    if (error) {
      toast.error("Couldn't load activity");
    } else {
      setRows((prev) => (reset ? next : [...prev, ...next]));
      setHasMore(next.length === PAGE_SIZE);
    }

    setIsLoading(false);
    setIsLoadingMore(false);
  }, [rows.length]);

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
    let aid = authId;
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      aid = user?.id ?? aid;
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
    setSelectedBottle(mapDetail(data, row, [aid, uid]));
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
    let q = supabase
      .from("user_bottles")
      .update({ currently_owned: false, updated_at: new Date().toISOString() })
      .eq("user_id", publicUserId)
      .eq("bottle_id", bottleId)
      .eq("currently_owned", true);
    q = vId ? q.eq("variant_id", vId) : q.is("variant_id", null);
    const { error } = await q;
    if (error) { toast.error("Failed to update"); return; }
    await logActivity({ userId: publicUserId, bottleId, action: "finished", variantId: vId });
    setSelectedRow({ ...selectedRow, currently_owned: false, updated_at: new Date().toISOString() });
    setSelectedOwned({ inCollection: true, currentlyOwned: false });
    toast.success("Marked as Finished");
    load(true);
  };

  const handleDeleteFromBar = async (bottleId: string, variantId?: string | null) => {
    if (!publicUserId) return;
    const result = await removeUserBottle({ userId: publicUserId, bottleId, variantId: variantId ?? selectedRow?.variant_id ?? null });
    if (result.error) { toast.error("Failed to remove"); return; }
    setSelectedRow(null);
    setSelectedOwned({ inCollection: false, currentlyOwned: false });
    toast.success("Removed from collection");
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-ivory border-b border-charcoal z-20 flex items-center justify-center">
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
          <div>
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openBottle(row.bottleId)}
                className="w-full text-left flex items-center p-3 border-b border-gray-300 hover:bg-gray-100"
              >
                <div className="w-8 h-14 flex-shrink-0 mr-2 overflow-hidden">
                  {row.bottleImageUrl ? (
                    <img
                      src={row.bottleImageUrl}
                      alt={row.bottleName}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <BottlePlaceholderImage />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{row.bottleName}</h3>
                  <p className="text-sm text-gray-700 truncate">
                    <span className="font-medium">{row.username}</span>
                    {" "}
                    {formatFeedAction(row.action, row.pourType)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatFeedTime(row.createdAt)}</p>
                </div>
              </button>
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

      <Toaster position="top-center" style={{ top: "56px" }} />

      {selectedBottle && (
        <BottleDetailView
          bottle={selectedBottle}
          onClose={() => setSelectedBottle(null)}
          inCollection={selectedOwned.inCollection}
          currentlyOwned={selectedOwned.currentlyOwned}
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
