"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary (Phase 10, added 2026-09-05 after an iPhone hit a white screen).
 *
 * WHY THIS EXISTS. The app had no error boundary at all, so any uncaught render error produced
 * Next's bare "Application error: a client-side exception has occurred" on a white page -- no way
 * back, and nothing recorded beyond a `window.onerror` that browsers reduce to "Script error." with
 * no file or line. A beta tester in that state can only force-quit, and we learn nothing.
 *
 * `global-error` replaces the whole document (it renders its own html/body), so it catches errors
 * in the root layout too, which `error.tsx` cannot.
 *
 * It logs by direct fetch rather than through `logEvent`: at this point the app has already failed,
 * and importing the Supabase client here risks the same module that just crashed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;

      // Anonymous insert is allowed by the events RLS policy (user_id NULL), which is what lets a
      // crash on the logged-out login screen still reach us.
      void fetch(`${url}/rest/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          event_type: "error",
          surface: typeof window !== "undefined" ? window.location.pathname : null,
          metadata: {
            kind: "react_global_error",
            // The three fields that were missing last time and made the report useless.
            message: String(error?.message ?? "").slice(0, 500),
            stack: String(error?.stack ?? "").slice(0, 2000),
            digest: error?.digest ?? null,
            ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
          },
        }),
      }).catch(() => {});
    } catch {
      // Reporting must never be the thing that breaks the error screen.
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#2F2F2F" }}>
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center", gap: "1rem" }}>
          <div style={{ fontSize: "2.5rem" }}>🥃</div>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: "0.875rem", color: "#666", margin: 0, maxWidth: "26rem" }}>
            Pour Choices hit an error and couldn&apos;t finish loading. We&apos;ve been told about it.
          </p>
          <button
            onClick={reset}
            style={{ minHeight: 44, padding: "0.75rem 1.5rem", background: "#2F2F2F", color: "#fff", border: "none", borderRadius: "0.75rem", fontSize: "0.95rem", fontWeight: 600 }}
          >
            Try again
          </button>
          {/* Deliberately a plain <a>, not next/link: this boundary runs when React has already
              failed, so the client router cannot be trusted. A full document load is the
              recovery, which is the one thing a soft navigation would not do. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ fontSize: "0.8rem", color: "#666" }}>Back to the start</a>
        </div>
      </body>
    </html>
  );
}
