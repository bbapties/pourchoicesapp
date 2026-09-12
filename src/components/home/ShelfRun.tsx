"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BottleOnShelf from "@/components/home/BottleOnShelf";
import { SHELF_PAGE_SIZE, type ShelfBottle, type ShelfDef, type ShelfFetchOpts } from "@/lib/shelves";

/**
 * The horizontal run of one shelf (#88, part of #82) — the riskiest piece of the cabinet.
 *
 * A shelf holds its WHOLE list and pages in as you walk along it. No "see all" button: reaching
 * the end of the shelf is the only end state.
 *
 * THE END WALLS BELONG TO THE RUN, NOT THE SCREEN. They are the two ends of a long box you pan
 * along, so they live inside this scroller and move with the bottles: on a run of 47 you see the
 * left wall at rest, it is gone one bottle in, and the right wall does not appear until the last
 * bottle has loaded. The right wall carries `margin-left: auto`, which absorbs slack only when
 * there IS slack — so a short or empty run keeps it pinned to the frame and reads as a closed box,
 * with no branching between the two cases.
 *
 * Three traps, all of them silent, all of them hit while prototyping:
 *   1. `overflow-x: auto` with `overflow-y: visible` computes to `auto` on BOTH axes. Every shelf
 *      becomes a vertical scroller too and the two axes eat each other's drags. Hence
 *      `overflow-y: hidden` in the CSS, and nothing inside is allowed to need vertical overflow.
 *   2. A `touch-action` axis lock breaks the OTHER axis, in both directions. `pan-y` on the
 *      cabinet makes the browser refuse every horizontal drag here; `pan-x` on this run forbids
 *      vertical panning, and since the run covers nearly the whole shelf, that leaves the cabinet
 *      scrollable only by touching its frame. Neither element sets `touch-action` at all: left at
 *      the default the browser picks the dominant axis and chains the other to the ancestor.
 *   3. A mouse has no horizontal wheel, so on desktop there is no gesture at all without
 *      click-and-drag — and that drag must not fire a bottle tap on release.
 */

const DRAG_SLOP = 4;      // px of movement before a press counts as a drag, not a tap
const PREFETCH_PX = 320;  // fetch the next batch this far before the end of what is loaded

export default function ShelfRun({
  shelf,
  viewerId,
  onPick,
  fetchOpts,
}: {
  shelf: ShelfDef;
  viewerId: string;
  onPick?: (b: ShelfBottle) => void;
  /** #111: extra scope for the fetch (Following / muted). Remount the run when it changes. */
  fetchOpts?: Partial<ShelfFetchOpts>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [bottles, setBottles] = useState<ShelfBottle[]>([]);
  const [done, setDone] = useState(false);

  // Refs, not state, because the scroll handler reads them on every frame and must never be
  // re-bound to a stale closure mid-drag.
  const loading = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const doneRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loading.current || doneRef.current) return;
    loading.current = true;
    const page = await shelf.fetchPage({
      ...fetchOpts,
      viewerId,
      cursor: cursorRef.current,
      limit: SHELF_PAGE_SIZE,
    });
    // A page can legitimately come back empty while more rows exist — Social dedupes after
    // reading — so the end of the run is the null cursor, never an empty page.
    setBottles((prev) => {
      const seen = new Set(prev.map((b) => b.key));
      return [...prev, ...page.bottles.filter((b) => !seen.has(b.key))];
    });
    cursorRef.current = page.nextCursor;
    if (page.nextCursor === null) {
      doneRef.current = true;
      setDone(true);
    }
    loading.current = false;
  }, [shelf, viewerId]);

  useEffect(() => {
    void loadMore();
  }, [loadMore]);

  // Page in before the gap is visible, not when it is reached.
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - PREFETCH_PX) void loadMore();
  }, [loadMore]);

  /* ---- desktop click-and-drag; touch pans natively and must be left alone ---- */
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: 0 });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    drag.current = { down: true, startX: e.clientX, startLeft: ref.current?.scrollLeft ?? 0, moved: 0 };
    ref.current?.classList.add("is-dragging");
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.down || !ref.current) return;
    const dx = e.clientX - drag.current.startX;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
    ref.current.scrollLeft = drag.current.startLeft - dx;
  };
  const endDrag = () => {
    drag.current.down = false;
    ref.current?.classList.remove("is-dragging");
  };
  // Capture phase: swallow the click a drag produces before it reaches a bottle.
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved > DRAG_SLOP) {
      e.stopPropagation();
      e.preventDefault();
      drag.current.moved = 0;
    }
  };

  // The run's height comes from the viewport now (#89 sizes a shelf so 2.5 fit), so the end
  // walls have to be measured rather than assumed. Their sloped edges must meet the back wall
  // exactly; a hardcoded height would leave the perspective disagreeing with the box on every
  // screen but one.
  const [wallHeight, setWallHeight] = useState(250);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWallHeight(el.clientHeight));
    ro.observe(el);
    setWallHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="pc-run"
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      {/* Left end wall — the start of the run. Drawn, not clipped, so it can carry a stroke. */}
      <EndWall side="left" height={wallHeight} />

      {bottles.map((b) => (
        <BottleOnShelf key={b.key} bottle={b} onPick={onPick} />
      ))}

      {/* The right wall only exists once the last bottle has arrived — you do not see the end of
          a shelf before you reach it. Until then a placeholder holds the scroll open so the
          prefetch has somewhere to trigger. */}
      {done ? (
        <EndWall side="right" height={wallHeight} />
      ) : (
        <div style={{ flex: "none", width: 58 }} aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * An end wall in one-point perspective: the near edge is full height at the opening, the far edge
 * meets the back wall (12px down from the top panel, 24px up from the deck's front). These two are
 * the ONLY surfaces on the shelf that recede.
 */
function EndWall({ side, height }: { side: "left" | "right"; height: number }) {
  const w = 24;
  const top = 12;                 // back wall's top edge
  const bottom = height - 24;     // back wall's bottom edge = the deck's back edge
  const points =
    side === "left"
      ? `0,0 ${w},${top} ${w},${bottom} 0,${height}`
      : `${w},0 0,${top} 0,${bottom} ${w},${height}`;
  return (
    <svg
      className={`pc-endwall ${side === "right" ? "pc-endwall-r" : ""}`}
      width={w}
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      aria-hidden="true"
    >
      <polygon points={points} fill="#F2F2F2" stroke="#2F2F2F" strokeWidth="1" />
    </svg>
  );
}
