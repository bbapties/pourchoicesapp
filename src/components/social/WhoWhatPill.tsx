"use client";

import { avatarInitials } from "@/lib/avatar";

// Who did what, as one pill (Brian, 2026-09-21): the person and the action glyph side by side in
// a brass ring, the same on Home's Social shelf (floating under a bottle) and in a Social card's
// header (standing inline). Seeing it in both places is how the glyphs teach themselves. Each
// action wears a colour so a scroll reads at a glance: green added, red emptied, brass poured,
// plum blind, blue wishlisted, cream posted. The colours are tokens in globals.css (--color-act-*).

/** The CSS colour var for an action; anything else falls back to brass. */
export function actionColor(action: string): string {
  switch (action) {
    case "added_to_collection": return "var(--color-act-add)";
    case "finished": return "var(--color-act-empty)";
    case "drank": return "var(--color-act-pour)";
    case "tasted": return "var(--color-act-blind)";
    case "wishlisted": return "var(--color-act-wish)";
    case "posted": return "var(--color-act-post)";
    default: return "var(--color-brass-hi)";
  }
}

/** The glyphs: glass = poured, tipped glass = emptied, crossed eye = blind, plus = added, bookmark = wishlisted. */
export function ActionGlyph({ action, size = 19 }: { action: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (action) {
    case "drank":
      return <svg {...common}><path d="M7 3h10l-1 10a4 4 0 0 1-8 0z" /><path d="M12 17v4M9 21h6" /></svg>;
    case "finished":
      // the glass, empty, with an X where the whisky was
      return <svg {...common}><path d="M7 3h10l-1 10a4 4 0 0 1-8 0z" /><path d="M12 17v4M9 21h6" /><path d="M9.5 6.5l5 5M14.5 6.5l-5 5" /></svg>;
    case "tasted":
      return <svg {...common}><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" /><path d="M4 4l16 16" /></svg>;
    case "wishlisted":
      return <svg {...common}><path d="M6 3h12v18l-6-4-6 4z" /></svg>;
    case "posted":
      // a speech bubble: they said something
      return <svg {...common}><path d="M21 12a8 8 0 0 1-8 8H6l-3 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" /><path d="M9 11h6M9 14h3" /></svg>;
    default:
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  }
}

/** The coloured disc with the glyph on it. `--act` feeds the pill CSS. */
export function ActionDisc({ action, className = "" }: { action: string; className?: string }) {
  return (
    <span className={`pc-pill-what ${className}`} style={{ "--act": actionColor(action) } as React.CSSProperties} aria-hidden="true">
      <ActionGlyph action={action} />
    </span>
  );
}

type PillProps = {
  username: string;
  avatarUrl: string | null;
  action: string;
  /** Tap the person. */
  onUser?: () => void;
  /** `inline` stands in a row (a card header); default floats under a shelf bottle (Home). */
  inline?: boolean;
};

export default function WhoWhatPill({ username, avatarUrl, action, onUser, inline = false }: PillProps) {
  return (
    <span className={`pc-pill ${inline ? "pc-pill-inline" : ""}`}>
      <span
        className="pc-pill-who"
        role="button"
        tabIndex={onUser ? 0 : -1}
        aria-label={`@${username}`}
        onClick={(e) => { if (!onUser) return; e.stopPropagation(); onUser(); }}
        onKeyDown={(e) => { if (onUser && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); onUser(); } }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" />
        ) : (
          avatarInitials(username)
        )}
      </span>
      <ActionDisc action={action} />
    </span>
  );
}
