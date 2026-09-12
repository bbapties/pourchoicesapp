import { supabase } from "@/lib/supabase";
import { logActivity, type PourType } from "@/lib/activities";
import { setRatingStars } from "@/lib/ratings";

// Have a drink (#108, step 3 of #105): one call records the whole pour - the optional photo,
// the optional stars + note on the rating row, and the `drank` activity with a `details`
// snapshot of what was said AT THE TIME. The snapshot is what the activity card shows; a later
// re-rate updates user_ratings but never rewrites an old post.
//
// Photos are compressed on the phone before upload (~1280px long edge, WebP) so a pour costs
// ~100-200 KB, not the 3-5 MB a camera produces. They live in the existing public bottle-images
// bucket under pours/<user>/, the same way feedback screenshots live under feedback/.

const BUCKET = "bottle-images";
const MAX_EDGE = 1280;
const QUALITY = 0.8;

export type PourDetails = {
  stars?: number | null;
  note?: string | null;
  photo_url?: string | null;
};

/** Downscale + re-encode an image on the client. Falls back to the original if canvas is unavailable. */
export async function compressImage(file: File, maxEdge = MAX_EDGE, quality = QUALITY): Promise<Blob> {
  if (typeof document === "undefined") return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    return blob ?? file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload one pour photo; returns its public URL. */
export async function uploadPourPhoto(userId: string, file: File): Promise<{ url?: string; error?: string }> {
  const blob = await compressImage(file);
  const isWebp = blob.type === "image/webp";
  const path = `pours/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${isWebp ? "webp" : "jpg"}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/**
 * Record a pour end to end. Photo upload and rating save are best-effort: a failed photo still
 * logs the pour (without the photo) and says so via `warnings`; a failed activity insert is the
 * only hard error, because that is the pour itself.
 */
export async function recordPour(opts: {
  userId: string;
  bottleId: string;
  variantId?: string | null;
  pourType: Exclude<PourType, "blind">;
  stars?: number | null;
  note?: string | null;
  photo?: File | null;
}): Promise<{ error?: string; warnings: string[]; details: PourDetails }> {
  const warnings: string[] = [];
  const note = opts.note?.trim() ? opts.note.trim().slice(0, 2000) : null;
  const stars = typeof opts.stars === "number" ? Math.round(Math.min(5, Math.max(0, opts.stars)) * 10) / 10 : null;

  let photoUrl: string | null = null;
  if (opts.photo) {
    const up = await uploadPourPhoto(opts.userId, opts.photo);
    if (up.url) photoUrl = up.url;
    else warnings.push("Photo didn't upload");
  }

  if (stars !== null || note) {
    const res = await setRatingStars({
      userId: opts.userId,
      bottleId: opts.bottleId,
      variantId: opts.variantId ?? null,
      stars: stars ?? undefined,
      note,
    });
    if (res.error) warnings.push("Rating didn't save");
  }

  const details: PourDetails = { stars, note, photo_url: photoUrl };
  const result = await logActivity({
    userId: opts.userId,
    bottleId: opts.bottleId,
    variantId: opts.variantId ?? null,
    action: "drank",
    pourType: opts.pourType,
    details,
  });
  if (result.error) return { error: result.error, warnings, details };
  return { warnings, details };
}
