import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";

export interface BottleCardMediumData {
  id: string;
  name: string;
  distillery?: string;
  category?: string;
  style?: string;
  proof?: number;
  stars?: number | null;
  image_url?: string;
  addedAt?: string;
  dateLabel?: string;
  provisional?: boolean;
  currentlyOwned?: boolean;
  tasted?: boolean;
}

function StarRating({ value }: { value: number }) {
  const clamped = Math.min(5, Math.max(0, value));
  const full = Math.floor(clamped);
  const partial = clamped - full;
  const empty = 5 - Math.ceil(clamped);
  return (
    <div className="flex items-center gap-0">
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f${i}`} className="text-gray-800 text-sm leading-none">★</span>
      ))}
      {partial > 0 && (
        <span className="relative inline-block text-sm leading-none">
          <span className="text-gray-300">★</span>
          <span className="absolute inset-0 overflow-hidden text-gray-800" style={{ width: `${partial * 100}%` }}>★</span>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} className="text-gray-300 text-sm leading-none">★</span>
      ))}
      <span className="ml-1 text-xs text-gray-500">{clamped.toFixed(2)}</span>
    </div>
  );
}

function ChipTag({ label }: { label: string }) {
  return (
    <span className="inline-block border border-gray-300 text-gray-500 text-xs px-2 py-0.5 rounded-full">
      {label}
    </span>
  );
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
  const owned = bottle.currentlyOwned ?? true; // default true for backwards compat
  const tasted = bottle.tasted ?? false;
  const checkColor = provisional ? '#FFD700' : '#ffffff';
  const earmarkColor = owned ? '#22c55e' : '#9ca3af'; // green if owned, gray if empty

  return (
    <div className="relative flex flex-col border-b border-gray-300 hover:bg-gray-100 transition-colors pb-6">
      {/* Earmark — owned/empty only. Tasted-only bottles were never in the bar. */}
      {!tasted && (
      <div style={{ position: 'absolute', top: 0, right: 0, width: 28, height: 28 }}>
        <div style={{ position: 'absolute', inset: 0, background: earmarkColor, clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }} />
        <span style={{
          position: 'absolute', top: 3, right: 4, fontSize: 11, lineHeight: 1,
          color: checkColor, fontWeight: 'bold',
          textShadow: provisional ? '0 0 2px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)' : 'none',
        }}>✓</span>
      </div>
      )}

      {/* Main row: image + attributes */}
      <div className="flex items-stretch p-3 gap-3">
        {/* Image — fills the card height (no wasted padding), whole bottle shown, transparent (no gray box) */}
        <div className="w-11 flex-shrink-0 overflow-hidden">
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
          {/* Name */}
          <h3 className="font-semibold text-gray-900 truncate mb-1">{bottle.name}</h3>
          {/* Row 1: distillery (2/3) | category (1/3 right-aligned) */}
          <div className="flex gap-2 mb-1">
            <span className="flex-[2] text-sm text-gray-600 truncate">{bottle.distillery || '—'}</span>
            <span className="flex-[1] text-sm text-gray-600 truncate text-right">{bottle.category || '—'}</span>
          </div>
          {/* Row 2: stars (2/3) | proof (1/3 right-aligned) */}
          <div className="flex gap-2 items-center">
            <span className="flex-[2]">
              {bottle.stars != null
                ? <StarRating value={bottle.stars} />
                : <span className="text-xs text-gray-400">No rating yet</span>
              }
            </span>
            <span className="flex-[1] text-sm text-gray-500 text-right">
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

      {/* Added date — anchored bottom-right for visual balance */}
      {bottle.addedAt && (
        <span className="absolute bottom-1.5 right-3 text-xs text-gray-400">
          {bottle.dateLabel || 'Added'} {formatDate(bottle.addedAt)}
        </span>
      )}
    </div>
  );
}
