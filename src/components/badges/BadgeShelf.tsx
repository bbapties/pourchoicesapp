"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import Medal, { TIER_NAME, type MedalTier } from "@/components/badges/Medal";
import BadgeSprite from "@/components/badges/BadgeSprite";
import { fetchShelf, runAwards, type ShelfItem } from "@/lib/badges";
import { logClick } from "@/lib/events";
import { howToEarn } from "@/lib/badgeCopy";
import { fetchReleased } from "@/lib/badgeRelease";

/**
 * The badge shelf on a user page (#139). Earned first (highest tier first) with the distance to
 * the next rung, then in progress, then not started - dull coins with a hint of what to do, which
 * is the tutorial in disguise. Tap a coin for the sheet: what it is for, the five thresholds,
 * when each was earned. Design record: the #140 canvas, round 9.
 */
export default function BadgeShelf({ userId, viewerId, own, surface, reloadKey = 0 }: {
  userId: string;
  viewerId: string | null;
  own: boolean;
  surface: string;
  reloadKey?: number;
}) {
  const [items, setItems] = useState<ShelfItem[] | null>(null);
  const [released, setReleased] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<ShelfItem | null>(null);
  // `/profile?badge=<id>` opens that badge's sheet - the reveal's "More details" lands here.
  // Read once from the URL (no useSearchParams: that needs a Suspense boundary at build time).
  const [wantBadge, setWantBadge] = useState<string | null>(null);
  useEffect(() => {
    if (!own) return;
    const id = new URLSearchParams(window.location.search).get("badge");
    if (id) setWantBadge(id);
  }, [own]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // your own page re-runs the engine first, so a badge you just earned is already there
      if (own) await runAwards(userId);
      const [shelf, rel] = await Promise.all([fetchShelf(userId), fetchReleased(userId)]);
      if (!alive) return;
      setItems(shelf);
      setReleased(rel);
    })();
    return () => { alive = false; };
  }, [userId, own, reloadKey]);

  useEffect(() => {
    if (!wantBadge || !items) return;
    const it = items.find((i) => i.def.id === wantBadge);
    if (it) setOpen(it);
    setWantBadge(null);
    window.history.replaceState(null, "", window.location.pathname); // one-shot: a refresh does not reopen it
  }, [wantBadge, items]);

  if (items === null) return <div className="mx-4 h-[120px]" />;

  // Unreleased badges (badge_releases via src/lib/badgeRelease.ts) sit under "Coming soon" whatever
  // the user holds; the engine keeps counting behind the scenes so credit is there on release day.
  const isReleased = (id: string) => released.has(id);
  const live = items.filter((i) => isReleased(i.def.id));
  const soon = items.filter((i) => !isReleased(i.def.id));
  const earned = live.filter((i) => i.tier > 0).sort((a, b) => b.tier - a.tier || (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""));
  const started = live.filter((i) => i.tier === 0 && i.progress > 0).sort((a, b) => ratio(b) - ratio(a));
  const locked = live.filter((i) => i.tier === 0 && i.progress === 0);
  const openSheet = (it: ShelfItem) => {
    setOpen(it);
    logClick("badge_sheet_opened", { userId: viewerId, surface, targetId: it.def.id, metadata: { tier: it.tier, own } });
  };

  return (
    <>
      <BadgeSprite />
      {released.size > 0 && earned.length === 0 && started.length === 0 ? (
        <p className="mx-4 rounded-lg px-4 py-[18px] text-center text-xs text-cream-mute border border-dashed border-edge bg-panel">
          {own ? "Nothing yet - pour something, scan something, blind something." : "No badges yet."}
        </p>
      ) : null}

      {earned.length > 0 && (
        <Grid>
          {earned.map((it) => (
            <Cell key={it.def.id} item={it} onOpen={openSheet}>
              <div className="text-[10.5px] text-cream-faint tracking-[.06em] uppercase">{it.def.oneOff ? "One-off" : TIER_NAME[it.tier]}</div>
              {it.next && <Progress item={it} />}
            </Cell>
          ))}
        </Grid>
      )}

      {started.length > 0 && (
        <>
          <Divider>In progress</Divider>
          <Grid>
            {started.map((it) => (
              <Cell key={it.def.id} item={it} onOpen={openSheet}><Progress item={it} /></Cell>
            ))}
          </Grid>
        </>
      )}

      {locked.length > 0 && (
        <>
          <Divider>Not started</Divider>
          <Grid>
            {locked.map((it) => (
              <Cell key={it.def.id} item={it} onOpen={openSheet} dim>
                <div className="text-[10.5px] text-cream-faint">{it.def.hint ?? ""}</div>
              </Cell>
            ))}
          </Grid>
        </>
      )}

      {soon.length > 0 && (
        <>
          <Divider>Coming soon</Divider>
          <Grid>
            {soon.map((it) => (
              <Cell key={it.def.id} item={{ ...it, tier: 0, subTier: 0 }} onOpen={openSheet} dim>
                <div className="text-[10.5px] text-brass-hi tracking-[.06em] uppercase">Coming soon</div>
              </Cell>
            ))}
          </Grid>
        </>
      )}

      <BadgeSheet item={open} released={!!open && isReleased(open.def.id)} onClose={() => setOpen(null)} />
    </>
  );
}

const ratio = (i: ShelfItem) => (i.next ? i.progress / i.next.threshold : 1);

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="mx-3 pc-leather rounded-xl px-1 pt-4 pb-3 grid grid-cols-3 gap-x-0.5 gap-y-4">{children}</div>;
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 mt-3.5 mb-2 text-[10.5px] text-cream-faint tracking-[.12em] uppercase flex items-center gap-2.5">
      {children}<span className="flex-1 h-px bg-edge" />
    </div>
  );
}

function Cell({ item, onOpen, dim, children }: { item: ShelfItem; onOpen: (i: ShelfItem) => void; dim?: boolean; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => onOpen(item)} className="flex flex-col items-center gap-1 text-center" aria-label={`${item.def.name}, ${item.tier ? TIER_NAME[item.tier] : "not started"}`}>
      <Medal tier={item.tier} glyph={item.def.glyph} stars={item.subTier} initial={item.def.category} size={100} badgeId={item.def.id} oneOff={item.def.oneOff} />
      <div className={`font-display font-semibold text-[12px] leading-tight ${dim ? "text-cream-faint" : "text-cream"}`}>{item.def.name}</div>
      {children}
    </button>
  );
}

function Progress({ item }: { item: ShelfItem }) {
  if (!item.next) return null;
  const pct = Math.min(100, Math.round((item.progress / item.next.threshold) * 100));
  return (
    <>
      <div className="w-16 h-1 rounded bg-black/55 overflow-hidden shadow-[inset_0_1px_1px_rgba(0,0,0,.6)]">
        <i className="block h-full bg-gradient-to-r from-brass-lo to-brass-hi" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10.5px] text-cream-mute tabular-nums">{item.progress} / {item.next.threshold} to {TIER_NAME[item.next.tier as MedalTier]}</div>
    </>
  );
}

/** Sheet medal: 2.5x the 100px shelf coin, capped so it clears the ladder on a short phone. */
const MEDAL_SHEET = 250;

export function BadgeSheet({ item, released, onClose }: { item: ShelfItem | null; released: boolean; onClose: () => void }) {
  const d = item?.def;
  return (
    <Sheet open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="pc-leather max-h-[92dvh] overflow-y-auto">
        {item && d && (
          <>
            <SheetHeader className="items-center text-center">
              {/* the medal is the point of the sheet - 2.5x the shelf coin (Brian, 2026-09-21) */}
              <Medal tier={released ? item.tier : 0} glyph={d.glyph} stars={released ? item.subTier : 0} initial={d.category} size={MEDAL_SHEET} badgeId={d.id} oneOff={d.oneOff} className="mx-auto" />
              <SheetTitle className="font-display text-2xl text-cream mt-1">{d.name}</SheetTitle>
              <SheetDescription className="text-cream text-[14px] leading-snug max-w-[34ch] mx-auto">
                {howToEarn(d)}
              </SheetDescription>
              <p className="text-cream-mute text-[13px] mt-1">
                {released ? describe(item) : "Coming soon. What you do now still counts toward it."}
              </p>
            </SheetHeader>
            {released && <ol className="mt-3.5 flex flex-col">
              {d.tiers.map((t) => {
                const got = item.tier >= t.tier;
                const isNext = item.next?.tier === t.tier;
                return (
                  <li key={t.tier} className="flex items-center gap-2.5 py-1.5 border-t border-black/35 text-[13px]">
                    <Medal tier={(got ? t.tier : 0) as MedalTier} glyph={d.glyph} initial={d.category} size={38} badgeId={d.id} oneOff={d.oneOff} />
                    <span className="w-[74px] font-display font-semibold text-cream">{d.oneOff ? "Earned" : TIER_NAME[t.tier as MedalTier]}</span>
                    <span className="w-[70px] text-cream-mute tabular-nums">{d.oneOff ? "" : t.threshold}</span>
                    <span className={`ml-auto text-xs ${isNext ? "text-brass-hi" : "text-cream-faint"}`}>
                      {got && item.tier === t.tier && item.earnedAt ? formatDay(item.earnedAt) : got ? "earned" : isNext ? `${Math.max(0, t.threshold - item.progress)} to go` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function describe(it: ShelfItem): string {
  const d = it.def;
  if (d.oneOff) return it.tier ? `Earned${it.earnedAt ? ` ${formatDay(it.earnedAt)}` : ""}.` : "Not yet.";
  if (!it.tier) return `${it.progress} so far${it.next ? ` - ${TIER_NAME[it.next.tier as MedalTier]} at ${it.next.threshold}` : ""}.`;
  return `You are on ${TIER_NAME[it.tier]} - ${it.progress} so far${it.next ? `, ${TIER_NAME[it.next.tier as MedalTier]} at ${it.next.threshold}` : ", the top"}.`;
}
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
