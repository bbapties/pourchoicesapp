import "./globals.css";
import { Inter } from "next/font/google";
import AppShell from "@/components/AppShell";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";
import type { Metadata, Viewport } from "next";

const inter = Inter({ subsets: ["latin"] });

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
    // "default" = dark status bar text. NOT "black-translucent": that forces WHITE status bar text
    // and lets content run under the notch, so on this app's ivory headers the clock and battery
    // would be white-on-white, and the Dynamic Island would sit on top of the search bar.
    // Revisit in Phase 5 if the palette goes dark.
    statusBarStyle: "default",
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
  themeColor: "#2a1400",
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
      <head>
        {IOS_SPLASH.map(([w, h, dpr]) => (
          <link
            key={`${w}x${h}@${dpr}`}
            rel="apple-touch-startup-image"
            href={`/splash/splash-${w}x${h}@${dpr}x.png`}
            media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body className={`${inter.className} h-dvh flex flex-col bg-ivory`}>
        {/* Implemented fixed header/footer with scrollable middle per user spec */}
        <ServiceWorkerRegistrar />
        <InstallPrompt />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
