import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/compressImage";

const BUCKET = "bottle-images";

// B-59: only accept real image types, derive the extension from the validated MIME (never from
// the client-supplied filename), and cap the size. The bucket is public, so a sanitized filename
// + type is the trust boundary.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — ceiling on what we actually store
// Phase 10 A2: raw phone photos routinely exceed the stored ceiling (we saw 4.6 MB) and now get
// downscaled below it, so the input guard is separate and only exists to bound decode memory.
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Uploads a bottle/variant image to the public `bottle-images` storage bucket
 * and returns its public URL. Path is namespaced by bottle id and randomized
 * so re-uploads never collide. Rejects anything that isn't an allow-listed
 * image type or exceeds the size cap.
 *
 * Phase 10 A2: the image is downscaled to 1200px on the long edge and re-encoded to WebP
 * before upload. Compression is best-effort — if it fails or wouldn't help, the original is
 * uploaded unchanged, because a large image beats a blocked contribution.
 */
export async function uploadBottleImage(
  file: File,
  bottleId: string
): Promise<{ url: string | null; error: string | null }> {
  const mime = (file.type || "").toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) return { url: null, error: "Unsupported image type — use JPG, PNG, or WebP." };
  if (file.size > MAX_INPUT_BYTES) return { url: null, error: "Image too large (max 25 MB)." };

  // Shrink before upload. Never fatal: null means "upload the original".
  let body: Blob = file;
  let uploadMime = mime;
  let uploadExt = ext;
  try {
    const compressed = await compressImage(file);
    if (compressed) {
      body = compressed.blob;
      uploadMime = compressed.mime;
      uploadExt = compressed.ext;
    }
  } catch {
    // Keep the original.
  }

  if (body.size > MAX_BYTES) return { url: null, error: "Image too large (max 8 MB)." };

  const path = `${bottleId}/${crypto.randomUUID()}.${uploadExt}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, {
      cacheControl: "3600",
      upsert: false,
      contentType: uploadMime,
    });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
