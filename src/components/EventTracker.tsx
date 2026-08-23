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
  const { publicUserId } = useCurrentUser();
  const pathname = usePathname();

  // Latest userId, read by handlers without making them a render dependency.
  const userIdRef = useRef<string | null>(publicUserId);
  userIdRef.current = publicUserId;

  // page_view — fire once per pathname (not again when userId resolves).
  useEffect(() => {
    logEvent({ eventType: "page_view", userId: userIdRef.current, surface: pathname });
  }, [pathname]);

  // Global client-error capture — attach once.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      logEvent({
        eventType: "error",
        userId: userIdRef.current,
        surface: window.location.pathname,
        metadata: {
          message: String(e.message || "").slice(0, 500),
          source: e.filename || null,
          line: e.lineno ?? null,
          col: e.colno ?? null,
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
          kind: "unhandledrejection",
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
