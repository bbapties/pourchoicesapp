"use client";

import Link from "next/link";
import { ScanLine } from "lucide-react";
import type { ShelfDef } from "@/lib/shelves";

/**
 * One shelf of the Home cabinet (#86, part of #82).
 *
 * A shallow box about one bottle deep: top panel, back wall, deck, and the front lip that carries
 * the label. Geometry lives in globals.css under `.pc-*` — clip paths, gradients and a fixed
 * 276px block are not things Tailwind expresses usefully.
 *
 * What is NOT here yet, on purpose:
 *   #87 the bottles and their status light
 *   #88 the horizontal run, its paging, and the two END walls (which scroll WITH the bottles —
 *       they are the ends of a long box you pan along, not a frame around the screen)
 *   #89 the vertical stack and the 2.5-shelf peek
 *
 * The children slot is where the run goes, so #88 can drop in without touching the box.
 */
export default function Shelf({
  shelf,
  count,
  isEmpty,
  onPlateOpen,
  onScanFromEmpty,
  children,
}: {
  shelf: ShelfDef;
  /** Total length of the run, shown on the plate. Null while it is still being counted. */
  count: number | null;
  /** True only once we know the run is genuinely empty — not merely still loading. */
  isEmpty: boolean;
  /** The plate is the door to a tab; Home wants to know which doors get used. */
  onPlateOpen?: () => void;
  /** Taken from the empty-bar prompt — the one measure of whether that prompt works. */
  onScanFromEmpty?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="pc-shelf" aria-label={shelf.label} data-coach="home.shelf">
      <div className="pc-face pc-back" />
      <div className="pc-face pc-top" />
      <div className="pc-face pc-deck" />

      {isEmpty ? (
        <div className="pc-empty">
          <strong>{shelf.empty.title}</strong>
          {shelf.empty.body}
          {/* The one-tap way out of empty. It links to Search with the scanner already open
              rather than mounting a second scanner here, so the match / owned-version /
              add-provisional flow stays in one place. The camera needs HTTPS, so this cannot
              be exercised on the LAN URL — prod or a tunnel only. */}
          {shelf.empty.cta ? (
            <div>
              <Link href="/search?scan=1" onClick={onScanFromEmpty}>
                <ScanLine size={17} aria-hidden="true" />
                {shelf.empty.cta.label}
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        children
      )}

      <div className="pc-face pc-lip" />

      {/* The plate names the shelf AND opens it: Home is a zoomed-out view of the other tabs. */}
      {shelf.href ? (
        <Link
          href={shelf.href}
          className="pc-plate"
          data-coach="home.plate"
          aria-label={`Open ${shelf.label}`}
          onClick={onPlateOpen}
        >
          {shelf.label}
          {count !== null ? <span className="pc-plate-count">{count}</span> : null}
          <span className="pc-plate-go" aria-hidden="true">
            ›
          </span>
        </Link>
      ) : (
        // A user-page shelf (#110) has no tab behind it yet: the plate is a label, not a door.
        <span className="pc-plate" aria-label={shelf.label}>
          {shelf.label}
          {count !== null ? <span className="pc-plate-count">{count}</span> : null}
        </span>
      )}
    </section>
  );
}
