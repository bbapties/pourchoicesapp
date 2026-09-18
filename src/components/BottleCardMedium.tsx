import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import { EarmarkCorner } from "@/components/BottleCard";

export interface BottleCardMediumData {
  id: string;
  name: string;
  distillery?: string;
  category?: string;
  style?: string;
  proof?: number;
  stars?: number | null;
  /** #80: true when the star is the viewer's own rating rather than the shared one. */
  starIsMine?: boolean;
  image_url?: string;
  addedAt?: string;
  dateLabel?: string;
  provisional?: boolean;
  currentlyOwned?: boolean;
  tasted?: boolean;
  quantity?: number; // B-32: how many (owned on In My Bar, finished on Empty); shown when > 1
  ownedCount?: number; // on hand right now - the digit in the earmark corner
  /** #128: Have-a-drink pours of this whiskey (any version). Blind tastings are not pours. */
  pourCount?: number;
  lastPourAt?: string;
}

function StarRating({ value }: { value: number }) {
  const clamped = Math.min(5, Math.max(0, value));
  const full = Math.floor(clamped);
  const partial = clamped - full;
  const empty = 5 - Math.ceil(clamped);
  return (
    <div className="flex items-center gap-0">
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f${i}`} className="text-cream text-sm leading-none">★</span>
      ))}
      {partial > 0 && (
        <span className="relative inline-block text-sm leading-none">
          <span className="text-cream-faint">★</span>
          <span className="absolute inset-0 overflow-hidden text-cream" style={{ width: `${partial * 100}%` }}>★</span>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} className="text-cream-faint text-sm leading-none">★</span>
      ))}
      <span className="ml-1 text-xs text-cream-mute">{clamped.toFixed(2)}</span>
    </div>
  );
}

function ChipTag({ label }: { label: string }) {
  return (
    <span className="inline-block border border-edge text-cream-mute text-xs px-2 py-0.5 rounded-full">
      {label}
    </span>
  );
}

function formatDay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface BottleCardMediumProps {
  bottle: BottleCardMediumData;
}

export default function BottleCardMedium({ bottle }: BottleCardMediumProps) {
  const provisional = bottle.provisional ?? false;
  return (
    <div className="relative flex flex-col border-b border-edge hover:bg-panel-2 transition-colors pb-6">
      {/* #103: the same earmark as Search (B-31). Every card in My Bar has been had by definition
          (owned, emptied, or blind-tasted), so every card gets the green check; the tab already
          says which. The old owned-green / empty-grey / tasted-none split disagreed with Search. */}
      <EarmarkCorner hadIt provisional={provisional} ownedCount={bottle.ownedCount ?? (bottle.currentlyOwned ? (bottle.quantity ?? 1) : 0)} />

      {/* Main row: image + attributes */}
      <div className="flex items-center p-3 gap-3">
        {/* Image — fixed frame; the bottle is forced to fit it and can never change the card height */}
        <div className="w-11 h-16 flex-shrink-0 overflow-hidden">
          {bottle.image_url ? (
            <img src={bottle.image_url} alt={bottle.name} className="w-full h-full object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.parentElement as HTMLElement).querySelector('.placeholder')?.classList.remove('hidden'); }} />
          ) : null}
          <div className={`placeholder w-full h-full ${bottle.image_url ? 'hidden' : ''}`}>
            <BottlePlaceholderImage />
          </div>
        </div>

        {/* Attribute grid */}
        <div className="flex-1 min-w-0 pr-6">
          {/* Name (+ quantity when you have more than one) */}
          <h3 className="font-semibold text-cream truncate mb-1">
            {bottle.name}
            {(bottle.quantity ?? 1) > 1 && (
              <span className="ml-1.5 text-xs font-semibold text-cream-mute align-middle">×{bottle.quantity}</span>
            )}
          </h3>
          {/* Row 1: distillery (2/3) | category (1/3 right-aligned) */}
          <div className="flex gap-2 mb-1">
            <span className="flex-[2] text-sm text-cream-mute truncate">{bottle.distillery || '—'}</span>
            <span className="flex-[1] text-sm text-cream-mute truncate text-right">{bottle.category || '—'}</span>
          </div>
          {/* Row 2: stars (2/3) | proof (1/3 right-aligned) */}
          <div className="flex gap-2 items-center">
            <span className="flex-[2]">
              {bottle.stars != null ? (
                <span className="inline-flex items-center gap-1">
                  <StarRating value={bottle.stars} />
                  {/* #80: an unlabelled star was the bug -- My Bar shows YOUR rating where you have
                      one and the shared rollup otherwise, and they are different numbers. */}
                  <span className="text-[10px] text-cream-faint">
                    {bottle.starIsMine ? "yours" : "global"}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-cream-faint">No rating yet</span>
              )}
            </span>
            <span className="flex-[1] text-sm text-cream-mute text-right">
              {bottle.proof ? `${bottle.proof}% ABV` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Style chip (if present) */}
      {bottle.style && (
        <div className="flex gap-2 px-3 -mt-1">
          <ChipTag label={bottle.style} />
        </div>
      )}

      {/* #128: pours, bottom-left, opposite the date. "Drank" is the word the sheet uses. */}
      {(bottle.pourCount ?? 0) > 0 && (
        <span className="absolute bottom-1.5 left-3 text-xs text-cream-faint">
          Drank ×{bottle.pourCount}{bottle.lastPourAt ? ` · last ${formatDay(bottle.lastPourAt)}` : ''}
        </span>
      )}

      {/* Added date — anchored bottom-right for visual balance */}
      {bottle.addedAt && (
        <span className="absolute bottom-1.5 right-3 text-xs text-cream-faint">
          {bottle.dateLabel || 'Added'} {formatDate(bottle.addedAt)}
        </span>
      )}
    </div>
  );
}
