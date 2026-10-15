"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ScanLine, Wine } from "lucide-react";
import Shelf from "@/components/home/Shelf";
import ShelfRun from "@/components/home/ShelfRun";
import PickedUpBottle from "@/components/home/PickedUpBottle";
import { Toaster } from "@/components/ui/sonner";
import { logClick, logEvent } from "@/lib/events";
import { countFriendOwned, countFriendWishlist, SHELVES, type ShelfBottle, type ShelfPerson } from "@/lib/shelves";
import { fetchFeedDefault, fetchFollowing, fetchMyGraph, saveFeedDefault, type FeedScope, type PersonRow } from "@/lib/relationships";

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

const FRIEND_SHELVES = new Set(["friendsbar", "friendswish"]);

type FriendNotice = { title: string; body: string; cta?: { label: string; href: string } };

/** What the friend shelf says when it is not showing bottles. */
function friendNotice(kind: "bar" | "wish", friends: PersonRow[], pick: string, count: number | null, loading: boolean): FriendNotice | null {
  if (friends.length === 0) {
    return kind === "bar"
      ? {
          title: "No friends yet.",
          body: "Follow people, and their bar stands on this shelf.",
          cta: { label: "Find people", href: "/social" },
        }
      : {
          title: "No friends yet.",
          body: "Follow people, and the bottles they want show up here.",
          cta: { label: "Find people", href: "/social" },
        };
  }
  if (pick === "prompt") {
    return kind === "bar"
      ? { title: "Whose bar?", body: "Open the list on this shelf and pick a friend, or choose All." }
      : { title: "Whose wishlist?", body: "Open the list and pick a friend, or choose All to see every want." };
  }
  if (!loading && count === 0) {
    if (pick === "all") {
      return kind === "bar"
        ? { title: "Every friend's bar is empty.", body: "A quiet cabinet. Someone should crack a seal." }
        : { title: "No wishes on the shelf.", body: "Your friends are keeping their wants to themselves." };
    }
    const name = friends.find((f) => f.userId === pick)?.username ?? "Your friend";
    return kind === "bar"
      ? { title: `${name}'s bar is empty.`, body: "Either the good stuff is already in a glass, or the shelf was never stocked." }
      : { title: `${name} isn't wishing.`, body: "An empty wishlist. They might already own everything they want." };
  }
  return null;
}

export default function HomeClient({ viewerId }: { viewerId: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<ShelfBottle | null>(null);
  // Bumped only when a bottle's ownership actually changed. Re-mounting the runs is a blunt
  // refresh, but it is rare and it is the honest one: a new bottle belongs at the front of My Bar.
  const [reloadKey, setReloadKey] = useState(0);

  // #111: the Social shelf is the Social tab seen from across the room, so it has the same
  // Following | Everyone switch, remembered on the same users.feed_default.
  const [scope, setScope] = useState<FeedScope | null>(null);
  const [graph, setGraph] = useState<{ following: string[]; muted: string[] } | null>(null);
  // null until the people you follow have loaded. One friend is selected for you; two or more
  // wait on the list. Each shelf remembers its own choice.
  const [friends, setFriends] = useState<PersonRow[] | null>(null);
  const [barPick, setBarPick] = useState("prompt");
  const [wishPick, setWishPick] = useState("prompt");
  useEffect(() => {
    let live = true;
    Promise.all([fetchMyGraph(viewerId), fetchFeedDefault(viewerId), fetchFollowing(viewerId)]).then(([g, sc, people]) => {
      if (!live) return;
      setGraph(g);
      setScope(sc);
      setFriends(people);
      const initial = people.length === 1 ? people[0].userId : "prompt";
      setBarPick(initial);
      setWishPick(initial);
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
    friendsbar: INITIAL,
    friendswish: INITIAL,
    social: INITIAL,
    verified: INITIAL,
  });

  useEffect(() => {
    let live = true;
    SHELVES.forEach(async (shelf) => {
      if (FRIEND_SHELVES.has(shelf.id)) return;
      const count = await shelf.fetchCount(viewerId);
      if (!live) return;
      setState((s) => ({ ...s, [shelf.id]: { count, loading: false } }));
    });
    return () => {
      live = false;
    };
  }, [viewerId, reloadKey]);

  useEffect(() => {
    if (!friends) return;
    let live = true;
    setState((s) => ({
      ...s,
      friendsbar: { count: null, loading: true },
      friendswish: { count: null, loading: true },
    }));
    const load = async (id: "friendsbar" | "friendswish", pick: string) => {
      if (friends.length === 0 || pick === "prompt") {
        if (live) setState((s) => ({ ...s, [id]: { count: null, loading: false } }));
        return;
      }
      const ids = pick === "all" ? friends.map((f) => f.userId) : [pick];
      const count = id === "friendsbar" ? await countFriendOwned(ids) : await countFriendWishlist(ids);
      if (live) setState((s) => ({ ...s, [id]: { count, loading: false } }));
    };
    void load("friendsbar", barPick);
    void load("friendswish", wishPick);
    return () => { live = false; };
  }, [friends, barPick, wishPick, reloadKey]);

  // One view event carrying how long each shelf actually is. Worth having from day one: it is the
  // only way to tell later whether the shelf ORDER is right, and whether anyone ever reaches the
  // third shelf at all.
  useEffect(() => {
    logEvent({ eventType: "home_view", surface: "/home", userId: viewerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-panel min-h-full">
      {/* The cabinet's top trim: a slim ebony rail that stays put while the shelves scroll under
          it. Drink at the far left (a pour or a blind, two taps from anywhere on Home), the name
          engraved in the brass in the middle, the scanner at the far right. AppShell clears 40px. */}
      <header
        className="fixed top-0 left-0 right-0 h-10 pc-wood pc-rail-bottom z-20 shadow-[0_6px_14px_rgba(0,0,0,.55)] flex items-center justify-between px-2"
        style={{ top: "env(safe-area-inset-top)" }}
      >
        <Link
          href="/taste"
          aria-label="Have a drink or start a blind tasting"
          data-coach="home.drink"
          className="w-10 h-10 flex items-center justify-center text-brass-hi"
          onClick={() => logClick("home_drink_trim", { userId: viewerId, surface: "/home" })}
        >
          <Wine size={20} aria-hidden="true" />
        </Link>
        <span className="font-display text-base font-black tracking-[.2em] uppercase pc-brass-text select-none">Pour Choices</span>
        <Link
          href="/search?scan=1"
          aria-label="Scan a barcode"
          data-coach="home.scan"
          className="w-10 h-10 flex items-center justify-center text-brass-hi"
          onClick={() => logClick("home_scan_trim", { userId: viewerId, surface: "/home" })}
        >
          <ScanLine size={20} aria-hidden="true" />
        </Link>
      </header>

      {SHELVES.map((shelf) => {
        const s = state[shelf.id] ?? INITIAL;
        // Empty only once we KNOW it is empty. Saying "your bar is empty" while the count is
        // still in flight tells a new user something false about their own collection.
        const social = shelf.id === "social";
        const friendKind = shelf.id === "friendsbar" ? "bar" as const : shelf.id === "friendswish" ? "wish" as const : null;
        const pick = shelf.id === "friendsbar" ? barPick : shelf.id === "friendswish" ? wishPick : "";
        const notice = friendKind && friends ? friendNotice(friendKind, friends, pick, s.count, s.loading) : null;
        const chosen = friendKind && friends && pick !== "prompt" && friends.length > 0
          ? (pick === "all" ? friends : friends.filter((f) => f.userId === pick))
          : [];
        const directory: ShelfPerson[] | null = pick === "all"
          ? chosen.map((f) => ({ userId: f.userId, username: f.username, avatarUrl: f.avatarUrl }))
          : null;
        const person = friendKind && pick !== "all" && pick !== "prompt" ? friends?.find((f) => f.userId === pick) : undefined;
        // In Following mode the plate count is the whole feed's, not the filtered run's, so it
        // comes off rather than lie; empty is decided by the run itself (an empty Following run
        // still shows the shelf, with the switch on it, so you can flip back).
        const isEmpty = !friendKind && !s.loading && (s.count ?? 0) === 0 && !(social && scope === "following");
        const socialOpts = social && scope === "following"
          ? { onlyUserIds: graph?.following ?? [], excludeUserIds: graph?.muted ?? [] }
          : social ? { excludeUserIds: graph?.muted ?? [] } : undefined;
        const friendOpts = chosen.length
          ? { friendIds: chosen.map((f) => f.userId), friendDirectory: directory }
          : undefined;
        return (
          <Shelf
            key={shelf.id}
            shelf={shelf}
            count={social && scope === "following" ? null : s.count}
            isEmpty={isEmpty}
            notice={notice}
            hrefOverride={friendKind ? (person ? `/u/${encodeURIComponent(person.username)}` : "") : undefined}
            lipRight={social && scope ? (
              <button type="button" className="pc-feed-switch" data-scope={scope} onClick={flipScope} aria-label={`Showing ${scope}. Tap to switch.`} data-coach="home.feed_switch">
                <span className={scope === "following" ? "" : "off"}>Following</span>
                <span className="knob" aria-hidden="true" />
                <span className={scope === "everyone" ? "" : "off"}>Everyone</span>
              </button>
            ) : friendKind && friends && friends.length > 0 ? (
              <select
                className="pc-friend-select"
                aria-label={friendKind === "bar" ? "Choose a friend's bar" : "Choose a friend's wishlist"}
                value={pick === "prompt" ? "" : pick}
                onChange={(e) => {
                  const next = e.target.value || "prompt";
                  if (friendKind === "bar") setBarPick(next);
                  else setWishPick(next);
                  logClick("home_friend_pick", { userId: viewerId, surface: "/home", metadata: { shelf: shelf.id, pick: next } });
                }}
              >
                {pick === "prompt" ? <option value="">Choose a friend</option> : null}
                <option value="all">All</option>
                {friends.map((f) => (
                  <option key={f.userId} value={f.userId}>{f.username}</option>
                ))}
              </select>
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
            {notice || s.loading || (social && (!scope || !graph)) ? null : (
              <ShelfRun
                key={`${shelf.id}:${reloadKey}:${social ? scope : ""}:${pick}`}
                shelf={shelf}
                viewerId={viewerId}
                fetchOpts={social ? socialOpts : friendOpts}
                onPickUser={(b) => {
                  const who = b.owner ?? (b.post ? { userId: b.post.userId, username: b.post.username } : null);
                  if (!who) return;
                  logClick("home_bottle_user", { userId: viewerId, surface: "/home", targetId: who.userId, metadata: { shelf: shelf.id } });
                  router.push(`/u/${encodeURIComponent(who.username)}`);
                }}
                onPick={(b) => {
                  // Ghost-vs-real on every pick-up: the share of what people actually touch that
                  // is still a placeholder is the number that says when Home stops being a
                  // wireframe.
                  logClick("home_bottle", {
                    userId: viewerId,
                    surface: "/home",
                    targetId: b.bottleId,
                    metadata: { shelf: shelf.id, image: b.imageState, status: b.status, post: !!b.post },
                  });
                  // #113: a Social-shelf bottle IS a post - open it. Other shelves pick the bottle up.
                  if (b.post) router.push(`/post/${b.post.activityId}`);
                  else setPicked(b);
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
