import { Wine } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function TastePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 pb-20">
      <Card className="w-full max-w-md p-8 text-center bg-white shadow-lg">
        <Wine className="w-16 h-16 mx-auto mb-6 text-gray-400" />
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Taste</h1>
        <p className="text-gray-600">Blind tasting flow coming soon</p>
      </Card>
    </div>
  );
}
