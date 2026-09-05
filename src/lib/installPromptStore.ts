/**
 * Captures Chrome's `beforeinstallprompt` the moment it fires (Phase 10 C3 follow-up).
 *
 * WHY A MODULE-LEVEL LISTENER. Chrome fires this event once, early, and only when it decides the
 * app is installable. A component that attaches its listener on mount routinely misses it -- which
 * is what left the Profile install row showing manual instructions and no button. Attaching at
 * import time, from a component mounted in the root layout, means the event is caught whatever the
 * user does next, and any sheet opened later can read the stashed event.
 *
 * The event is single-use: once `prompt()` is called it must be discarded. Chrome issues a fresh
 * one if the user remains eligible.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Suppress Chrome's own mini-infobar so our sheet is the only ask.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null; // no longer meaningful once installed
    emit();
  });
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

/** True only if we observed the install happen in this page's lifetime. */
export function wasInstalledThisSession(): boolean {
  return installed;
}

export function consumeDeferredPrompt(): void {
  deferred = null;
  emit();
}

export function subscribeToInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
