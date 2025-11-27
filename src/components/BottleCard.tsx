import { Badge } from "@/components/ui/badge";

export interface Bottle {
  id: string;
  name: string;
  distillery?: string;
  category: string;
  image_url?: string;
  elo_global?: number;
  provisional?: boolean;
  total_count?: number; // For percentile calculation
  rank?: number; // Rank in overall bottles list
}

interface BottleCardProps {
  bottle: Bottle;
}

export default function BottleCard({ bottle }: BottleCardProps) {
  // Calculate percentile based on rank (higher rank = higher percentile)
  const percentile = bottle.rank && bottle.total_count
    ? Math.round(((bottle.total_count - bottle.rank + 1) / bottle.total_count) * 100)
    : 50;

  return (
    <div className={`flex items-center p-3 border-b border-gray-300 hover:bg-gray-100 transition-colors ${bottle.provisional ? 'opacity-75' : ''}`}>
      <div className="w-12 h-12 bg-gray-300 rounded flex-shrink-0 mr-3 flex items-center justify-center">
        {bottle.image_url ? (
          <img
            src={bottle.image_url}
            alt={bottle.name}
            className="w-full h-full object-cover rounded"
          />
        ) : (
          <div className="w-6 h-6 text-gray-600">🍾</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 truncate">{bottle.name}</h3>
          {bottle.provisional && (
            <Badge variant="outline" className="text-xs border-gray-600 text-gray-600">
              Provisional
            </Badge>
          )}
        </div>
        {(bottle.distillery || bottle.category) && (
          <p className="text-gray-600 text-sm truncate">
            {bottle.distillery && bottle.distillery}
            {bottle.distillery && bottle.category && " • "}
            {bottle.category}
          </p>
        )}
      </div>

      <Badge variant="outline" className="ml-2 text-xs border-gray-600 text-gray-600">
        {percentile}th
      </Badge>
    </div>
  );
}
