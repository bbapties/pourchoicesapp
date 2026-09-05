"use client";

import { useEffect } from "react";
import { logEvent } from "@/lib/events";

/**
 * Route-level error boundary (Phase 10, added 2026-09-05).
 *
 * Catches render errors inside a page while keeping the app shell mounted, so a crash on one screen
 * does not take the whole app down. `global-error.tsx` is the fallback for errors in the root layout
 * itself, which this cannot catch.
 *
 * The message and stack are logged deliberately: the previous capture only read `ErrorEvent.message`,
 * which browsers reduce to "Script error." with no file or line, and that told us nothing.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logEvent({
      eventType: "error",
      surface: typeof window !== "undefined" ? window.location.pathname : null,
      metadata: {
        kind: "react_route_error",
        message: String(error?.message ?? "").slice(0, 500),
        stack: String(error?.stack ?? "").slice(0, 2000),
        digest: error?.digest ?? null,
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
      },
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ minHeight: "60dvh" }}>
      <div className="text-4xl">🥃</div>
      <h1 className="text-lg font-semibold text-charcoal">This screen hit a snag</h1>
      <p className="text-sm text-gray-600 max-w-sm">
        Something went wrong loading this page. We&apos;ve been told about it.
      </p>
      <button
        onClick={reset}
        className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white"
        style={{ minHeight: 44 }}
      >
        Try again
      </button>
    </div>
  );
}
