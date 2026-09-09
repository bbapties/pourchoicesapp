"use client";

import { useEffect, useState } from "react";
import Shelf from "@/components/home/Shelf";
import { SHELVES, type ShelfId } from "@/lib/shelves";

/**
 * The Home screen — "The Cabinet" (#82).
 *
 * At #86 this renders the cabinet's boxes: three shelves from the registry, each with its lit
 * back wall, deck, front lip and label plate, plus the empty state when a run is genuinely empty.
 *
 * The bottles (#87), the horizontal run with its end walls and paging (#88) and the 2.5-shelf
 * peek (#89) are not here yet. Where the run will go, a placeholder names the run's length so the
 * queries stay verifiable on a real phone in the meantime.
 *
 * Counts are fetched per shelf rather than derived from a loaded page: the plate shows the length
 * of the WHOLE run, which is the point of it.
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
    <div style={{ background: "#0b0b0c", minHeight: "100%" }}>
      {SHELVES.map((shelf) => {
        const s = state[shelf.id];
        // Empty only once we KNOW it is empty. Showing "your bar is empty" while the count is
        // still in flight would tell a new user something false about their own collection.
        const isEmpty = !s.loading && (s.count ?? 0) === 0;
        return (
          <Shelf key={shelf.id} shelf={shelf} count={s.count} isEmpty={isEmpty}>
            <div
              style={{
                position: "absolute", left: 0, right: 0, top: 96, zIndex: 3,
                textAlign: "center", fontSize: 12, color: "#4e4e57",
              }}
            >
              {s.loading ? "…" : `${s.count} bottles stand here`}
            </div>
          </Shelf>
        );
      })}
    </div>
  );
}
