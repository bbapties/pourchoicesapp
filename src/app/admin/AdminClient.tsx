"use client";

import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import UsersTab from "./UsersTab";
import ReviewTab from "./ReviewTab";
import FeedbackTab from "./FeedbackTab";
import NotifyTab from "./NotifyTab";
import BlindsTab from "./BlindsTab";

type TabId = "users" | "review" | "blinds" | "feedback" | "notify";

const TABS: { id: TabId; label: string }[] = [
  { id: "users",    label: "Users" },
  // #130: Bottles / Variants / Images were three queues over the same rows; Review is the one queue.
  { id: "review",   label: "Review" },
  { id: "blinds",   label: "Blinds" },
  { id: "feedback", label: "Feedback" },
  { id: "notify",   label: "Notify" },
];

export default function AdminClient({
  publicUserId,
  username,
  initialTab,
  initialBottle,
}: {
  publicUserId: string;
  username: string;
  initialTab?: string;
  /** /admin?tab=review&bottle=<id> - a push about one bottle opens that bottle's case file. */
  initialBottle?: string;
}) {
  // A push about new feedback deep-links to /admin?tab=feedback; anything unknown falls back to Users.
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "users");
  // A push tapped while Admin is ALREADY open arrives as router.push to a new URL, which re-renders
  // this mounted component with new props - useState's initial value ignores that (Brian, 2026-09-21:
  // the add push landed on the list, not the bottle). Follow the URL whenever it changes.
  useEffect(() => {
    if (initialTab && TABS.some((t) => t.id === initialTab)) setTab(initialTab as TabId);
  }, [initialTab, initialBottle]);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-brass-line bg-panel px-4 py-3">
        <h1 className="font-display text-xl font-bold tracking-wide pc-brass-text">Admin</h1>
        <p className="text-xs text-cream-mute">Signed in as {username}</p>
      </header>

      <nav className="flex border-b border-brass-line bg-panel">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm ${active ? "font-semibold text-cream border-b-2 border-brass" : "text-cream-mute"}`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "users"    && <UsersTab currentPublicUserId={publicUserId} />}
        {tab === "review"   && <ReviewTab publicUserId={publicUserId} initialBottle={initialBottle} />}
        {tab === "blinds"   && <BlindsTab publicUserId={publicUserId} />}
        {tab === "feedback" && <FeedbackTab publicUserId={publicUserId} />}
        {tab === "notify"   && <NotifyTab publicUserId={publicUserId} />}
      </div>
      {/* Every tab toasts its errors; without a Toaster mounted here they were all invisible (found via #129). */}
      <Toaster position="top-center" style={{ top: "132px" }} />
    </div>
  );
}
