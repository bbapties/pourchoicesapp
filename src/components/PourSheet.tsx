"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { type PourType } from "@/lib/activities";

const POUR_OPTIONS: { type: PourType; label: string; hint: string }[] = [
  { type: "neat", label: "Neat", hint: "Straight, no ice" },
  { type: "rocks", label: "On the rocks", hint: "Over ice" },
  { type: "mixed", label: "Mixed", hint: "In a cocktail" },
  { type: "blind", label: "Blind tasting", hint: "Logs this pour. Blind tastings aren't live yet." },
];

interface PourSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottleName: string;
  isSaving?: boolean;
  onSelect: (pourType: PourType) => void;
}

export default function PourSheet({
  open,
  onOpenChange,
  bottleName,
  isSaving = false,
  onSelect,
}: PourSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal"
        style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-charcoal text-left">Have a drink</SheetTitle>
          <SheetDescription className="text-charcoal text-left">
            How did you have {bottleName}?
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 pb-6">
          {POUR_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              disabled={isSaving}
              onClick={() => onSelect(opt.type)}
              className="w-full text-left border border-gray-400 rounded px-4 py-3 bg-white hover:bg-gray-100 disabled:opacity-50"
              style={{ minHeight: "44px" }}
            >
              <div className="text-sm font-medium text-black">{opt.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{opt.hint}</div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
