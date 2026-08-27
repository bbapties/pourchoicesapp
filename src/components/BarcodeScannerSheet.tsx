"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X } from "lucide-react";

interface BarcodeScannerSheetProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

/**
 * Full-screen camera barcode scanner (ZXing). Prefers the rear camera, decodes
 * UPC/EAN/etc., and fires `onDetected(code)` once on the first successful read
 * (then stops). Works on iOS Safari + Android Chrome over HTTPS.
 */
export default function BarcodeScannerSheet({ open, onClose, onDetected }: BarcodeScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | null = null;
    let done = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, _err, ctrls) => {
        if (result && !done) {
          done = true;
          ctrls.stop();
          onDetectedRef.current(result.getText());
        }
      })
      .then((c) => {
        controls = c;
        if (done) c.stop(); // detected before the promise resolved
      })
      .catch((e: unknown) => {
        const name = (e as { name?: string } | null)?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Enable it in your browser settings and try again."
            : name === "NotFoundError"
            ? "No camera found on this device."
            : "Couldn't start the camera. Make sure no other app is using it."
        );
      });

    return () => {
      done = true;
      controls?.stop();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">Scan a bottle barcode</span>
        <button onClick={onClose} aria-label="Close scanner" className="p-1">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        {/* Aiming frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-72 h-40 rounded-lg border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {error && (
          <div className="absolute inset-x-0 bottom-0 p-6 bg-black/70 text-white text-sm text-center">
            {error}
          </div>
        )}
      </div>

      <div className="px-4 py-3 text-center text-white/70 text-xs">
        Center the barcode in the frame
      </div>
    </div>
  );
}
