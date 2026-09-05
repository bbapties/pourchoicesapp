"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  AUTO_COACHES_ENABLED,
  FORCE_REPLAY_KEY,
  CORE_DONE,
  coreItems,
  flattenCoreTour,
  markCoachSeen,
  unseenAnnounce,
  type CoachItem,
  type TourStep,
} from "@/lib/coaches";
import TourPlayer from "@/components/TourPlayer";
import WhatsNewSheet from "@/components/WhatsNewSheet";

const SESSION_KEY = "pc.whatsnew.session";

export default function CoachHost() {
  const { publicUserId, seenCoachIds, setSeenCoachIds, loading } = useCurrentUser();
  const pathname = usePathname();
  const isAuthPage = pathname === "/";
  const started = useRef(false);

  const [tour, setTour] = useState<TourStep[] | null>(null);
  const [digest, setDigest] = useState<CoachItem[] | null>(null);
  const digestHold = useRef<CoachItem[] | null>(null);

  const persist = useCallback(
    async (add: string[]) => {
      if (!publicUserId) return;
      const next = await markCoachSeen({
        userId: publicUserId,
        seen: seenCoachIds,
        add,
      });
      setSeenCoachIds(next);
    },
    [publicUserId, seenCoachIds, setSeenCoachIds]
  );

  useEffect(() => {
    if (loading || !publicUserId || isAuthPage || started.current) return;
    started.current = true;

    // Profile > "Replay tutorial" sets this right before reloading. Consume it once, so an
    // explicit request still plays even while the automatic behaviours are switched off.
    let forcedReplay = false;
    try {
      forcedReplay = sessionStorage.getItem(FORCE_REPLAY_KEY) === "1";
      if (forcedReplay) sessionStorage.removeItem(FORCE_REPLAY_KEY);
    } catch {
      // Private mode: fall through to the normal (currently disabled) path.
    }

    // Kill switch for the auto-play tour and the What's new digest. See coaches.ts for why.
    if (!AUTO_COACHES_ENABLED && !forcedReplay) return;

    if (!seenCoachIds.includes(CORE_DONE)) {
      const steps = flattenCoreTour();
      if (steps.length) setTour(steps);
      return;
    }

    if (typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY)) return;
    const pending = unseenAnnounce(seenCoachIds);
    if (pending.length) {
      if (typeof window !== "undefined") sessionStorage.setItem(SESSION_KEY, "1");
      setDigest(pending);
    }
  }, [loading, publicUserId, isAuthPage, seenCoachIds]);

  const finishCore = async () => {
    setTour(null);
    await persist([CORE_DONE, ...coreItems().map((c) => c.id)]);
  };

  const dismissDigest = async () => {
    const items = digestHold.current || digest || [];
    setDigest(null);
    digestHold.current = null;
    if (items.length) await persist(items.map((c) => c.id));
  };

  const showMe = (item: CoachItem) => {
    if (!item.tour.length) return;
    digestHold.current = digest;
    setDigest(null);
    setTour(item.tour);
  };

  const finishShowMe = () => {
    setTour(null);
    const held = digestHold.current;
    digestHold.current = null;
    if (held && held.length) setDigest(held);
  };

  if (isAuthPage) return null;

  return (
    <>
      {tour && (
        <TourPlayer
          key={tour.map((s) => s.anchor).join("|")}
          steps={tour}
          onSkip={digestHold.current ? finishShowMe : finishCore}
          onComplete={digestHold.current ? finishShowMe : finishCore}
        />
      )}
      {digest && !tour && (
        <WhatsNewSheet
          open
          items={digest}
          onShowMe={showMe}
          onDismiss={dismissDigest}
        />
      )}
    </>
  );
}

export function unseenAnnounceRoutes(seenCoachIds: string[]): Set<string> {
  return new Set(unseenAnnounce(seenCoachIds).map((c) => c.route));
}
