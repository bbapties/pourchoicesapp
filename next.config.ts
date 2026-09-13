import type { NextConfig } from "next";

// #15 (B-69): security headers. The plain ones are ENFORCED; the CSP is REPORT-ONLY for now.
// An enforced CSP that is wrong breaks Supabase, push or the shelf images silently, and
// there is no report endpoint yet, so violations show up in the browser console only. Once
// prod has run clean for a while, rename the CSP header to `Content-Security-Policy`.
//
// What the CSP allows, and why:
//   script  'self' + 'unsafe-inline' -- Next's hydration/RSC payload is an inline script; a
//           nonce would need middleware on every page. 'unsafe-eval' only in dev (HMR).
//   style   'self' + 'unsafe-inline' -- Tailwind and next/font are self-hosted, but React sets
//           style attributes and Radix injects inline styles.
//   img     https: + data: + blob:   -- bottle images come from Supabase storage, the two
//           remotePatterns hosts below and any `image_url` an admin pasted; pours are blob
//           previews before upload.
//   connect 'self' + the Supabase project (REST, auth, storage over https; realtime over wss).
//   worker  'self' + blob:           -- the service worker (public/sw.js) and the barcode
//           scanner's worker.
//   media   'self' + blob:           -- the camera preview.
//   frame-ancestors 'self'           -- nobody embeds the app.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}${isDev ? " ws: wss:" : ""}`.replace(/\s+/g, " "),
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // Add `upgrade-insecure-requests` when this becomes enforced; report-only ignores it.
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera and mic are ours (barcode scanner, dictation); nothing else is used.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
  // Prod is HTTPS-only on Vercel; the LAN dev URL is plain HTTP and never sees this header
  // because browsers ignore HSTS over HTTP.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'thebourbonculture.com',
      },
      {
        protocol: 'https',
        hostname: 'images.squarespace-cdn.com',
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
