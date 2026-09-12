"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchFeedback,
  updateFeedbackStatus,
  setFeedbackNote,
  statusLabel,
  FEEDBACK_STATUSES,
  type FeedbackRow,
  type FeedbackStatus,
} from "@/lib/feedback";

const STATUS_FILTERS: (FeedbackStatus | "all" | "open")[] = ["open", "all", "new", "triaged", "planned", "done"];

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function FeedbackTab({ publicUserId }: { publicUserId: string }) {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { rows, error } = await fetchFeedback();
    if (error) toast.error(error);
    setRows(rows);
    setNotes(Object.fromEntries(rows.map((r) => [r.id, r.adminNote ?? ""])));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "open") return r.status !== "done";
    return r.status === filter;
  });

  const changeStatus = async (row: FeedbackRow, status: FeedbackStatus) => {
    setBusyId(row.id);
    const { error } = await updateFeedbackStatus(row.id, status, publicUserId);
    setBusyId(null);
    if (error) return toast.error(error);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
    toast.success(`Marked ${statusLabel(status)}.`);
  };

  const saveNote = async (row: FeedbackRow) => {
    setBusyId(row.id);
    const { error } = await setFeedbackNote(row.id, notes[row.id] ?? "", publicUserId);
    setBusyId(null);
    if (error) return toast.error(error);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, adminNote: notes[row.id] ?? "" } : r)));
    toast.success("Note saved.");
  };

  if (loading) return <p className="text-sm text-cream-mute">Loading feedback…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = filter === f;
          const count =
            f === "all" ? rows.length
            : f === "open" ? rows.filter((r) => r.status !== "done").length
            : rows.filter((r) => r.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded border ${
                active ? "pc-brass bg-brass text-engrave border-brass" : "bg-panel text-cream border-edge"
              }`}
            >
              {f === "open" ? "Open" : f === "all" ? "All" : statusLabel(f)} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-cream-mute">No reports in this view.</p>
      )}

      <div className="space-y-3">
        {visible.map((row) => (
          <div key={row.id} className="border border-edge rounded p-3 bg-panel">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  row.type === "bug" ? "bg-red-950/40 text-red-400" : "bg-blue-950/40 text-blue-300"
                }`}
              >
                {row.type === "bug" ? "Bug" : "Feature"}
              </span>
              <span className="text-xs text-cream-faint">{fmt(row.createdAt)}</span>
            </div>

            <p className="text-sm text-cream whitespace-pre-wrap">{row.message}</p>

            <p className="text-xs text-cream-mute mt-1">
              by {row.submittedByName}
              {row.route ? ` · ${row.route}` : ""}
              {row.viewport ? ` · ${row.viewport}` : ""}
            </p>
            {row.userAgent && (
              <p className="text-[10px] text-cream-faint mt-0.5 break-words">{row.userAgent}</p>
            )}

            {row.screenshotUrl && (
              <a href={row.screenshotUrl} target="_blank" rel="noreferrer" className="inline-block mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.screenshotUrl}
                  alt="attachment"
                  className="max-h-40 rounded border border-edge"
                />
              </a>
            )}

            {/* Status controls */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {FEEDBACK_STATUSES.map((s) => {
                const active = row.status === s;
                return (
                  <button
                    key={s}
                    disabled={busyId === row.id || active}
                    onClick={() => changeStatus(row, s)}
                    className={`text-xs px-2 py-1 rounded border disabled:opacity-60 ${
                      active ? "pc-brass bg-brass text-engrave border-brass" : "bg-panel text-cream border-edge"
                    }`}
                  >
                    {statusLabel(s)}
                  </button>
                );
              })}
            </div>

            {/* Triage note */}
            <div className="mt-2">
              <textarea
                value={notes[row.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                rows={2}
                placeholder="Triage note (internal)…"
                className="w-full border border-edge rounded px-2 py-1 text-xs text-cream"
              />
              <button
                disabled={busyId === row.id}
                onClick={() => saveNote(row)}
                className="mt-1 text-xs px-2 py-1 rounded border border-edge bg-panel text-cream disabled:opacity-60"
              >
                Save note
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
