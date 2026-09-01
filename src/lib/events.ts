import { supabase } from "@/lib/supabase";

// Generic usage/interaction telemetry. See TELEMETRY.md.
// Fire-and-forget + fail-open: logging NEVER throws or blocks the caller.
// Domain bottle actions stay in `activities.ts`; this is for broader usage
// (page views, searches, key clicks, client errors) — including logged-out.
//
// Table + RLS: sql/events-migration.sql. event_type is the "what kind" filter
// column; metadata jsonb holds the long tail.

export type EventType = "page_view" | "search" | "click" | "error";

const SESSION_KEY = "pc.session.id";

/** Stable per-app-session id (sessionStorage), so a visit can be stitched together. */
function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export type LogEventOpts = {
  eventType: EventType | string;
  userId?: string | null;
  surface?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
};

// B-60: client-side guard so an honest client can't flood the events table. A rolling
// window caps the burst rate; a hard ceiling caps the whole app-session. Excess events are
// dropped silently (fail-open). This is a first line only — the DB trigger (events-hardening
// migration) bounds field/jsonb sizes so a raw anon insert can't bypass it either.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_IN_WINDOW = 40;
const SESSION_MAX = 2_000;
let recentTimes: number[] = [];
let sessionCount = 0;

function rateLimited(): boolean {
  if (sessionCount >= SESSION_MAX) return true;
  const now = Date.now();
  recentTimes = recentTimes.filter((t) => now - t < RATE_WINDOW_MS);
  if (recentTimes.length >= RATE_MAX_IN_WINDOW) return true;
  recentTimes.push(now);
  sessionCount += 1;
  return false;
}

// B-60: bound the free-form metadata so it can't bloat the row. Oversized payloads are
// replaced with a small marker rather than dropped, so we still know something was elided.
function boundMetadata(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (meta == null) return null;
  try {
    const json = JSON.stringify(meta);
    if (json.length > 4000) return { _truncated: true, size: json.length };
    return meta;
  } catch {
    return { _unserializable: true };
  }
}

/**
 * Insert one event. Fire-and-forget: callers do not await. Any failure is
 * swallowed (console only) so telemetry can never break a user action.
 */
export function logEvent(opts: LogEventOpts): void {
  if (typeof window === "undefined") return; // client-only
  if (rateLimited()) return; // B-60: drop excess rather than flood the table
  try {
    const row = {
      user_id: opts.userId ?? null,
      session_id: getSessionId(),
      event_type: String(opts.eventType).slice(0, 64),
      surface: opts.surface ? opts.surface.slice(0, 256) : null,
      target_type: opts.targetType ? opts.targetType.slice(0, 64) : null,
      target_id: opts.targetId ? opts.targetId.slice(0, 256) : null,
      metadata: boundMetadata(opts.metadata),
    };
    // Do not await — fire-and-forget. Report insert errors to the console only.
    void supabase
      .from("events")
      .insert(row)
      .then(({ error }) => {
        if (error) console.error("logEvent:", error.message);
      });
  } catch (e) {
    console.error("logEvent (threw):", e);
  }
}

/** Convenience for the most common case: a key control click. */
export function logClick(
  targetType: string,
  opts?: { userId?: string | null; surface?: string | null; targetId?: string | null; metadata?: Record<string, unknown> | null }
): void {
  logEvent({ eventType: "click", targetType, ...opts });
}
