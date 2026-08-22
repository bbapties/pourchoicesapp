"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { type TourStep } from "@/lib/coaches";

type Rect = { top: number; left: number; width: number; height: number };

function readAnchor(anchor: string): Rect | null {
  const el = document.querySelector(`[data-coach="${anchor}"]`) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function TourPlayer({
  steps,
  onSkip,
  onComplete,
}: {
  steps: TourStep[];
  onSkip: () => void;
  onComplete: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[index];

  useEffect(() => {
    if (!step) return;
    if (pathname !== step.route) {
      router.push(step.route);
      return;
    }

    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const found = readAnchor(step.anchor);
      if (found) {
        setRect(found);
        return;
      }
      tries += 1;
      if (tries > 25) {
        setRect(null);
        return;
      }
      window.setTimeout(tick, 80);
    };
    setRect(null);
    tick();
    const onResize = () => setRect(readAnchor(step.anchor));
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [step, pathname, router]);

  if (!step) return null;

  const pad = 8;
  const hole = rect
    ? {
        top: Math.max(8, rect.top - pad),
        left: Math.max(8, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const captionOnTop = hole ? hole.top + hole.height > window.innerHeight - 220 : false;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label="Feature tour">
      <div className={`absolute inset-0 ${hole ? "" : "bg-black/50"}`} />
      {hole && (
        <div
          className="absolute border-2 border-white rounded-md pointer-events-none"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      )}

      <div
        className="absolute left-1/2 -translate-x-1/2 w-[min(360px,calc(100%-24px))] bg-white text-black border border-gray-500 rounded-lg p-4 z-[81]"
        style={
          captionOnTop
            ? { top: 16 }
            : hole
              ? { top: Math.min(hole.top + hole.height + 12, window.innerHeight - 200) }
              : { bottom: "calc(80px + env(safe-area-inset-bottom))" }
        }
      >
        <p className="text-sm leading-5">{step.caption}</p>
        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-gray-500 underline"
          >
            Skip
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {index + 1} / {steps.length}
            </span>
            <button
              type="button"
              onClick={() => {
                if (index + 1 >= steps.length) onComplete();
                else setIndex((i) => i + 1);
              }}
              className="px-3 py-1.5 text-sm border border-gray-500 rounded bg-gray-800 text-white"
            >
              {index + 1 >= steps.length ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
