import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activities";
import { uploadPostPhoto } from "@/lib/postPhoto";
import { logEvent } from "@/lib/events";

// A free-text Social post (Brian, 2026-09-21): "@you posted about a pour choice". Text, one
// optional photo, one optional tagged bottle. The ONE activity that may have no bottle - the DB
// allows bottle_id NULL for `posted` alone (sql/activities-posted-migration.sql). The text is
// details.note and the picture details.photo_url, exactly where a pour keeps them, so every
// card / edit / viewer path already understands a post.

export type TaggableBottle = {
  bottleId: string;
  variantId: string | null;
  name: string;
  distillery: string | null;
  imageUrl: string | null;
};

/** Bottles matching a few typed letters, for the Tag a bottle picker. */
export async function searchTaggableBottles(term: string, limit = 8): Promise<TaggableBottle[]> {
  const q = term.trim().replace(/[%_]/g, "");
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("all_bottle_details")
    .select("bottle_id, bottle_name, bottle_distillery, attr_frontimage_url, default_variant_id")
    .ilike("bottle_name", `%${q}%`)
    .order("bottle_verified", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("searchTaggableBottles:", error.message);
    return [];
  }
  return (data || []).map((r: any) => ({
    bottleId: r.bottle_id,
    variantId: r.default_variant_id ?? null,
    name: r.bottle_name,
    distillery: r.bottle_distillery ?? null,
    imageUrl: r.attr_frontimage_url ?? null,
  }));
}

/** Write the post. Photo upload is best-effort (a failed photo still posts, and says so). */
export async function createPost(opts: {
  userId: string;
  text: string;
  photo: File | null;
  bottle: TaggableBottle | null;
  surface: string;
}): Promise<{ id?: string; error?: string; warnings: string[] }> {
  const warnings: string[] = [];
  const note = opts.text.trim().slice(0, 2000);
  if (!note && !opts.photo) return { error: "Say something or add a photo", warnings };

  let photoUrl: string | null = null;
  if (opts.photo) {
    const up = await uploadPostPhoto(opts.userId, opts.photo);
    if (up.url) photoUrl = up.url;
    else warnings.push("Photo didn't upload");
  }

  const res = await logActivity({
    userId: opts.userId,
    bottleId: opts.bottle?.bottleId ?? null,
    variantId: opts.bottle?.variantId ?? null,
    action: "posted",
    details: { note: note || null, photo_url: photoUrl },
  });
  if (res.error) return { error: res.error, warnings };
  logEvent({
    eventType: "post_written",
    surface: opts.surface,
    targetType: "activity",
    targetId: res.id,
    metadata: { has_photo: !!photoUrl, has_bottle: !!opts.bottle, chars: note.length },
  });
  return { id: res.id, warnings };
}
