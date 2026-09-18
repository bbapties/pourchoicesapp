import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";

/**
 * A blind tasting in progress, kept in Supabase so a reload / OS kill / phone swap can offer
 * Resume (#134). Brian, 2026-09-17: "If it's an app, a URL refresh shouldn't screw up the flow."
 *
 * This is a resume CACHE, not a record: the real rows are written by saveTasting at the end, and
 * the draft is deleted the moment that happens (or the person starts over). One row per user.
 * Supabase rather than localStorage because the native shells will be webviews the OS wipes.
 *
 * `state` is whatever DrinkClient hands over; this module never interprets it beyond `step`.
 * Every call is fail-open: a draft that did not save costs nothing, the tasting carries on.
 */

export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TastingDraft<S = unknown> = { step: string; state: S; updatedAt: string };

export async function loadTastingDraft<S = unknown>(userId: string): Promise<TastingDraft<S> | null> {
  const { data, error } = await supabase
    .from("tasting_drafts")
    .select("step, state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  // A day-old draft is a tasting nobody finished, not one to resume. Leave the row; the next
  // save overwrites it and Start over deletes it.
  if (Date.now() - new Date(data.updated_at).getTime() > DRAFT_MAX_AGE_MS) return null;
  return { step: data.step, state: data.state as S, updatedAt: data.updated_at };
}

let pending: ReturnType<typeof setTimeout> | null = null;
let queued: { userId: string; step: string; state: unknown; body: string } | null = null;
let last: string | null = null;

async function send(q: NonNullable<typeof queued>) {
  const { error } = await supabase
    .from("tasting_drafts")
    .upsert({ user_id: q.userId, step: q.step, state: q.state, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) { last = null; console.warn("tasting draft not saved:", error.message); }
  else last = q.body;
}

/** Debounced upsert; identical state is not re-sent. */
export function saveTastingDraft(userId: string, step: string, state: unknown): void {
  const body = JSON.stringify({ step, state });
  if (body === last || body === queued?.body) return;
  queued = { userId, step, state, body };
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; const q = queued; queued = null; if (q) void send(q); }, 400);
}

/** Send whatever is queued right now - called when the page is about to hide. */
export function flushTastingDraft(): void {
  if (!pending) return;
  clearTimeout(pending); pending = null;
  const q = queued; queued = null;
  if (q) void send(q);
}

export async function clearTastingDraft(userId: string, why: "saved" | "discarded" | "done"): Promise<void> {
  if (pending) { clearTimeout(pending); pending = null; }
  queued = null; last = null;
  await supabase.from("tasting_drafts").delete().eq("user_id", userId);
  if (why === "discarded") logEvent({ eventType: "tasting_draft_discarded", surface: "taste", targetType: "tasting_draft", targetId: userId });
}
