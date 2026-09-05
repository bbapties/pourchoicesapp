import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/compressImage";

// Feedback / bug-report channel (beta-prep).
// Users submit from Profile; admins triage in Admin > Feedback.
// Table + RLS: sql/feedback-migration.sql (mirrors the 7.8 suggested_edits shape).

const BUCKET = "bottle-images"; // reused; feedback objects live under "feedback/<id>/..."

export type FeedbackType = "feature" | "bug";
export type FeedbackStatus = "new" | "triaged" | "planned" | "done";

export const FEEDBACK_STATUSES: FeedbackStatus[] = ["new", "triaged", "planned", "done"];

export function statusLabel(s: FeedbackStatus): string {
  switch (s) {
    case "new": return "New";
    case "triaged": return "Triaged";
    case "planned": return "Planned";
    case "done": return "Done";
    default: return s;
  }
}

/** Non-sensitive context captured with each report (no route/PII beyond the pathname). */
function captureContext(): { user_agent: string | null; viewport: string | null; route: string | null } {
  if (typeof window === "undefined") {
    return { user_agent: null, viewport: null, route: null };
  }
  return {
    user_agent: navigator.userAgent || null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    route: window.location.pathname || null,
  };
}

/**
 * Upload an optional screenshot to the shared bucket under a feedback-tagged
 * path so a resolved report's image is trivial to purge. Returns both the
 * public URL (for display) and the storage path (for deletion).
 */
// B-59: allow-list the image type, derive the extension from the validated MIME (never the
// client filename), and cap the size.
const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024; // 8 MB -- ceiling on what we store
// Phase 10 A2: the input guard only bounds decode memory; compression brings the stored
// object well under SCREENSHOT_MAX_BYTES.
const SCREENSHOT_MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
const SCREENSHOT_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function uploadScreenshot(
  file: File,
  feedbackId: string
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const mime = (file.type || "").toLowerCase();
  const ext = SCREENSHOT_MIME_EXT[mime];
  if (!ext) return { url: null, path: null, error: "Unsupported image type" };
  if (file.size > SCREENSHOT_MAX_INPUT_BYTES) return { url: null, path: null, error: "Image too large (max 25 MB)" };

  // Phase 10 A2: shrink before upload — screenshots share the metered `bottle-images` bucket.
  // Best-effort: null means upload the original rather than lose the report.
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

  if (body.size > SCREENSHOT_MAX_BYTES) return { url: null, path: null, error: "Image too large (max 8 MB)" };
  const path = `feedback/${feedbackId}/${crypto.randomUUID()}.${uploadExt}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, {
      cacheControl: "3600",
      upsert: false,
      contentType: uploadMime,
    });
  if (uploadError) return { url: null, path: null, error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, error: null };
}

/**
 * Submit a feedback report. Inserts the row first (to get its id for the
 * screenshot path), uploads the optional screenshot, then attaches it.
 * Fail-open on the screenshot: a report is never lost because its image failed.
 */
/**
 * "This is definitely the wrong bottle" on a barcode hit.
 *
 * Report ONLY — the catalog is not touched. One user's say-so shouldn't strip a
 * barcode off a bottle other people may have scanned correctly, and there is no
 * unique index on `bottles.barcode` to arbitrate, so the admin decides which
 * bottle actually owns the code.
 *
 * Distinct from a store pick or a special release: those are real versions OF
 * this bottle, and have their own flow. This says the barcode is mapped to the
 * wrong product entirely.
 *
 * Rides the existing feedback queue (Admin > Feedback) rather than
 * `suggested_edits`, because that queue's approve action APPLIES a field change,
 * and here there is deliberately nothing to apply.
 */
export async function reportBarcodeMismatch(opts: {
  userId: string; // public users id
  barcode: string;
  bottleId: string;
  bottleName: string;
  note?: string | null;
}): Promise<{ error?: string }> {
  const note = opts.note?.trim();
  const message = [
    `WRONG BOTTLE for barcode ${opts.barcode}`,
    `Scanned barcode ${opts.barcode} opened "${opts.bottleName}" (bottle ${opts.bottleId}),`,
    `and the user reports that is not the product in their hand.`,
    note ? `
User note: ${note}` : null,
    `
No catalog change was made — decide which bottle owns this barcode.`,
  ]
    .filter(Boolean)
    .join(" ");

  return submitFeedback({ userId: opts.userId, type: "bug", message });
}

export async function submitFeedback(opts: {
  userId: string; // public users id
  type: FeedbackType;
  message: string;
  screenshot?: File | null;
}): Promise<{ error?: string; screenshotFailed?: boolean }> {
  const message = opts.message.trim();
  if (!message) return { error: "Message is empty" };

  const ctx = captureContext();

  const { data, error } = await supabase
    .from("feedback")
    .insert({
      type: opts.type,
      message,
      status: "new",
      submitted_by: opts.userId,
      user_agent: ctx.user_agent,
      viewport: ctx.viewport,
      route: ctx.route,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (opts.screenshot) {
    const up = await uploadScreenshot(opts.screenshot, data.id);
    if (up.error || !up.url) {
      // Keep the report; flag the image failure to the caller.
      return { screenshotFailed: true };
    }
    const { error: attachErr } = await supabase
      .from("feedback")
      .update({ screenshot_url: up.url, screenshot_path: up.path })
      .eq("id", data.id);
    if (attachErr) return { screenshotFailed: true };
  }

  return {};
}

export type FeedbackRow = {
  id: string;
  type: FeedbackType;
  message: string;
  screenshotUrl: string | null;
  screenshotPath: string | null;
  status: FeedbackStatus;
  submittedByName: string;
  adminNote: string | null;
  userAgent: string | null;
  viewport: string | null;
  route: string | null;
  createdAt: string;
};

const ADMIN_SELECT = `
  id, type, message, screenshot_url, screenshot_path, status, admin_note,
  user_agent, viewport, route, created_at,
  users:submitted_by ( username )
`;

/** All reports, newest first, for the admin triage queue. */
export async function fetchFeedback(): Promise<{ rows: FeedbackRow[]; error?: string }> {
  const { data, error } = await supabase
    .from("feedback")
    .select(ADMIN_SELECT)
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchFeedback:", error.message); return { rows: [], error: error.message }; }

  const rows: FeedbackRow[] = (data || []).map((raw: any) => {
    const user = Array.isArray(raw.users) ? raw.users[0] : raw.users;
    return {
      id: raw.id,
      type: raw.type,
      message: raw.message,
      screenshotUrl: raw.screenshot_url,
      screenshotPath: raw.screenshot_path,
      status: raw.status,
      submittedByName: user?.username ?? "Someone",
      adminNote: raw.admin_note,
      userAgent: raw.user_agent,
      viewport: raw.viewport,
      route: raw.route,
      createdAt: raw.created_at,
    };
  });
  return { rows };
}

/** Admin: move a report through the triage lifecycle. */
export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  reviewerUserId: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("feedback")
    .update({ status, reviewed_by: reviewerUserId, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

/** Admin: attach/replace a triage note (reuses the 7.8 review-note idea). */
export async function setFeedbackNote(
  id: string,
  note: string,
  reviewerUserId: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("feedback")
    .update({
      admin_note: note.trim() || null,
      reviewed_by: reviewerUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return error ? { error: error.message } : {};
}
