"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  return (
    <div className="fixed top-0 left-0 right-0 bottom-16 overflow-hidden">
      <img
        src="/coming-soon.jpg"
        alt="Coming Soon"
        className="w-full h-full object-cover object-top"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 px-8">
        <button
          onClick={handleSignOut}
          className="w-full max-w-sm py-3 bg-white text-gray-900 font-semibold rounded-xl shadow-lg border border-gray-200"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
