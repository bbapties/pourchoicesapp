"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { fetchLevelBands, weeklyRate, type Level, type LevelBand } from "@/lib/badges";

/**
 * "What does this mean?" for the member level pill (#139 follow-up, 2026-09-22). Level is a
 * rolling 6-month activity rate (sql/member-level-engagement-migration.sql), not a badge sum -
 * this is the one place that explains the number and shows the six bands, since the pill alone
 * only shows a title and a count nobody has context for.
 */
export default function LevelSheet({ level, open, onClose }: { level: Level | null; open: boolean; onClose: () => void }) {
  const [bands, setBands] = useState<LevelBand[] | null>(null);
  useEffect(() => {
    if (open && !bands) fetchLevelBands().then(setBands);
  }, [open, bands]);

  const weekly = level ? weeklyRate(level.points) : "0.0";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="pc-leather max-h-[85dvh] overflow-y-auto">
        <SheetHeader className="items-center text-center">
          <SheetTitle className="font-display text-2xl text-cream">{level?.title ?? "Regular"}</SheetTitle>
          <SheetDescription className="text-cream text-[14px] leading-snug max-w-[34ch] mx-auto">
            About {weekly} actions a week, averaged over your last 6 months - every pour, tasting,
            post, cheer, and comment counts the same.
          </SheetDescription>
          <p className="text-cream-mute text-[13px] mt-1">
            {level?.nextTitle && level.nextPoints != null
              ? `${weeklyRate(Math.max(0, level.nextPoints - level.points))}/wk more gets you to ${level.nextTitle}.`
              : "The top band - nothing above this yet."}
            {" "}Go quiet for a while and this can drop; it is not a badge.
          </p>
        </SheetHeader>
        {bands && (
          <ol className="mt-3.5 flex flex-col">
            {bands.map((b) => {
              const isCurrent = b.title === level?.title;
              return (
                <li key={b.title} className={`flex items-center gap-2.5 py-1.5 border-t border-black/35 text-[13px] ${isCurrent ? "text-brass-hi" : "text-cream-mute"}`}>
                  <span className={`font-display font-semibold ${isCurrent ? "text-brass-hi" : "text-cream"}`}>{b.title}</span>
                  <span className="ml-auto tabular-nums">{weeklyRate(b.minPoints)}+/wk</span>
                  {isCurrent && <span className="text-brass-hi">●</span>}
                </li>
              );
            })}
          </ol>
        )}
      </SheetContent>
    </Sheet>
  );
}
