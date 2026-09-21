import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/pours";
import { logEvent } from "@/lib/events";

// A photo on a Social post, after the fact (Brian, 2026-09-21). A pour takes its photo in the
// sheet; an add / empty is one tap from five places, so the photo comes AFTER - the "Show it off"
// nudge right after the tap, or Edit on your own post later. Both land here: upload, then write
// `details.photo_url` onto the activity row. RLS (activities_update_own) limits that write to your
// own drank / added_to_collection / finished rows and a trigger pins every column but details.
//
// The event `pc:showoff` is how a lib call (userBottles) reaches the one <ShowOffNudge /> mounted
// in AppShell; `pc:post-updated` is how the nudge / editor tells any open feed to redraw the card.

const BUCKET = "bottle-images";

export type ShowOffDetail = {
  activityId: string;
  action: "added_to_collection" | "finished" | "wishlisted";
  bottleId: string;
  bottleName?: string | null;
};

/** Ask the app to offer a photo for the activity that just landed. Safe to call from a lib. */
export function offerShowOff(detail: ShowOffDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pc:showoff", { detail }));
}

/** Tell open feeds a post's details changed (photo added / removed). */
export function announcePostUpdated(activityId: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pc:post-updated", { detail: { activityId, details } }));
}

/** Upload one post photo (compressed on the phone); returns its public URL. */
export async function uploadPostPhoto(userId: string, file: File): Promise<{ url?: string; error?: string }> {
  const blob = await compressImage(file);
  const isWebp = blob.type === "image/webp";
  const path = `posts/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${isWebp ? "webp" : "jpg"}`;
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
 * Set (or with `null`, remove) the photo on one of your own posts. Merges into the existing
 * details so stars / note on a pour survive. Returns the new details for the caller to redraw.
 */
export async function setPostPhoto(opts: {
  activityId: string;
  userId: string;
  photo: File | null;
  surface: string;
}): Promise<{ details?: Record<string, unknown>; error?: string }> {
  let url: string | null = null;
  if (opts.photo) {
    const up = await uploadPostPhoto(opts.userId, opts.photo);
    if (!up.url) return { error: up.error ?? "upload failed" };
    url = up.url;
  }
  const { data: row, error: readErr } = await supabase
    .from("activities")
    .select("details")
    .eq("id", opts.activityId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  const details = { ...((row?.details as Record<string, unknown> | null) ?? {}), photo_url: url };
  const { error } = await supabase.from("activities").update({ details }).eq("id", opts.activityId);
  if (error) return { error: error.message };
  logEvent({
    eventType: url ? "post_photo_set" : "post_photo_removed",
    surface: opts.surface,
    targetType: "activity",
    targetId: opts.activityId,
  });
  announcePostUpdated(opts.activityId, details);
  return { details };
}
