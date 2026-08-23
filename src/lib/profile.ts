import { supabase } from "@/lib/supabase";

// Phase 4 Profile — username edit + tutorial replay.
// Usernames are UNIQUE-indexed in the DB (the real guarantee); we also
// pre-check for a friendly message and validate format in-app.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[A-Za-z0-9_-]+$/;

/** Returns an error message if invalid, or null if the format is acceptable. */
export function validateUsername(raw: string): string | null {
  const name = raw.trim();
  if (name.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(name)) return "Letters, numbers, - and _ only.";
  return null;
}

/**
 * Update the current user's username. Validates format, pre-checks uniqueness
 * (case-insensitive), then writes — falling back on the DB unique constraint
 * (code 23505) if someone took it in between.
 */
export async function updateUsername(opts: {
  userId: string;
  username: string;
}): Promise<{ error?: string }> {
  const name = opts.username.trim();
  const formatErr = validateUsername(name);
  if (formatErr) return { error: formatErr };

  // Case-insensitive uniqueness pre-check (ilike with no wildcard = exact match).
  const { data: existing, error: checkErr } = await supabase
    .from("users")
    .select("id")
    .ilike("username", name)
    .neq("id", opts.userId)
    .limit(1);
  if (checkErr) return { error: checkErr.message };
  if (existing && existing.length > 0) return { error: "That username is taken." };

  const { error } = await supabase
    .from("users")
    .update({ username: name })
    .eq("id", opts.userId);
  if (error) {
    if ((error as { code?: string }).code === "23505") return { error: "That username is taken." };
    return { error: error.message };
  }
  return {};
}

/** Read the account email (mirrored onto public.users). */
export async function fetchEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (error) { console.error("fetchEmail:", error.message); return null; }
  return data?.email ?? null;
}

/**
 * Reset the coach/tutorial "seen" state so the new-user tour replays. Caller
 * should do a full reload afterward so CoachHost re-runs from a clean mount.
 */
export async function resetCoaches(userId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("users")
    .update({ seen_coach_ids: [] })
    .eq("id", userId);
  return error ? { error: error.message } : {};
}
