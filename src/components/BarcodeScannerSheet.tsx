"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { X } from "lucide-react";
import { logEvent } from "@/lib/events";

interface BarcodeScannerSheetProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

/**
 * Only the formats a bottle actually carries. The default reader tries every
 * symbology it knows — QR, PDF417, Aztec, Data Matrix and the rest — and each
 * one costs a pass over every frame. Retail spirits are UPC/EAN; CODE_128 is
 * kept for the occasional shelf or distillery label. Narrowing this is the
 * single biggest win on time-to-scan.
 */
const HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.CODE_128,
    ],
  ],
  // Affordable now that the format list is short, and it's what lets a barcode
  // curved around a bottle or held at an angle resolve at all.
  [DecodeHintType.TRY_HARDER, true],
]);

/**
 * Ask for the REAR camera explicitly and at a high resolution. Passing no
 * constraints lets the browser hand back whatever it likes — often the front
 * camera, often 640x480, which is not enough pixels to resolve the bars on a
 * 750ml label at arm's length.
 */
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
};

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

    // Browsers expose getUserMedia ONLY in a secure context, so on an insecure
    // origin `navigator.mediaDevices` is simply undefined and ZXing throws a
    // TypeError — which used to land in the generic "another app is using it"
    // branch and send you hunting a problem that doesn't exist. Check for it up
    // front and say the true thing instead. (Our LAN QA URL is HTTP, so this is
    // the expected result there, not a bug.)
    const secure = typeof window !== "undefined" && window.isSecureContext;
    if (!secure || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "The camera only works over a secure (https) connection. This is the local test URL — scan from the live site instead."
      );
      logEvent({
        eventType: "error",
        surface: "barcode_scanner",
        metadata: { reason: "insecure_context", origin: window.location.origin },
      });
      return;
    }

    // delayBetweenScanAttempts defaults to 500ms — half a second of doing nothing
    // between looks, which is most of why scanning felt slow. The narrowed format
    // list buys back the CPU to attempt far more often.
    const reader = new BrowserMultiFormatReader(HINTS as Map<DecodeHintType, never>, {
      delayBetweenScanAttempts: 100,
    });
    let controls: { stop: () => void } | null = null;
    let done = false;

    reader
      .decodeFromConstraints(CAMERA_CONSTRAINTS, videoRef.current!, (result, _err, ctrls) => {
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
        // NotReadableError is the ONLY one that actually means "something else has
        // the camera" — hardware in use, or the OS refused to hand it over. The
        // old code showed that message for every failure.
        const message =
          name === "NotAllowedError"
            ? "Camera permission was denied. Enable it in your browser settings and try again."
            : name === "NotFoundError"
            ? "No camera found on this device."
            : name === "NotReadableError"
            ? "Couldn't start the camera. Close any other app that might be using it, then try again."
            : "Couldn't start the camera. Try closing and reopening this screen.";
        setError(message);
        logEvent({
          eventType: "error",
          surface: "barcode_scanner",
          metadata: { reason: name ?? "unknown", origin: window.location.origin },
        });
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
