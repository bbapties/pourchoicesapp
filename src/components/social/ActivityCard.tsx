"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import WhoWhatPill from "@/components/social/WhoWhatPill";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import { EarmarkCorner } from "@/components/BottleCard";
import { formatFeedTime, type ActivityRow } from "@/lib/activities";
import { fetchPodium, type FeedItem, type PodiumGlass } from "@/lib/social";
import { logClick } from "@/lib/events";

// The big activity card (#109). One shared frame - who · verb · when on top, Cheers · Comment
// underneath, the whole thing opening the post - and a different body per action. The card
// shows the OUTCOME (what happened, the rating, the first line of the note, who won); the
// detail shows the reasoning (the full note, the full podium, the comments).
//
// What the eye lands on, doom-scrolling (Brian, 2026-09-21) - in this order:
//   1. a PHOTO, on any action: edge to edge, the post is the picture (PhotoBody)
//   2. a bottle ADDED to a bar, then one EMPTIED: the pack shot big, on a shelf (ShelfBody)
//   3. a BLIND tasting: the podium (BlindBody)
//   4. a POUR with no photo: compact, they happen all the time (PourBody)
// The header says WHO did WHAT ("added a bottle", "emptied a bottle", "had a pour"); how they
// took it (neat / rocks) is a small tag in the body, never the verb.

type Props = {
  item: FeedItem;
  viewerId: string | null;
  onCheer: (item: FeedItem) => void;
  /** Tap the bottle (image or name) - opens the bottle sheet where the host page has one. */
  onOpenBottle?: (bottleId: string, variantId: string | null) => void;
  /** Tap the person. Wired to the user page in step 5. */
  onOpenUser?: (userId: string, username: string) => void;
  /** Rendered inside the detail view: no link wrapper, full note, no clamp. */
  detail?: boolean;
  /** Detail view only: Comment focuses the compose box instead of navigating. */
  onComment?: () => void;
  /** Rolled-up card: any tap (body, Cheers, Comment) splits it into its members instead. */
  onExpand?: (item: FeedItem) => void;
};

/** The verb line: the ACTION, never the method. The body names the bottle, so the verb never repeats it. */
export function verbFor(row: ActivityRow, groupSize = 1): string {
  switch (row.action) {
    case "drank":
      return "had a pour";
    case "tasted": {
      const n = row.details?.count ?? null;
      return n ? `blind-tasted ${n} bottle${n === 1 ? "" : "s"}` : "finished a blind tasting";
    }
    case "finished":
      return "emptied a bottle";
    case "added_to_collection":
      return groupSize > 1 ? `added ${groupSize} bottles to their bar` : "added a bottle to their bar";
    case "wishlisted":
      return groupSize > 1 ? `wants ${groupSize} bottles` : "wants a bottle";
    default:
      return row.action.replace(/_/g, " ");
  }
}

export default function ActivityCard({ item, viewerId, onCheer, onOpenBottle, onOpenUser, detail = false, onComment, onExpand }: Props) {
  const group = item.group ?? [item];
  const href = `/post/${item.id}`;
  // A rolled-up card speaks for all its members: summed counts, lit if the viewer cheered any.
  // It cannot be reacted to as a whole - every tap on it splits it so reactions land on one post.
  const rolled = group.length > 1 && !detail;
  const cheers = rolled ? group.reduce((n, g) => n + g.cheers, 0) : item.cheers;
  const comments = rolled ? group.reduce((n, g) => n + g.comments, 0) : item.comments;
  const viewerCheered = rolled ? group.some((g) => g.viewerCheered) : item.viewerCheered;
  const expand = () => onExpand?.(item);

  // A rolled card's body is one <button> that splits it, so nothing inside may be a button too.
  const openBottle = rolled || !onOpenBottle ? undefined : (e: React.MouseEvent, row: ActivityRow) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenBottle(row.bottleId, row.variantId ?? null);
  };

  const earmark = group.length === 1 && (item.viewerHadIt || !(item.bottleVerified ?? true));

  // A pour, and an add, keep their own row and hang the photo UNDER it (Brian, 2026-09-21 - the
  // same block of info with and without a picture); the rest lead with the photo.
  const photo = !rolled ? item.details?.photo_url ?? null : null;
  const rowThenPhoto = item.action === "drank" || item.action === "added_to_collection" || item.action === "finished" || item.action === "wishlisted";
  const body = photo && !rowThenPhoto ? (
    <PhotoBody item={item} photo={photo} detail={detail} onOpenBottle={openBottle} />
  ) : (() => {
    switch (item.action) {
      case "drank":
        return <PourBody item={item} detail={detail} onOpenBottle={openBottle} />;
      case "tasted":
        return <BlindBody item={item} detail={detail} />;
      case "finished":
        return photo ? <PourBody item={item} detail={detail} onOpenBottle={openBottle} /> : <ShelfBody rows={[item]} onOpenBottle={openBottle} />;
      case "added_to_collection":
        return photo ? <PourBody item={item} detail={detail} onOpenBottle={openBottle} /> : <ShelfBody rows={group} onOpenBottle={openBottle} />;
      case "wishlisted":
        return photo ? <PourBody item={item} detail={detail} onOpenBottle={openBottle} /> : <ShelfBody rows={group} onOpenBottle={openBottle} />;
      default:
        return <ShelfBody rows={[item]} onOpenBottle={openBottle} />;
    }
  })();

  return (
    <article className="relative pc-leather mb-6 overflow-hidden" data-coach="social.card">
      <span className="pc-rivet" style={{ top: 5, left: 5 }} /><span className="pc-rivet" style={{ bottom: 5, left: 5 }} /><span className="pc-rivet" style={{ bottom: 5, right: 5 }} />
      {/* The viewer's own relationship to this bottle, in the same corner every card wears.
          Grouped adds carry several bottles; the corner speaks for the first. No earmark to
          show - the fourth rivet takes the corner instead (Brian, 2026-09-21). */}
      {earmark ? (
        <EarmarkCorner hadIt={item.viewerHadIt} provisional={!(item.bottleVerified ?? true)} ownedCount={item.viewerOwnedCount} />
      ) : (
        <span className="pc-rivet" style={{ top: 5, right: 5 }} />
      )}
      <div className="flex items-center gap-3 px-3.5 py-2.5 pr-8">
        {/* who · what as the same pill Home wears under a shelf bottle, so the glyphs teach themselves */}
        <WhoWhatPill username={item.username} avatarUrl={item.avatarUrl ?? null} action={item.action} inline onUser={() => onOpenUser?.(item.userId, item.username)} />
        <button
          type="button"
          onClick={() => onOpenUser?.(item.userId, item.username)}
          className="min-w-0 text-left"
          aria-label={`@${item.username}`}
        >
          <div className="text-[16px] font-semibold text-cream truncate">@{item.username}</div>
          <div className="text-[15px] leading-tight text-cream-mute" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{verbFor(item, group.length)}</div>
        </button>
        <span className="ml-auto text-xs text-cream-faint shrink-0">{formatFeedTime(item.createdAt)}</span>
      </div>

      {detail ? <div>{body}</div> : rolled ? (
        <button type="button" onClick={expand} className="block w-full text-left" aria-label={`Show each of the ${group.length} bottles`}>{body}</button>
      ) : <Link href={href} className="block">{body}</Link>}

      <div className="flex pc-leather-foot">
        <button
          type="button"
          onClick={() => (rolled ? expand() : onCheer(item))}
          disabled={!viewerId}
          className={`flex-1 h-11 flex items-center justify-center gap-1.5 text-[13px] font-medium disabled:opacity-50 ${viewerCheered ? "text-brass-hi" : "text-cream-mute"}`}
          aria-pressed={viewerCheered}
          data-coach="social.cheers"
        >
          <CheersIcon filled={viewerCheered} />
          Cheers
          {cheers > 0 && <span className="text-cream-mute font-normal">{cheers}</span>}
        </button>
        {rolled ? (
          <button
            type="button"
            onClick={expand}
            className="flex-1 h-11 flex items-center justify-center gap-1.5 text-[13px] font-medium text-cream border-l border-black/40"
          >
            <CommentIcon />
            Comment
            {comments > 0 && <span className="text-cream-mute font-normal">{comments}</span>}
          </button>
        ) : detail ? (
          <button
            type="button"
            onClick={onComment}
            className="flex-1 h-11 flex items-center justify-center gap-1.5 text-[13px] font-medium text-cream border-l border-black/40"
          >
            <CommentIcon />
            Comment
            {item.comments > 0 && <span className="text-cream-mute font-normal">{item.comments}</span>}
          </button>
        ) : (
          <Link
            href={href}
            className="flex-1 h-11 flex items-center justify-center gap-1.5 text-[13px] font-medium text-cream border-l border-black/40"
          >
            <CommentIcon />
            Comment
            {item.comments > 0 && <span className="text-cream-mute font-normal">{item.comments}</span>}
          </Link>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- bodies

type OpenBottle = ((e: React.MouseEvent, row: ActivityRow) => void) | undefined;

/** A tappable bottle - or, inside a rolled-up card, a plain box (no button in a button). */
function BottleTap({ row, onOpenBottle, className, children }: { row: ActivityRow; onOpenBottle: OpenBottle; className: string; children: React.ReactNode }) {
  if (!onOpenBottle) return <div className={className}>{children}</div>;
  return (
    <button type="button" onClick={(e) => onOpenBottle(e, row)} className={`${className} text-left`} aria-label={row.bottleName}>
      {children}
    </button>
  );
}

function howOf(item: FeedItem): string | null {
  return item.pourType === "neat" ? "Neat" : item.pourType === "rocks" ? "On the rocks" : item.pourType === "mixed" ? "Mixed" : null;
}

/**
 * Tier 1 - a photo, on any action. Edge to edge, 4:5 like every other feed, tap for full screen.
 * The bottle sits under it as a caption: a small pack shot, the name, and what they thought.
 */
function PhotoBody({ item, photo, detail, onOpenBottle }: { item: FeedItem; photo: string; detail: boolean; onOpenBottle: OpenBottle }) {
  const note = item.details?.note ?? null;
  const stars = item.details?.stars ?? null;
  const how = item.action === "drank" ? howOf(item) : null;
  return (
    <div className="pb-3">
      <button type="button" onClick={(e) => openPhoto(e, photo, item)} className="block w-full" aria-label="See the photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt=""
          className={`w-full object-cover border-y border-black/50 ${detail ? "max-h-[70vh]" : "aspect-[4/5] max-h-[460px]"}`}
        />
      </button>
      <div className="flex items-center gap-3 px-3.5 pt-3">
        <BottleTap row={item} onOpenBottle={onOpenBottle} className="w-9 h-12 shrink-0 flex items-end justify-center">
          {item.bottleImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.bottleImageUrl} alt="" className="max-h-12 max-w-full object-contain" />
          ) : (
            <BottlePlaceholderImage />
          )}
        </BottleTap>
        <div className="min-w-0 flex-1">
          <BottleLine item={item} onOpenBottle={onOpenBottle} />
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {stars != null && <Stars value={stars} size={13} />}
          {item.action === "finished" ? <Tag>Empty</Tag> : how ? <Tag>{how}</Tag> : null}
        </div>
      </div>
      {note && (
        detail ? (
          <p className="text-sm leading-relaxed text-cream mt-2.5 px-3.5 whitespace-pre-wrap">{note}</p>
        ) : (
          <p className="text-[13px] leading-snug text-cream mt-2 px-3.5" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {note}
          </p>
        )
      )}
    </div>
  );
}

/**
 * Tier 2 / 3 - added to a bar, or emptied. The pack shot BIG, standing on a lit brick shelf; up
 * to four across for a rolled-up add or wishlist. An empty is the same shelf (Brian: no fading,
 * no Empty tag - the header already says it) with the stars, if they rated it on the way out.
 */
function ShelfBody({ rows, onOpenBottle }: { rows: FeedItem[]; onOpenBottle: OpenBottle }) {
  const shown = rows.slice(0, 4);
  const one = shown.length === 1;
  const first = shown[0];
  const stars = first?.details?.stars ?? first?.posterStars ?? null;
  const h = one ? 150 : shown.length === 2 ? 130 : 112;
  return (
    <div className="pb-3">
      <div className="relative mx-3.5 rounded-md overflow-hidden pc-brick shadow-[inset_0_0_0_1px_rgba(0,0,0,.6),inset_0_-24px_30px_-20px_rgba(0,0,0,.7)]">
        {/* the sconce light on the top courses, as on the Home wall */}
        <div className="absolute inset-x-0 top-0 h-16 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,205,140,.22), rgba(255,205,140,0))" }} />
        <div className="flex items-end justify-center gap-4 px-3 pt-4" style={{ height: h + 28 }}>
          {shown.map((r) => (
            <BottleTap key={r.id} row={r} onOpenBottle={onOpenBottle} className="flex items-end justify-center" >
              <div className="flex items-end justify-center" style={{ height: h, width: one ? 140 : 72 }}>
                {r.bottleImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.bottleImageUrl}
                    alt=""
                    style={{ maxHeight: h }}
                    className="max-w-full object-contain drop-shadow-[0_6px_6px_rgba(0,0,0,.6)]"
                  />
                ) : (
                  <div style={{ height: h * 0.9, width: h * 0.28 }} className="rounded-sm bg-panel-3" />
                )}
              </div>
            </BottleTap>
          ))}
        </div>
        {/* the deck they stand on */}
        <div className="h-3 pc-wood shadow-[0_-3px_6px_rgba(0,0,0,.6)]" />
      </div>
      <div className="px-3.5 pt-2.5">
        {one ? (
          <>
            <BottleLine item={first} onOpenBottle={onOpenBottle} big />
            {stars != null && <div className="mt-1.5"><Stars value={stars} /></div>}
          </>
        ) : (
          <div className="text-[13px] leading-snug text-cream" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {shown.map((r) => r.bottleName).join(" · ")}
            {rows.length > 4 && <span className="text-cream-mute"> · +{rows.length - 4} more</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tier 4 - a pour with no photo. Compact: pours happen all the time, so one quiet row - the
 * bottle, the stars, how they took it in small type, and the first line of the note.
 */
function PourBody({ item, detail, onOpenBottle }: { item: FeedItem; detail: boolean; onOpenBottle: OpenBottle }) {
  const photo = item.details?.photo_url ?? null;
  const note = item.details?.note ?? null;
  const stars = item.details?.stars ?? item.posterStars ?? null;
  const how = howOf(item); // the header already says emptied / added / wants - no tag for those
  return (
    <div className={photo ? "" : "pb-3"}>
      <div className="flex items-center gap-3 px-3.5">
        <BottleTap row={item} onOpenBottle={onOpenBottle} className="w-11 h-14 shrink-0 flex items-end justify-center">
          {item.bottleImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.bottleImageUrl} alt="" className="max-h-14 max-w-full object-contain" />
          ) : (
            <BottlePlaceholderImage />
          )}
        </BottleTap>
        <div className="min-w-0 flex-1">
          <BottleLine item={item} onOpenBottle={onOpenBottle} />
          <div className="flex items-center gap-2 mt-1">
            {stars != null && <Stars value={stars} size={12} />}
            {how && <Tag>{how}</Tag>}
          </div>
        </div>
      </div>
      {note && (
        detail ? (
          <p className="text-sm leading-relaxed text-cream mt-2.5 px-3.5 whitespace-pre-wrap">{note}</p>
        ) : (
          <p className="text-[13px] leading-snug text-cream-mute mt-2 px-3.5" style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {note}
          </p>
        )
      )}
      {photo && (
        <button type="button" onClick={(e) => openPhoto(e, photo, item)} className="block w-full mt-3" aria-label="See the photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" className={`w-full object-cover border-t border-black/50 ${detail ? "max-h-[70vh]" : "aspect-[4/5] max-h-[460px]"}`} />
        </button>
      )}
    </div>
  );
}

/** Open the full-screen photo viewer (<PhotoViewer /> is mounted once, in AppShell). */
function openPhoto(e: React.MouseEvent, url: string, item: FeedItem) {
  e.preventDefault();
  e.stopPropagation();
  logClick("post_photo_opened", { targetId: item.id, surface: "social" });
  window.dispatchEvent(new CustomEvent("pc:photo", { detail: { url, caption: `${item.username} · ${item.bottleName}` } }));
}

/**
 * Full-screen photo (Brian, 2026-09-20). Listens for pc:photo; tap anywhere, the X or Esc to
 * close. Mounted ONCE, in AppShell, so every screen that shows a card (Social, a post, a user
 * page, Home's shelf) shares one overlay.
 */
export function PhotoViewer() {
  const [shot, setShot] = useState<{ url: string; caption: string } | null>(null);
  useEffect(() => {
    const on = (ev: Event) => setShot((ev as CustomEvent).detail);
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") setShot(null); };
    window.addEventListener("pc:photo", on);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pc:photo", on); window.removeEventListener("keydown", esc); };
  }, []);
  // swipe-back closes the photo before anything else (useSwipeBack step 1)
  useEffect(() => {
    if (!shot) return;
    const back = (ev: Event) => { ev.preventDefault(); setShot(null); };
    window.addEventListener("pc:back", back);
    return () => window.removeEventListener("pc:back", back);
  }, [shot]);
  if (!shot) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-3" onClick={() => setShot(null)} role="dialog" aria-label="Photo">
      <button type="button" onClick={(e) => { e.stopPropagation(); setShot(null); }} aria-label="Close" className="absolute top-3 right-3 z-[70] w-10 h-10 rounded-full bg-panel text-cream flex items-center justify-center" style={{ top: "calc(12px + env(safe-area-inset-top))" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.url} alt={shot.caption} className="max-w-full max-h-[85vh] object-contain rounded-md" onClick={(e) => e.stopPropagation()} />
      <div className="mt-3 text-sm text-cream-mute">{shot.caption}</div>
    </div>
  );
}

function BlindBody({ item, detail }: { item: FeedItem; detail: boolean }) {
  const [podium, setPodium] = useState<PodiumGlass[] | null | undefined>(undefined);
  const count = item.details?.count ?? null;

  useEffect(() => {
    let alive = true;
    if (!item.sessionId) {
      setPodium(null);
      return;
    }
    fetchPodium(item.sessionId).then((p) => { if (alive) setPodium(p); });
    return () => { alive = false; };
  }, [item.sessionId]);

  void count;

  return (
    <div className="px-3.5 pb-3.5 flex flex-col gap-3">
      {podium === undefined ? (
        <div className="h-[120px]" />
      ) : podium === null ? (
        <div className="text-sm text-cream-mute">
          <span className="font-medium text-cream">{item.bottleName}</span> came out on top.
          {!item.sessionId && <span className="block text-xs text-cream-faint mt-1">Ranking not available for this tasting.</span>}
        </div>
      ) : detail ? (
        <ol className="flex flex-col divide-y divide-edge border border-edge rounded-md">
          {podium.map((g) => (
            <li key={g.rank} className="flex items-center gap-3 px-3 py-2.5">
              <span className={`w-6 text-center text-sm ${g.rank === 0 ? "font-semibold text-cream" : "text-cream-faint"}`}>{g.rank + 1}</span>
              <div className="w-8 h-12 shrink-0 flex items-center justify-center">
                {g.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.imageUrl} alt="" className="max-w-full max-h-full object-contain" />
                ) : (
                  <BottlePlaceholderImage />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm truncate ${g.rank === 0 ? "font-semibold" : "font-medium"} text-cream`}>{g.name}</div>
                {g.distillery && <div className="text-xs text-cream-mute truncate">{g.distillery}</div>}
                {g.notes && (g.notes.nose || g.notes.palate || g.notes.finish) && (
                  <div className="text-xs text-cream-mute mt-1 space-y-0.5">
                    {g.notes.nose && <div><span className="text-cream-faint">Nose</span> {g.notes.nose}</div>}
                    {g.notes.palate && <div><span className="text-cream-faint">Taste</span> {g.notes.palate}</div>}
                    {g.notes.finish && <div><span className="text-cream-faint">Finish</span> {g.notes.finish}</div>}
                  </div>
                )}
                {g.notes?.swap && (
                  <div className="text-xs text-cream-faint mt-1 italic">
                    Swapped in for {g.notes.swap.from} &mdash; &ldquo;{g.notes.swap.reason}&rdquo;
                  </div>
                )}
              </div>
              {g.glassLetter && <span className="text-xs text-cream-faint">Glass {g.glassLetter}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <Podium glasses={podium} />
      )}
      {!detail && podium && (
        <div className="text-xs text-cream-mute flex items-center justify-between">
          See the full ranking
          <Chevron />
        </div>
      )}
    </div>
  );
}

/** Winner big in the middle, the rest smaller either side, in rank order 2 · 1 · 3 · 4 … */
function Podium({ glasses }: { glasses: PodiumGlass[] }) {
  const sorted = [...glasses].sort((a, b) => a.rank - b.rank);
  const [first, second, third, ...rest] = sorted;
  const order = [second, first, third, ...rest].filter(Boolean) as PodiumGlass[];
  return (
    <div className="flex items-end justify-center gap-5 pt-1 pb-2 border-b border-edge">
      {order.map((g) => {
        const win = g.rank === 0;
        const h = win ? 96 : g.rank < 3 ? 64 : 48;
        return (
          <div key={g.rank} className="flex flex-col items-center gap-1.5" style={{ width: win ? 92 : 56 }}>
            <div className="flex items-end justify-center" style={{ height: h }}>
              {g.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.imageUrl} alt="" style={{ maxHeight: h }} className={`object-contain ${win ? "" : "opacity-60"}`} />
              ) : (
                <div style={{ height: h, width: h * 0.32 }} className={`rounded-sm bg-panel-3 ${win ? "" : "opacity-60"}`} />
              )}
            </div>
            <span className={`text-[11px] text-center leading-tight ${win ? "font-semibold text-cream" : "text-cream-faint"}`}>
              {win ? `1st · ${g.name}` : ordinal(g.rank + 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BottleLine({ item, onOpenBottle, big = false }: { item: FeedItem; onOpenBottle: OpenBottle; big?: boolean }) {
  const inner = (
    <>
      <div className={`${big ? "text-[17px]" : "text-[15px]"} font-semibold leading-tight text-cream`}>{item.bottleName}</div>
      {item.bottleDistillery && <div className="text-xs text-cream-mute mt-0.5">{item.bottleDistillery}</div>}
    </>
  );
  if (!onOpenBottle) return <div className="min-w-0">{inner}</div>;
  return (
    <button type="button" onClick={(e) => onOpenBottle(e, item)} className="text-left min-w-0">
      {inner}
    </button>
  );
}

// ---------------------------------------------------------------- bits

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[2px]" aria-label={`${value} stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id={`st-${size}-${i}-${fill}`} x1="0" x2="1">
                <stop offset={`${fill * 100}%`} stopColor="#d6b565" />
                <stop offset={`${fill * 100}%`} stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.5 6.4 20.4l1.1-6.3L3 9.7l6.2-.9z"
              fill={`url(#st-${size}-${i}-${fill})`}
              stroke="#f6ecd9"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
}

/** The small, quiet tag: how a pour was taken, or Empty. Never louder than the bottle. */
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold tracking-[.1em] uppercase text-cream-faint">{children}</span>;
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center h-[22px] px-2.5 rounded-sm pc-brass text-[11px] font-bold tracking-[.12em] uppercase">{children}</span>;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function CheersIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#f6ecd9" : "none"} stroke="#f6ecd9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3h8l-1 9a3 3 0 0 1-6 0z" />
      <path d="M12 15v5" />
      <path d="M9 20h6" />
      {!filled && <path d="M8 7h8" />}
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f6ecd9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H6l-3 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
