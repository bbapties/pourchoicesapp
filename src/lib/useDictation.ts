"use client";

import { useEffect, useRef, useState } from "react";

// Speech-to-text for a text box. Lifted out of FeedbackSheet (#108) so the pour note gets the
// same "tap the mic, talk, text appears" behaviour. Minimal shape of the Web Speech API - not
// in lib.dom, so declared here.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/**
 * `append` receives each final transcript chunk; `active` stops dictation when it goes false
 * (the sheet closed). `supported` is false where the browser has no speech API - hide the mic.
 */
export function useDictation(append: (chunk: string) => void, active: boolean, onError?: () => void) {
  const [listening, setListening] = useState(false);
  const ref = useRef<SpeechRecognitionLike | null>(null);
  const supported = getSpeechCtor() !== null;

  useEffect(() => {
    if (!active && ref.current) ref.current.stop();
  }, [active]);

  const stop = () => ref.current?.stop();

  const toggle = () => {
    if (listening) {
      stop();
      return;
    }
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) chunk += e.results[i][0].transcript;
      }
      if (chunk.trim()) append(chunk.trim());
    };
    rec.onerror = () => {
      setListening(false);
      onError?.();
    };
    rec.onend = () => setListening(false);
    ref.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return { listening, supported, toggle, stop };
}
