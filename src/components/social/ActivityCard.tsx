"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import UserAvatar from "@/components/UserAvatar";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import { formatFeedTime, type ActivityRow } from "@/lib/activities";
import { fetchPodium, type FeedItem, type PodiumGlass } from "@/lib/social";

// The big activity card (#109). One shared frame - who · verb · when on top, Cheers · Comment
// underneath, the whole thing opening the post - and a different body per action. The card
// shows the OUTCOME (what happened, the rating, the first line of the note, who won); the
// detail shows the reasoning (the full note, the full podium, the comments).

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
};

/** The verb line. The body names the bottle, so the verb never repeats it - it would truncate. */
export function verbFor(row: ActivityRow, groupSize = 1): string {
  switch (row.action) {
    case "drank":
      return row.pourType === "neat" ? "had a pour, neat"
        : row.pourType === "rocks" ? "had a pour on the rocks"
        : row.pourType === "mixed" ? "had a pour, mixed"
        : "had a pour";
    case "tasted":
      return "finished a blind tasting";
    case "finished":
      return "finished a bottle";
    case "added_to_collection":
      return groupSize > 1 ? `added ${groupSize} bottles to their bar` : "added a bottle to their bar";
    case "wishlisted":
      return groupSize > 1 ? `wants ${groupSize} bottles` : "added to their wishlist";
    default:
      return row.action.replace(/_/g, " ");
  }
}

export default function ActivityCard({ item, viewerId, onCheer, onOpenBottle, onOpenUser, detail = false, onComment }: Props) {
  const group = item.group ?? [item];
  const href = `/post/${item.id}`;

  const openBottle = (e: React.MouseEvent, row: ActivityRow) => {
    if (!onOpenBottle) return;
    e.preventDefault();
    e.stopPropagation();
    onOpenBottle(row.bottleId, row.variantId ?? null);
  };

  const body = (() => {
    switch (item.action) {
      case "drank":
        return <PourBody item={item} detail={detail} onOpenBottle={openBottle} />;
      case "tasted":
        return <BlindBody item={item} detail={detail} />;
      case "finished":
        return <SmallBody rows={[item]} onOpenBottle={openBottle} caption={item.details?.stars != null ? <Stars value={item.details.stars} /> : null} />;
      case "added_to_collection":
      case "wishlisted":
        return <SmallBody rows={group} onOpenBottle={openBottle} />;
      default:
        return <SmallBody rows={[item]} onOpenBottle={openBottle} />;
    }
  })();

  return (
    <article className="border border-gray-300 rounded-lg bg-white mx-4 mb-3 overflow-hidden" data-coach="social.card">
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <button
          type="button"
          onClick={() => onOpenUser?.(item.userId, item.username)}
          className="flex items-center gap-2.5 min-w-0 text-left"
          aria-label={`@${item.username}`}
        >
          <UserAvatar username={item.username} avatarUrl={item.avatarUrl} size={36} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-charcoal truncate">@{item.username}</div>
            <div className="text-[13px] text-gray-600 truncate">{verbFor(item, group.length)}</div>
          </div>
        </button>
        <span className="ml-auto text-xs text-gray-400 shrink-0">{formatFeedTime(item.createdAt)}</span>
      </div>

      {detail ? <div>{body}</div> : <Link href={href} className="block">{body}</Link>}

      <div className="flex border-t border-gray-200">
        <button
          type="button"
          onClick={() => onCheer(item)}
          disabled={!viewerId}
          className={`flex-1 h-11 flex items-center justify-center gap-1.5 text-[13px] font-medium disabled:opacity-50 ${item.viewerCheered ? "text-black" : "text-charcoal"}`}
          aria-pressed={item.viewerCheered}
          data-coach="social.cheers"
        >
          <CheersIcon filled={item.viewerCheered} />
          Cheers
          {item.cheers > 0 && <span className="text-gray-500 font-normal">{item.cheers}</span>}
        </button>
        {detail ? (
          <button
            type="button"
            onClick={onComment}
            className="flex-1 h-11 flex items-center justify-center gap-1.5 text-[13px] font-medium text-charcoal border-l border-gray-200"
          >
            <CommentIcon />
            Comment
            {item.comments > 0 && <span className="text-gray-500 font-normal">{item.comments}</span>}
          </button>
        ) : (
          <Link
            href={href}
            className="flex-1 h-11 flex items-center justify-center gap-1.5 text-[13px] font-medium text-charcoal border-l border-gray-200"
          >
            <CommentIcon />
            Comment
            {item.comments > 0 && <span className="text-gray-500 font-normal">{item.comments}</span>}
          </Link>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- bodies

function PourBody({ item, detail, onOpenBottle }: { item: FeedItem; detail: boolean; onOpenBottle: (e: React.MouseEvent, row: ActivityRow) => void }) {
  const photo = item.details?.photo_url ?? null;
  const note = item.details?.note ?? null;
  const stars = item.details?.stars ?? null;
  const how = item.pourType === "neat" ? "Neat" : item.pourType === "rocks" ? "Rocks" : item.pourType === "mixed" ? "Mixed" : null;

  if (detail) {
    return (
      <div className="px-3.5 pb-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="w-full max-h-[320px] object-cover rounded-md border border-gray-300 mb-3" />
        ) : null}
        <BottleLine item={item} onOpenBottle={onOpenBottle} big />
        <div className="flex items-center gap-2 mt-2">
          {how && <Chip>{how}</Chip>}
          {stars != null && <Stars value={stars} />}
        </div>
        {note && <p className="text-sm leading-relaxed text-gray-800 mt-3 whitespace-pre-wrap">{note}</p>}
      </div>
    );
  }

  return (
    <div className="flex gap-3.5 px-3.5 pb-3">
      <button
        type="button"
        onClick={(e) => onOpenBottle(e, item)}
        className="w-[104px] h-[104px] rounded-md border border-gray-300 bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center"
        aria-label={item.bottleName}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : item.bottleImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.bottleImageUrl} alt="" className="w-full h-full object-contain p-1" />
        ) : (
          <BottlePlaceholderImage />
        )}
      </button>
      <div className="min-w-0 flex flex-col gap-1.5">
        <BottleLine item={item} onOpenBottle={onOpenBottle} />
        <div className="flex items-center gap-2">
          {how && <Chip>{how}</Chip>}
          {stars != null && <Stars value={stars} />}
        </div>
        {note && (
          <p className="text-[13px] leading-snug text-gray-700" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {note}
          </p>
        )}
      </div>
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

  const n = count ?? podium?.length ?? null;
  const headline = n ? `Blind-tasted ${n} bottle${n === 1 ? "" : "s"}` : "Blind tasting";

  return (
    <div className="px-3.5 pb-3.5 flex flex-col gap-3">
      <div className="text-[15px] font-semibold text-charcoal">{headline}</div>
      {podium === undefined ? (
        <div className="h-[120px]" />
      ) : podium === null ? (
        <div className="text-sm text-gray-600">
          <span className="font-medium text-charcoal">{item.bottleName}</span> came out on top.
          {!item.sessionId && <span className="block text-xs text-gray-400 mt-1">Ranking not available for this tasting.</span>}
        </div>
      ) : detail ? (
        <ol className="flex flex-col divide-y divide-gray-200 border border-gray-200 rounded-md">
          {podium.map((g) => (
            <li key={g.rank} className="flex items-center gap-3 px-3 py-2.5">
              <span className={`w-6 text-center text-sm ${g.rank === 0 ? "font-semibold text-charcoal" : "text-gray-400"}`}>{g.rank + 1}</span>
              <div className="w-8 h-12 shrink-0 flex items-center justify-center">
                {g.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.imageUrl} alt="" className="max-w-full max-h-full object-contain" />
                ) : (
                  <BottlePlaceholderImage />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm truncate ${g.rank === 0 ? "font-semibold" : "font-medium"} text-charcoal`}>{g.name}</div>
                {g.distillery && <div className="text-xs text-gray-500 truncate">{g.distillery}</div>}
                {g.notes && (g.notes.nose || g.notes.palate || g.notes.finish) && (
                  <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                    {g.notes.nose && <div><span className="text-gray-400">Nose</span> {g.notes.nose}</div>}
                    {g.notes.palate && <div><span className="text-gray-400">Taste</span> {g.notes.palate}</div>}
                    {g.notes.finish && <div><span className="text-gray-400">Finish</span> {g.notes.finish}</div>}
                  </div>
                )}
              </div>
              {g.glassLetter && <span className="text-xs text-gray-400">Glass {g.glassLetter}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <Podium glasses={podium} />
      )}
      {!detail && podium && (
        <div className="text-xs text-gray-500 flex items-center justify-between">
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
    <div className="flex items-end justify-center gap-5 pt-1 pb-2 border-b border-gray-200">
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
                <div style={{ height: h, width: h * 0.32 }} className={`rounded-sm bg-gray-300 ${win ? "" : "opacity-60"}`} />
              )}
            </div>
            <span className={`text-[11px] text-center leading-tight ${win ? "font-semibold text-charcoal" : "text-gray-400"}`}>
              {win ? `1st · ${g.name}` : ordinal(g.rank + 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SmallBody({ rows, onOpenBottle, caption }: { rows: ActivityRow[]; onOpenBottle: (e: React.MouseEvent, row: ActivityRow) => void; caption?: React.ReactNode }) {
  const shown = rows.slice(0, 4);
  return (
    <div className="flex items-end gap-3 px-3.5 pb-3">
      <div className="flex items-end gap-2">
        {shown.map((r) => (
          <button key={r.id} type="button" onClick={(e) => onOpenBottle(e, r)} className="w-7 h-12 flex items-end justify-center" aria-label={r.bottleName}>
            {r.bottleImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.bottleImageUrl} alt="" className="max-h-12 max-w-full object-contain" />
            ) : (
              <div className="w-4 h-11 rounded-sm bg-gray-300" />
            )}
          </button>
        ))}
      </div>
      <div className="min-w-0 pb-1">
        <div className="text-xs text-gray-600 leading-snug" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {rows.map((r) => r.bottleName).join(", ")}
        </div>
        {caption}
      </div>
    </div>
  );
}

function BottleLine({ item, onOpenBottle, big = false }: { item: FeedItem; onOpenBottle: (e: React.MouseEvent, row: ActivityRow) => void; big?: boolean }) {
  return (
    <button type="button" onClick={(e) => onOpenBottle(e, item)} className="text-left min-w-0">
      <div className={`${big ? "text-[17px]" : "text-[15px]"} font-semibold leading-tight text-charcoal`}>{item.bottleName}</div>
      {item.bottleDistillery && <div className="text-xs text-gray-500 mt-0.5">{item.bottleDistillery}</div>}
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
                <stop offset={`${fill * 100}%`} stopColor="#2F2F2F" />
                <stop offset={`${fill * 100}%`} stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.5 6.4 20.4l1.1-6.3L3 9.7l6.2-.9z"
              fill={`url(#st-${size}-${i}-${fill})`}
              stroke="#2F2F2F"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center h-[22px] px-2 rounded-full border border-charcoal text-[11px] font-medium text-charcoal bg-white">{children}</span>;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function CheersIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#2F2F2F" : "none"} stroke="#2F2F2F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3h8l-1 9a3 3 0 0 1-6 0z" />
      <path d="M12 15v5" />
      <path d="M9 20h6" />
      {!filled && <path d="M8 7h8" />}
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F2F2F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
