"use client";

import { useRef, useState, type ReactNode } from "react";
import { Camera, ImageIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Take a photo or pick one from the library (Brian, 2026-10-08). A bare `accept="image/*"` input
 * goes straight to the gallery on most Android phones, so on a touch device `open()` first asks
 * which one, like most apps do. On a mouse/trackpad there's no camera to offer, so it goes
 * straight to the file picker.
 *
 * Render `picker` anywhere in the component; call `open()` from a tap.
 */
export function usePhotoPicker({
  onPick,
  facing = "environment",
  title = "Add a photo",
}: {
  onPick: (file: File) => void;
  /** Which camera `capture` asks for: the back one for bottles and pours, the front for a selfie. */
  facing?: "environment" | "user";
  title?: string;
}): { open: () => void; picker: ReactNode } {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [choosing, setChoosing] = useState(false);

  const open = () => {
    const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (touch) setChoosing(true);
    else libraryRef.current?.click();
  };

  // The input's click() has to run inside the tap itself, or the browser blocks it, so it fires
  // before the chooser closes.
  const choose = (ref: React.RefObject<HTMLInputElement | null>) => {
    ref.current?.click();
    setChoosing(false);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPick(f);
    e.target.value = "";
  };

  // Visually hidden rather than `display: none`: a file input that isn't rendered can have
  // `capture` ignored on mobile, which lands the user in the library after asking for the camera.
  const hidden = "absolute h-px w-px overflow-hidden opacity-0 -z-10";
  const option =
    "w-full flex items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-3.5 text-[15px] text-cream text-left";

  const picker = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture={facing} tabIndex={-1} aria-hidden="true" className={hidden} onChange={onChange} />
      <input ref={libraryRef} type="file" accept="image/*" tabIndex={-1} aria-hidden="true" className={hidden} onChange={onChange} />
      <Sheet open={choosing} onOpenChange={setChoosing}>
        <SheetContent side="bottom" className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="pb-0">
            <SheetTitle className="text-cream text-left">{title}</SheetTitle>
            <SheetDescription className="sr-only">Take a new photo or choose one from your library.</SheetDescription>
          </SheetHeader>
          <div className="px-4 flex flex-col gap-2">
            <button type="button" className={option} onClick={() => choose(cameraRef)}>
              <Camera className="h-5 w-5 text-brass-hi" /> Take photo
            </button>
            <button type="button" className={option} onClick={() => choose(libraryRef)}>
              <ImageIcon className="h-5 w-5 text-brass-hi" /> Choose from library
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );

  return { open, picker };
}
