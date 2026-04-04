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
          <span
            className="absolute inset-0 overflow-hidden text-gray-800"
            style={{ width: `${partial * 100}%` }}
          >★</span>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} className="text-gray-300 text-sm leading-none">★</span>
      ))}
      <span className="ml-1 text-xs text-gray-500">{clamped.toFixed(2)}</span>
    </div>
  );
}

// Earmark matrix (top-right corner):
// not in collection, not provisional  → none
// not in collection, provisional      → subtle yellow dot
// in collection, owned, not prov      → green triangle + white ✓
// in collection, owned, provisional   → green triangle + yellow ✓
// in collection, not owned, not prov  → light grey triangle + white ✓
// in collection, not owned, prov      → light grey triangle + yellow ✓
function EarmarkCorner({
  inCollection,
  currentlyOwned,
  provisional,
}: {
  inCollection: boolean;
  currentlyOwned: boolean;
  provisional: boolean;
}) {
  if (!inCollection && !provisional) return null;

  // Provisional only: subtle yellow dot, no triangle
  if (!inCollection) {
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

  // In collection: triangle + checkmark
  const triangleColor = currentlyOwned ? '#22c55e' : '#d1d5db';
  const checkColor = provisional ? '#FFD700' : '#ffffff';

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, width: 28, height: 28 }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: triangleColor,
        clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
      }} />
      <span style={{
        position: 'absolute',
        top: 3,
        right: 4,
        fontSize: 11,
        lineHeight: 1,
        color: checkColor,
        fontWeight: 'bold',
        textShadow: provisional && !currentlyOwned ? '0 0 2px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)' : 'none',
      }}>✓</span>
    </div>
  );
}

interface BottleCardProps {
  bottle: Bottle;
}

export default function BottleCard({ bottle }: BottleCardProps) {
  return (
    <div className={`relative flex items-start p-3 border-b border-gray-300 hover:bg-gray-100 transition-colors ${bottle.provisional ? 'opacity-75' : ''}`}>
      <EarmarkCorner
        inCollection={bottle.inCollection ?? false}
        currentlyOwned={bottle.currentlyOwned ?? false}
        provisional={bottle.provisional ?? false}
      />

      {/* Image */}
      <div className="w-12 h-12 bg-gray-200 rounded flex-shrink-0 mr-3 overflow-hidden">
        {bottle.image_url ? (
          <img
            src={bottle.image_url}
            alt={bottle.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.parentElement as HTMLElement).querySelector('.placeholder')?.classList.remove('hidden'); }}
          />
        ) : null}
        <div className={`placeholder w-full h-full ${bottle.image_url ? 'hidden' : ''}`}>
          <BottlePlaceholderImage />
        </div>
      </div>

      {/* Content: name + distillery/category + stars bottom-right */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate pr-6">{bottle.name}</h3>
        {(bottle.distillery || bottle.category) && (
          <p className="text-gray-600 text-sm truncate">
            {bottle.distillery && bottle.distillery}
            {bottle.distillery && bottle.category && " • "}
            {bottle.category}
          </p>
        )}
        <div className="flex justify-end mt-1">
          {bottle.stars != null
            ? <StarRating value={bottle.stars} />
            : <span className="text-xs text-gray-400">—</span>
          }
        </div>
      </div>
    </div>
  );
}
