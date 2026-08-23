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

  if (loading) return <p className="text-sm text-gray-500">Loading feedback…</p>;

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
                active ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-700 border-gray-400"
              }`}
            >
              {f === "open" ? "Open" : f === "all" ? "All" : statusLabel(f)} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-gray-500">No reports in this view.</p>
      )}

      <div className="space-y-3">
        {visible.map((row) => (
          <div key={row.id} className="border border-gray-300 rounded p-3 bg-white">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  row.type === "bug" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                }`}
              >
                {row.type === "bug" ? "Bug" : "Feature"}
              </span>
              <span className="text-xs text-gray-400">{fmt(row.createdAt)}</span>
            </div>

            <p className="text-sm text-black whitespace-pre-wrap">{row.message}</p>

            <p className="text-xs text-gray-500 mt-1">
              by {row.submittedByName}
              {row.route ? ` · ${row.route}` : ""}
              {row.viewport ? ` · ${row.viewport}` : ""}
            </p>
            {row.userAgent && (
              <p className="text-[10px] text-gray-400 mt-0.5 break-words">{row.userAgent}</p>
            )}

            {row.screenshotUrl && (
              <a href={row.screenshotUrl} target="_blank" rel="noreferrer" className="inline-block mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.screenshotUrl}
                  alt="attachment"
                  className="max-h-40 rounded border border-gray-300"
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
                      active ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-700 border-gray-400"
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
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-black"
              />
              <button
                disabled={busyId === row.id}
                onClick={() => saveNote(row)}
                className="mt-1 text-xs px-2 py-1 rounded border border-gray-400 bg-white text-gray-700 disabled:opacity-60"
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
