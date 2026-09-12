import "./globals.css";
import { Playfair_Display, Source_Sans_3 } from "next/font/google";
import AppShell from "@/components/AppShell";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";
import type { Metadata, Viewport } from "next";

// Phase 5 (#115): Playfair Display for titles and plates, Source Sans 3 for everything you read.
// Exposed as CSS variables so globals.css can bind them to Tailwind's font-sans / font-display.
const bodyFont = Source_Sans_3({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700"], style: ["normal", "italic"] });
const displayFont = Playfair_Display({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"] });

// Phase 10 C1 (PWA). `metadataBase` makes the icon/manifest URLs absolute, which iOS wants when it
// resolves apple-touch-icon from a home-screen add.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.pourchoicesapp.com"),
  title: "Pour Choices",
  description: "Picture Your Next Sip",
  manifest: "/manifest.webmanifest",
  applicationName: "Pour Choices",
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    // iOS ignores the manifest's icons entirely and reads this one.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Pour Choices",
    // Phase 5 went dark, so the status bar text is white on the ebony headers. "black" (not
    // "black-translucent") keeps content OUT from under the notch, so the Dynamic Island still
    // never sits on top of the search bar.
    statusBarStyle: "black",
  },
  // iOS Safari would otherwise linkify anything that looks like a phone number (proof, ages, years).
  formatDetection: { telephone: false },
  other: {
    // Next emits only the standardised `mobile-web-app-capable`. iOS Safari still reads the
    // apple-prefixed name, and without it "Add to Home Screen" launches inside Safari chrome
    // instead of standalone -- which is the entire point of installing.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  // Matches the manifest background: the cellar dark sampled from the login splash, so launching
  // the installed app is continuous with the first screen the user sees.
  themeColor: "#0e0805",
};

/**
 * iOS launch images. Android composes a splash from the manifest's background_color + icon on its
 * own; iOS does not, and without these it shows a WHITE flash before the app paints -- the most
 * obvious "this is a website" tell on iPhone.
 *
 * iOS matches by exact device metrics, so every supported device needs its own file and media
 * query, and only the matching one is ever downloaded. A device that matches nothing simply gets
 * today's white, so this is purely additive. Portrait only; the manifest declares portrait.
 * Regenerate with the scratchpad `make_splash.py` if the icon art changes.
 */
const IOS_SPLASH: [number, number, number][] = [
  [375, 667, 2], // SE 2/3, 8
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [390, 844, 3], // 12, 13, 14, 15
  [393, 852, 3], // 14 Pro, 15 Pro, 16
  [402, 874, 3], // 16 Pro
  [414, 896, 2], // XR, 11
  [428, 926, 3], // 12/13/14 Pro Max, 14 Plus
  [430, 932, 3], // 15 Pro Max, 15 Plus
  [440, 956, 3], // 16 Pro Max
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* No explicit <head>: React 19 hoists <link> into the document head on its own, and App
          Router owns that element. Wrapping these in a literal <head> alongside Next's own head
          management is not the documented pattern and is a known source of hydration mismatch --
          suspected in the 2026-09-05 iPhone white screen, which appeared five minutes after the
          commit that added it. */}
      {IOS_SPLASH.map(([w, h, dpr]) => (
        <link
          key={`${w}x${h}@${dpr}`}
          rel="apple-touch-startup-image"
          href={`/splash/splash-${w}x${h}@${dpr}x.png`}
          media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
        />
      ))}
      <body className={`${bodyFont.variable} ${displayFont.variable} font-sans h-dvh flex flex-col`}>
        {/* Implemented fixed header/footer with scrollable middle per user spec */}
        <ServiceWorkerRegistrar />
        <InstallPrompt />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
