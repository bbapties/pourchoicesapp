"use client";

import { useId } from "react";
import { GLYPH_KEYS } from "@/components/badges/BadgeSprite";

/**
 * The badge coin (#140, design canvas round 9 - "that's good enough", Brian 2026-09-18):
 * a matte black face, a wide brushed ring in the tier's metal with an inner step, four stars
 * in an arc across the top (the sub-tiers: lit metal when earned, dark recesses otherwise), and
 * the glyph as a 3D object standing off the face (one SVG lighting filter, #pc-pop3d). Diamond
 * has no metal ring - a pave of 68 stones in two rows. Locked is the same coin in dull metal
 * with no sweep, sparkle or aura.
 *
 * Every gradient is built per instance (useId) with its stops reading the :root ramps from
 * globals.css. A var() on a stop resolves against the stop's own ancestry, so a shared gradient
 * in a sprite could never take the tier colour - that is why the defs are inline here.
 *
 * Sizes that hold: 38 (ladder), 66 (toast / feed card), 100 (shelf), 124 (sheet).
 * Needs <BadgeSprite /> mounted once on the page.
 */
export type MedalTier = 0 | 1 | 2 | 3 | 4 | 5;
export const TIER_NAME: Record<MedalTier, string> = { 0: "Locked", 1: "Bronze", 2: "Silver", 3: "Gold", 4: "Platinum", 5: "Diamond" };
const TIER_KEY: Record<MedalTier, string> = { 0: "locked", 1: "bronze", 2: "silver", 3: "gold", 4: "platinum", 5: "diamond" };

type Props = {
  tier: MedalTier;
  glyph: string;
  /** stars lit, 0-4 (sub_tier) */
  stars?: number;
  /** the Hound family: the category initial stamped on the bottle's label */
  initial?: string | null;
  size?: number;
  className?: string;
  title?: string;
};

const POLAR = (r: number, deg: number) => [70 + r * Math.cos((deg * Math.PI) / 180), 70 + r * Math.sin((deg * Math.PI) / 180)] as const;

export default function Medal({ tier, glyph, stars = 0, initial, size = 100, className, title }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const k = TIER_KEY[tier];
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

      {/* the matte black face */}
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

      {/* four stars in an arc across the top: the sub-tiers */}
      {[-33, -11, 11, 33].map((deg, i) => {
        const [x, y] = POLAR(44, -90 + deg);
        return i < stars ? (
          <use key={i} href="#pc-star5" x={x - 5} y={y - 5} width="10" height="10" fill={`url(#${rel})`} filter="url(#pc-pop3d)" />
        ) : (
          <use key={i} href="#pc-star5" x={x - 5} y={y - 5} width="10" height="10" fill="#1d1d1e" stroke="#000" strokeWidth=".4" />
        );
      })}

      {/* the glyph, standing off the face */}
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
