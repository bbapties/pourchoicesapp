"use client";

import { useId, useState } from "react";
import { GLYPH_KEYS } from "@/components/badges/BadgeSprite";
import {
  TIER_NAME,
  frameFor,
  hasObject,
  type MedalFrame,
  type MedalTier,
} from "@/lib/badgeArt";

export type { MedalTier, MedalFrame };
export { TIER_NAME };

/**
 * The badge coin (#150): a photoreal plate (public/badges/frames) with the badge's SVG glyph
 * inlaid in the well and 0–4 stars drawn on top. The glyph is the interim object layer - each
 * badge's 3D cutout (public/badges/objects, `hasObject`) replaces it one at a time. The all-SVG coin (#140) only draws now if the
 * plate image fails to load, so the shelf never blanks.
 *
 * Sizes that hold: 38 (ladder), 66 (toast / feed card), 100 (shelf), 124 (sheet).
 * Glyphs need <BadgeSprite /> mounted once on the page.
 */

/** SVG-only metal ramps. Wood has no old ramp so it borrows bronze. */
const SVG_METAL: Record<MedalTier, string> = {
  0: "locked",
  1: "bronze",
  2: "bronze",
  3: "silver",
  4: "gold",
  5: "diamond",
};

type Props = {
  tier: MedalTier;
  glyph: string;
  /** stars lit, 0-4 (sub_tier). Growing and centered; no empty seats. */
  stars?: number;
  /** the Hound family: the category initial stamped on the bottle's label */
  initial?: string | null;
  size?: number;
  className?: string;
  title?: string;
  badgeId?: string;
  oneOff?: boolean;
  /** the plate alone - no object, no glyph. The reveal's "something is under here" state. */
  mystery?: boolean;
};

const POLAR = (r: number, deg: number) => [70 + r * Math.cos((deg * Math.PI) / 180), 70 + r * Math.sin((deg * Math.PI) / 180)] as const;

const STAR_FILL: Record<MedalFrame, string> = {
  locked: "var(--medal-locked-hi)",
  wood: "var(--medal-wood-hi)",
  bronze: "var(--medal-bronze-hi)",
  silver: "var(--medal-silver-hi)",
  gold: "var(--medal-gold-hi)",
  diamond: "var(--medal-diamond-hi)",
  limited: "var(--medal-limited-hi)",
};

function starAngles(n: number): number[] {
  const c = Math.max(0, Math.min(4, n | 0));
  if (c === 0) return [];
  if (c === 1) return [-90];
  const gap = 16;
  const span = gap * (c - 1);
  const start = -90 - span / 2;
  return Array.from({ length: c }, (_, i) => start + i * gap);
}

function StarOverlay({ count, size, frame }: { count: number; size: number; frame: MedalFrame }) {
  const angles = starAngles(count);
  if (!angles.length) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.385;
  const s = size * 0.078;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {angles.map((deg, i) => {
        const x = cx + r * Math.cos((deg * Math.PI) / 180) - s / 2;
        const y = cy + r * Math.sin((deg * Math.PI) / 180) - s / 2;
        return (
          <svg key={i} x={x} y={y} width={s} height={s} viewBox="0 0 10 10">
            <path d="M5 .4 L6.35 3.55 L9.75 3.85 L7.15 6.1 L7.95 9.45 L5 7.7 L2.05 9.45 L2.85 6.1 L.25 3.85 L3.65 3.55Z" fill={STAR_FILL[frame]} />
          </svg>
        );
      })}
    </svg>
  );
}

/**
 * The glyph, drawn in the well of a photoreal plate. Same <use> geometry as the SVG coin
 * (72/140 of the disc) so it sits inside every well, wood's included. Paints come from the
 * frame's metal ramp, so the glyph reads as an inlay in that metal. Interim until each badge
 * has a 3D object cutout (#150) - then this layer is swapped for the object image.
 */
function GlyphOverlay({ glyph, frame, size, initial }: { glyph: string; frame: MedalFrame; size: number; initial?: string | null }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const v = (part: "hi" | "" | "lo") => `var(--medal-${frame}${part ? "-" + part : ""})`;
  const g = GLYPH_KEYS.has(glyph) ? glyph : "g-pour";
  const locked = frame === "locked";
  const rel = `${id}rel`;
  return (
    <svg
      viewBox="0 0 140 140"
      width={size}
      height={size}
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: "visible", ["--gfill" as string]: `url(#${rel})`, ["--ghi" as string]: v("hi") }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={rel} x1="0" y1="0" x2=".35" y2="1">
          <stop offset="0" stopColor={v("hi")} /><stop offset=".5" stopColor={v("")} /><stop offset="1" stopColor={v("lo")} />
        </linearGradient>
      </defs>
      <g filter={locked ? undefined : "url(#pc-pop3d)"} opacity={locked ? 0.45 : 1}>
        <use href={`#${g}`} x="34" y="35" width="72" height="72" />
        {g === "g-hound" && initial && (
          <text x="70" y="82.5" textAnchor="middle" fontFamily="var(--font-display), Georgia, serif" fontWeight="700" fontSize="16" fill={v("hi")}>
            {initial.slice(0, 1).toUpperCase()}
          </text>
        )}
      </g>
    </svg>
  );
}

export default function Medal({ tier, glyph, stars = 0, initial, size = 100, className, title, badgeId, oneOff, mystery }: Props) {
  const frame = frameFor(tier, !!oneOff, badgeId ?? "");
  const [plateFailed, setPlateFailed] = useState(false);
  const [objectFailed, setObjectFailed] = useState(false);
  const object = !!badgeId && hasObject(badgeId) && !objectFailed;
  if (plateFailed) {
    return <SvgMedal tier={tier} glyph={glyph} stars={stars} initial={initial} size={size} className={className} title={title} />;
  }
  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height: size, display: "block" }}
      role="img"
      aria-label={title}
    >
      <img
        src={`/badges/frames/${frame}.webp`}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={() => setPlateFailed(true)}
        style={{ position: "absolute", inset: 0, display: "block" }}
      />
      {mystery ? null : object ? (
        // the badge's 3D object, in front of the plate; dimmed on the locked plate like the glyph
        <img
          src={`/badges/objects/${badgeId}.webp`}
          alt=""
          width={size}
          height={size}
          draggable={false}
          onError={() => setObjectFailed(true)}
          style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none", opacity: frame === "locked" ? 0.45 : 1 }}
        />
      ) : (
        <GlyphOverlay glyph={glyph} frame={frame} size={size} initial={initial} />
      )}
      <StarOverlay count={stars} size={size} frame={frame} />
    </div>
  );
}

function SvgMedal({ tier, glyph, stars = 0, initial, size = 100, className, title }: Omit<Props, "badgeId" | "oneOff">) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const k = SVG_METAL[tier];
  const v = (part: "hi" | "" | "lo" | "ink") => `var(--medal-${k}${part ? "-" + part : ""})`;
  const g = GLYPH_KEYS.has(glyph) ? glyph : "g-pour";
  const locked = tier === 0;
  const diamond = tier === 5;
  const rim = `${id}rim`, brush = `${id}brush`, rel = `${id}rel`, face = `${id}face`, aura = `${id}aura`;

  const outer: (readonly [number, number])[] = [];
  const inner: (readonly [number, number])[] = [];
  if (diamond) {
    for (let i = 0; i < 36; i++) outer.push(POLAR(64.2, (i / 36) * 360));
    for (let i = 0; i < 32; i++) inner.push(POLAR(59.4, ((i + 0.5) / 32) * 360));
  }

  return (
    <svg
      viewBox="0 0 140 140"
      width={size}
      height={size}
      className={className}
      style={{ display: "block", overflow: "visible", ["--gfill" as string]: `url(#${rel})`, ["--ghi" as string]: v("hi") }}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={v("hi")} /><stop offset=".25" stopColor={v("")} /><stop offset=".48" stopColor={v("lo")} />
          <stop offset=".62" stopColor={v("")} /><stop offset=".82" stopColor={v("hi")} /><stop offset="1" stopColor={v("")} />
        </linearGradient>
        <radialGradient id={brush} cx=".5" cy=".5" r=".5">
          {Array.from({ length: 41 }, (_, i) => (
            <stop key={i} offset={(0.8 + (i * 0.2) / 40).toFixed(4)} stopColor="#fff" stopOpacity={i % 2 ? 0.11 : 0} />
          ))}
        </radialGradient>
        <linearGradient id={rel} x1="0" y1="0" x2=".35" y2="1">
          <stop offset="0" stopColor={v("hi")} /><stop offset=".5" stopColor={v("")} /><stop offset="1" stopColor={v("lo")} />
        </linearGradient>
        <radialGradient id={face} cx=".5" cy=".42" r=".7">
          <stop offset="0" stopColor={locked ? "#1c1a18" : "var(--medal-face-hi)"} /><stop offset=".6" stopColor={locked ? "#121110" : "var(--medal-face)"} /><stop offset="1" stopColor="var(--medal-face-lo)" />
        </radialGradient>
        <radialGradient id={aura} cx=".5" cy=".5" r=".5">
          <stop offset=".8" stopColor={v("")} stopOpacity="0" /><stop offset=".92" stopColor={v("")} stopOpacity=".35" /><stop offset="1" stopColor={v("")} stopOpacity="0" />
        </radialGradient>
      </defs>

      {!locked && <circle cx="70" cy="70" r="70" fill={`url(#${aura})`} />}

      {diamond ? (
        <>
          <circle cx="70" cy="70" r="68" fill="var(--medal-pave-edge)" filter="url(#pc-drop)" />
          <circle cx="70" cy="70" r="67.2" fill="var(--medal-pave-base)" />
          <g fill="var(--medal-pave-seat)">
            {outer.map(([x, y], i) => <circle key={`o${i}`} cx={x} cy={y} r="3.6" />)}
            {inner.map(([x, y], i) => <circle key={`i${i}`} cx={x} cy={y} r="3.4" />)}
          </g>
          <g fill="url(#pc-stone)" filter="url(#pc-glow)">
            {outer.map(([x, y], i) => <circle key={`o${i}`} cx={x} cy={y} r="3.1" />)}
            {inner.map(([x, y], i) => <circle key={`i${i}`} cx={x} cy={y} r="2.9" />)}
          </g>
          <circle cx="70" cy="70" r="56.6" fill="none" stroke="#2c3236" strokeWidth="1.4" />
        </>
      ) : (
        <>
          <circle cx="70" cy="70" r="68" fill={v("lo")} filter="url(#pc-drop)" />
          <circle cx="70" cy="70" r="67.2" fill={`url(#${rim})`} />
          <circle cx="70" cy="70" r="67.2" fill={`url(#${brush})`} />
          <circle cx="70" cy="70" r="67.2" fill="none" stroke="#fff" strokeWidth=".6" opacity=".45" />
          <circle cx="70" cy="70" r="61" fill="none" stroke={v("lo")} strokeWidth="1.3" opacity=".85" />
          <circle cx="70" cy="70" r="59.8" fill="none" stroke={v("hi")} strokeWidth="1" opacity=".8" />
          <circle cx="70" cy="70" r="56.6" fill="none" stroke={v("ink")} strokeWidth="1.4" opacity=".9" />
        </>
      )}

      <circle cx="70" cy="70" r="56" fill="#000" />
      <circle cx="70" cy="70" r="55.2" fill={`url(#${face})`} />
      <circle cx="70" cy="70" r="55.2" fill="none" stroke="#000" strokeWidth="2" opacity=".9" />

      {!locked && (
        <>
          <g clipPath="url(#pc-faceClip)">
            <rect className="pc-medal-flash" x="40" y="-10" width="34" height="160" fill="url(#pc-flashG)" opacity=".22" transform="skewX(-20)" />
          </g>
          <use className="pc-medal-spark" href="#pc-sparkle" x="30" y="36" width="7" height="7" />
          <use className="pc-medal-spark" href="#pc-sparkle" x="100" y="40" width="5" height="5" style={{ animationDelay: ".9s" }} />
        </>
      )}

      {starAngles(stars).map((deg, i) => {
        const [x, y] = POLAR(44, deg);
        return (
          <use key={i} href="#pc-star5" x={x - 5} y={y - 5} width="10" height="10" fill={`url(#${rel})`} filter="url(#pc-pop3d)" />
        );
      })}

      <g filter={locked ? undefined : "url(#pc-pop3d)"} opacity={locked ? 0.4 : 1}>
        <use href={`#${g}`} x="34" y="35" width="72" height="72" />
        {g === "g-hound" && initial && (
          <text x="70" y="82.5" textAnchor="middle" fontFamily="var(--font-display), Georgia, serif" fontWeight="700" fontSize="16" fill={v("hi")}>
            {initial.slice(0, 1).toUpperCase()}
          </text>
        )}
      </g>
    </svg>
  );
}
