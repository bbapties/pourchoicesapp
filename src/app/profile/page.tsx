import { User } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 pb-20">
      <Card className="w-full max-w-md p-8 text-center bg-white shadow-lg">
        <User className="w-16 h-16 mx-auto mb-6 text-gray-400" />
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Profile</h1>
        <p className="text-gray-600">User profile coming soon</p>
      </Card>
    </div>
  );
}
