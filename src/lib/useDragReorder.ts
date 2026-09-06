"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Touch-first drag-to-reorder for a single vertical list.
 *
 * WHY HAND-ROLLED. The only list that needs this is the blind-tasting ranking screen, and the
 * off-the-shelf options (@dnd-kit and friends) cost ~30 KB on a mobile PWA to solve a much more
 * general problem -- multiple containers, collision strategies, virtualization -- none of which
 * applies here. Pointer Events cover touch, mouse and pen in one code path.
 *
 * THE MOBILE PITFALLS THIS EXISTS TO HANDLE, all of which bite on a real phone and none of which
 * show up in a desktop browser:
 *
 *   1. Drag by a HANDLE, never the whole row. If the row itself starts a drag, the list can no
 *      longer be scrolled with a thumb -- every scroll gesture reorders something instead.
 *   2. `touch-action: none` on that handle. Without it the browser claims the gesture for scrolling
 *      and pointermove simply stops firing mid-drag.
 *   3. Pointer capture, so a fast drag that leaves the handle's own box keeps delivering events
 *      instead of silently dropping the item.
 *   4. Edge auto-scroll. Ten rows do not fit on a 375x812 screen, so dragging to a position that is
 *      off-screen is impossible without it -- the reason this matters more at 10 bottles than at 6.
 *   5. Live rects, re-measured on every move. Rows shift under the finger as the list reorders, so
 *      anything cached from pointerdown points at the wrong row within one swap.
 *
 * Reorder is an array MOVE (remove + insert), not a swap: dragging the last item to the top should
 * carry it past the others, not trade places with whatever happens to be there.
 *
 * Callers should keep their existing up/down buttons. This is an accelerator, not a replacement --
 * drag alone is unusable with a screen reader or a keyboard, so the handle is focusable and takes
 * ArrowUp/ArrowDown too.
 */

const EDGE_PX = 72; // how close to a viewport edge before the list starts scrolling itself
const SCROLL_PX = 12; // per animation frame

export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function useDragReorder(opts: {
  count: number;
  onMove: (from: number, to: number) => void;
}) {
  const { count, onMove } = opts;

  // The row currently under the finger. null when idle -- also the flag the render path uses.
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const dragIndexRef = useRef<number | null>(null);
  const pointerYRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const setRowRef = useCallback((i: number) => (el: HTMLElement | null) => {
    rowRefs.current[i] = el;
  }, []);

  /**
   * Which row is the pointer over right now? Measured live, because the rows have already moved
   * if an earlier move in this same drag reordered them.
   */
  const indexAtY = useCallback((y: number): number | null => {
    for (let i = 0; i < count; i++) {
      const el = rowRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return i;
    }
    // Past the ends of the list -- clamp, so dragging beyond the last row still lands.
    const first = rowRefs.current[0]?.getBoundingClientRect();
    const last = rowRefs.current[count - 1]?.getBoundingClientRect();
    if (first && y < first.top) return 0;
    if (last && y > last.bottom) return count - 1;
    return null;
  }, [count]);

  const applyAt = useCallback((y: number) => {
    const from = dragIndexRef.current;
    if (from === null) return;
    const to = indexAtY(y);
    if (to === null || to === from) return;
    onMove(from, to);
    dragIndexRef.current = to;
    setDragIndex(to);
  }, [indexAtY, onMove]);

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Runs only while a drag is active and the finger is parked near an edge. Re-applies the drop
  // target each frame, so the item keeps following as the page slides underneath it.
  const tickAutoScroll = useCallback(() => {
    if (dragIndexRef.current === null) { stopAutoScroll(); return; }
    const y = pointerYRef.current;
    const h = window.innerHeight;
    let dy = 0;
    if (y < EDGE_PX) dy = -SCROLL_PX;
    else if (y > h - EDGE_PX) dy = SCROLL_PX;
    if (dy !== 0) {
      window.scrollBy(0, dy);
      applyAt(y);
    }
    rafRef.current = requestAnimationFrame(tickAutoScroll);
  }, [applyAt, stopAutoScroll]);

  const end = useCallback(() => {
    dragIndexRef.current = null;
    setDragIndex(null);
    stopAutoScroll();
  }, [stopAutoScroll]);

  // Safety net: if the component unmounts mid-drag the rAF loop must not outlive it.
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const handleProps = useCallback((i: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      // Ignore secondary buttons; a right-click should not start a drag.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      // Capture keeps events flowing if the finger outruns the handle (pitfall 3). It can throw
      // if the pointer is already gone, and Safari has historically been picky here -- a failed
      // capture must degrade to a normal drag, never abort it.
      try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* non-fatal */ }
      dragIndexRef.current = i;
      pointerYRef.current = e.clientY;
      setDragIndex(i);
      stopAutoScroll();
      rafRef.current = requestAnimationFrame(tickAutoScroll);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (dragIndexRef.current === null) return;
      e.preventDefault();
      pointerYRef.current = e.clientY;
      applyAt(e.clientY);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onKeyDown: (e: React.KeyboardEvent) => {
      // Keyboard equivalent, so the handle is not a mouse-only control.
      if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); onMove(i, i - 1); }
      else if (e.key === "ArrowDown" && i < count - 1) { e.preventDefault(); onMove(i, i + 1); }
    },
    // See pitfall 2 -- without this the browser scrolls instead of dragging.
    style: { touchAction: "none" as const },
  }), [applyAt, count, end, onMove, stopAutoScroll, tickAutoScroll]);

  return { dragIndex, setRowRef, handleProps };
}
