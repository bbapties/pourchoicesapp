"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fetchPastTastings, type PastTasting } from "@/lib/tastings";
import { logClick } from "@/lib/events";

/**
 * #20: the list of someone's past blind tastings - date, how many bottles, the winner. Each row
 * opens the tasting's post, which already shows every glass in finishing order with notes and
 * swap footnotes. Used on the user page and on My Bar's Blind tab. Renders nothing when empty
 * unless `emptyText` is given.
 */
export default function PastTastings({ userId, viewerId, surface, limit, emptyText }: {
  userId: string;
  viewerId: string | null;
  surface: string;
  limit?: number;
  emptyText?: string;
}) {
  const [rows, setRows] = useState<PastTasting[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPastTastings(userId).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [userId]);

  if (rows === null) return null;
  if (rows.length === 0) {
    return emptyText ? <p className="px-4 py-3 text-sm text-cream-mute">{emptyText}</p> : null;
  }
  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <ol className="mx-4 flex flex-col divide-y divide-edge border border-edge rounded-md">
      {shown.map((t) => (
        <li key={t.activityId}>
          <Link
            href={`/post/${t.activityId}`}
            onClick={() => logClick("past_tasting_open", { userId: viewerId, surface, targetId: t.activityId })}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm text-cream">
                <span className="font-medium">{formatDay(t.createdAt)}</span>
                <span className="text-cream-mute"> · {t.count} bottle{t.count === 1 ? "" : "s"}</span>
              </div>
              <div className="text-xs text-cream-mute truncate">1st · {t.winnerName}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-cream-faint shrink-0" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
