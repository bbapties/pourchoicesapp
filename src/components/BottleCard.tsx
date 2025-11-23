import { Badge } from "@/components/ui/badge";

export interface Bottle {
  id: string;
  name: string;
  distillery?: string;
  category: string;
  image_url?: string;
  elo_global?: number;
}

interface BottleCardProps {
  bottle: Bottle;
}

export default function BottleCard({ bottle }: BottleCardProps) {
  // Calculate percentile (0-100) based on elo_global, assuming 1500 is average
  const percentile = bottle.elo_global ? Math.min(100, Math.max(0, ((bottle.elo_global - 1500) / 200) * 100 + 50)) : 50;

  return (
    <div className="flex items-center p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors">
      <div className="w-12 h-12 bg-gray-200 rounded flex-shrink-0 mr-3 flex items-center justify-center">
        {bottle.image_url ? (
          <img
            src={bottle.image_url}
            alt={bottle.name}
            className="w-full h-full object-cover rounded"
          />
        ) : (
          <div className="w-6 h-6 text-gray-400">🍾</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{bottle.name}</h3>
        {(bottle.distillery || bottle.category) && (
          <p className="text-sm text-gray-600 truncate">
            {bottle.distillery && bottle.distillery}
            {bottle.distillery && bottle.category && " • "}
            {bottle.category}
          </p>
        )}
      </div>

      <Badge variant="outline" className="ml-2 text-xs">
        {Math.round(percentile)}th
      </Badge>
    </div>
  );
}
