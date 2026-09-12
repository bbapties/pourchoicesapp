"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { type PourType } from "@/lib/activities";
import { useDictation } from "@/lib/useDictation";
import StarRatingSlider from "./StarRatingSlider";

// Have a drink (#108). One sheet: how you had it, an optional gut rating, an optional note
// (typed or dictated), one optional photo, then Pour. Blind tasting is still an exit from
// here - it starts the ranking flow instead of logging a pour.
//
// The rating section replaces the old post-pour RatePromptSheet: same slider, same meaning
// ("your gut rating until you blind-taste it"), one less step. It is hidden once the bottle
// has been blind-tasted, because then the rank is earned and the slider would lie.

const SERVINGS: { type: Exclude<PourType, "blind">; label: string; hint: string }[] = [
  { type: "neat", label: "Neat", hint: "no ice" },
  { type: "rocks", label: "Rocks", hint: "over ice" },
  { type: "mixed", label: "Mixed", hint: "cocktail" },
];

export type PourSubmission = {
  pourType: Exclude<PourType, "blind">;
  stars: number | null;
  note: string | null;
  photo: File | null;
};

interface PourSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottleName: string;
  isSaving?: boolean;
  /** Existing gut rating, pre-fills the slider. */
  initialStars?: number | null;
  /** True once blind-tasted: the rating section is hidden. */
  hasTasted?: boolean;
  onSubmit: (pour: PourSubmission) => void;
  onBlind: () => void;
}

export default function PourSheet({
  open,
  onOpenChange,
  bottleName,
  isSaving = false,
  initialStars = null,
  hasTasted = false,
  onSubmit,
  onBlind,
}: PourSheetProps) {
  const [serving, setServing] = useState<PourSubmission["pourType"] | null>(null);
  const [rate, setRate] = useState(false);
  const [stars, setStars] = useState(initialStars ?? 2.5);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const dictation = useDictation(
    (chunk) => setNote((prev) => (prev ? `${prev.replace(/\s*$/, "")} ${chunk}` : chunk)),
    open,
    () => toast.error("Could not access the microphone."),
  );

  // Fresh form each open; keep the existing gut rating as the starting point.
  useEffect(() => {
    if (!open) return;
    setServing(null);
    setRate(initialStars != null);
    setStars(initialStars ?? 2.5);
    setNote("");
    setPhoto(null);
  }, [open, initialStars]);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const canPour = serving !== null && !isSaving;

  const submit = () => {
    if (!serving) return;
    dictation.stop();
    onSubmit({
      pourType: serving,
      stars: !hasTasted && rate ? stars : null,
      note: note.trim() || null,
      photo,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-charcoal max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}
      >
        <SheetHeader className="mb-3">
          <SheetTitle className="text-charcoal text-left">Have a drink</SheetTitle>
          <SheetDescription className="text-charcoal text-left">{bottleName}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {/* How */}
          <section>
            <Label>How</Label>
            <div className="grid grid-cols-3 gap-2" data-coach="drink.serving">
              {SERVINGS.map((opt) => {
                const on = serving === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    disabled={isSaving}
                    onClick={() => setServing(opt.type)}
                    className={`rounded-lg border px-2 py-2.5 text-sm font-medium disabled:opacity-50 ${
                      on ? "bg-charcoal text-white border-charcoal" : "bg-white text-charcoal border-gray-400"
                    }`}
                    style={{ minHeight: 44 }}
                  >
                    {opt.label}
                    <span className={`block text-[11px] font-normal ${on ? "text-gray-300" : "text-gray-500"}`}>{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Rate it - hidden once blind-tasted */}
          {!hasTasted && (
            <section>
              <div className="flex items-center justify-between">
                <Label optional>Rate it</Label>
                <button
                  type="button"
                  onClick={() => setRate((v) => !v)}
                  className="text-xs text-gray-600 underline underline-offset-2 mb-2"
                >
                  {rate ? "Skip rating" : "Add a rating"}
                </button>
              </div>
              {rate ? (
                <StarRatingSlider value={stars} onChange={setStars} disabled={isSaving} />
              ) : (
                <p className="text-xs text-gray-500">Your gut rating until you blind-taste it.</p>
              )}
            </section>
          )}

          {/* Notes */}
          <section>
            <Label optional>Notes</Label>
            <div className="relative">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Nose, taste, finish - whatever stood out"
                className="w-full border border-gray-400 rounded-lg px-3 py-2 pr-11 text-sm text-black bg-white resize-none"
                disabled={isSaving}
              />
              {dictation.supported && (
                <button
                  type="button"
                  onClick={dictation.toggle}
                  disabled={isSaving}
                  aria-label={dictation.listening ? "Stop dictation" : "Dictate a note"}
                  className={`absolute right-2 bottom-2 w-8 h-8 rounded-full border flex items-center justify-center ${
                    dictation.listening ? "bg-red-600 border-red-600 text-white" : "bg-white border-gray-400 text-charcoal"
                  }`}
                >
                  <MicIcon />
                </button>
              )}
            </div>
            {dictation.listening && <p className="text-xs text-red-600 mt-1">Listening… tap the mic to stop</p>}
          </section>

          {/* Photo - one per pour */}
          <section>
            <Label optional>Photo</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) setPhoto(f);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => fileRef.current?.click()}
                className="w-[88px] h-[88px] rounded-lg border border-dashed border-gray-400 bg-white overflow-hidden flex flex-col items-center justify-center gap-1 text-[11px] text-gray-600"
                aria-label={photo ? "Retake photo" : "Add a photo"}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <CameraIcon />
                    Camera
                  </>
                )}
              </button>
              <div className="text-xs text-gray-500">
                {photo ? (
                  <>
                    One photo per pour.{" "}
                    <button type="button" className="underline underline-offset-2" onClick={() => fileRef.current?.click()}>
                      Retake
                    </button>
                    {" · "}
                    <button type="button" className="underline underline-offset-2" onClick={() => setPhoto(null)}>
                      Remove
                    </button>
                  </>
                ) : (
                  "Compressed on your phone before it uploads."
                )}
              </div>
            </div>
          </section>

          <button
            type="button"
            disabled={!canPour}
            onClick={submit}
            className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: "#2F2F2F", minHeight: 44 }}
            data-coach="drink.pour"
          >
            {isSaving ? "Logging…" : "Pour"}
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={onBlind}
            className="w-full text-center text-sm text-gray-600 underline underline-offset-2 py-1"
          >
            Blind tasting instead
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Label({ children, optional = false }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-charcoal mb-2">
      {children}
      {optional && <span className="ml-1 font-normal normal-case tracking-normal text-gray-400">optional</span>}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
