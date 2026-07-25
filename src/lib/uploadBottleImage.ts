import { supabase } from "@/lib/supabase";

const BUCKET = "bottle-images";

/**
 * Uploads a bottle/variant image to the public `bottle-images` storage bucket
 * and returns its public URL. Path is namespaced by bottle id and randomized
 * so re-uploads never collide.
 *
 * Requires a public Supabase Storage bucket named `bottle-images` with an
 * authenticated-insert policy (see ROADMAP Phase 6.2).
 */
export async function uploadBottleImage(
  file: File,
  bottleId: string
): Promise<{ url: string | null; error: string | null }> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${bottleId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
