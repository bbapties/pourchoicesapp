// clean-up-one-bottle, last step: push every admin that a bottle's clean-up is waiting for review.
//
// Brian's ask (2026-09-15): a scheduled clean-up must announce itself the way an app-side bottle
// ADD does, so he hears about it on his phone instead of finding it in the queue days later.
// Sending mirrors scripts/notify_admin_adds.mjs / src/lib/push-server.ts (that file stays
// canonical); the deep link is Admin > Bottles, where suggested_edits are reviewed.
//
//   node scripts/notify_admin_cleanup.mjs <bottle_id> <submission_group> [--dry-run]
//
// Idempotent per submission_group: an `events` row (bottle_cleanup_notified) is written on send
// and checked first, so a retried run cannot buzz twice.

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const [bottleId, group] = args;
if (!bottleId || !group) { console.error("usage: notify_admin_cleanup.mjs <bottle_id> <submission_group> [--dry-run]"); process.exit(1); }

const envPath = process.env.ENV_LOCAL || resolve(process.cwd(), ".env.local");
const env = {};
for (const line of readFileSync(envPath, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const need = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"];
for (const k of need) if (!env[k]) { console.error(`missing ${k} in .env.local`); process.exit(1); }

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:admin@pourchoicesapp.com", env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

const { data: already } = await db.from("events").select("id").eq("event_type", "bottle_cleanup_notified").eq("target_id", group).limit(1);
if (already && already.length) { console.log("already notified for this submission_group"); process.exit(0); }

const { data: bottle } = await db.from("bottles").select("name").eq("id", bottleId).maybeSingle();
const { data: edits } = await db.from("suggested_edits").select("id, submitted_by").eq("submission_group", group).eq("status", "pending");
const n = (edits || []).length;
if (!n) { console.log("no pending suggestions in that group - nothing to announce"); process.exit(0); }
const submitter = edits[0].submitted_by;

const { data: admins } = await db.from("users").select("id").eq("role", "admin");
const recipients = (admins || []).map((a) => a.id).filter((id) => id !== submitter);
const msg = { title: `Cleaned up ${bottle?.name ?? "a bottle"}`, body: `${n} suggestion${n === 1 ? "" : "s"} waiting for your review`, url: "/admin?tab=bottles" };
console.log(`${dryRun ? "[dry] " : ""}${msg.title} - ${msg.body} -> ${recipients.length} admin(s)`);
if (dryRun) process.exit(0);

const { data: subs } = await db
  .from("push_subscriptions")
  .select("id, user_id, endpoint, p256dh, auth, users!inner ( notify_push )")
  .in("user_id", recipients)
  .eq("users.notify_push", true);
const payload = JSON.stringify({ title: msg.title.slice(0, 80), body: msg.body.slice(0, 200), url: msg.url });
let sent = 0, failed = 0; const expired = [];
for (const s of subs || []) {
  try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); sent += 1; }
  catch (e) { failed += 1; if (e && (e.statusCode === 404 || e.statusCode === 410)) expired.push(s.id); }
}
if (expired.length) await db.from("push_subscriptions").delete().in("id", expired);

await db.from("events").insert({
  user_id: submitter, event_type: "bottle_cleanup_notified", surface: "clean_up_one_bottle",
  target_type: "submission_group", target_id: group,
  metadata: { bottle_id: bottleId, suggestions: n, sent, failed },
});
console.log(`sent ${sent}, failed ${failed}`);
