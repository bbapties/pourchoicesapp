"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (Phase 10 C2). Renders nothing.
 *
 * Production only. In dev, Next serves `/_next/static/` chunks whose names are NOT stable across
 * rebuilds in the same way, and a worker holding onto them produces "why is my change not showing"
 * confusion that costs more than it saves. To exercise it locally, run a production build
 * (`npm run build && npm start`) -- localhost counts as a secure context, so the worker registers
 * there. It will NOT register on the LAN QA URL, which is plain HTTP.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        // `updateViaCache: 'none'` makes the browser revalidate sw.js itself rather than serving it
        // from the HTTP cache, so a fix to the worker actually reaches people.
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => console.error("SW registration failed:", err));
    };

    // Registration competes with the first paint for bandwidth; wait for load.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
