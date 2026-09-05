/**
 * Client-side image downscale + re-encode, run before anything reaches Storage.
 *
 * WHY (Phase 10 A2). Supabase Storage is metered and we are on the free tier. Phone-camera
 * JPEGs were being uploaded untouched at 1.1-4.6 MB each; six of them accounted for 86% of
 * the bucket. At ~1.5 MB/image 1 GB holds ~660 images; at ~100 KB it holds ~10,000.
 *
 * Sizing: the largest place an image is ever rendered is the detail view's full-screen zoom,
 * capped at `max-w-[500px] h-[75vh]`. 1200px on the long edge stays crisp there even at a 3x
 * device pixel ratio, and is far above the 32x64 search thumbnail and 176px detail frame.
 *
 * This is best-effort. Every failure path returns null so the caller uploads the original --
 * an unoptimized image is much better than a blocked contribution.
 */

/** Longest edge, in px, that we keep. Never upscales. */
const MAX_EDGE = 1200;
/** WebP/JPEG quality. 0.82 is visually clean on product shots at this size. */
const QUALITY = 0.82;
/** Below this, an already-web-friendly file isn't worth re-encoding (avoids generation loss). */
const SKIP_UNDER_BYTES = 200 * 1024;

export type CompressResult = {
  blob: Blob;
  mime: string;
  ext: string;
  width: number;
  height: number;
};

/** Decode to a bitmap, honoring EXIF orientation so phone photos aren't stored sideways. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof createImageBitmap === "function") {
      // `imageOrientation: 'from-image'` applies the EXIF rotation phones write. Without it a
      // portrait photo can be baked in rotated 90 degrees.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    }
  } catch {
    // Fall through to the <img> path below.
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    URL.revokeObjectURL(url);
    return img;
  } catch {
    return null;
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, QUALITY));
}

/**
 * Returns a smaller re-encoded image, or **null** when the original should be used as-is
 * (already small enough, decode unsupported, or re-encoding would not actually help).
 */
export async function compressImage(file: File): Promise<CompressResult | null> {
  if (typeof document === "undefined") return null;

  const sourceMime = (file.type || "").toLowerCase();
  const hasAlpha = sourceMime === "image/png";

  const bitmap = await decode(file);
  if (!bitmap) return null;

  const srcW = bitmap.width;
  const srcH = bitmap.height;
  if (!srcW || !srcH) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const width = Math.round(srcW * scale);
  const height = Math.round(srcH * scale);

  // Already small in both dimensions and bytes, and in a web-friendly format: leave it alone
  // rather than re-encode and lose a generation of quality for no gain.
  if (scale === 1 && file.size < SKIP_UNDER_BYTES && sourceMime !== "image/png") {
    if ("close" in bitmap) bitmap.close();
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in bitmap) bitmap.close();
    return null;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  // Prefer WebP: it is ~30% smaller than JPEG at equal quality AND keeps alpha, which matters
  // for the transparent product PNGs the verify-bottle lane produces. Older Safari silently
  // hands back a PNG from toBlob('image/webp'), so trust the returned type, not the request.
  let blob = await toBlob(canvas, "image/webp");
  let mime = blob?.type || "";

  if (mime !== "image/webp") {
    // No WebP encoder. Flattening a transparent PNG onto JPEG would paint the bottle onto a
    // black box, so leave alpha images untouched and let the caller upload the original.
    if (hasAlpha) return null;
    blob = await toBlob(canvas, "image/jpeg");
    mime = blob?.type || "";
    if (mime !== "image/jpeg") return null;
  }

  if (!blob) return null;
  // Never make a file bigger than it started (small or already-optimized sources).
  if (blob.size >= file.size) return null;

  return {
    blob,
    mime,
    ext: mime === "image/webp" ? "webp" : "jpg",
    width,
    height,
  };
}
