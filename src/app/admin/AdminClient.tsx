"use client";

import { useState } from "react";
import UsersTab from "./UsersTab";
import BottlesTab from "./BottlesTab";
import ImportTab from "./ImportTab";
import FeedbackTab from "./FeedbackTab";
import NotifyTab from "./NotifyTab";

type TabId = "users" | "bottles" | "feedback" | "notify" | "import";

const TABS: { id: TabId; label: string }[] = [
  { id: "users",    label: "Users" },
  { id: "bottles",  label: "Bottles" },
  { id: "feedback", label: "Feedback" },
  { id: "notify",   label: "Notify" },
  { id: "import",   label: "Import" },
];

export default function AdminClient({
  publicUserId,
  username,
}: {
  publicUserId: string;
  username: string;
}) {
  const [tab, setTab] = useState<TabId>("users");

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-charcoal bg-ivory px-4 py-3">
        <h1 className="text-lg font-semibold text-charcoal">Admin</h1>
        <p className="text-xs text-gray-500">Signed in as {username}</p>
      </header>

      <nav className="flex border-b border-charcoal bg-ivory">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm ${active ? "font-semibold text-black border-b-2 border-black" : "text-gray-500"}`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "users"    && <UsersTab currentPublicUserId={publicUserId} />}
        {tab === "bottles"  && <BottlesTab publicUserId={publicUserId} />}
        {tab === "feedback" && <FeedbackTab publicUserId={publicUserId} />}
        {tab === "notify"   && <NotifyTab />}
        {tab === "import"   && <ImportTab />}
      </div>
    </div>
  );
}
