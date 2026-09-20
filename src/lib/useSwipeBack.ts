"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Swipe right from the left edge = back, the way Reddit does it (Brian, 2026-09-20).
 *
 * Order of business, so the gesture always does the most local thing first:
 *   1. a `pc:back` event - any overlay that is not a route (the bottle sheet, the photo viewer)
 *      listens and closes itself, calling preventDefault to say "handled";
 *   2. an open Radix dialog / sheet - closed with a synthetic Escape;
 *   3. otherwise the router goes back (only if there is somewhere to go).
 *
 * Native-app friendly: Capacitor's iOS webview has its own edge swipe, so a wrapper can simply
 * not mount this hook. Nothing here assumes a URL bar.
 */
const EDGE_PX = 28;      // the swipe must START this close to the left edge
const MIN_DX = 72;       // and travel at least this far right
const MAX_DY = 48;       // without drifting up or down much
const MAX_MS = 700;      // in one quick motion

export function useSwipeBack(enabled = true) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let start: { x: number; y: number; t: number } | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t && t.clientX <= EDGE_PX ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y), ms = Date.now() - start.t;
      start = null;
      if (dx < MIN_DX || dy > MAX_DY || ms > MAX_MS) return;
      goBack(router);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => { window.removeEventListener("touchstart", onStart); window.removeEventListener("touchend", onEnd); };
  }, [enabled, router]);
}

export function goBack(router: { back: () => void }) {
  // 1. a non-route overlay?
  const ev = new CustomEvent("pc:back", { cancelable: true });
  window.dispatchEvent(ev);
  if (ev.defaultPrevented) return;
  // 2. a Radix dialog / sheet?
  if (document.querySelector('[role="dialog"][data-state="open"]')) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return;
  }
  // 3. the route
  if (window.history.length > 1) router.back();
}
