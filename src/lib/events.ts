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

/**
 * Insert one event. Fire-and-forget: callers do not await. Any failure is
 * swallowed (console only) so telemetry can never break a user action.
 */
export function logEvent(opts: LogEventOpts): void {
  if (typeof window === "undefined") return; // client-only
  try {
    const row = {
      user_id: opts.userId ?? null,
      session_id: getSessionId(),
      event_type: opts.eventType,
      surface: opts.surface ?? null,
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
      metadata: opts.metadata ?? null,
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
