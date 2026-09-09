"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import BottleDetailView from "@/components/BottleDetailView";
import { loadBottleDetails } from "@/lib/bottleDetails";
import { addOrRestockUserBottle } from "@/lib/userBottles";
import { logClick } from "@/lib/events";
import type { BottleDetails } from "@/lib/types";
import type { ShelfBottle } from "@/lib/shelves";

/**
 * Picking a bottle up off the shelf (#90, part of #82).
 *
 * THIS IS AN OVERLAY ON HOME. IT MUST NEVER BECOME A ROUTE. Putting a bottle back has to leave you
 * standing exactly where you were on the shelf, as it would in the room — and that falls out for
 * free from an overlay. The moment this becomes a route, every shelf resets to its start when you
 * come back, silently and with nothing to point at. (Leaving Home properly IS a fresh load; that
 * part is intended.)
 *
 * The actions DELEGATE rather than reimplement. Bottle details opens the same
 * `BottleDetailView` every other screen uses, and "Have a drink" opens it with its pour sheet
 * already up — so the pour, the star prompt and the blind-tasting hand-off stay in exactly one
 * place. Home is an entrance to a bottle, not a second copy of it.
 */

export default function PickedUpBottle({
  bottle,
  viewerId,
  onClose,
  onChanged,
}: {
  bottle: ShelfBottle;
  viewerId: string;
  onClose: () => void;
  /** Ownership changed — the shelf behind may now be stale. */
  onChanged?: () => void;
}) {
  const [details, setDetails] = useState<BottleDetails | null>(null);
  const [openDetail, setOpenDetail] = useState<false | "plain" | "pour">(false);
  const [busy, setBusy] = useState(false);

  // Fetched up front so tapping an action never waits: by the time the sheet has finished
  // sliding up, the bottle behind it is already loaded.
  useEffect(() => {
    let live = true;
    void loadBottleDetails(bottle.bottleId, viewerId).then((d) => {
      if (live) setDetails(d);
    });
    return () => {
      live = false;
    };
  }, [bottle.bottleId, viewerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const owned = bottle.status === "owned";
  const isGhost = bottle.imageState !== "ready";

  const addToBar = async () => {
    if (busy) return;
    setBusy(true);
    const res = await addOrRestockUserBottle({
      userId: viewerId,
      bottleId: bottle.bottleId,
      variantId: bottle.variantId,
    });
    setBusy(false);
    if ("error" in res) {
      toast.error("Could not add that to your bar.");
      return;
    }
    logClick("home_add_to_bar", { userId: viewerId, surface: "/home", targetId: bottle.bottleId });
    toast.success(`${bottle.name} added to My Bar`);
    onChanged?.();
    onClose();
  };

  if (openDetail && details) {
    return (
      <BottleDetailView
        bottle={details}
        publicUserId={viewerId}
        initialVariantId={bottle.variantId}
        inCollection={owned}
        currentlyOwned={owned}
        autoOpenPour={openDetail === "pour"}
        onClose={() => {
          setOpenDetail(false);
          onClose();
        }}
        onActivityLogged={onChanged}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label={bottle.name}>
      <button
        className="absolute inset-0 w-full h-full bg-black/60"
        aria-label="Put it back"
        onClick={onClose}
      />

      {/* The bottle, in your hand: big enough that the label is the thing you are looking at. */}
      <div className="absolute inset-x-0 top-0 flex justify-center pointer-events-none"
           style={{ height: "58%", paddingTop: 28 }}>
        {isGhost ? (
          <svg viewBox="0 0 58 180" preserveAspectRatio="xMidYMax meet" style={{ height: "100%" }}
               aria-hidden="true">
            <path
              d="M23 7h12v27c0 8 13 12 13 27v102c0 7-4 10-10 10H20c-6 0-10-3-10-10V61c0-15 13-19 13-27z"
              fill="#F7F7F7" stroke="#2F2F2F" strokeWidth="1.4" strokeDasharray="5 3"
            />
          </svg>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={bottle.imageUrl ?? ""} alt={bottle.name}
               style={{ height: "100%", objectFit: "contain" }} />
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-ivory rounded-t-2xl border-t border-charcoal p-4">
        <h2 className="text-lg font-semibold text-charcoal">{bottle.name}</h2>
        {bottle.distillery ? <p className="text-xs text-gray-500">{bottle.distillery}</p> : null}

        <div className="flex flex-wrap gap-1.5 mt-2">
          {owned ? <Tag>In your bar</Tag> : null}
          {bottle.status === "tasted" ? <Tag>Tasted</Tag> : null}
          {bottle.provisional ? <Tag>Unverified</Tag> : null}
          {isGhost ? <Tag>No shelf image</Tag> : null}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            disabled={!details}
            onClick={() => setOpenDetail("pour")}
            className="col-span-2 py-3 rounded-lg bg-charcoal text-ivory font-semibold text-sm disabled:opacity-50"
          >
            Have a drink
          </button>
          <button
            disabled={!details}
            onClick={() => setOpenDetail("plain")}
            className="py-3 rounded-lg border border-charcoal text-charcoal font-semibold text-sm disabled:opacity-50"
          >
            Bottle details
          </button>
          <button
            disabled={busy || owned}
            onClick={addToBar}
            className="py-3 rounded-lg border border-charcoal text-charcoal font-semibold text-sm disabled:opacity-40"
          >
            {owned ? "In My Bar" : "Add to My Bar"}
          </button>
        </div>

        <button onClick={onClose} className="w-full mt-3 py-2 text-sm text-gray-500">
          Put it back
        </button>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wide font-semibold text-charcoal border border-gray-300 rounded px-2 py-0.5">
      {children}
    </span>
  );
}
