"use client";

import { useEffect, useState } from "react";
import Shelf from "@/components/home/Shelf";
import ShelfRun from "@/components/home/ShelfRun";
import PickedUpBottle from "@/components/home/PickedUpBottle";
import { Toaster } from "@/components/ui/sonner";
import { SHELVES, type ShelfBottle, type ShelfId } from "@/lib/shelves";

/**
 * The Home screen — "The Cabinet" (#82).
 *
 * Three shelves from the registry, each a shallow box holding a horizontal run of bottles that
 * pages in as you walk along it. Wireframe in the app's own palette; the lit cabinet is Phase 5.
 *
 * Picking a bottle up (#90) is an OVERLAY ON THIS PAGE, never a route: putting it back has to
 * leave you standing where you were on the shelf, and that only stays true while Home is never
 * unmounted. `pickKey` remounts the shelves after an ownership change, which is the one time the
 * runs are genuinely stale.
 */

type ShelfState = { count: number | null; loading: boolean };

const INITIAL: ShelfState = { count: null, loading: true };

export default function HomeClient({ viewerId }: { viewerId: string }) {
  const [picked, setPicked] = useState<ShelfBottle | null>(null);
  // Bumped only when a bottle's ownership actually changed. Re-mounting the runs is a blunt
  // refresh, but it is rare and it is the honest one: a new bottle belongs at the front of My Bar.
  const [reloadKey, setReloadKey] = useState(0);

  const [state, setState] = useState<Record<ShelfId, ShelfState>>({
    mybar: INITIAL,
    social: INITIAL,
    verified: INITIAL,
  });

  useEffect(() => {
    let live = true;
    SHELVES.forEach(async (shelf) => {
      const count = await shelf.fetchCount(viewerId);
      if (!live) return;
      setState((s) => ({ ...s, [shelf.id]: { count, loading: false } }));
    });
    return () => {
      live = false;
    };
  }, [viewerId, reloadKey]);

  return (
    <div className="bg-ivory min-h-full">
      {SHELVES.map((shelf) => {
        const s = state[shelf.id];
        // Empty only once we KNOW it is empty. Saying "your bar is empty" while the count is
        // still in flight tells a new user something false about their own collection.
        const isEmpty = !s.loading && (s.count ?? 0) === 0;
        return (
          <Shelf key={shelf.id} shelf={shelf} count={s.count} isEmpty={isEmpty}>
            {s.loading ? null : (
              <ShelfRun
                key={`${shelf.id}:${reloadKey}`}
                shelf={shelf}
                viewerId={viewerId}
                onPick={setPicked}
              />
            )}
          </Shelf>
        );
      })}

      {picked ? (
        <PickedUpBottle
          bottle={picked}
          viewerId={viewerId}
          onClose={() => setPicked(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
      <Toaster />
    </div>
  );
}
