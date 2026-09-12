"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase";
import { logClick } from "@/lib/events";

// Avatar upload with a circle crop (#112, step 7 of #105). Pick from camera or gallery, drag to
// position, slide to zoom, save. The crop is a square whose inscribed circle is what every
// <UserAvatar> shows - the mask here is the same circle, so what you frame is what you get.
// Output: one 256px WebP under bottle-images/avatars/<user>/, users.avatar_url updated.

const VIEW = 260; // px, the square crop viewport
const OUT = 256;
const BUCKET = "bottle-images";

export default function AvatarCropSheet({ open, onOpenChange, userId, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSaved: (url: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image centre offset from viewport centre, px
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // The preview <img> reads the same blob URL the decoder used, so the URL must live until the
  // picture is replaced or the sheet closes - revoking it on decode (the first version) left a
  // blank preview on a real phone photo, where nothing was cached.
  const urlRef = useRef<string | null>(null);
  const dropUrl = () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };

  useEffect(() => {
    if (!open) { setImg(null); setZoom(1); setPos({ x: 0, y: 0 }); dropUrl(); }
  }, [open]);
  useEffect(() => () => dropUrl(), []);

  const pick = (f: File | null) => {
    if (!f) return;
    dropUrl();
    const url = URL.createObjectURL(f);
    urlRef.current = url;
    const el = new Image();
    el.onload = () => { setImg(el); setZoom(1); setPos({ x: 0, y: 0 }); };
    el.onerror = () => { toast.error("Couldn't read that image - try a JPG or PNG"); dropUrl(); };
    el.src = url;
  };

  // Base scale fills the viewport with the shorter side, so zoom 1 = "cover".
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = base * zoom;
  const drawW = img ? img.naturalWidth * scale : 0;
  const drawH = img ? img.naturalHeight * scale : 0;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.max(-(drawW - VIEW) / 2, Math.min((drawW - VIEW) / 2, p.x)),
    y: Math.max(-(drawH - VIEW) / 2, Math.min((drawH - VIEW) / 2, p.y)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos(clamp({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) }));
  };
  const onPointerUp = () => { drag.current = null; };

  const save = async () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      const k = OUT / VIEW;
      const p = clamp(pos);
      ctx.drawImage(img, (VIEW / 2 - drawW / 2 + p.x) * k, (VIEW / 2 - drawH / 2 + p.y) * k, drawW * k, drawH * k);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
      if (!blob) throw new Error("encode failed");
      const path = `avatars/${userId}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: uErr } = await supabase.from("users").update({ avatar_url: data.publicUrl }).eq("id", userId);
      if (uErr) throw new Error(uErr.message);
      logClick("avatar_uploaded", { userId, surface: "/profile" });
      onSaved(data.publicUrl);
      onOpenChange(false);
      toast.success("Photo updated");
    } catch (e) {
      toast.error(`Couldn't save the photo: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.from("users").update({ avatar_url: null }).eq("id", userId);
    setBusy(false);
    if (error) { toast.error("Couldn't remove the photo"); return; }
    logClick("avatar_removed", { userId, surface: "/profile" });
    onSaved("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="border-t border-charcoal max-h-[92vh] overflow-y-auto" style={{ backgroundColor: "#FFFFFF", color: "#2F2F2F" }}>
        <SheetHeader className="mb-2">
          <SheetTitle className="text-charcoal text-left">Profile photo</SheetTitle>
          <SheetDescription className="text-charcoal opacity-70 text-left">Drag to position, slide to zoom. It shows as a circle everywhere.</SheetDescription>
        </SheetHeader>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />

        <div className="px-4 pb-6 flex flex-col items-center gap-4">
          {img ? (
            <>
              <div
                className="relative overflow-hidden bg-gray-200 touch-none select-none"
                style={{ width: VIEW, height: VIEW, cursor: "grab" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{ position: "absolute", left: VIEW / 2 - drawW / 2 + clamp(pos).x, top: VIEW / 2 - drawH / 2 + clamp(pos).y, width: drawW, height: drawH, maxWidth: "none" }}
                />
                {/* the circle mask: everything outside it is dimmed, the ring is the edge of the avatar */}
                <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "0 0 0 9999px rgba(255,255,255,.7)", borderRadius: "50%", border: "1px solid #2F2F2F" }} />
              </div>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => { setZoom(Number(e.target.value)); setPos((p) => clamp(p)); }} className="w-[260px]" aria-label="Zoom" />
              <div className="flex gap-2.5 w-full">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex-1 h-11 rounded-lg border border-gray-400 bg-white text-sm font-semibold text-charcoal">Choose another</button>
                <button type="button" onClick={save} disabled={busy} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#2F2F2F" }}>{busy ? "Saving…" : "Save"}</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-12 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: "#2F2F2F" }}>
                Choose a photo
              </button>
              <button type="button" onClick={remove} disabled={busy} className="text-sm text-gray-600 underline underline-offset-2">Remove current photo</button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
