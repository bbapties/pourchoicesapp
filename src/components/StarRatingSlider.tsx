"use client";

import { useCallback, useRef } from "react";
import { Star } from "lucide-react";

/**
 * Greyscale 0-5 star slider (1-decimal precision). Wireframe control for the
 * Phase 3.1 manual star "guess". Controlled component.
 *
 * WHY THIS IS NOT AN `<input type="range">` (#66).
 * It was one until 2026-09-07, and on an installed iOS PWA it barely worked: testers reported the
 * thumb freezing mid-drag and taking three attempts to move, then working after closing and
 * reopening the sheet. The control only ever renders inside `RatePromptSheet`, which is a Radix
 * Dialog -- and a modal Radix Dialog wraps its content in `react-remove-scroll`, which attaches a
 * non-passive `touchmove` listener and cancels moves it reads as an attempt to scroll the locked
 * page. On iOS a native range thumb follows the finger via exactly that touch stream, so the
 * scroll lock and the slider fight over the same gesture and the slider usually loses.
 *
 * Pointer events plus `touch-action: none` end the fight instead of refereeing it: the browser is
 * told up front that this element never scrolls, so the gesture is never a scroll candidate, and
 * `setPointerCapture` keeps the drag attached to the track even when the finger slides off it.
 * Keep `touch-action: none` on the track -- without it the iOS bug comes straight back.
 */

const MIN = 0;
const MAX = 5;
const STEP = 0.1;

function clampToStep(v: number) {
  const clamped = Math.min(MAX, Math.max(MIN, v));
  // 1 decimal, and free of float dust like 3.9000000000000004.
  return Math.round(clamped / STEP) * STEP;
}

export default function StarRatingSlider({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = ((Math.min(MAX, Math.max(MIN, value)) - MIN) / (MAX - MIN)) * 100;

  const valueFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    return clampToStep(MIN + ratio * (MAX - MIN));
  }, []);

  const applyFromClientX = useCallback(
    (clientX: number) => {
      const next = valueFromClientX(clientX);
      if (next != null && next !== value) onChange(next);
    },
    [onChange, value, valueFromClientX]
  );

  const nudge = (delta: number) => {
    const next = clampToStep(value + delta);
    if (next !== value) onChange(next);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        {/* Star fill visualization (outline row + clipped filled row) */}
        <div className="relative inline-flex">
          <div className="flex gap-1 text-gray-300">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={22} fill="currentColor" strokeWidth={0} />
            ))}
          </div>
          <div
            className="absolute inset-0 overflow-hidden flex gap-1 text-charcoal"
            style={{ width: `${pct}%` }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={22} fill="currentColor" strokeWidth={0} className="flex-shrink-0" />
            ))}
          </div>
        </div>
        <span className="text-base font-semibold tabular-nums text-charcoal">{value.toFixed(1)}</span>
      </div>

      {/* The padding is the touch target: the visible track is 6px, the grabbable band is 40px. */}
      <div
        ref={trackRef}
        role="slider"
        aria-label="Star rating"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={Number(value.toFixed(1))}
        aria-valuetext={`${value.toFixed(1)} of 5 stars`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        className={`relative w-full py-4 select-none outline-none focus-visible:ring-2 focus-visible:ring-charcoal rounded ${
          disabled ? "opacity-50" : "cursor-pointer"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (disabled) return;
          // Capture first: the drag must keep working once the finger leaves the track, and on iOS
          // it routinely does within the first few pixels. `dragging` is the source of truth rather
          // than hasPointerCapture(), so a browser that refuses the capture still gets a drag.
          dragging.current = true;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
          applyFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (disabled || !dragging.current) return;
          applyFromClientX(e.clientX);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* never captured */ }
        }}
        onPointerCancel={() => { dragging.current = false; }}
        onKeyDown={(e) => {
          if (disabled) return;
          const keyed: Record<string, () => void> = {
            ArrowLeft: () => nudge(-STEP),
            ArrowDown: () => nudge(-STEP),
            ArrowRight: () => nudge(STEP),
            ArrowUp: () => nudge(STEP),
            PageDown: () => nudge(-0.5),
            PageUp: () => nudge(0.5),
            Home: () => onChange(MIN),
            End: () => onChange(MAX),
          };
          const handler = keyed[e.key];
          if (!handler) return;
          e.preventDefault();
          handler();
        }}
      >
        <div className="h-1.5 w-full rounded-full bg-gray-300">
          <div className="h-full rounded-full bg-charcoal" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-500 bg-charcoal"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
