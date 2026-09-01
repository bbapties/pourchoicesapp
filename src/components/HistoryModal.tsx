"use client";

import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchVariantHistory, type VariantHistory } from "@/lib/bottleHistory";
import { deleteActivity } from "@/lib/activities";

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
  bottleName: string;
  versionLabel?: string;
  userId: string;
  bottleId: string;
  variantId: string | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryModal({
  open,
  onClose,
  bottleName,
  versionLabel,
  userId,
  bottleId,
  variantId,
}: HistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<VariantHistory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchVariantHistory(userId, bottleId, variantId).then((h) => {
      if (!cancelled) { setHistory(h); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [open, userId, bottleId, variantId]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const res = await deleteActivity(id);
    if (res.error) {
      toast.error("Couldn't delete that pour");
    } else {
      toast.success("Pour removed");
      const h = await fetchVariantHistory(userId, bottleId, variantId);
      setHistory(h);
    }
    setDeletingId(null);
  };

  if (!open) return null;

  const counts = history?.counts;
  const stat = (n: number, label: string) => (
    <div className="flex flex-col items-center px-3 py-2">
      <span className="text-lg font-semibold text-charcoal tabular-nums">{n}</span>
      <span className="text-[11px] text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-gray-900/90 z-[60] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg w-full max-w-[420px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-charcoal truncate">Your history</h2>
            <p className="text-xs text-gray-500 truncate">
              {bottleName}{versionLabel ? ` · ${versionLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="ml-2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 flex-shrink-0"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {counts && (
              <div className="flex justify-around border-b border-gray-200 py-2">
                {stat(counts.added, "Added")}
                {stat(counts.pours, "Pours")}
                {stat(counts.tastings, "Tastings")}
                {stat(counts.emptied, "Emptied")}
              </div>
            )}
            <div className="overflow-y-auto p-2">
              {history && history.timeline.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {history.timeline.map((item, i) => (
                    <li key={i} className="flex items-center justify-between px-2 py-2.5">
                      <span className="text-sm text-charcoal">{item.label}</span>
                      <span className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-xs text-gray-500 tabular-nums">{fmtDate(item.at)}</span>
                        {item.activityId && (
                          <button
                            type="button"
                            onClick={() => handleDelete(item.activityId!)}
                            disabled={deletingId === item.activityId}
                            aria-label="Delete this pour"
                            className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-sm text-gray-400">No history for this version yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
