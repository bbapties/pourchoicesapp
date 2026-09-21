"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import Medal, { TIER_NAME } from "@/components/badges/Medal";
import BadgeSprite from "@/components/badges/BadgeSprite";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { fetchPendingReveals, markRevealed, type RevealItem } from "@/lib/badgeReveal";
import { howToEarn } from "@/lib/badgeCopy";
import { logClick } from "@/lib/events";

/**
 * The badge reveal (Brian, 2026-09-21). Next time the app is in front with a session - an organic
 * open, a notification tap, a tab coming back - anything released and not yet revealed plays:
 * the screen behind darkens like picking a bottle off the Home shelf, a plate sits in focus ("New
 * badge earned" on the grey locked plate; "Badge upgraded" on the old metal), holds, shakes,
 * bursts, and the earned medal drops in; a leather tray below carries the name, the copy and the
 * buttons - Close, or More details (the badge sheet on Profile). More than one: "1 of X", Next,
 * and Reveal all (no animation, a scrollable list in the tray).
 * Mounted ONCE, in AppShell. `pc:badge-check` (runAwards) re-asks the moment something is earned.
 *
 * Seen-state is `user_badges.revealed_tier` in the DB (badgeReveal.ts) - never the device.
 * Close on 1 of 3 marks all three seen: a nag is worse than a missed reveal, the shelf has them.
 * Never over a tasting, and never on the auth page. Reduced motion: no shake, no burst.
 */

const HOLD_MS = 3000; // the plate sits in your hand a few seconds before it shakes (Brian)
const MEDAL = 260; // 30% up from the first cut (Brian, 2026-09-21)
const SHAKE_MS = 1600; // pc-shake-long
const BLOCKED_ROUTES = ["/", "/taste"];

type Phase = "hold" | "shake" | "burst" | "list";

export default function BadgeReveal() {
  const { publicUserId } = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const [queue, setQueue] = useState<RevealItem[] | null>(null);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>("hold");
  const busy = useRef(false);
  const blocked = BLOCKED_ROUTES.includes(pathname);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const check = useCallback(async () => {
    if (!publicUserId || busy.current) return;
    busy.current = true;
    try {
      const pending = await fetchPendingReveals(publicUserId);
      if (pending.length) {
        setQueue(pending);
        setI(0);
        setPhase("hold");
      }
    } finally {
      busy.current = false;
    }
  }, [publicUserId]);

  // ask on sign-in, when the tab comes back to the front, and when the engine says something went up
  useEffect(() => {
    if (!publicUserId || blocked) return;
    void check();
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    const onEarn = () => { void check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pc:badge-check", onEarn);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pc:badge-check", onEarn);
    };
  }, [publicUserId, blocked, check]);

  // choreography: hold -> shake -> burst (the medal stays until the person moves on)
  useEffect(() => {
    if (!queue || phase === "burst" || phase === "list") return;
    if (reduced) { setPhase("burst"); return; }
    const t = setTimeout(() => setPhase(phase === "hold" ? "shake" : "burst"), phase === "hold" ? HOLD_MS : SHAKE_MS);
    return () => clearTimeout(t);
  }, [queue, phase, reduced]);

  if (!queue || !publicUserId || blocked) return null;

  const item = queue[i];
  const left = queue.length - i;
  const finish = (items: RevealItem[], mode: "animated" | "reveal_all" | "dismissed") => {
    void markRevealed(publicUserId, items, mode, queue.length);
    setQueue(null);
  };
  const close = () => {
    logClick("badge_reveal_close", { userId: publicUserId, surface: "reveal", targetId: item.def.id, metadata: { at: i, of: queue.length, phase } });
    // whatever was still queued counts as seen too
    finish(queue.slice(i), phase === "burst" || phase === "list" ? "animated" : "dismissed");
  };
  const next = () => {
    void markRevealed(publicUserId, [item], "animated", queue.length);
    setI(i + 1);
    setPhase("hold");
  };
  const revealAll = () => {
    logClick("badge_reveal_all", { userId: publicUserId, surface: "reveal", metadata: { at: i, of: queue.length } });
    setPhase("list");
  };
  const details = (it: RevealItem) => {
    logClick("badge_reveal_details", { userId: publicUserId, surface: "reveal", targetId: it.def.id });
    finish(queue.slice(i), phase === "list" ? "reveal_all" : "animated");
    router.push(`/profile?badge=${encodeURIComponent(it.def.id)}`);
  };

  const label = (it: RevealItem) => (it.def.oneOff ? "One-off" : TIER_NAME[it.tier]);

  const tray = "absolute inset-x-0 bottom-0 pc-leather rounded-t-2xl px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="New badge">
      <BadgeSprite />
      {/* the room goes dark behind it, like taking a bottle down off the shelf */}
      <button type="button" className="absolute inset-0 w-full h-full bg-black/70" aria-label="Close" onClick={close} />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[calc(12px+env(safe-area-inset-top))] pointer-events-none">
        <span className="text-[11px] uppercase tracking-[.2em] text-cream tabular-nums drop-shadow">
          {phase === "list" ? `${queue.length - i} new` : queue.length > 1 ? `${i + 1} of ${queue.length}` : ""}
        </span>
        <button type="button" onClick={close} aria-label="Close" className="pointer-events-auto w-9 h-9 rounded-md pc-brass flex items-center justify-center">
          <X size={18} />
        </button>
      </div>

      {phase === "list" ? (
        <div className={`${tray} max-h-[80dvh] flex flex-col`}>
          <RevealList items={queue.slice(i)} onDetails={details} onDone={() => finish(queue.slice(i), "reveal_all")} label={label} />
        </div>
      ) : (
        <>
          {/* the medal, in focus, in the upper half of the room */}
          <div className="absolute inset-x-0 top-0 flex flex-col items-center justify-center pointer-events-none" style={{ height: "62%", paddingTop: 24 }}>
            <p className="text-xs uppercase tracking-[.2em] text-cream mb-6 min-h-4 drop-shadow">
              {phase === "burst" ? label(item) : item.upgrade ? "Badge upgraded" : "New badge earned"}
            </p>
            <button type="button" onClick={() => phase !== "burst" && setPhase("burst")} className="relative pointer-events-auto" aria-label={phase === "burst" ? item.def.name : "Reveal"}>
              {phase !== "burst" ? (
                <div className={phase === "shake" ? "pc-shake-long" : ""}>
                  <Medal tier={item.revealedTier} glyph={item.def.glyph} initial={item.def.category} size={MEDAL} badgeId={item.def.id} oneOff={item.def.oneOff} mystery={!item.upgrade} />
                </div>
              ) : (
                <div className={reduced ? "" : "pc-pop"}>
                  <Medal tier={item.tier} glyph={item.def.glyph} stars={item.subTier} initial={item.def.category} size={MEDAL} badgeId={item.def.id} oneOff={item.def.oneOff} title={item.def.name} />
                </div>
              )}
            </button>
            {phase !== "burst" && <p className="mt-5 text-[11px] text-cream-mute drop-shadow">Tap to skip</p>}
          </div>

          {/* the tray: name, how it is earned, the buttons */}
          <div className={tray}>
            {phase === "burst" ? (
              <div className="pc-pop">
                <h2 className="font-display text-2xl font-bold text-cream text-center">{item.def.name}</h2>
                <p className="text-cream text-[14px] leading-snug max-w-[34ch] mx-auto text-center mt-1.5">{howToEarn(item.def)}</p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {left > 1 ? (
                    <button type="button" onClick={next} className="col-span-2 py-3 rounded-lg pc-brass bg-brass text-engrave font-semibold text-sm">Next</button>
                  ) : (
                    <button type="button" onClick={close} className="col-span-2 py-3 rounded-lg pc-brass bg-brass text-engrave font-semibold text-sm">Close</button>
                  )}
                  <button type="button" onClick={() => details(item)} className={`${left > 1 ? "" : "col-span-2"} py-3 rounded-lg border border-brass-line text-cream font-semibold text-sm`}>More details</button>
                  {left > 1 && (
                    <button type="button" onClick={revealAll} className="py-3 rounded-lg border border-brass-line text-cream font-semibold text-sm">Reveal all {left}</button>
                  )}
                </div>
                {left > 1 && (
                  <button type="button" onClick={close} className="w-full mt-3 py-2 text-sm text-cream-mute">Close</button>
                )}
              </div>
            ) : (
              <div>
                <h2 className="font-display text-2xl font-bold text-cream-mute text-center">{item.upgrade ? "Badge upgraded" : "New badge earned"}</h2>
                <p className="text-cream-mute text-[14px] text-center mt-1.5">{item.upgrade ? "Your badge just moved up a tier." : "You earned something."}</p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button type="button" onClick={() => setPhase("burst")} className="col-span-2 py-3 rounded-lg pc-brass bg-brass text-engrave font-semibold text-sm">Reveal</button>
                  {left > 1 && (
                    <button type="button" onClick={revealAll} className="col-span-2 py-3 rounded-lg border border-brass-line text-cream font-semibold text-sm">Reveal all {left}</button>
                  )}
                </div>
                <button type="button" onClick={close} className="w-full mt-3 py-2 text-sm text-cream-mute">Not now</button>
              </div>
            )}
          </div>

          {phase === "burst" && !reduced && <Burst />}
        </>
      )}
    </div>
  );
}

/** Reveal all: every medal at once, scrollable, one Close. */
function RevealList({ items, onDetails, onDone, label }: { items: RevealItem[]; onDetails: (it: RevealItem) => void; onDone: () => void; label: (it: RevealItem) => string }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ul className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pb-3">
        {items.map((it) => (
          <li key={it.def.id} className="pc-inset rounded-xl px-3 py-2.5 flex items-center gap-3">
            <Medal tier={it.tier} glyph={it.def.glyph} stars={it.subTier} initial={it.def.category} size={66} badgeId={it.def.id} oneOff={it.def.oneOff} />
            <div className="min-w-0 flex-1 text-left">
              <div className="font-display font-semibold text-cream leading-tight">{it.def.name}</div>
              <div className="text-[11px] uppercase tracking-[.06em] text-cream-faint">{it.upgrade ? `Upgraded to ${label(it)}` : label(it)}</div>
            </div>
            <button type="button" onClick={() => onDetails(it)} className="text-[12px] text-brass-hi underline underline-offset-4 shrink-0">Details</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDone} className="w-full py-3 rounded-lg pc-brass bg-brass text-engrave font-semibold text-sm">Close</button>
    </div>
  );
}

/** The burst: the blind tasting's confetti, dealt once so re-renders never re-deal it mid-fall. */
function Burst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, k) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.8 + Math.random() * 1.4,
        rot: Math.random() * 360,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        hue: k % 3,
      })),
    [],
  );
  return (
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
  );
}
