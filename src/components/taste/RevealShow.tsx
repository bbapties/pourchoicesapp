"use client";

import { useEffect, useMemo, useState } from "react";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";

/**
 * The reveal, as theatre (Brian, 2026-09-13). Last place first: the screen shakes, the bottle
 * pops up with its place in a bubble, shakes again, the next one pops... First place gets the
 * long shake and confetti. Tap anywhere to skip to the list. Pure CSS motion (globals.css
 * `pc-shake` / `pc-pop` / `pc-confetti`), no library.
 */
export type RevealItem = {
  variantId: string;
  name: string;
  distillery: string | null;
  imageUrl?: string | null;
  glassLetter?: string;
};

const SHAKE_MS = 700;
const FIRST_SHAKE_MS = 1600;
const HOLD_MS = 1500;
const CONFETTI_MS = 3200;

export default function RevealShow({ ranked, onDone }: { ranked: RevealItem[]; onDone: () => void }) {
  // index into `ranked` counting DOWN from last place; phase drives the animation classes.
  const [i, setI] = useState(ranked.length - 1);
  const [phase, setPhase] = useState<"shake" | "show" | "confetti">("shake");

  useEffect(() => {
    if (!ranked.length) { onDone(); return; }
    const first = i === 0;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "shake") {
      t = setTimeout(() => setPhase("show"), first ? FIRST_SHAKE_MS : SHAKE_MS);
    } else if (phase === "show") {
      t = setTimeout(() => {
        if (first) setPhase("confetti");
        else { setI(i - 1); setPhase("shake"); }
      }, first ? 400 : HOLD_MS);
    } else {
      t = setTimeout(onDone, CONFETTI_MS);
    }
    return () => clearTimeout(t);
  }, [i, phase, ranked.length, onDone]);

  // Confetti pieces are laid out once so re-renders never re-deal them mid-fall.
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, k) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2 + Math.random() * 1.6,
        rot: Math.random() * 360,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        hue: k % 3,
      })),
    [],
  );

  const b = ranked[i];
  const first = i === 0;
  const place = i + 1;

  return (
    <button
      type="button"
      onClick={onDone}
      aria-label="Skip the reveal"
      className={`fixed inset-0 z-40 bg-panel flex flex-col items-center justify-center text-center px-6 ${phase === "shake" ? (first ? "pc-shake-long" : "pc-shake") : ""}`}
    >
      {phase !== "shake" && b && (
        <div className="pc-pop flex flex-col items-center">
          <div className="relative w-56 h-72 flex items-center justify-center">
            {b.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={b.imageUrl} alt={b.name} className="max-h-full max-w-full object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,.7)]" />
            ) : (
              <div className="w-32 h-64"><BottlePlaceholderImage /></div>
            )}
            <span
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 min-w-12 h-12 px-3 rounded-full pc-brass flex items-center justify-center font-display text-xl font-black"
              aria-label={`Place ${place}`}
            >
              {place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`}
            </span>
          </div>
          <h2 className="font-display text-xl font-bold text-cream mt-7">{b.name}</h2>
          <p className="text-sm text-cream-mute">{[b.distillery, b.glassLetter ? `Glass ${b.glassLetter}` : null].filter(Boolean).join(" · ")}</p>
        </div>
      )}
      {phase === "shake" && (
        <p className="text-xs uppercase tracking-[.2em] text-cream-mute">{first ? "And the winner..." : `${place === ranked.length ? "Last place" : `${place}${place === 2 ? "nd" : place === 3 ? "rd" : "th"} place`}...`}</p>
      )}
      {phase === "confetti" && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          {pieces.map((p, k) => (
            <span
              key={k}
              className="pc-confetti absolute -top-4 block"
              style={{
                left: `${p.left}%`,
                width: p.w,
                height: p.h,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.dur}s`,
                transform: `rotate(${p.rot}deg)`,
                background: p.hue === 0 ? "var(--color-brass-hi)" : p.hue === 1 ? "var(--color-cream)" : "var(--color-brass-lo)",
              }}
            />
          ))}
        </div>
      )}
      <span className="absolute bottom-8 text-[11px] text-cream-faint">Tap to skip</span>
    </button>
  );
}
