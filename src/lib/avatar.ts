// Generated default avatar (#107, step 2 of the user-page epic #105).
//
// Every user has a face from day one: initials on a tinted disc, derived deterministically from
// the username so the same person looks the same on every surface and every device without a
// round-trip. A real photo (users.avatar_url, step 7) wins when present; this is the fallback.
//
// Greyscale on purpose - Phase 5 restyles. The tint is one of a few greys picked by hash so a
// list of people is still tellable apart at a glance. Swap the palette, not the hash, later.

const TINTS = ["#C9C9C9", "#D9D9D9", "#BDBDBD", "#E3E3E3", "#B3B3B3", "#DDDDDD"];

/** Stable small hash of a string (djb2). Same input, same tint, forever. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Initials for a username. Splits on `_`, `-`, `.` and camelCase humps so "The_Lake_House" -> "TL",
 * "grokbuild" -> "G", "marcusSenn" -> "MS". Max two characters, upper-cased.
 */
export function avatarInitials(username: string | null | undefined): string {
  const raw = (username ?? "").trim();
  if (!raw) return "?";
  const parts = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return letters.join("").toUpperCase() || raw[0].toUpperCase();
}

/** Disc tint for a username - deterministic. */
export function avatarTint(username: string | null | undefined): string {
  return TINTS[hash(username ?? "") % TINTS.length];
}
