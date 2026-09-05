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
  itemById,
  markCoachSeen,
  type TourStep,
} from "@/lib/coaches";
import { fetchUnseenAnnouncements, type Announcement } from "@/lib/announcements";
import TourPlayer from "@/components/TourPlayer";
import WhatsNewSheet from "@/components/WhatsNewSheet";

const SESSION_KEY = "pc.whatsnew.session";

export default function CoachHost() {
  const { publicUserId, seenCoachIds, setSeenCoachIds, loading } = useCurrentUser();
  const pathname = usePathname();
  const isAuthPage = pathname === "/";
  const started = useRef(false);

  const [tour, setTour] = useState<TourStep[] | null>(null);
  const [digest, setDigest] = useState<Announcement[] | null>(null);
  const digestHold = useRef<Announcement[] | null>(null);

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

    // D1: the digest now reads ADMIN-PUBLISHED announcements, not every `announce: true` item in
    // the catalog. That is the whole point -- the catalog reflects what exists in the codebase,
    // which is not the same question as what a person should be told about today.
    void (async () => {
      const pending = await fetchUnseenAnnouncements({
        seenIds: seenCoachIds,
        isNewUser: !seenCoachIds.includes(CORE_DONE),
      });
      if (!pending.length) return;
      if (typeof window !== "undefined") sessionStorage.setItem(SESSION_KEY, "1");
      setDigest(pending);
    })();
  }, [loading, publicUserId, isAuthPage, seenCoachIds]);

  const finishCore = async () => {
    setTour(null);
    await persist([CORE_DONE, ...coreItems().map((c) => c.id)]);
  };

  const dismissDigest = async () => {
    const items = digestHold.current || digest || [];
    setDigest(null);
    digestHold.current = null;
    // Announcement ids go into the same `seen_coach_ids` array as catalog ids -- one list of
    // "things this user has been shown", rather than a second mechanism that can disagree.
    if (items.length) await persist(items.map((a) => a.id));
  };

  const showMe = (item: Announcement) => {
    // An announcement only offers "Show me" when it is linked to a catalog tour; plain text
    // announcements have nothing to play.
    const coach = item.coachId ? itemById(item.coachId) : undefined;
    if (!coach?.tour.length) return;
    digestHold.current = digest;
    setDigest(null);
    setTour(coach.tour);
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

/**
 * D1: announcements are now admin-published rows, not catalog entries, so "which routes have an
 * unseen announcement" is no longer a question the catalog can answer -- an announcement need not
 * correspond to a route at all. Kept as an empty set so the AppShell nav dot simply stops showing,
 * rather than removing a prop across the shell for a hint nothing currently produces.
 */
export function unseenAnnounceRoutes(): Set<string> {
  return new Set<string>();
}
