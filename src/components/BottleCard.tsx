import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";

export interface Bottle {
  id: string;
  name: string;
  distillery?: string;
  category: string;
  image_url?: string;
  elo_global?: number;
  provisional?: boolean;
  stars?: number | null; // 0.00–5.00 scaled from global Elo
  inCollection?: boolean;    // bottle_id exists in user_bottles
  currentlyOwned?: boolean;  // user_bottles.currently_owned = true
  hadIt?: boolean;           // owned/past OR drank OR blind-tasted — drives the earmark (B-31)
  ownedCount?: number;       // bottles on hand right now - the digit in the corner
  variantCount?: number;     // Bottles view: SKU roll-up count; badge shown when > 1
  variantLabel?: string;     // All Variants view: per-variant tag (Default / Batch 302 / 2021 …)
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
          <span
            className="absolute inset-0 overflow-hidden text-cream"
            style={{ width: `${partial * 100}%` }}
          >★</span>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} className="text-cream-faint text-sm leading-none">★</span>
      ))}
      <span className="ml-1 text-xs text-cream-mute">{clamped.toFixed(2)}</span>
    </div>
  );
}

// Earmark matrix (top-right corner) - two dimensions: verified x had-it (BOTTLE_ACTIONS.md B.1),
// settled again with Brian 2026-09-12 so the same corner works on cards AND the detail tray:
//   verified   + never had  -> none
//   unverified + never had  -> subtle yellow dot
//   had it, none on hand    -> plain green triangle (yellow-edged check when unverified)
//   had it, N on hand       -> green triangle carrying the digit N. White; yellow when unverified.
// "Had it" spans ownership (now or past), a pour, or a blind tasting. The shelf says the same
// thing with light (BottleOnShelf's LED); the detail tray reuses this exact corner.
export function EarmarkCorner({
  hadIt,
  provisional,
  ownedCount = 0,
  size = 28,
}: {
  hadIt: boolean;
  provisional: boolean;
  /** Bottles on hand right now. Only meaningful when hadIt. */
  ownedCount?: number;
  /** Corner size in px; the detail tray uses a larger one. */
  size?: number;
}) {
  if (!hadIt && !provisional) return null;

  // Never had it, just unverified: subtle yellow dot, no triangle
  if (!hadIt) {
    return (
      <div style={{
        position: 'absolute',
        top: 4,
        right: 4,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#FFD700',
      }} />
    );
  }

  const count = Math.max(0, Math.floor(ownedCount));
  // Zero on hand is just the green corner - Brian: a "0" reads as nothing. Digits start at one.
  // Unverified with nothing to write still needs its yellow, so it keeps a small check.
  const label = count === 0 ? (provisional ? '✓' : '') : count > 99 ? '99+' : String(count);
  const digitColor = provisional ? '#FFD700' : '#ffffff';
  const font = Math.round(size * 0.4);

  return (
    <div
      style={{ position: 'absolute', top: 0, right: 0, width: size, height: size }}
      aria-label={count === 0 ? 'Had it, none on hand' : `${count} on hand`}
      title={count === 0 ? 'Had it - none on hand' : `${count} in your bar`}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        background: '#22c55e',
        clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
      }} />
      <span style={{
        position: 'absolute',
        top: Math.round(size * 0.1),
        right: Math.round(size * 0.14),
        fontSize: font,
        lineHeight: 1,
        color: digitColor,
        fontWeight: 'bold',
        fontVariantNumeric: 'tabular-nums',
        textShadow: provisional ? '0 0 2px rgba(0,0,0,0.45)' : 'none',
      }}>{label}</span>
    </div>
  );
}

interface BottleCardProps {
  bottle: Bottle;
}

export default function BottleCard({ bottle }: BottleCardProps) {
  return (
    <div className={`relative flex items-center p-3 border-b border-edge hover:bg-panel-2 transition-colors ${bottle.provisional ? 'opacity-75' : ''}`}>
      <EarmarkCorner hadIt={bottle.hadIt ?? bottle.inCollection ?? false} provisional={bottle.provisional ?? false} ownedCount={bottle.ownedCount ?? 0} />

      {/* Image — fixed frame; the bottle is forced to fit it and can never change the card height */}
      <div className="w-8 h-16 flex-shrink-0 mr-2 overflow-hidden">
        {bottle.image_url ? (
          <img
            src={bottle.image_url}
            alt={bottle.name}
            className="w-full h-full object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.parentElement as HTMLElement).querySelector('.placeholder')?.classList.remove('hidden'); }}
          />
        ) : null}
        <div className={`placeholder w-full h-full ${bottle.image_url ? 'hidden' : ''}`}>
          <BottlePlaceholderImage />
        </div>
      </div>

      {/* Content: name + distillery/category + stars bottom-right */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-cream truncate pr-6">{bottle.name}</h3>
        {(bottle.distillery || bottle.category) && (
          <p className="text-cream-mute text-sm truncate">
            {bottle.distillery && bottle.distillery}
            {bottle.distillery && bottle.category && " • "}
            {bottle.category}
          </p>
        )}
        {bottle.variantLabel && (
          <p className="text-xs text-cream-mute italic truncate">{bottle.variantLabel}</p>
        )}
        <div className="flex items-center mt-1">
          {bottle.variantCount != null && bottle.variantCount > 1 && (
            <span className="text-[11px] text-cream-mute bg-panel-2 border border-edge rounded-full px-2 py-0.5 whitespace-nowrap">
              {bottle.variantCount} variants
            </span>
          )}
          <div className="ml-auto">
            {bottle.stars != null
              ? <StarRating value={bottle.stars} />
              : <span className="text-xs text-cream-faint">—</span>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
