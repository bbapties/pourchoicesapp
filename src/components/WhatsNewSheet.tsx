"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { itemById } from "@/lib/coaches";
import { type Announcement } from "@/lib/announcements";

export default function WhatsNewSheet({
  open,
  items,
  onShowMe,
  onDismiss,
}: {
  open: boolean;
  items: Announcement[];
  onShowMe: (item: Announcement) => void;
  onDismiss: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal"
        style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}
      >
        <SheetHeader className="mb-2">
          <SheetTitle className="text-charcoal text-left">What&apos;s new</SheetTitle>
          <SheetDescription className="text-charcoal text-left">
            {items.length === 1
              ? "A new feature since you were last here."
              : "A few things shipped since you were last here."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 pb-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="border border-gray-400 rounded p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-xs text-gray-600 mt-0.5">{item.body}</div>
              </div>
              {/* Only offer "Show me" when this announcement is linked to a tour that exists.
                  Plain-text announcements have nothing to play. */}
              {!!(item.coachId && itemById(item.coachId)?.tour.length) && (
                <button
                  type="button"
                  onClick={() => onShowMe(item)}
                  className="shrink-0 text-xs px-3 py-1.5 border border-gray-500 rounded"
                >
                  Show me
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="w-full py-3 mb-4 rounded border border-charcoal text-sm font-medium"
          style={{ backgroundColor: "#2F2F2F", color: "#FFFFFF" }}
        >
          Got it
        </button>
      </SheetContent>
    </Sheet>
  );
}
