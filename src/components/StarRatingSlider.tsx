"use client";

import { Star } from "lucide-react";

/**
 * Greyscale 0-5 star slider (1-decimal precision). Wireframe control for the
 * Phase 3.1 manual star "guess". Controlled component.
 */
export default function StarRatingSlider({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const pct = (Math.min(5, Math.max(0, value)) / 5) * 100;

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
      <input
        type="range"
        min={0}
        max={5}
        step={0.1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-charcoal disabled:opacity-50"
        aria-label="Star rating"
      />
    </div>
  );
}
