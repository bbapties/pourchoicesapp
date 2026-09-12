"use client";

import { useEffect, useRef, useState } from "react";
import { useDictation } from "@/lib/useDictation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { submitFeedback, type FeedbackType } from "@/lib/feedback";

interface FeedbackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

export default function FeedbackSheet({ open, onOpenChange, userId }: FeedbackSheetProps) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Shared with the pour note (#108): src/lib/useDictation.ts
  const dictation = useDictation(
    (chunk) => setMessage((prev) => (prev ? `${prev.replace(/\s*$/, "")} ${chunk}` : chunk)),
    open,
    () => toast.error("Could not access the microphone."),
  );
  const listening = dictation.listening;
  const speechSupported = dictation.supported;

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (open) {
      setType("bug");
      setMessage("");
      setScreenshot(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!userId) {
      toast.error("You need to be signed in.");
      return;
    }
    if (!message.trim()) {
      toast.error("Add a short description first.");
      return;
    }
    dictation.stop();
    setBusy(true);
    const res = await submitFeedback({ userId, type, message, screenshot });
    setBusy(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.screenshotFailed) {
      toast("Thanks — your report was saved, but the screenshot didn't upload.");
    } else {
      toast.success("Thanks — your feedback was sent.");
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal"
        style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-charcoal text-left">Send feedback</SheetTitle>
          <SheetDescription className="text-charcoal text-left">
            Suggest a feature or report a bug. This goes straight to the team.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(["bug", "feature"] as FeedbackType[]).map((t) => {
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 text-sm rounded border ${
                    active ? "bg-gray-800 text-white border-gray-800" : "bg-white text-black border-gray-400"
                  }`}
                  style={{ minHeight: "44px" }}
                >
                  {t === "bug" ? "Report a bug" : "Suggest a feature"}
                </button>
              );
            })}
          </div>

          {/* Message + dictation */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">
                {type === "bug" ? "What went wrong?" : "What would you like to see?"}
              </label>
              {speechSupported && (
                <button
                  type="button"
                  onClick={dictation.toggle}
                  className={`text-xs px-2 py-1 rounded border ${
                    listening ? "bg-red-600 text-white border-red-600" : "bg-white text-black border-gray-400"
                  }`}
                >
                  {listening ? "● Listening… tap to stop" : "🎤 Speak instead"}
                </button>
              )}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={speechSupported ? "Type here, or tap Speak instead." : "Type here."}
              className="w-full border border-gray-400 rounded px-3 py-2 text-sm text-black"
            />
          </div>

          {/* Screenshot attach */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
            />
            {screenshot ? (
              <div className="flex items-center justify-between border border-gray-400 rounded px-3 py-2">
                <span className="text-xs text-gray-700 truncate">{screenshot.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setScreenshot(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="text-xs text-red-600 underline ml-2 shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full text-left border border-dashed border-gray-400 rounded px-3 py-2 text-sm text-gray-600"
                style={{ minHeight: "44px" }}
              >
                📎 Attach a screenshot (optional)
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleSubmit}
            className="w-full py-3 text-sm font-semibold rounded bg-gray-900 text-white disabled:opacity-50"
            style={{ minHeight: "44px" }}
          >
            {busy ? "Sending…" : "Send feedback"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
