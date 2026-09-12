"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { logClick } from "@/lib/events";
import { checkPushSupport, permissionState } from "@/lib/pushNotifications";
import { ALL_KINDS, NOTIFY_KINDS, mute, setNotifyKinds, type NotifyKind } from "@/lib/relationships";

// The bell (#111): per-person, per-event pushes. Turning anything on for someone you don't
// follow follows them first (the sheet only ever calls setNotifyKinds, which upserts the follow
// row). If pushes cannot reach this device the choice is still saved and a plain warning says
// so - no silent failure. Mute lives at the bottom because it is the opposite gesture.

export default function BellSheet({ open, onOpenChange, viewerId, target, initialKinds, onSaved, onMuted, onInstall }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerId: string;
  target: { id: string; username: string };
  initialKinds: NotifyKind[];
  onSaved: (kinds: NotifyKind[]) => void;
  onMuted: () => void;
  onInstall?: () => void;
}) {
  const [kinds, setKinds] = useState<Set<NotifyKind>>(new Set(initialKinds));
  const [busy, setBusy] = useState(false);
  const [confirmMute, setConfirmMute] = useState(false);

  useEffect(() => {
    if (open) { setKinds(new Set(initialKinds)); setConfirmMute(false); }
  }, [open, initialKinds]);

  const reachable = checkPushSupport().supported && permissionState() === "granted";
  const allOn = ALL_KINDS.every((k) => kinds.has(k));

  const save = async (next: Set<NotifyKind>) => {
    setKinds(next);
    setBusy(true);
    const res = await setNotifyKinds(viewerId, target.id, [...next]);
    setBusy(false);
    if (res.error) { toast.error("Couldn't save that"); return; }
    logClick("notify_kinds_changed", { userId: viewerId, targetId: target.id, surface: "/u", metadata: { kinds: [...next] } });
    onSaved([...next]);
  };

  const toggle = (k: NotifyKind) => {
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k); else next.add(k);
    save(next);
  };

  const doMute = async () => {
    setBusy(true);
    const res = await mute(viewerId, target.id);
    setBusy(false);
    if (res.error) { toast.error("Couldn't mute"); return; }
    logClick("user_muted", { userId: viewerId, targetId: target.id, surface: "/u" });
    onOpenChange(false);
    onMuted();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="border-t border-charcoal" style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}>
        <SheetHeader className="mb-1">
          <SheetTitle className="text-charcoal text-left">Notify me when @{target.username}…</SheetTitle>
          <SheetDescription className="text-charcoal opacity-70 text-left">Pushes go to your phone once the app is installed.</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => save(allOn ? new Set() : new Set(ALL_KINDS))}
            className="w-full h-11 flex items-center justify-between text-xs text-gray-600 border-b border-charcoal"
          >
            <span>All</span><span className="font-semibold text-charcoal">{allOn ? "on" : kinds.size ? "some" : "off"}</span>
          </button>

          {NOTIFY_KINDS.map((k) => {
            const on = kinds.has(k.id);
            return (
              <button
                key={k.id}
                type="button"
                disabled={busy}
                onClick={() => toggle(k.id)}
                className="w-full h-12 flex items-center justify-between text-sm text-charcoal border-b border-gray-200"
                role="switch"
                aria-checked={on}
              >
                <span>{k.label}</span>
                <span className="relative block w-10 h-6 rounded-full transition-colors" style={{ backgroundColor: on ? "#111" : "#D1D5DB" }}>
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
                </span>
              </button>
            );
          })}

          {!reachable && kinds.size > 0 && (
            <div className="mt-3.5 px-3 py-2.5 border border-gray-400 rounded-lg text-xs text-gray-700 leading-relaxed">
              You won&apos;t get these until you install the app and allow notifications.{" "}
              {onInstall && (
                <button type="button" onClick={onInstall} className="underline underline-offset-2">Install the app</button>
              )}
            </div>
          )}

          <div className="mt-4 text-center">
            {confirmMute ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-gray-600">Their posts leave your feed and shelf. They won&apos;t be told. You can unmute from Profile › Settings.</p>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={doMute} className="h-9 px-4 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: "#111" }}>Mute @{target.username}</button>
                  <button type="button" onClick={() => setConfirmMute(false)} className="h-9 px-4 rounded-full text-xs font-semibold border border-gray-400 text-charcoal bg-white">Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmMute(true)} className="text-[13px] text-gray-600 underline underline-offset-2">Mute @{target.username}</button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
