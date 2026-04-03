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
  provisional?: boolean;
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
  const checkColor = provisional ? '#FFD700' : '#ffffff';

  return (
    <div className="relative flex flex-col border-b border-gray-300 hover:bg-gray-100 transition-colors">
      {/* Earmark — always green (currently owned), yellow ✓ if also provisional */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 28, height: 28 }}>
        <div style={{ position: 'absolute', inset: 0, background: '#22c55e', clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }} />
        <span style={{
          position: 'absolute', top: 3, right: 4, fontSize: 11, lineHeight: 1,
          color: checkColor, fontWeight: 'bold',
          textShadow: provisional ? '0 0 2px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)' : 'none',
        }}>✓</span>
      </div>

      {/* Main row: image + attributes */}
      <div className="flex items-start p-3 gap-3">
        {/* Image */}
        <div className="w-16 h-16 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
          {bottle.image_url ? (
            <img src={bottle.image_url} alt={bottle.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl">🍾</span>
          )}
        </div>

        {/* Attribute grid */}
        <div className="flex-1 min-w-0 pr-6">
          {/* Name */}
          <h3 className="font-semibold text-gray-900 truncate mb-1">{bottle.name}</h3>
          {/* Row 1: distillery | category */}
          <div className="flex gap-2 mb-1">
            <span className="flex-1 text-sm text-gray-600 truncate">{bottle.distillery || '—'}</span>
            <span className="flex-1 text-sm text-gray-600 truncate">{bottle.category || '—'}</span>
          </div>
          {/* Row 2: stars | proof */}
          <div className="flex gap-2 items-center">
            <span className="flex-1">
              {bottle.stars != null
                ? <StarRating value={bottle.stars} />
                : <span className="text-xs text-gray-400">No rating yet</span>
              }
            </span>
            <span className="flex-1 text-sm text-gray-500">
              {bottle.proof ? `${bottle.proof}% ABV` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom chip row */}
      {(bottle.style || bottle.addedAt) && (
        <div className="flex flex-wrap gap-2 px-3 pb-3 -mt-1">
          {bottle.style && <ChipTag label={bottle.style} />}
          {bottle.addedAt && <ChipTag label={`Added ${formatDate(bottle.addedAt)}`} />}
        </div>
      )}
    </div>
  );
}
