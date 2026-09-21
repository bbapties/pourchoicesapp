"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { setPostPhoto, type ShowOffDetail } from "@/lib/postPhoto";
import { logClick } from "@/lib/events";

/**
 * "Show it off" (Brian, 2026-09-21). An add or an empty is one tap, from five places; the photo
 * comes AFTER. The moment the post lands, this bar slides up over the nav: Add a photo? / Not now.
 * Pick one and it goes onto that post. Ignore it and it leaves on its own. Mounted ONCE, in
 * AppShell, and driven by the `pc:showoff` event from userBottles - the same way PhotoViewer works.
 */

const LINGER_MS = 9000;

export default function ShowOffNudge() {
  const { publicUserId } = useCurrentUser();
  const [offer, setOffer] = useState<ShowOffDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on = (ev: Event) => {
      setOffer((ev as CustomEvent<ShowOffDetail>).detail);
      setBusy(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setOffer(null), LINGER_MS);
    };
    window.addEventListener("pc:showoff", on);
    return () => { window.removeEventListener("pc:showoff", on); if (timer.current) clearTimeout(timer.current); };
  }, []);

  if (!offer) return null;

  const did = offer.action === "finished" ? "Emptied" : "Added to your bar";

  const dismiss = () => {
    logClick("showoff_dismissed", { userId: publicUserId, targetId: offer.activityId, metadata: { action: offer.action } });
    setOffer(null);
  };

  const pick = () => {
    if (timer.current) clearTimeout(timer.current); // they're in the picker; don't pull the bar away
    logClick("showoff_opened", { userId: publicUserId, targetId: offer.activityId, metadata: { action: offer.action } });
    fileRef.current?.click();
  };

  const onFile = async (file: File | null) => {
    if (!file || !publicUserId) return;
    setBusy(true);
    const res = await setPostPhoto({ activityId: offer.activityId, userId: publicUserId, photo: file, surface: "showoff" });
    setBusy(false);
    if (res.error) {
      toast.error("Photo didn't upload");
      return;
    }
    toast.success("On your post");
    setOffer(null);
  };

  return (
    <div
      className="fixed left-3 right-3 z-30 pc-leather rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.6)] flex items-center gap-3 pl-3.5 pr-2 py-2.5"
      style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
      role="status"
      data-coach="social.showoff"
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-cream truncate">{did}{offer.bottleName ? ` · ${offer.bottleName}` : ""}</div>
        <div className="text-xs text-cream-mute">Show it off with a photo?</div>
      </div>
      <button type="button" onClick={dismiss} disabled={busy} className="h-9 px-2.5 text-[13px] text-cream-mute">
        Not now
      </button>
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        className="h-9 px-3 rounded-sm pc-brass text-[12px] font-bold tracking-[.08em] uppercase flex items-center gap-1.5 disabled:opacity-60"
        aria-label="Add a photo"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
        </svg>
        {busy ? "Sending" : "Photo"}
      </button>
    </div>
  );
}
