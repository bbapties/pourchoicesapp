"use client";

import { MAX_PICKS } from "@/lib/tastings";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottleName: string;
  busy?: boolean;
  /** 7.9: contribute a new version (global variant or your store pick). Any state. */
  onAddVariant?: () => void;
  /** Restock a bottle you already own (opens variant picker). Owned state. */
  onAddAnother?: () => void;
  /** Soft delete — moves to Empty Bottles, kept in history. Owned state. */
  onMarkEmpty?: () => void;
  /** Log a pour (neat / rocks / mixed) or start a blind tasting. */
  onHaveADrink?: () => void;
  /** Start a blind tasting pre-seeded with this bottle. */
  onBlindTasting?: () => void;
  /** Hard delete — removes all rows + history. Owned + empty states. */
  onRemove?: () => void;
}

type Row = {
  label: string;
  hint: string;
  onClick?: () => void;
  danger?: boolean;
};

export default function MoreSheet({
  open,
  onOpenChange,
  bottleName,
  busy = false,
  onAddVariant,
  onAddAnother,
  onMarkEmpty,
  onHaveADrink,
  onBlindTasting,
  onRemove,
}: MoreSheetProps) {
  const rows: Row[] = [];
  if (onAddVariant) rows.push({ label: "Add a variant", hint: "A batch, release, or your store pick", onClick: onAddVariant });
  if (onAddAnother) rows.push({ label: "Add another", hint: "You bought another bottle of this", onClick: onAddAnother });
  if (onHaveADrink) rows.push({ label: "Have a drink", hint: "Neat, rocks, mixed, or start a blind tasting", onClick: onHaveADrink });
  if (onBlindTasting) rows.push({ label: "Blind tasting", hint: `Rank this against up to ${MAX_PICKS - 1} others`, onClick: onBlindTasting });
  if (onMarkEmpty) rows.push({ label: "Mark as Empty", hint: "Moves to Empty Bottles, kept in your history", onClick: onMarkEmpty });
  if (onRemove) rows.push({ label: "Remove from collection", hint: "Only if added by mistake — a tasting keeps its rating", onClick: onRemove, danger: true });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal"
        style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-charcoal text-left">More</SheetTitle>
          <SheetDescription className="text-charcoal text-left">
            {bottleName}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 pb-6">
          {rows.map((row) => (
            <button
              key={row.label}
              type="button"
              disabled={busy}
              onClick={row.onClick}
              className="w-full text-left border border-gray-400 rounded px-4 py-3 bg-white hover:bg-gray-100 disabled:opacity-50"
              style={{ minHeight: "44px" }}
            >
              <div className={`text-sm font-medium ${row.danger ? "text-red-600" : "text-black"}`}>{row.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{row.hint}</div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
