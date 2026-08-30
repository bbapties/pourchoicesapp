import { supabase } from "@/lib/supabase";

const BUCKET = "bottle-images";

// B-59: only accept real image types, derive the extension from the validated MIME (never from
// the client-supplied filename), and cap the size. The bucket is public, so a sanitized filename
// + type is the trust boundary.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
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
 */
export async function uploadBottleImage(
  file: File,
  bottleId: string
): Promise<{ url: string | null; error: string | null }> {
  const mime = (file.type || "").toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) return { url: null, error: "Unsupported image type — use JPG, PNG, or WebP." };
  if (file.size > MAX_BYTES) return { url: null, error: "Image too large (max 8 MB)." };

  const path = `${bottleId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: mime,
    });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
