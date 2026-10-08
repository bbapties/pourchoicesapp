"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import Medal from "@/components/badges/Medal";
import BadgeSprite from "@/components/badges/BadgeSprite";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { fetchPendingReveals, markRevealed, revealKind, type RevealItem } from "@/lib/badgeReveal";
import { howToEarn, toGo } from "@/lib/badgeCopy";
import { logClick } from "@/lib/events";
import { fetchLadderSteps, tierFrame, tierStars, tierLabel, type LadderStep } from "@/lib/badgeArt";

/**
 * The badge reveal (Brian, 2026-09-21). Next time the app is in front with a session - an organic
 * open, a notification tap, a tab coming back - anything released and not yet revealed plays:
 * the screen behind darkens like picking a bottle off the Home shelf, a plate sits in focus (the grey
 * locked plate for a new badge, the old metal on an upgrade), holds, shakes, bursts, and the earned
 * medal drops in; a leather tray below carries what happened, the copy and the buttons - Close, or More details (the badge sheet on Profile). More than one: "1 of X", Next,
 * and Reveal all (no animation, a scrollable list in the tray).
 * Mounted ONCE, in AppShell. `pc:badge-check` (runAwards) re-asks the moment something is earned.
 *
 * Seen-state is `user_badges.revealed_tier` in the DB (badgeReveal.ts) - never the device.
 * Close on 1 of 3 marks all three seen: a nag is worse than a missed reveal, the shelf has them.
 * Never over a tasting, and never on the auth page. Reduced motion: no shake, no burst.
 *
 * Three moments, three sets of words (Brian, 2026-10-08; `revealKind`): a new badge, a star
 * toward the current level, a move up to a new level. Before the burst the headline names the
 * moment and the tray says which badge; after it the headline is the badge's name and the tray
 * says what changed, what the badge is for and what the next rung takes. No line says the same
 * thing twice. The headline sits on a brass ribbon so it reads over the darkened room.
 */

/** Before the burst: the headline names the moment... */
function momentHeadline(kind: ReturnType<typeof revealKind>): string {
  if (kind.kind === "new") return "New badge";
  if (kind.kind === "level") return "Level up";
  return kind.stars > 1 ? "Stars earned" : "Star earned";
}

/** ...and the tray says which badge, without repeating it. */
function momentLine(kind: ReturnType<typeof revealKind>, name: string): string {
  if (kind.kind === "new") return "One you haven't earned before. Tap Reveal to see it.";
  if (kind.kind === "level") return `Your ${name} badge has a new look. Tap Reveal to see it.`;
  return `On your ${name} badge. Tap Reveal to see it.`;
}

/** After the burst: the tray title says what changed. */
function resultTitle(kind: ReturnType<typeof revealKind>, frameName: string): string {
  if (kind.kind === "new") return "New badge unlocked";
  if (kind.kind === "level") return `Moved up to ${frameName}`;
  return kind.stars > 1 ? `You earned ${kind.stars} stars` : "You earned a star";
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

/** Under the tray title on a star or a level-up: "2nd star received" on Wood, "Bronze Level - 2nd
 * star received" above it, just "Gold Level" on a plate with no stars (version-1 badges). */
function rankLine(frame: string, frameName: string, stars: number): string {
  if (!stars) return `${frameName} Level`;
  const got = `${ORDINAL[stars] ?? `${stars}th`} star received`;
  return frame === "wood" ? got.charAt(0).toUpperCase() + got.slice(1) : `${frameName} Level - ${got}`;
}

const FRAME_NAME: Record<string, string> = { locked: "Locked", wood: "Wood", bronze: "Bronze", silver: "Silver", gold: "Gold", diamond: "Diamond", limited: "Limited Edition" };

const HOLD_MS = 3000; // the plate sits in your hand a few seconds before it shakes (Brian)
const MEDAL = 286; // 200 -> 260 -> 286 (Brian, 2026-09-21)
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
  const [steps, setSteps] = useState<Map<string, LadderStep> | null>(null);
  useEffect(() => { fetchLadderSteps().then(setSteps); }, []);

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

  const label = (it: RevealItem) => (it.def.oneOff ? "One-off" : tierLabel(steps, it.def.ladderVersion, it.tier));
  const kind = revealKind(item, steps);
  const frame = tierFrame(steps, item.def.ladderVersion, item.tier, item.def.oneOff, item.def.id);
  const frameName = FRAME_NAME[frame];
  const stars = tierStars(steps, item.def.ladderVersion, item.tier, item.def.oneOff);
  // the footer names the next milestone: a star on the same plate, or the next plate (Brian, 2026-10-08)
  const nextFrame = item.next ? tierFrame(steps, item.def.ladderVersion, item.next.tier, item.def.oneOff, item.def.id) : null;
  const goal = nextFrame && nextFrame !== frame ? "Level up your badge" : kind.kind === "new" ? "Earn a star" : "Earn another star";
  const nextLine = item.def.oneOff ? null
    : item.next ? `Next Milestone = ${goal} - ${toGo(item.def, Math.max(0, item.next.threshold - item.progress))}`
    : "You've reached the top of the ladder.";

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
          <RevealList items={queue.slice(i)} onDetails={details} onDone={() => finish(queue.slice(i), "reveal_all")} label={label} steps={steps} />
        </div>
      ) : (
        <>
          {/* the medal, in focus, in the upper half of the room */}
          <div className="absolute inset-x-0 top-0 flex flex-col items-center justify-center pointer-events-none" style={{ height: "62%", paddingTop: 24 }}>
            {/* the headline is the point of the screen (Brian): big, bold, brass */}
            <div className="pc-ribbon-wrap mb-6 mx-4 max-w-full">
              <p className="pc-ribbon font-display font-black text-[26px] leading-tight uppercase tracking-[.08em] text-center px-10 py-2">
                {phase === "burst" ? item.def.name : momentHeadline(kind)}
              </p>
            </div>
            {/* before the burst a tap skips ahead; after it, the medal itself goes to the details */}
            <button type="button" onClick={() => (phase === "burst" ? details(item) : setPhase("burst"))} className="relative pointer-events-auto" aria-label={phase === "burst" ? `${item.def.name} - more details` : "Reveal"}>
              {phase !== "burst" ? (
                <div className={phase === "shake" ? "pc-shake-long" : ""}>
                  <Medal tier={item.revealedTier} glyph={item.def.glyph} frame={tierFrame(steps, item.def.ladderVersion, item.revealedTier, item.def.oneOff, item.def.id)} initial={item.def.category} size={MEDAL} badgeId={item.def.id} oneOff={item.def.oneOff} mystery={!item.upgrade} />
                </div>
              ) : (
                <div className={reduced ? "" : "pc-pop"}>
                  <Medal tier={item.tier} glyph={item.def.glyph} stars={tierStars(steps, item.def.ladderVersion, item.tier, item.def.oneOff)} frame={tierFrame(steps, item.def.ladderVersion, item.tier, item.def.oneOff, item.def.id)} initial={item.def.category} size={MEDAL} badgeId={item.def.id} oneOff={item.def.oneOff} title={item.def.name} />
                </div>
              )}
            </button>
            {phase !== "burst" && <p className="mt-5 text-[11px] text-cream-mute drop-shadow">Tap to skip</p>}
          </div>

          {/* the tray: name, how it is earned, the buttons */}
          <div className={tray}>
            {phase === "burst" ? (
              <div className="pc-pop">
                <h2 className="font-display text-2xl font-bold text-cream text-center">{resultTitle(kind, frameName)}</h2>
                {kind.kind !== "new" && !item.def.oneOff && <p className="text-[13px] text-cream-mute text-center mt-1">{rankLine(frame, frameName, stars)}</p>}
                <p className="text-cream text-[14px] leading-snug max-w-[34ch] mx-auto text-center mt-2.5">{howToEarn(item.def)}</p>
                {nextLine && <p className="text-brass-hi text-[13px] text-center text-balance mt-2 tabular-nums">{nextLine}</p>}
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
                <p className="text-cream text-[15px] leading-snug max-w-[30ch] mx-auto text-center">{momentLine(kind, item.def.name)}</p>
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
function RevealList({ items, onDetails, onDone, label, steps }: { items: RevealItem[]; onDetails: (it: RevealItem) => void; onDone: () => void; label: (it: RevealItem) => string; steps: Map<string, LadderStep> | null }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ul className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pb-3">
        {items.map((it) => (
          <li key={it.def.id} className="pc-inset rounded-xl px-3 py-2.5 flex items-center gap-3">
            <Medal tier={it.tier} glyph={it.def.glyph} stars={tierStars(steps, it.def.ladderVersion, it.tier, it.def.oneOff)} frame={tierFrame(steps, it.def.ladderVersion, it.tier, it.def.oneOff, it.def.id)} initial={it.def.category} size={66} badgeId={it.def.id} oneOff={it.def.oneOff} />
            <div className="min-w-0 flex-1 text-left">
              <div className="font-display font-semibold text-cream leading-tight">{it.def.name}</div>
              <div className="text-[11px] uppercase tracking-[.06em] text-cream-faint">{momentHeadline(revealKind(it, steps))} · {label(it)}</div>
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
