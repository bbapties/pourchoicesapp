/**
 * PWA install detection and platform rules (Phase 10 C3).
 *
 * The hard constraint: **iOS has no programmatic install.** Safari never fires
 * `beforeinstallprompt`, so on iPhone the instructional "Share -> Add to Home Screen" UI IS the
 * feature, not a fallback. Android Chrome is the only platform where we can actually call
 * `prompt()`. Everything else degrades to "continue in browser".
 */

/** localStorage key remembering that the user chose the browser. Kept out of a runtime capability
 *  deliberately: it is a per-device convenience, and being wrong just re-asks once. */
const DISMISS_KEY = "pc.pwa.dismissed";

/** The Chrome-only event. Not in the TS DOM lib, so declared here. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type Platform = "android" | "ios" | "desktop" | "in-app-browser";

/** Already running as an installed app? Then never ask. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses a non-standard navigator flag; everyone else reports the display mode.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Macintosh, so touch points are the reliable tell.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * In-app browsers (Instagram, Facebook, TikTok) usually cannot install at all, and their menus
 * differ from Safari's. Detect them so we can say "open in Safari" instead of teaching steps that
 * do not exist in that UI.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|Instagram|Line|Twitter|TikTok|Snapchat/i.test(navigator.userAgent);
}

export function detectPlatform(): Platform {
  if (isInAppBrowser()) return "in-app-browser";
  if (isIOS()) return "ios";
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

export function hasDismissedInstall(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Private mode / blocked storage: treat as not dismissed. Worst case we ask once more.
    return false;
  }
}

export function rememberDismissedInstall(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Non-fatal: the prompt simply reappears next visit.
  }
}

/** Profile's "Install the app" row clears this so the sheet can be summoned again. */
export function clearDismissedInstall(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    // Non-fatal.
  }
}
