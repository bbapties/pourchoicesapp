"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/useCurrentUser";
import FeedbackSheet from "@/components/FeedbackSheet";

export default function ProfilePage() {
  const router = useRouter();
  const { publicUserId } = useCurrentUser();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 px-8 gap-3">
        <button
          data-coach="profile.feedback"
          onClick={() => setFeedbackOpen(true)}
          className="w-full max-w-sm py-3 bg-white text-gray-900 font-semibold rounded-xl shadow-lg border border-gray-200"
        >
          Send Feedback / Report a Bug
        </button>
        <button
          onClick={handleSignOut}
          className="w-full max-w-sm py-3 bg-white text-gray-900 font-semibold rounded-xl shadow-lg border border-gray-200"
        >
          Sign Out
        </button>
      </div>

      <FeedbackSheet
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        userId={publicUserId}
      />
    </div>
  );
}
