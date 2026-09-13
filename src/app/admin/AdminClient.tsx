"use client";

import { useState } from "react";
import UsersTab from "./UsersTab";
import BottlesTab from "./BottlesTab";
import VariantsTab from "./VariantsTab";
import FeedbackTab from "./FeedbackTab";
import NotifyTab from "./NotifyTab";
import ImagesTab from "./ImagesTab";

type TabId = "users" | "bottles" | "variants" | "images" | "feedback" | "notify";

const TABS: { id: TabId; label: string }[] = [
  { id: "users",    label: "Users" },
  { id: "bottles",  label: "Bottles" },
  { id: "variants", label: "Variants" },
  { id: "images",   label: "Images" },
  { id: "feedback", label: "Feedback" },
  { id: "notify",   label: "Notify" },
];

export default function AdminClient({
  publicUserId,
  username,
  initialTab,
}: {
  publicUserId: string;
  username: string;
  initialTab?: string;
}) {
  // A push about new feedback deep-links to /admin?tab=feedback; anything unknown falls back to Users.
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "users");

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
        {tab === "bottles"  && <BottlesTab publicUserId={publicUserId} />}
        {tab === "variants" && <VariantsTab publicUserId={publicUserId} />}
        {tab === "images"   && <ImagesTab publicUserId={publicUserId} />}
        {tab === "feedback" && <FeedbackTab publicUserId={publicUserId} />}
        {tab === "notify"   && <NotifyTab publicUserId={publicUserId} />}
      </div>
    </div>
  );
}
