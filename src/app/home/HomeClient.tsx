"use client";

import { useEffect, useState } from "react";
import Shelf from "@/components/home/Shelf";
import ShelfRun from "@/components/home/ShelfRun";
import { SHELVES, type ShelfId } from "@/lib/shelves";

/**
 * The Home screen — "The Cabinet" (#82).
 *
 * Three shelves from the registry, each a shallow box holding a horizontal run of bottles that
 * pages in as you walk along it. Wireframe in the app's own palette; the lit cabinet is Phase 5.
 *
 * Still to come: the 2.5-shelf peek tuning (#89) and picking a bottle up (#90) — tapping a bottle
 * does nothing yet on purpose, because that sheet must be an overlay on this page and never a
 * route, or putting a bottle back would bounce you to the start of every shelf.
 */

type ShelfState = { count: number | null; loading: boolean };

const INITIAL: ShelfState = { count: null, loading: true };

export default function HomeClient({ viewerId }: { viewerId: string }) {
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
  }, [viewerId]);

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
              <ShelfRun shelf={shelf} viewerId={viewerId} />
            )}
          </Shelf>
        );
      })}
    </div>
  );
}
