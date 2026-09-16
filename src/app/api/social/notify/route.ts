import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { adminClient, pushConfigured, sendPushTo } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Social pushes (#114, step 9 of #105). The client says WHAT happened; the server decides WHO
// hears about it, from the database, never from the request:
//   cheer / comment / reply  -> the post owner (and the parent commenter), gated by their
//                               users.notify_reactions
//   follow                   -> the followed person, gated by notify_reactions
//   activity                 -> the poster's followers whose follow row's notify_kinds names
//                               this action (the bell), never the poster
//   activity (added_to_db)   -> every admin, when the adder is a data account (account_type =
//                               'data'); Brian wants to see each bottle those accounts put in.
//   feedback                 -> every admin, for every report (Brian, 2026-09-13); deep-links to
//                               Admin > Feedback.
//   bottle_verified          -> the HUMAN who added the bottle, when an admin verifies it
//                               (Brian, 2026-09-16): "your add is on the shelf". Admin caller only.
//   edit_reviewed            -> the HUMAN submitter(s) of a suggestion group, when an admin
//                               approves or rejects it; bot submissions stay silent. Admin caller only.
// Every recipient still passes the master switch (users.notify_push) inside sendPushTo, and a
// muted person can never reach the muter: muting deleted the follow row, so there is no bell.
// Fail-open end to end: the caller's action already happened; this only decides whether phones buzz.

type Body = {
  kind: "cheer" | "comment" | "reply" | "follow" | "activity" | "feedback" | "bottle_verified" | "edit_reviewed";
  activityId?: string;
  commentId?: string;
  targetUserId?: string;
  feedbackId?: string;
  bottleId?: string;
  submissionGroup?: string;
  /** edit_reviewed: what the admin did to the group, and the note they left (if any). */
  decision?: "approved" | "rejected" | "partial";
  note?: string;
};

const NOTIFY_ACTIONS = new Set(["drank", "tasted", "added_to_collection", "wishlisted"]);

function verb(action: string, pourType: string | null, bottle: string): string {
  switch (action) {
    case "drank":
      return pourType === "neat" ? `poured ${bottle} neat` : pourType === "rocks" ? `poured ${bottle} on the rocks` : pourType === "mixed" ? `poured ${bottle}, mixed` : `poured ${bottle}`;
    case "tasted":
      return "finished a blind tasting";
    case "added_to_collection":
      return `added ${bottle} to their bar`;
    case "wishlisted":
      return `wants ${bottle}`;
    default:
      return action.replace(/_/g, " ");
  }
}

export async function POST(request: Request) {
  if (!pushConfigured()) return NextResponse.json({ sent: 0, skipped: "push not configured" });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ sent: 0, skipped: "no service role" });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: caller } = await supabase.from("users").select("id, username, account_type, role").eq("auth_id", user.id).maybeSingle();
  if (!caller) return NextResponse.json({ error: "No profile" }, { status: 403 });

  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const me = `@${caller.username}`;
  let recipients: string[] = [];
  let msg: { title: string; body: string; url: string } | null = null;

  if (body.kind === "cheer" || body.kind === "comment" || body.kind === "reply") {
    if (!body.activityId) return NextResponse.json({ error: "activityId required" }, { status: 400 });
    const { data: act } = await admin
      .from("activities")
      .select("id, user_id, action, pour_type, bottles ( name )")
      .eq("id", body.activityId)
      .maybeSingle();
    if (!act) return NextResponse.json({ sent: 0 });
    const bottle = (Array.isArray(act.bottles) ? act.bottles[0] : act.bottles)?.name ?? "a bottle";
    const what = act.action === "tasted" ? "blind tasting" : act.action === "drank" ? "pour" : "post";

    if (body.kind === "cheer") {
      // Only a cheer that actually exists buzzes anyone.
      const { data: re } = await admin.from("post_reactions").select("activity_id").eq("activity_id", act.id).eq("user_id", caller.id).maybeSingle();
      if (!re) return NextResponse.json({ sent: 0 });
      recipients = [act.user_id];
      msg = { title: `${me} cheered your ${what}`, body: bottle, url: `/post/${act.id}` };
    } else {
      if (!body.commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });
      const { data: c } = await admin.from("post_comments").select("id, user_id, body, parent_id").eq("id", body.commentId).eq("user_id", caller.id).maybeSingle();
      if (!c) return NextResponse.json({ sent: 0 });
      recipients = [act.user_id];
      if (c.parent_id) {
        const { data: parent } = await admin.from("post_comments").select("user_id").eq("id", c.parent_id).maybeSingle();
        if (parent?.user_id) recipients.push(parent.user_id);
      }
      msg = { title: c.parent_id ? `${me} replied to you` : `${me} commented on your ${what}`, body: String(c.body).slice(0, 120), url: `/post/${act.id}` };
    }
    recipients = recipients.filter((id) => id !== caller.id);
    if (recipients.length) {
      const { data: prefs } = await admin.from("users").select("id").in("id", recipients).eq("notify_reactions", true);
      recipients = (prefs || []).map((p: { id: string }) => p.id);
    }
  } else if (body.kind === "follow") {
    if (!body.targetUserId) return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
    const { data: rel } = await admin
      .from("user_relationships")
      .select("to_user_id")
      .eq("from_user_id", caller.id)
      .eq("to_user_id", body.targetUserId)
      .eq("kind", "follow")
      .maybeSingle();
    if (!rel) return NextResponse.json({ sent: 0 });
    const { data: t } = await admin.from("users").select("id").eq("id", body.targetUserId).eq("notify_reactions", true).maybeSingle();
    if (t) recipients = [t.id];
    msg = { title: `${me} followed you`, body: "See their page", url: `/u/${encodeURIComponent(caller.username)}` };
  } else if (body.kind === "activity") {
    if (!body.activityId) return NextResponse.json({ error: "activityId required" }, { status: 400 });
    const { data: act } = await admin
      .from("activities")
      .select("id, user_id, action, pour_type, bottles ( name )")
      .eq("id", body.activityId)
      .eq("user_id", caller.id)
      .maybeSingle();
    if (!act) return NextResponse.json({ sent: 0 });
    const bottle = (Array.isArray(act.bottles) ? act.bottles[0] : act.bottles)?.name ?? "a bottle";
    if (act.action === "added_to_db") {
      // Feed-hidden, but the admins hear it when a data account did the adding.
      if (caller.account_type !== "data") return NextResponse.json({ sent: 0 });
      const { data: admins } = await admin.from("users").select("id").eq("role", "admin");
      recipients = (admins || []).map((a: { id: string }) => a.id).filter((id) => id !== caller.id);
      msg = { title: `${me} added ${bottle} to the database`, body: "Open Admin to review it", url: "/admin" };
    } else {
      if (!NOTIFY_ACTIONS.has(act.action)) return NextResponse.json({ sent: 0 });
      const { data: followers } = await admin
        .from("user_relationships")
        .select("from_user_id")
        .eq("to_user_id", caller.id)
        .eq("kind", "follow")
        .contains("notify_kinds", [act.action]);
      recipients = (followers || []).map((f: { from_user_id: string }) => f.from_user_id);
      msg = { title: `${me} ${verb(act.action, act.pour_type, bottle)}`, body: act.action === "tasted" ? "See who won" : "Open the post", url: `/post/${act.id}` };
    }
  } else if (body.kind === "feedback") {
    if (!body.feedbackId) return NextResponse.json({ error: "feedbackId required" }, { status: 400 });
    // Only a report the caller actually filed buzzes anyone (same shape as the cheer check).
    const { data: fb } = await admin
      .from("feedback")
      .select("id, type, message")
      .eq("id", body.feedbackId)
      .eq("submitted_by", caller.id)
      .maybeSingle();
    if (!fb) return NextResponse.json({ sent: 0 });
    const { data: admins } = await admin.from("users").select("id").eq("role", "admin");
    recipients = (admins || []).map((a: { id: string }) => a.id).filter((id) => id !== caller.id);
    msg = {
      title: `${me} sent ${fb.type === "bug" ? "a bug report" : "a feature request"}`,
      body: String(fb.message ?? "").replace(/\s+/g, " ").slice(0, 200),
      url: "/admin?tab=feedback",
    };
  } else if (body.kind === "bottle_verified") {
    if (caller.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    if (!body.bottleId) return NextResponse.json({ error: "bottleId required" }, { status: 400 });
    // Only a bottle that IS verified buzzes its adder, and only a human adder (a data bot has no phone).
    const { data: b } = await admin
      .from("bottles")
      .select("id, name, verified, created_by, users:created_by ( id, account_type )")
      .eq("id", body.bottleId)
      .maybeSingle();
    if (!b || !b.verified || !b.created_by) return NextResponse.json({ sent: 0 });
    const adder = Array.isArray(b.users) ? b.users[0] : b.users;
    if (!adder || adder.account_type !== "human") return NextResponse.json({ sent: 0 });
    recipients = [b.created_by].filter((id) => id !== caller.id);
    msg = { title: `${b.name} is verified`, body: "The bottle you added is cleaned up and on the shelf. Thanks for adding it.", url: "/search" };
  } else if (body.kind === "edit_reviewed") {
    if (caller.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    if (!body.submissionGroup) return NextResponse.json({ error: "submissionGroup required" }, { status: 400 });
    // The group's rows say who submitted and what happened; the client only names the group.
    const { data: rows } = await admin
      .from("suggested_edits")
      .select("submitted_by, status, review_note, bottles ( name ), users:submitted_by ( account_type )")
      .eq("submission_group", body.submissionGroup);
    if (!rows || !rows.length) return NextResponse.json({ sent: 0 });
    const decided = rows.filter((r) => r.status === "approved" || r.status === "rejected");
    if (!decided.length) return NextResponse.json({ sent: 0 });
    const approved = decided.filter((r) => r.status === "approved").length;
    const rejected = decided.length - approved;
    const bottle = (Array.isArray(rows[0].bottles) ? rows[0].bottles[0] : rows[0].bottles)?.name ?? "a bottle";
    const humans = new Set<string>();
    for (const r of rows) {
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
      if (r.submitted_by && u?.account_type === "human") humans.add(r.submitted_by);
    }
    recipients = [...humans].filter((id) => id !== caller.id);
    const note = (body.note ?? decided.find((r) => r.review_note)?.review_note ?? "").toString().replace(/\s+/g, " ").trim();
    const title = rejected === 0 ? `Your edit to ${bottle} was approved` : approved === 0 ? `Your edit to ${bottle} wasn't taken` : `Your edit to ${bottle}: ${approved} approved, ${rejected} not`;
    msg = { title: title.slice(0, 80), body: (note ? `Note from the admin: ${note}` : rejected === 0 ? "It's live in the catalog now. Thanks." : "Open the bottle to see what it reads now.").slice(0, 200), url: "/search" };
  } else {
    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  }

  if (!msg || !recipients.length) return NextResponse.json({ sent: 0 });
  const result = await sendPushTo(admin, recipients, msg);
  return NextResponse.json({ ...result, recipients: recipients.length });
}
