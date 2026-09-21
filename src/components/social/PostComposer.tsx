"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useDictation } from "@/lib/useDictation";
import { createPost, searchTaggableBottles, type TaggableBottle } from "@/lib/posts";
import { logClick } from "@/lib/events";

// Write a post (Brian, 2026-09-21). One sheet, mounted ONCE in AppShell like PhotoViewer and the
// Show it off bar, opened from anywhere with the `pc:compose` event (optionally pre-tagged with a
// bottle): the floating button on Social, "Post about this" on a bottle, your own Profile. Text
// (typed or dictated), Tag a bottle, one photo, Post.

export type ComposeDetail = { bottle?: TaggableBottle | null; surface: string };

/** Open the composer from anywhere. */
export function openComposer(detail: ComposeDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pc:compose", { detail }));
}

export default function PostComposer() {
  const { publicUserId } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState("social");
  const [text, setText] = useState("");
  const [bottle, setBottle] = useState<TaggableBottle | null>(null);
  const [tagging, setTagging] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<TaggableBottle[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<ComposeDetail>).detail;
      setText(""); setPhoto(null); setTagging(false); setTerm(""); setHits([]);
      setBottle(d.bottle ?? null);
      setSurface(d.surface);
      setOpen(true);
      logClick("compose_opened", { surface: d.surface, metadata: { pretagged: !!d.bottle } });
    };
    window.addEventListener("pc:compose", on);
    return () => window.removeEventListener("pc:compose", on);
  }, []);

  const dictation = useDictation(
    (chunk) => setText((prev) => (prev ? `${prev.replace(/\s*$/, "")} ${chunk}` : chunk)),
    open,
    () => toast.error("Could not access the microphone."),
  );

  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // the tag search, debounced
  useEffect(() => {
    if (!tagging) return;
    const t = setTimeout(() => { searchTaggableBottles(term).then(setHits); }, 200);
    return () => clearTimeout(t);
  }, [term, tagging]);

  const canPost = !saving && (text.trim().length > 0 || !!photo);

  const submit = async () => {
    if (!publicUserId || !canPost) return;
    dictation.stop();
    setSaving(true);
    const res = await createPost({ userId: publicUserId, text, photo, bottle, surface });
    setSaving(false);
    if (res.error) { toast.error("Couldn't post that"); return; }
    res.warnings.forEach((w) => toast.warning(w));
    toast.success("Posted");
    setOpen(false);
    window.dispatchEvent(new CustomEvent("pc:posted", { detail: { activityId: res.id } }));
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="mb-3">
          <SheetTitle className="text-cream text-left">Write a post</SheetTitle>
          <SheetDescription className="text-cream-mute text-left">A pour choice worth telling people about.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <section>
            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                rows={4}
                autoFocus
                placeholder="What's the pour choice?"
                className="w-full border border-edge rounded-lg px-3 py-2 pr-11 text-[15px] text-cream bg-panel resize-none"
                disabled={saving}
                data-coach="compose.text"
              />
              {dictation.supported && (
                <button
                  type="button"
                  onClick={dictation.toggle}
                  disabled={saving}
                  aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
                  className={`absolute right-2 bottom-2 w-8 h-8 rounded-full border flex items-center justify-center ${dictation.listening ? "bg-red-600 border-red-600 text-cream" : "bg-panel border-edge text-cream"}`}
                >
                  <MicIcon />
                </button>
              )}
            </div>
            {dictation.listening && <p className="text-xs text-red-400 mt-1">Listening… tap the mic to stop</p>}
          </section>

          {/* Tag a bottle */}
          <section data-coach="compose.tag">
            <Label optional>Bottle</Label>
            {bottle ? (
              <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel px-3 py-2">
                <div className="w-8 h-11 flex items-end justify-center shrink-0">
                  {bottle.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bottle.imageUrl} alt="" className="max-h-11 max-w-full object-contain" />
                  ) : <BottlePlaceholderImage />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-cream truncate">{bottle.name}</div>
                  {bottle.distillery && <div className="text-xs text-cream-mute truncate">{bottle.distillery}</div>}
                </div>
                <button type="button" onClick={() => setBottle(null)} disabled={saving} className="text-xs text-cream-mute underline underline-offset-2">Remove</button>
              </div>
            ) : tagging ? (
              <div>
                <input
                  type="text"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  autoFocus
                  placeholder="Start typing a bottle"
                  className="w-full border border-edge rounded-lg px-3 py-2 text-sm text-cream bg-panel"
                />
                {hits.length > 0 && (
                  <ul className="mt-1 rounded-lg border border-edge bg-panel divide-y divide-edge max-h-56 overflow-y-auto">
                    {hits.map((h) => (
                      <li key={h.bottleId}>
                        <button type="button" onClick={() => { setBottle(h); setTagging(false); setTerm(""); setHits([]); }} className="w-full flex items-center gap-3 px-3 py-2 text-left">
                          <div className="w-7 h-10 flex items-end justify-center shrink-0">
                            {h.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={h.imageUrl} alt="" className="max-h-10 max-w-full object-contain" />
                            ) : <BottlePlaceholderImage />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm text-cream truncate">{h.name}</div>
                            {h.distillery && <div className="text-xs text-cream-mute truncate">{h.distillery}</div>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => { setTagging(false); setTerm(""); setHits([]); }} className="mt-2 text-xs text-cream-mute underline underline-offset-2">Never mind</button>
              </div>
            ) : (
              <button type="button" onClick={() => setTagging(true)} disabled={saving} className="rounded-lg border border-dashed border-edge bg-panel px-3 py-2 text-sm text-cream-mute">
                + Tag a bottle
              </button>
            )}
          </section>

          {/* Photo */}
          <section>
            <Label optional>Photo</Label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f) setPhoto(f); e.target.value = ""; }} />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => fileRef.current?.click()}
                className="w-[88px] h-[88px] rounded-lg border border-dashed border-edge bg-panel overflow-hidden flex flex-col items-center justify-center gap-1 text-[11px] text-cream-mute"
                aria-label={photo ? "Retake photo" : "Add a photo"}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                ) : (<><CameraIcon />Camera</>)}
              </button>
              <div className="text-xs text-cream-mute">
                {photo ? (
                  <>
                    <button type="button" className="underline underline-offset-2" onClick={() => fileRef.current?.click()}>Retake</button>
                    {" · "}
                    <button type="button" className="underline underline-offset-2" onClick={() => setPhoto(null)}>Remove</button>
                  </>
                ) : "Compressed on your phone before it uploads."}
              </div>
            </div>
          </section>

          <button
            type="button"
            disabled={!canPost}
            onClick={submit}
            className="w-full rounded-lg py-3 text-sm font-semibold pc-brass text-engrave disabled:opacity-40"
            style={{ minHeight: 44 }}
            data-coach="compose.post"
          >
            {saving ? "Posting…" : "Post"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Label({ children, optional = false }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-cream mb-2">
      {children}
      {optional && <span className="ml-1 font-normal normal-case tracking-normal text-cream-faint">optional</span>}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
