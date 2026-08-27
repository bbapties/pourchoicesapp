"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import StarRatingSlider from "./StarRatingSlider";

/**
 * Phase 3.1 post-drink star prompt. Shown after logging a "Have a drink" on a bottle
 * the user hasn't blind-tasted yet, to set/update the manual star guess. Pre-filled
 * with any existing guess; Skip leaves it unchanged.
 */
export default function RatePromptSheet({
  open,
  onOpenChange,
  bottleName,
  initialStars,
  isSaving = false,
  onSave,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottleName: string;
  initialStars: number | null;
  isSaving?: boolean;
  onSave: (stars: number) => void;
  onSkip: () => void;
}) {
  const [stars, setStars] = useState(initialStars ?? 2.5);

  useEffect(() => {
    if (open) setStars(initialStars ?? 2.5);
  }, [open, initialStars]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal"
        style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}
      >
        <SheetHeader>
          <SheetTitle className="text-charcoal">Rate {bottleName}</SheetTitle>
          <SheetDescription className="text-charcoal opacity-70">
            Your gut rating until you blind-taste it. You can change it anytime.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-6">
          <StarRatingSlider value={stars} onChange={setStars} disabled={isSaving} />
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onSkip}
            disabled={isSaving}
            className="flex-1 rounded-lg border border-charcoal py-2.5 text-sm font-medium text-charcoal disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => onSave(stars)}
            disabled={isSaving}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#2F2F2F" }}
          >
            {isSaving ? "Saving..." : "Save rating"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
