import { supabase } from "@/lib/supabase";

/**
 * Admin-published What's new (Phase 10 D1).
 *
 * Replaces the old digest, which read the coach catalog directly and therefore showed whatever the
 * codebase happened to contain -- handing a brand-new tester the accumulated 7.x/8.x history as if
 * it were news. That is why the automatic coaches were switched off; this is what turns them back
 * on safely.
 *
 * Division of responsibility: the catalog owns TOURS (anchors and captions are UI and belong in
 * code); this table owns ANNOUNCEMENTS (what is shown, to whom, when). `coachId` optionally links
 * the two so "Show me" can play a tour.
 */

export type Announcement = {
  id: string;
  title: string;
  body: string;
  coachId: string | null;
  published: boolean;
  audience: "all" | "new" | "existing";
  createdAt: string;
  publishedAt: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(r: any): Announcement {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    coachId: r.coach_id ?? null,
    published: !!r.published,
    audience: (r.audience ?? "all") as Announcement["audience"],
    createdAt: r.created_at,
    publishedAt: r.published_at ?? null,
  };
}

/**
 * What this user should see in the digest right now: published, matching their audience, and not
 * already seen. RLS hides drafts, so a failure here can never leak an unpublished row.
 *
 * Fail-open with an empty list: a broken announcements read must never block the app.
 */
export async function fetchUnseenAnnouncements(opts: {
  seenIds: string[];
  isNewUser: boolean;
}): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, coach_id, published, audience, created_at, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("fetchUnseenAnnouncements:", error.message);
    return [];
  }

  const seen = new Set(opts.seenIds);
  return (data ?? [])
    .map(mapRow)
    .filter((a) => !seen.has(a.id))
    .filter((a) =>
      a.audience === "all" ? true : opts.isNewUser ? a.audience === "new" : a.audience === "existing"
    );
}

/** Admin: everything, drafts included, newest first. */
export async function fetchAllAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, coach_id, published, audience, created_at, published_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchAllAnnouncements:", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function createAnnouncement(opts: {
  title: string;
  body: string;
  coachId: string | null;
  audience: Announcement["audience"];
  createdBy: string; // public.users.id (B-74)
}): Promise<{ error?: string }> {
  const { error } = await supabase.from("announcements").insert({
    title: opts.title.trim().slice(0, 120),
    body: opts.body.trim().slice(0, 400),
    coach_id: opts.coachId || null,
    audience: opts.audience,
    created_by: opts.createdBy,
    published: false, // always a draft first -- publishing is a separate, deliberate action
  });
  return error ? { error: error.message } : {};
}

/** Publishing stamps `published_at`, which is also the digest's ordering key. */
export async function setPublished(id: string, published: boolean): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("announcements")
    .update({ published, published_at: published ? new Date().toISOString() : null })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

export async function deleteAnnouncement(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  return error ? { error: error.message } : {};
}
