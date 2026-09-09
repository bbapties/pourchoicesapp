"use client";

import type { ShelfBottle } from "@/lib/shelves";

/**
 * One bottle standing on a shelf (#87, part of #82).
 *
 * Wireframe line art in the app's palette — ivory fill, charcoal stroke — because every screen
 * gets styled together in Phase 5. Real photographs replace the silhouette the moment their
 * variant is marked shelf-ready (#83); until then this is a GHOST.
 *
 * THE GHOST MUST OCCUPY THE SAME SPACE AS THE REAL THING. Same width, same height, same footprint,
 * same mark underneath. Promoting an image has to change what a bottle looks like and nothing
 * about where anything on the shelf sits — otherwise the whole run reflows every time Brian
 * curates one bottle.
 */

/**
 * How tall a bottle stands, as a percentage of the run.
 *
 * A percentage rather than a pixel count because a shelf sizes itself so 2.5 fit the viewport
 * (#89) — a fixed height would clip on a short screen and float on a tall one.
 *
 * WHEN THE REAL HEIGHT IS KNOWN, IT WINS. A cut-out's pixel height only describes how it was
 * cropped, so scaling by the image would make a squat Blanton's and a tall bourbon the same size
 * on the shelf — which is exactly the thing that would give the illusion away. `bottle_height` is
 * millimetres of actual glass, measured against a tall-bottle reference so the tallest spirits
 * fill the shelf and everything else is honestly shorter.
 *
 * Without it we fall back to a deterministic pseudo-height, so a run of un-measured bottles still
 * has some variety instead of reading as a picket fence, and any given bottle is the same height
 * every time you see it.
 */
const TALL_REFERENCE_MM = 340;  // about the tallest a 750ml spirits bottle gets
const MAX_PCT = 94;             // the reference bottle nearly fills the run
const MIN_PCT = 45;             // a miniature still has to be visible and tappable
const FALLBACK_PCT = [78, 82, 86, 90, 80, 88];

function heightFor(id: string, heightMm: number | null): number {
  if (heightMm && heightMm > 0) {
    const pct = (heightMm / TALL_REFERENCE_MM) * MAX_PCT;
    return Math.max(MIN_PCT, Math.min(MAX_PCT, Math.round(pct)));
  }
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_PCT[h % FALLBACK_PCT.length];
}

/** Two or three short lines, so a ghost still tells you which bottle it is. */
function shortName(name: string): string[] {
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > 9) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
    if (lines.length === 3) break;
  }
  if (cur && lines.length < 3) lines.push(cur);
  return lines.slice(0, 3).map((l) => (l.length > 10 ? `${l.slice(0, 9)}…` : l));
}

/**
 * The status mark under the bottle, in the SAME two colours the bottle cards already use for
 * earmarks — green "had it", yellow "unverified and never had". Anything else gets no mark, which
 * is exactly what a card shows too.
 */
function markColor(b: ShelfBottle): string | null {
  const hadIt = b.status === "owned" || b.status === "tasted";
  if (hadIt) return "#22c55e";
  if (b.provisional) return "#FFD700";
  return null;
}

export default function BottleOnShelf({
  bottle,
  onPick,
}: {
  bottle: ShelfBottle;
  onPick?: (b: ShelfBottle) => void;
}) {
  const heightPct = heightFor(bottle.bottleId, bottle.heightMm);
  const isGhost = bottle.imageState !== "ready";
  const mark = markColor(bottle);
  const lines = isGhost ? shortName(bottle.name) : [];
  const firstLineY = 104 - (lines.length - 1) * 6;

  return (
    <button
      type="button"
      className="pc-slot"
      data-coach="home.bottle"
      style={{ height: `${heightPct}%` }}
      aria-label={isGhost ? `${bottle.name} — no shelf-ready image` : bottle.name}
      onClick={() => onPick?.(bottle)}
    >
      {isGhost ? (
        // The silhouette is drawn, not photographed: dashed so it reads as a stand-in rather than
        // a bottle whose label nobody can see.
        <svg viewBox="0 0 58 180" preserveAspectRatio="xMidYMax meet" aria-hidden="true"
             style={{ aspectRatio: "58 / 180" }}>
          <path
            d="M23 7h12v27c0 8 13 12 13 27v102c0 7-4 10-10 10H20c-6 0-10-3-10-10V61c0-15 13-19 13-27z"
            fill="#F7F7F7"
            stroke="#2F2F2F"
            strokeWidth="1.4"
            strokeDasharray="5 3"
          />
          {lines.map((l, i) => (
            <text
              key={i}
              x="29"
              y={firstLineY + i * 12}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="#2F2F2F"
              opacity="0.75"
            >
              {l}
            </text>
          ))}
        </svg>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bottle.imageUrl ?? ""}
          alt={bottle.name}
          loading="lazy"
          decoding="async"
          // Anchored to the bottom so every bottle stands ON the deck. A photograph with
          // different padding than its neighbours must not float above the wood.
          style={{ objectFit: "contain", objectPosition: "bottom" }}
        />
      )}

      {mark ? <span className="pc-mark" style={{ background: mark }} /> : null}
    </button>
  );
}
