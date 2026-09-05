"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { logEvent } from "@/lib/events";

/**
 * Mounts inside the CurrentUserProvider. Emits:
 *  - page_view on every route change (surface = pathname)
 *  - error for uncaught JS errors + unhandled promise rejections
 * Both are fail-open (logEvent never throws). Logged-out visitors are captured
 * too (userId null), so the pre-login funnel is visible.
 */
export default function EventTracker() {
  const { publicUserId, loading } = useCurrentUser();
  const pathname = usePathname();

  // Latest userId, read by handlers without making them a render dependency.
  const userIdRef = useRef<string | null>(publicUserId);
  userIdRef.current = publicUserId;

  // page_view — B-61: wait until auth resolves before logging, so a signed-in user's
  // page_view is stamped with their id (not the null it holds during the first render).
  // Then log each pathname exactly once (a later login/logout won't re-log the same path).
  const lastLoggedPath = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (lastLoggedPath.current === pathname) return;
    lastLoggedPath.current = pathname;
    logEvent({ eventType: "page_view", userId: publicUserId, surface: pathname });
  }, [pathname, loading, publicUserId]);

  // Global client-error capture — attach once.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // `e.message` alone is close to useless: browsers reduce anything they consider cross-origin
      // to the literal string "Script error." with no file, line or column. That is exactly what we
      // got from the 2026-09-05 iPhone white screen, and it told us nothing. `e.error` usually still
      // carries the real Error object, so take the stack from there when it exists.
      const err = e.error as Error | undefined;
      logEvent({
        eventType: "error",
        userId: userIdRef.current,
        surface: window.location.pathname,
        metadata: {
          message: String(err?.message || e.message || "").slice(0, 500),
          stack: err?.stack ? String(err.stack).slice(0, 2000) : null,
          name: err?.name ?? null,
          source: e.filename || null,
          line: e.lineno ?? null,
          col: e.colno ?? null,
          // Which device hit it matters when a bug is platform-specific, as this one is.
          ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
        },
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      logEvent({
        eventType: "error",
        userId: userIdRef.current,
        surface: window.location.pathname,
        metadata: {
          message: String(reason?.message ?? reason ?? "unhandledrejection").slice(0, 500),
          stack: reason?.stack ? String(reason.stack).slice(0, 2000) : null,
          kind: "unhandledrejection",
          ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
        },
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
