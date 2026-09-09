"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addRejectReason,
  approveImage,
  fetchRejectReasons,
  fetchReviewCounts,
  fetchReviewShelf,
  rejectImage,
  type RejectReason,
  type ReviewBottle,
  type ReviewState,
} from "@/lib/imageReview";

/**
 * Admin › Images — the shelf preview that decides what stands on Home (#83, part of #82).
 *
 * WHY IT IS A SHELF AND NOT A TABLE. Whether an image works is a judgement about how it looks ON A
 * SHELF, beside its neighbours. A leftover background fringe or a bottle floating off the baseline
 * is invisible at thumbnail size and obvious at shelf size — and some faults are purely relative,
 * only showing up next to another bottle. So the review surface is the real thing: same geometry,
 * same sizing, same rules as the cabinet.
 *
 * The shelf refills as decisions are made, so the queue empties as you work.
 */

const STATE_LABEL: Record<ReviewState, string> = {
  needs_rereview: "Flagged",
  unreviewed: "Unreviewed",
  rejected: "Rejected",
  approved: "Approved",
};

// Flagged first: a disputed image is live on everyone's Home right now. Rejected and approved are
// off by default so the shelf shows work still to do.
const DEFAULT_STATES: ReviewState[] = ["needs_rereview", "unreviewed"];

export default function ImagesTab({ publicUserId }: { publicUserId: string }) {
  const [reasons, setReasons] = useState<RejectReason[]>([]);
  const [counts, setCounts] = useState<Record<ReviewState, number> | null>(null);
  const [states, setStates] = useState<ReviewState[]>(DEFAULT_STATES);
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [shelf, setShelf] = useState<ReviewBottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ReviewBottle | null>(null);
  // A white shelf hides the very fault this tool exists to catch — an image with a white box
  // behind it looks exactly like a clean cut-out. The checker exposes any opaque background at a
  // glance; the dark backdrop catches the pale fringing a careless removal leaves behind.
  const [backdrop, setBackdrop] = useState<"shelf" | "checker" | "dark">("checker");

  const refresh = useCallback(async () => {
    setLoading(true);
    const [rows, c] = await Promise.all([
      fetchReviewShelf({ states, reasonId: reasonFilter, limit: 12 }),
      fetchReviewCounts(),
    ]);
    setShelf(rows);
    setCounts(c);
    setLoading(false);
  }, [states, reasonFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void fetchRejectReasons().then(setReasons);
  }, []);

  const toggleState = (s: ReviewState) =>
    setStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-charcoal">Shelf images</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Judge each image as it will appear on Home. Approve puts it on the shelf; rejecting tags
          what is wrong with it, which becomes the work queue for cleanup.
        </p>
      </div>

      {/* the slicer */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATE_LABEL) as ReviewState[]).map((s) => {
          const on = states.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleState(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                on ? "bg-charcoal text-ivory border-charcoal" : "bg-ivory text-charcoal border-gray-300"
              }`}
            >
              {STATE_LABEL[s]}
              {counts ? <span className="ml-1.5 opacity-70">{counts[s]}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        {([["checker", "Checker"], ["shelf", "Shelf"], ["dark", "Dark"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setBackdrop(id)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${
              backdrop === id ? "bg-charcoal text-ivory border-charcoal" : "bg-ivory text-charcoal border-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-gray-500 self-center ml-1">backdrop</span>
      </div>

      {states.includes("rejected") && reasons.length > 0 ? (
        <select
          value={reasonFilter ?? ""}
          onChange={(e) => setReasonFilter(e.target.value || null)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-ivory text-charcoal"
        >
          <option value="">Rejected for any reason</option>
          {reasons.map((r) => (
            <option key={r.id} value={r.id}>
              Rejected: {r.label}
            </option>
          ))}
        </select>
      ) : null}

      {/* the shelf itself — the same box Home uses, so a decision here is the decision there */}
      <div className="border border-charcoal rounded-lg overflow-hidden">
        <div
          className={`pc-shelf ${backdrop === "checker" ? "pc-bg-checker" : backdrop === "dark" ? "pc-bg-dark" : ""}`}
          style={{ borderBottom: "none" }}
        >
          <div className="pc-face pc-back" />
          <div className="pc-face pc-top" />
          <div className="pc-face pc-deck" />

          {loading ? (
            <div className="pc-empty">Loading…</div>
          ) : shelf.length === 0 ? (
            <div className="pc-empty">
              <strong>Nothing left in this filter.</strong>
              Change the slicer above to see more.
            </div>
          ) : (
            <div className="pc-run">
              {shelf.map((b) => (
                <button
                  key={b.variantId}
                  type="button"
                  className="pc-slot"
                  style={{ height: "84%" }}
                  onClick={() => setOpen(b)}
                  aria-label={b.name}
                >
                  {b.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={b.imageUrl}
                      alt={b.name}
                      style={{ objectFit: "contain", objectPosition: "bottom" }}
                    />
                  ) : (
                    <svg viewBox="0 0 58 180" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
                      <path
                        d="M23 7h12v27c0 8 13 12 13 27v102c0 7-4 10-10 10H20c-6 0-10-3-10-10V61c0-15 13-19 13-27z"
                        fill="#F7F7F7" stroke="#2F2F2F" strokeWidth="1.4" strokeDasharray="5 3"
                      />
                      <text x="29" y="104" textAnchor="middle" fontSize="9" fill="#2F2F2F">
                        no image
                      </text>
                    </svg>
                  )}
                  {b.state === "needs_rereview" ? (
                    <span className="pc-mark" style={{ background: "#FFD700" }} />
                  ) : null}
                </button>
              ))}
            </div>
          )}

          <div className="pc-face pc-lip" />
          <span className="pc-plate" style={{ cursor: "default" }}>
            Review
            <span className="pc-plate-count">{shelf.length}</span>
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Tap a bottle to approve it or say what is wrong with it.
      </p>

      {open ? (
        <DecisionSheet
          bottle={open}
          reasons={reasons}
          publicUserId={publicUserId}
          onReasonAdded={(r) => setReasons((prev) => [...prev, r])}
          onClose={() => setOpen(null)}
          onDone={async () => {
            setOpen(null);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * One decision. Approve is one tap; rejecting asks what is wrong and accepts several answers,
 * because "background not removed" and "low resolution" are routinely both true — and the second
 * one is what tells a cleanup job it cannot fix this image alone.
 */
function DecisionSheet({
  bottle,
  reasons,
  publicUserId,
  onReasonAdded,
  onClose,
  onDone,
}: {
  bottle: ReviewBottle;
  reasons: RejectReason[];
  publicUserId: string;
  onReasonAdded: (r: RejectReason) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(bottle.reasonIds);
  const [note, setNote] = useState(bottle.note ?? "");
  const [newReason, setNewReason] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const addReason = async () => {
    const created = await addRejectReason(newReason, publicUserId);
    if (!created) return;
    onReasonAdded(created);
    setPicked((p) => [...p, created.id]);
    setNewReason("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="w-full bg-ivory rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-charcoal">{bottle.name}</h3>
            {bottle.distillery ? (
              <p className="text-xs text-gray-500">{bottle.distillery}</p>
            ) : null}
          </div>
          <button onClick={onClose} className="text-gray-500 text-sm px-2">
            Close
          </button>
        </div>

        {bottle.state === "needs_rereview" ? (
          <p className="mt-2 text-xs text-charcoal bg-yellow-100 border border-yellow-300 rounded p-2">
            A user flagged this image
            {bottle.flagNote ? `: “${bottle.flagNote}”` : "."}
          </p>
        ) : null}

        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await approveImage(bottle.variantId, publicUserId);
            setBusy(false);
            if (error) return alert(`Could not approve: ${error}`);
            onDone();
          }}
          className="mt-4 w-full py-3 rounded-lg bg-charcoal text-ivory font-semibold text-sm disabled:opacity-50"
        >
          Approve — put it on the shelf
        </button>

        <div className="mt-5">
          <p className="text-xs font-semibold text-charcoal uppercase tracking-wide">
            Or say what is wrong
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reasons.map((r) => {
              const on = picked.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${
                    on ? "bg-charcoal text-ivory border-charcoal" : "bg-ivory text-charcoal border-gray-300"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Another reason — it joins the list"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-ivory text-charcoal"
            />
            <button
              onClick={addReason}
              disabled={!newReason.trim()}
              className="px-3 rounded-lg border border-charcoal text-sm text-charcoal disabled:opacity-40"
            >
              Add
            </button>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything specific about this one (optional)"
            rows={2}
            className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-ivory text-charcoal"
          />

          <button
            disabled={busy || picked.length === 0}
            onClick={async () => {
              setBusy(true);
              const { error } = await rejectImage(bottle.variantId, publicUserId, picked, note);
              setBusy(false);
              if (error) return alert(`Could not save: ${error}`);
              onDone();
            }}
            className="mt-3 w-full py-3 rounded-lg border border-charcoal text-charcoal font-semibold text-sm disabled:opacity-40"
          >
            {picked.length === 0
              ? "Pick at least one reason"
              : `Reject — ${picked.length} reason${picked.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
