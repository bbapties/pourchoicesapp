"use client";

import { useEffect, useState } from "react";
import Shelf from "@/components/home/Shelf";
import ShelfRun from "@/components/home/ShelfRun";
import PickedUpBottle from "@/components/home/PickedUpBottle";
import { Toaster } from "@/components/ui/sonner";
import { logClick, logEvent } from "@/lib/events";
import { SHELVES, type ShelfBottle } from "@/lib/shelves";
import { fetchFeedDefault, fetchMyGraph, saveFeedDefault, type FeedScope } from "@/lib/relationships";

/**
 * The Home screen — "The Cabinet" (#82).
 *
 * Three shelves from the registry, each a shallow box holding a horizontal run of bottles that
 * pages in as you walk along it. Wireframe in the app's own palette; the lit cabinet is Phase 5.
 *
 * Picking a bottle up (#90) is an OVERLAY ON THIS PAGE, never a route: putting it back has to
 * leave you standing where you were on the shelf, and that only stays true while Home is never
 * unmounted. `pickKey` remounts the shelves after an ownership change, which is the one time the
 * runs are genuinely stale.
 */

type ShelfState = { count: number | null; loading: boolean };

const INITIAL: ShelfState = { count: null, loading: true };

export default function HomeClient({ viewerId }: { viewerId: string }) {
  const [picked, setPicked] = useState<ShelfBottle | null>(null);
  // Bumped only when a bottle's ownership actually changed. Re-mounting the runs is a blunt
  // refresh, but it is rare and it is the honest one: a new bottle belongs at the front of My Bar.
  const [reloadKey, setReloadKey] = useState(0);

  // #111: the Social shelf is the Social tab seen from across the room, so it has the same
  // Following | Everyone switch, remembered on the same users.feed_default.
  const [scope, setScope] = useState<FeedScope | null>(null);
  const [graph, setGraph] = useState<{ following: string[]; muted: string[] } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([fetchMyGraph(viewerId), fetchFeedDefault(viewerId)]).then(([g, sc]) => {
      if (!live) return;
      setGraph(g);
      setScope(sc);
    });
    return () => { live = false; };
  }, [viewerId]);
  const flipScope = () => {
    const next: FeedScope = scope === "following" ? "everyone" : "following";
    setScope(next);
    saveFeedDefault(viewerId, next);
    logClick("feed_tab_changed", { userId: viewerId, surface: "/home", metadata: { tab: next, surface: "home" } });
  };

  const [state, setState] = useState<Record<string, ShelfState>>({
    mybar: INITIAL,
    social: INITIAL,
    verified: INITIAL,
  });

  useEffect(() => {
    let live = true;
    SHELVES.forEach(async (shelf) => {
      const count = await shelf.fetchCount(viewerId);
      if (!live) return;
      setState((s) => ({ ...s, [shelf.id]: { count, loading: false } }));
    });
    return () => {
      live = false;
    };
  }, [viewerId, reloadKey]);

  // One view event carrying how long each shelf actually is. Worth having from day one: it is the
  // only way to tell later whether the shelf ORDER is right, and whether anyone ever reaches the
  // third shelf at all.
  useEffect(() => {
    logEvent({ eventType: "home_view", surface: "/home", userId: viewerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-ivory min-h-full">
      {SHELVES.map((shelf) => {
        const s = state[shelf.id];
        // Empty only once we KNOW it is empty. Saying "your bar is empty" while the count is
        // still in flight tells a new user something false about their own collection.
        const social = shelf.id === "social";
        // In Following mode the plate count is the whole feed's, not the filtered run's, so it
        // comes off rather than lie; empty is decided by the run itself (an empty Following run
        // still shows the shelf, with the switch on it, so you can flip back).
        const isEmpty = !s.loading && (s.count ?? 0) === 0 && !(social && scope === "following");
        const socialOpts = social && scope === "following"
          ? { onlyUserIds: graph?.following ?? [], excludeUserIds: graph?.muted ?? [] }
          : social ? { excludeUserIds: graph?.muted ?? [] } : undefined;
        return (
          <Shelf
            key={shelf.id}
            shelf={shelf}
            count={social && scope === "following" ? null : s.count}
            isEmpty={isEmpty}
            lipRight={social && scope ? (
              <button type="button" className="pc-feed-switch" data-scope={scope} onClick={flipScope} aria-label={`Showing ${scope}. Tap to switch.`} data-coach="home.feed_switch">
                <span className={scope === "following" ? "" : "off"}>Following</span>
                <span className="knob" aria-hidden="true" />
                <span className={scope === "everyone" ? "" : "off"}>Everyone</span>
              </button>
            ) : null}
            onPlateOpen={() =>
              logClick("home_plate", {
                userId: viewerId,
                surface: "/home",
                metadata: { shelf: shelf.id, to: shelf.href, count: s.count },
              })
            }
            onScanFromEmpty={() =>
              logClick("home_scan_empty", { userId: viewerId, surface: "/home",
                metadata: { shelf: shelf.id } })
            }
          >
            {s.loading || (social && (!scope || !graph)) ? null : (
              <ShelfRun
                key={`${shelf.id}:${reloadKey}:${social ? scope : ""}`}
                shelf={shelf}
                viewerId={viewerId}
                fetchOpts={socialOpts}
                onPick={(b) => {
                  // Ghost-vs-real on every pick-up: the share of what people actually touch that
                  // is still a placeholder is the number that says when Home stops being a
                  // wireframe.
                  logClick("home_bottle", {
                    userId: viewerId,
                    surface: "/home",
                    targetId: b.bottleId,
                    metadata: { shelf: shelf.id, image: b.imageState, status: b.status },
                  });
                  setPicked(b);
                }}
              />
            )}
          </Shelf>
        );
      })}

      {picked ? (
        <PickedUpBottle
          bottle={picked}
          viewerId={viewerId}
          onClose={() => setPicked(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
      <Toaster />
    </div>
  );
}
