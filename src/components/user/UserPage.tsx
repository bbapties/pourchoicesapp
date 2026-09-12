"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import UserAvatar from "@/components/UserAvatar";
import Shelf from "@/components/home/Shelf";
import ShelfRun from "@/components/home/ShelfRun";
import PickedUpBottle from "@/components/home/PickedUpBottle";
import ActivityCard from "@/components/social/ActivityCard";
import { Stars, Chip } from "@/components/social/ActivityCard";
import ProfileSettingsSheet from "@/components/ProfileSettingsSheet";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { logClick, logEvent } from "@/lib/events";
import { fetchUserFeed, toggleCheer, type FeedItem } from "@/lib/social";
import type { ShelfBottle, ShelfDef } from "@/lib/shelves";
import {
  fetchTop3,
  fetchUserById,
  fetchUserByUsername,
  fetchUserStats,
  userShelves,
  type PublicUser,
  type TopBottle,
  type UserStats,
} from "@/lib/userPage";

// The user page (#110, step 5 of #105). One component for everyone's page and your own:
// `own` swaps the back arrow for the gear, Following for Edit profile, and "Their bar" for
// "My bar". Sections top-down, every one built now with honest placeholder copy where the
// feature behind it has not shipped: header · their bar · Top 3 · what they may like ·
// wishlist · badges · recent activity. Design record: #105 and the mockup canvas.

const ACTIVITY_PAGE = 20;

type Props = { own?: boolean; username?: string };

export default function UserPage({ own = false, username }: Props) {
  const router = useRouter();
  const { publicUserId, loading: viewerLoading } = useCurrentUser();
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [top3, setTop3] = useState<TopBottle[] | null>(null);
  const [shelves, setShelves] = useState<{ bar: ShelfDef; wishlist: ShelfDef; suggested: ShelfDef } | null>(null);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [fetched, setFetched] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [picked, setPicked] = useState<ShelfBottle | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  // Resolve who this page is about.
  useEffect(() => {
    let live = true;
    (async () => {
      let u: PublicUser | null = null;
      if (own) {
        if (viewerLoading) return;
        u = publicUserId ? await fetchUserById(publicUserId) : null;
      } else if (username) {
        u = await fetchUserByUsername(username);
      }
      if (!live) return;
      setUser(u);
      if (u) {
        logEvent({ eventType: "page_view", surface: own ? "/profile" : "/u", userId: publicUserId, targetType: "user_page", targetId: u.id, metadata: { own } });
      }
    })();
    return () => { live = false; };
  }, [own, username, publicUserId, viewerLoading]);

  // Everything else hangs off the resolved user.
  useEffect(() => {
    if (!user) return;
    let live = true;
    const sh = userShelves(user, own);
    setShelves(sh);
    setCounts({});
    Object.values(sh).forEach(async (def) => {
      const c = await def.fetchCount(publicUserId ?? null);
      if (live) setCounts((prev) => ({ ...prev, [def.id]: c ?? 0 }));
    });
    fetchUserStats(user.id).then((s) => live && setStats(s));
    fetchTop3(user.id).then((t) => live && setTop3(t));
    fetchUserFeed({ userId: user.id, offset: 0, limit: ACTIVITY_PAGE, viewerId: publicUserId ?? null }).then((r) => {
      if (!live) return;
      setFeed(r.items);
      setFetched(r.rawCount);
      setHasMore(r.rawCount === ACTIVITY_PAGE);
    });
    return () => { live = false; };
  }, [user, own, publicUserId, reloadKey]);

  const loadMore = async () => {
    if (!user) return;
    const r = await fetchUserFeed({ userId: user.id, offset: fetched, limit: ACTIVITY_PAGE, viewerId: publicUserId ?? null });
    setFeed((prev) => [...prev, ...r.items]);
    setFetched(fetched + r.rawCount);
    setHasMore(r.rawCount === ACTIVITY_PAGE);
  };

  const handleCheer = async (item: FeedItem) => {
    if (!publicUserId) return;
    const on = !item.viewerCheered;
    const patch = (rows: FeedItem[], cheered: boolean, delta: number) =>
      rows.map((r) => (r.id === item.id ? { ...r, viewerCheered: cheered, cheers: Math.max(0, r.cheers + delta) } : r));
    setFeed((prev) => patch(prev, on, on ? 1 : -1));
    logClick(on ? "post_cheered" : "post_uncheered", { userId: publicUserId, targetId: item.id, surface: own ? "/profile" : "/u", metadata: { action: item.action } });
    const res = await toggleCheer(item.id, publicUserId, on);
    if (res.error) {
      setFeed((prev) => patch(prev, !on, on ? -1 : 1));
      toast.error("Couldn't save that");
    }
  };

  const surface = own ? "/profile" : "/u";
  const joined = user ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";

  if (user === null) {
    return (
      <div className="min-h-full">
        <TitleBar title={own ? "Profile" : "Not found"} back={!own} onBack={() => router.back()} />
        <p className="text-center text-sm text-gray-500 px-6 py-16">{own ? "Sign in to see your profile." : "No one by that name."}</p>
      </div>
    );
  }

  return (
    <div className="bg-ivory min-h-full pb-6">
      <TitleBar
        title={user ? `@${user.username}` : ""}
        subtitle={user ? `Joined ${joined}` : ""}
        back={!own}
        onBack={() => router.back()}
        gear={own}
        onGear={() => { setSettingsOpen(true); logClick("profile_settings_opened", { userId: publicUserId, surface }); }}
      />

      {/* Header: avatar left, actions + the two stat lines right. */}
      <div className="px-4 pt-5 pb-1 flex items-center gap-[18px]" data-coach="user.header">
        <div className="relative shrink-0">
          <UserAvatar username={user?.username} avatarUrl={user?.avatarUrl} size={112} />
          {own && (
            <span
              className="absolute right-0.5 bottom-0.5 w-7 h-7 rounded-full bg-gray-900 border-2 border-white flex items-center justify-center text-white"
              title="Photo upload comes in a later step"
              aria-hidden="true"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10-10-4-4L4 16z" /></svg>
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center gap-2.5">
          {own ? (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="h-10 px-[22px] rounded-full border border-charcoal text-sm font-semibold text-charcoal bg-white"
            >
              Edit profile
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              {/* Follow + bell are wired in step 6 (#111); the shape is here so the page reads right. */}
              <button
                type="button"
                onClick={() => toast("Following comes in the next update.")}
                className="h-10 px-[30px] rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: "#111" }}
                data-coach="user.follow"
              >
                Follow
              </button>
              <button
                type="button"
                onClick={() => toast("Per-person notifications come with following.")}
                className="w-10 h-10 rounded-full border border-charcoal bg-white flex items-center justify-center"
                aria-label="Notification settings for this person"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F2F2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              </button>
            </div>
          )}
          <div className="text-[13px] text-gray-600 text-center leading-relaxed">
            <div><b className="font-semibold text-charcoal">{stats?.followers ?? "–"}</b> followers · <b className="font-semibold text-charcoal">{stats?.following ?? "–"}</b> following</div>
            <div><b className="font-semibold text-charcoal">{stats?.tried ?? "–"}</b> tried · <b className="font-semibold text-charcoal">{stats?.blinds ?? "–"}</b> blinds</div>
          </div>
        </div>
      </div>

      {/* Their bar */}
      {shelves && (
        <>
          <SectionHead title={own ? "My bar" : `${user!.username}'s bar`} hint="Recent first" />
          <UserShelf def={shelves.bar} count={counts[shelves.bar.id]} viewerId={publicUserId ?? null} reloadKey={reloadKey} onPick={setPicked} surface={surface} />
        </>
      )}

      {/* Top 3 */}
      <SectionHead title="Top 3" hint="Personal ranking" />
      {top3 === null ? (
        <div className="h-[220px]" />
      ) : top3.length === 0 ? (
        <Plate>{own ? "Pour or blind-taste a few bottles to build your Top 3." : "No ranked bottles yet."}</Plate>
      ) : (
        <div className="px-4 pt-1 pb-2 flex items-end justify-center gap-[26px]" data-coach="user.top3">
          {[top3[1], top3[0], top3[2]].map((b, i) => {
            if (!b) return <div key={i} style={{ width: 96 }} />;
            const win = b === top3[0];
            const h = win ? 124 : i === 0 ? 88 : 76;
            return (
              <div key={b.bottleId} className="flex flex-col items-center" style={{ width: win ? 110 : 96 }}>
                <div className="flex items-end" style={{ height: 124 }}>
                  {b.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.imageUrl} alt="" style={{ maxHeight: h }} className="object-contain" />
                  ) : (
                    <div style={{ height: h, width: h * 0.32 }} className="rounded-sm bg-gray-300" />
                  )}
                </div>
                <div className={`h-4 mt-2 text-[11px] tracking-[.1em] ${win ? "font-semibold text-charcoal" : "text-gray-400"}`}>{win ? 1 : i === 0 ? 2 : 3}</div>
                <div className={`h-8 leading-4 ${win ? "text-[13px]" : "text-xs"} font-semibold text-charcoal text-center max-w-full`} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{b.name}</div>
                <div className="h-[18px] mt-[3px] flex items-center"><Stars value={b.stars} /></div>
                <div className="h-4 mt-1">
                  {b.manual && (
                    <button type="button" onClick={() => { setManualOpen(true); logClick("top3_manual_explained", { userId: publicUserId, surface }); }} className="inline-flex">
                      <Chip>Manual rated</Chip>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* What they may like */}
      {shelves && (
        <>
          <SectionHead title={own ? "What you may like" : "What they may like"} hint={own ? "Based on your top bottles" : "Based on their top bottles"} />
          <UserShelf def={shelves.suggested} count={counts[shelves.suggested.id]} viewerId={publicUserId ?? null} reloadKey={reloadKey} onPick={setPicked} surface={surface} spread />
        </>
      )}

      {/* Wishlist */}
      {shelves && (
        <>
          <SectionHead title="Wishlist" />
          <UserShelf def={shelves.wishlist} count={counts[shelves.wishlist.id]} viewerId={publicUserId ?? null} reloadKey={reloadKey} onPick={setPicked} surface={surface} />
        </>
      )}

      {/* Badges - #21 fills this */}
      <SectionHead title="Badges" />
      <Plate dashed>No badges yet</Plate>

      {/* Recent activity */}
      <SectionHead title="Recent activity" />
      {feed.length === 0 ? (
        <Plate>{own ? "Your pours and tastings will show up here." : "Nothing yet."}</Plate>
      ) : (
        <div className="pt-1">
          {feed.map((item) => (
            <ActivityCard key={item.id} item={item} viewerId={publicUserId ?? null} onCheer={handleCheer} />
          ))}
          {hasMore && (
            <div className="p-4 text-center">
              <button type="button" onClick={loadMore} className="text-sm text-gray-600 underline">Load more</button>
            </div>
          )}
        </div>
      )}

      {picked && publicUserId ? (
        <PickedUpBottle bottle={picked} viewerId={publicUserId} onClose={() => setPicked(null)} onChanged={() => setReloadKey((k) => k + 1)} />
      ) : null}

      {own && (
        <ProfileSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onUsernameChanged={(u) => setUser((prev) => (prev ? { ...prev, username: u } : prev))}
        />
      )}

      {manualOpen && (
        <div className="fixed inset-0 z-40 flex items-end" onClick={() => setManualOpen(false)}>
          <div className="absolute inset-0 bg-black/35" />
          <div className="relative w-full bg-white border-t border-charcoal rounded-t-2xl px-5 pt-3 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="w-9 h-1 rounded bg-gray-300 mx-auto mb-4" />
            <div className="text-base font-semibold text-charcoal mb-1">Manual rated</div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {own
                ? "This rank came from your star rating, not a blind tasting. Blind-taste it to earn a real rank."
                : `This rank came from ${user?.username}'s star rating, not a blind tasting.`}
            </p>
          </div>
        </div>
      )}

      <Toaster position="top-center" style={{ top: "calc(72px + env(safe-area-inset-top))" }} />
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function TitleBar({ title, subtitle, back, onBack, gear, onGear }: { title: string; subtitle?: string; back?: boolean; onBack?: () => void; gear?: boolean; onGear?: () => void }) {
  return (
    <div className="sticky top-0 z-20 h-[72px] bg-ivory border-b border-charcoal flex flex-col items-center justify-center gap-[3px]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {back && (
        <button type="button" onClick={onBack} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2F2F2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      <div className="text-2xl font-semibold text-charcoal leading-none tracking-[-.01em]">{title}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
      {gear && (
        <button type="button" onClick={onGear} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center" aria-label="Settings" data-coach="profile.settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2F2F2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
      )}
    </div>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 pt-[18px] pb-1.5 flex items-baseline justify-between">
      <h2 className="text-[11px] font-semibold uppercase tracking-[.14em] text-charcoal">{title}</h2>
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  );
}

function Plate({ children, dashed = false }: { children: React.ReactNode; dashed?: boolean }) {
  return (
    <div className={`mx-4 rounded-lg px-4 py-[18px] text-center text-xs text-gray-500 border ${dashed ? "border-dashed border-gray-400" : "border-gray-300"} bg-white`}>
      {children}
    </div>
  );
}

/** One shelf of the page. `spread` lays a short run edge to edge (the five suggestions). */
function UserShelf({ def, count, viewerId, reloadKey, onPick, surface, spread = false }: {
  def: ShelfDef; count: number | null | undefined; viewerId: string | null; reloadKey: number;
  onPick: (b: ShelfBottle) => void; surface: string; spread?: boolean;
}) {
  const loading = count === undefined;
  const isEmpty = !loading && (count ?? 0) === 0;
  // An empty shelf on Home is a full cabinet box saying so; here that is 330px of nothing, so an
  // empty run collapses to a plate and the page stays honest without the dead space.
  if (isEmpty) return <Plate>{def.empty.title}{def.empty.body ? ` - ${def.empty.body}` : ""}</Plate>;
  return (
    <div className={spread ? "pc-spread" : undefined}>
      <Shelf shelf={def} count={count ?? null} isEmpty={isEmpty}>
        {loading ? null : (
          <ShelfRun
            key={`${def.id}:${reloadKey}`}
            shelf={def}
            viewerId={viewerId ?? ""}
            onPick={(b) => {
              logClick("user_shelf_bottle", { userId: viewerId, surface, targetId: b.bottleId, metadata: { shelf: def.id.split(":")[0] } });
              onPick(b);
            }}
          />
        )}
      </Shelf>
    </div>
  );
}
