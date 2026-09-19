"use client";

/**
 * The badge glyphs (#140) - one <symbol> per badge, 40x40, plus the 3D filter and the fixed
 * paints. Rendered once (hidden) by BadgeSprite; Medal draws them with <use>. Classes inside the
 * symbols are plain (.pc-g-fill / -line / -dot / -liquid / -glass, styled in globals.css) on purpose: a descendant selector
 * cannot reach into a <use> shadow tree, and the paints come through custom properties set on
 * the Medal (--gfill / --ghi), which DO inherit into it. Design record: the #140 canvas, round 9.
 */
const SPRITE = `
<defs>
  <linearGradient id="pc-amberG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--medal-amber-hi)"/><stop offset=".5" stop-color="var(--medal-amber)"/><stop offset="1" stop-color="var(--medal-amber-lo)"/></linearGradient>
  <linearGradient id="pc-glassG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".45" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity=".32"/></linearGradient>
  <linearGradient id="pc-flashG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="pc-stone" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#eaf6ff"/><stop offset=".8" stop-color="#9ccbea"/><stop offset="1" stop-color="#4c86ab"/></radialGradient>
  <filter id="pc-drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity=".8"/></filter>
  <filter id="pc-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="pc-pop3d" x="-25%" y="-25%" width="150%" height="160%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="blur"/>
    <feSpecularLighting in="blur" surfaceScale="5" specularConstant=".85" specularExponent="16" lighting-color="#ffffff" result="spec"><fePointLight x="-30" y="-50" z="140"/></feSpecularLighting>
    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
    <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit"/>
    <feDropShadow in="lit" dx="0" dy="2.2" stdDeviation="1.6" flood-color="#000" flood-opacity=".85"/>
  </filter>
  <clipPath id="pc-faceClip"><circle cx="70" cy="70" r="55"/></clipPath>
  <symbol id="pc-sparkle" viewBox="0 0 10 10"><path d="M5 0 C5.4 3.2 6.8 4.6 10 5 C6.8 5.4 5.4 6.8 5 10 C4.6 6.8 3.2 5.4 0 5 C3.2 4.6 4.6 3.2 5 0Z" fill="#fff"/></symbol>
  <symbol id="pc-star5" viewBox="0 0 10 10"><path d="M5 .4 L6.35 3.55 L9.75 3.85 L7.15 6.1 L7.95 9.45 L5 7.7 L2.05 9.45 L2.85 6.1 L.25 3.85 L3.65 3.55Z"/></symbol>
<symbol id="g-pour" viewBox="0 0 40 40">
      <path class="pc-g-fill" d="M12 34.5 H28 L27 32.5 H13 Z"/>
      <path class="pc-g-glass" d="M14.5 4 H25.5 C26 11 31 14 31 20.5 C31 26.5 26.5 29.5 23 30.5 V32.5 H17 V30.5 C13.5 29.5 9 26.5 9 20.5 C9 14 14 11 14.5 4 Z"/>
      <path class="pc-g-liquid" d="M9.9 21 C9.9 26.4 14 29 17.2 29.9 H22.8 C26 29 30.1 26.4 30.1 21 C27 22.6 13 22.6 9.9 21 Z"/>
      <ellipse cx="20" cy="21.2" rx="10" ry="1.6" fill="#fff" opacity=".28"/>
      <path class="pc-g-line" d="M14.5 4 H25.5 C26 11 31 14 31 20.5 C31 26.5 26.5 29.5 23 30.5 V32.5 H17 V30.5 C13.5 29.5 9 26.5 9 20.5 C9 14 14 11 14.5 4 Z" style="stroke-width:1.1"/>
      <path class="pc-g-line" d="M12 34.5 H28 L27 32.5 H13 Z" style="stroke-width:.9"/>
      <path d="M13.2 8 C12.6 12 11 14.5 11 19" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
    </symbol>
    <symbol id="g-streak" viewBox="0 0 40 40"><path class="pc-g-fill" d="M20 5c1.6 5 7 6.5 7 14a7 7 0 0 1-14 0c0-2.6 1-4.6 2.4-6 .6 2.2 1.6 3.6 3 4.2C18.3 13 19 9 20 5Z"/><path class="pc-g-line" d="M20 5c1.6 5 7 6.5 7 14a7 7 0 0 1-14 0c0-2.6 1-4.6 2.4-6 .6 2.2 1.6 3.6 3 4.2C18.3 13 19 9 20 5Z"/><path class="pc-g-line" d="M20 14c1 2.4 3 3.4 3 6.2a3 3 0 0 1-6 0c0-1.2.5-2.2 1.2-2.9.4 1 .9 1.6 1.5 1.9.1-1.8.2-3.5.3-5.2Z" style="opacity:.8"/><path class="pc-g-line" d="M9 33h22M11 30v3M15 30v3M19 30v3M23 30v3M27 30v3"/><circle class="pc-g-dot" cx="11" cy="28" r="1.1"/><circle class="pc-g-dot" cx="15" cy="28" r="1.1"/><circle class="pc-g-dot" cx="19" cy="28" r="1.1"/></symbol>
    <symbol id="g-blind" viewBox="0 0 40 40"><path class="pc-g-fill" d="M4 16c6-6 26-6 32 0v7c-6 6-26 6-32 0Z"/><path class="pc-g-line" d="M4 16c6-6 26-6 32 0v7c-6 6-26 6-32 0Z"/><path class="pc-g-line" d="M36 17l3-3M36 22l3 2.5" style="opacity:.9"/><path class="pc-g-line" d="M9 19.5c3-1 5-1 8 0M23 19.5c3-1 5-1 8 0" style="opacity:.6"/><path class="pc-g-line" d="M13 28c2 2 12 2 14 0" style="opacity:.8"/></symbol>
    <symbol id="g-flight" viewBox="0 0 40 40"><path class="pc-g-fill" d="M5 9h7l-.9 8.5a2.6 2.6 0 0 1-5.2 0Z"/><path class="pc-g-fill" d="M16.5 9h7l-.9 8.5a2.6 2.6 0 0 1-5.2 0Z"/><path class="pc-g-fill" d="M28 9h7l-.9 8.5a2.6 2.6 0 0 1-5.2 0Z"/><path class="pc-g-line" d="M5 9h7l-.9 8.5a2.6 2.6 0 0 1-5.2 0ZM16.5 9h7l-.9 8.5a2.6 2.6 0 0 1-5.2 0ZM28 9h7l-.9 8.5a2.6 2.6 0 0 1-5.2 0Z"/><path class="pc-g-line" d="M8.5 21v4M20 21v4M31.5 21v4"/><path class="pc-g-line" d="M3 27h34v3H3Z"/><path class="pc-g-line" d="M7 30v3M33 30v3" style="opacity:.7"/><text x="8.5" y="15.5" text-anchor="middle" font-family="Playfair Display,serif" font-weight="700" font-size="6">A</text><text x="20" y="15.5" text-anchor="middle" font-family="Playfair Display,serif" font-weight="700" font-size="6">B</text><text x="31.5" y="15.5" text-anchor="middle" font-family="Playfair Display,serif" font-weight="700" font-size="6">C</text></symbol>
    <symbol id="g-helper" viewBox="0 0 40 40"><path class="pc-g-fill" d="M24 5h7v4l1.5 2v9h-10v-9l1.5-2Z" transform="rotate(35 27 12)"/><path class="pc-g-line" d="M24 5h7v4l1.5 2v9h-10v-9l1.5-2Z" transform="rotate(35 27 12)"/><path class="pc-g-line" d="M17 19c.5 2 1 3 2 4" style="opacity:.8"/><path class="pc-g-fill" d="M8 22h12l-1.2 8a5 5 0 0 1-9.6 0Z"/><path class="pc-g-line" d="M8 22h12l-1.2 8a5 5 0 0 1-9.6 0ZM14 35v2M11 37h6"/><path class="pc-g-line" d="M4 17c2-3 5-3 7-1l3 3" style="opacity:.8"/></symbol>
    <symbol id="g-collect" viewBox="0 0 40 40"><path class="pc-g-fill" d="M15 5h10v5l2 3v20H13V13l2-3Z"/><path class="pc-g-line" d="M15 5h10v5l2 3v20H13V13l2-3Z"/><path class="pc-g-line" d="M15 4h10" /><path class="pc-g-line" d="M15 18h10v9H15Z" style="opacity:.9"/><path class="pc-g-line" d="M17 21h6M17 24h4" style="opacity:.6"/><path class="pc-g-line" d="M6 33h28M8 36h24" style="opacity:.6"/></symbol>
    <symbol id="g-dead" viewBox="0 0 40 40"><g transform="rotate(70 20 21)"><path class="pc-g-fill" d="M15 5h10v5l2 3v20H13V13l2-3Z"/><path class="pc-g-line" d="M15 5h10v5l2 3v20H13V13l2-3Z"/><path class="pc-g-line" d="M15 18h10v9H15Z" style="opacity:.9"/><path class="pc-g-line" d="M17 20.5l6 4M23 20.5l-6 4" style="opacity:.9"/></g><path class="pc-g-line" d="M5 34h30" style="opacity:.6"/><path class="pc-g-line" d="M31 30c1.5-.5 2.5-.5 4 0" style="opacity:.6"/></symbol>
    <symbol id="g-travel" viewBox="0 0 40 40"><circle class="pc-g-fill" cx="20" cy="20" r="14"/><path class="pc-g-line" d="M6 20h28M20 6c5 4.5 5 23.5 0 28M20 6c-5 4.5-5 23.5 0 28"/><circle class="pc-g-line" cx="20" cy="20" r="14"/><path class="pc-g-line" d="M8.5 13c3.5 1.5 19.5 1.5 23 0M8.5 27c3.5-1.5 19.5-1.5 23 0" style="opacity:.7"/><path class="pc-g-line" d="M17 17.5c1.2-.8 2.4 0 3 1.2s2 1.6 3 .6" style="opacity:.8"/></symbol>
    <symbol id="g-barcode" viewBox="0 0 40 40"><path class="pc-g-fill" d="M5 9h30v20H5Z" style="opacity:.25"/><path class="pc-g-line" d="M8 12v14M11 12v14M15 12v14M17 12v14M21 12v14M25 12v14M28 12v14M32 12v14"/><path class="pc-g-line" d="M12.5 12v14M22.5 12v14M30 12v14" style="stroke-width:2.4"/><path class="pc-g-line" d="M5 7v4M35 7v4M5 29v4M35 29v4" style="opacity:.8"/><path class="pc-g-line" d="M3 20h34" style="opacity:.55;stroke-width:1"/><text x="20" y="34.5" text-anchor="middle" font-family="Source Sans 3,sans-serif" font-size="5" letter-spacing="1">0 88004 01</text></symbol>
    <symbol id="g-wish" viewBox="0 0 40 40"><path class="pc-g-fill" d="M11 5h18v30l-9-7-9 7Z"/><path class="pc-g-line" d="M11 5h18v30l-9-7-9 7Z"/><path class="pc-g-line" d="M20 11l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6Z"/></symbol>
    <symbol id="g-cheers" viewBox="0 0 40 40"><g transform="rotate(-18 11 15)"><path class="pc-g-fill" d="M6 7h10l-1.2 8a3.8 3.8 0 0 1-7.6 0Z"/><path class="pc-g-line" d="M6 7h10l-1.2 8a3.8 3.8 0 0 1-7.6 0ZM11 20v9M7 30h8"/></g><g transform="rotate(18 29 15)"><path class="pc-g-fill" d="M24 7h10l-1.2 8a3.8 3.8 0 0 1-7.6 0Z"/><path class="pc-g-line" d="M24 7h10l-1.2 8a3.8 3.8 0 0 1-7.6 0ZM29 20v9M25 30h8"/></g><path class="pc-g-line" d="M20 3v3M16 5l1.5 2.5M24 5l-1.5 2.5" style="opacity:.9"/><path class="pc-g-line" d="M6 36h28" style="opacity:.6"/></symbol>
    <symbol id="g-comment" viewBox="0 0 40 40"><path class="pc-g-fill" d="M5 7h30v18H16l-7 7v-7H5Z"/><path class="pc-g-line" d="M5 7h30v18H16l-7 7v-7H5Z"/><path class="pc-g-line" d="M11 13h18M11 18h12" style="opacity:.9"/><circle class="pc-g-dot" cx="28" cy="18" r="1.2"/></symbol>
    <symbol id="g-crowd" viewBox="0 0 40 40"><circle class="pc-g-fill" cx="20" cy="12" r="5"/><circle class="pc-g-line" cx="20" cy="12" r="5"/><circle class="pc-g-line" cx="9" cy="15" r="3.6"/><circle class="pc-g-line" cx="31" cy="15" r="3.6"/><path class="pc-g-fill" d="M10 33c0-6 4.5-10 10-10s10 4 10 10Z"/><path class="pc-g-line" d="M10 33c0-6 4.5-10 10-10s10 4 10 10Z"/><path class="pc-g-line" d="M3 30c0-4.5 2.7-7.5 6.5-7.5M37 30c0-4.5-2.7-7.5-6.5-7.5" style="opacity:.8"/></symbol>
    <symbol id="g-contrib" viewBox="0 0 40 40"><path class="pc-g-fill" d="M6 34l6-1.5L30 14.5l-4.5-4.5L7.5 28Z"/><path class="pc-g-line" d="M6 34l6-1.5L30 14.5l-4.5-4.5L7.5 28Z"/><path class="pc-g-line" d="M23 12.5l4.5 4.5M28.5 8.5l3-3 4.5 4.5-3 3"/><path class="pc-g-line" d="M9 30l3 3" style="opacity:.7"/><path class="pc-g-line" d="M20 34h14" style="opacity:.6"/></symbol>
    <symbol id="g-hound" viewBox="0 0 40 40"><path class="pc-g-fill" d="M15 5h10v5l2 3v20H13V13l2-3Z"/><path class="pc-g-line" d="M15 5h10v5l2 3v20H13V13l2-3Z"/><path class="pc-g-line" d="M15 4h10"/><path class="pc-g-line" d="M15 17h10v11H15Z" style="opacity:.9"/></symbol>
    <symbol id="g-early" viewBox="0 0 40 40"><path class="pc-g-fill" d="M8 30a12 12 0 0 1 24 0Z"/><path class="pc-g-line" d="M8 30a12 12 0 0 1 24 0Z"/><path class="pc-g-line" d="M20 9V5M9.4 13.4l-2.8-2.8M30.6 13.4l2.8-2.8M6 24H3M37 24h-3"/><path class="pc-g-line" d="M4 34h32" /><path class="pc-g-line" d="M8 37h24" style="opacity:.6"/></symbol>
    <symbol id="g-installed" viewBox="0 0 40 40"><rect class="pc-g-fill" x="11" y="4" width="18" height="32" rx="3"/><rect class="pc-g-line" x="11" y="4" width="18" height="32" rx="3"/><path class="pc-g-line" d="M17 7h6" style="opacity:.8"/><rect class="pc-g-line" x="15" y="12" width="10" height="10" rx="2.5"/><path class="pc-g-line" d="M18 15h4l-.5 3a1.5 1.5 0 0 1-3 0Z" style="stroke-width:1.1"/><path class="pc-g-line" d="M20 31v.5" style="stroke-width:2.2"/></symbol>
    <symbol id="g-taste" viewBox="0 0 40 40"><path class="pc-g-fill" d="M15 5h10v5l2 3v20H13V13l2-3Z"/><path class="pc-g-line" d="M15 5h10v5l2 3v20H13V13l2-3Z"/><path class="pc-g-line" d="M15 4h10"/><circle class="pc-g-fill" cx="27" cy="27" r="7" style="opacity:.9"/><circle class="pc-g-line" cx="27" cy="27" r="7"/><path class="pc-g-line" d="M23.5 27l2.5 2.5 4.5-5"/></symbol>
    <symbol id="g-founder" viewBox="0 0 40 40"><path class="pc-g-fill" d="M11 6h18v7a9 9 0 0 1-18 0Z"/><path class="pc-g-line" d="M11 6h18v7a9 9 0 0 1-18 0Z"/><path class="pc-g-line" d="M11 9H7a3.5 3.5 0 0 0 0 7h4.5M29 9h4a3.5 3.5 0 0 1 0 7h-4.5"/><path class="pc-g-line" d="M20 22v5M13 33h14M15 29h10l2 4H13Z"/><path class="pc-g-line" d="M16 10.5h8" style="opacity:.6"/></symbol>
</defs>`;

/** Every glyph key the catalog can name (badges.glyph). Unknown keys fall back to g-pour. */
export const GLYPH_KEYS = new Set([
  "g-pour", "g-streak", "g-blind", "g-flight", "g-helper", "g-collect", "g-dead", "g-travel", "g-barcode",
  "g-wish", "g-cheers", "g-comment", "g-crowd", "g-contrib", "g-hound", "g-early", "g-installed", "g-taste", "g-founder",
]);

/** Mount once per page that shows a Medal (UserPage does). Hidden; holds the symbols + filters. */
export default function BadgeSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE }} />
  );
}
