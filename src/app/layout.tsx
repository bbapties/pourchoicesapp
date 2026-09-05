import "./globals.css";
import { Inter } from "next/font/google";
import AppShell from "@/components/AppShell";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
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
    // The status bar sits over our own content in standalone mode; translucent keeps the cellar
    // splash continuous behind it rather than stamping a black bar across the top.
    statusBarStyle: "black-translucent",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} h-dvh flex flex-col bg-ivory`}>
        {/* Implemented fixed header/footer with scrollable middle per user spec */}
        <ServiceWorkerRegistrar />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
