"use client";

import { useEffect } from "react";

// #42: on a phone, tapping anywhere that is not a text field puts the soft keyboard away.
// The browser only blurs an input when the tap lands on something focusable, so a tap on a
// shelf, a card or empty space left the keyboard covering half the screen. Mounted once in
// AppShell so every search bar (Search, My Bar, Drink, People) and every note field gets it.
//
// Device seam (AGENTS.md "native apps"): this is the one place keyboard dismissal lives; a
// Capacitor build can swap in the Keyboard plugin here without touching a screen.
const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true']";

export function useDismissKeyboard(): void {
  useEffect(() => {
    // Touch only: a mouse click already blurs naturally, and on desktop blurring on every
    // mousedown would fight text selection and drag.
    const onTouchStart = (e: TouchEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !active.matches(EDITABLE)) return;
      const target = e.target as Element | null;
      // A tap on any editable, or on a label for one, is the keyboard moving, not leaving.
      if (target?.closest(EDITABLE) || target?.closest("label")) return;
      active.blur();
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => document.removeEventListener("touchstart", onTouchStart);
  }, []);
}
