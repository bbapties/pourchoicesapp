// #120: push every admin about bottles a DATA account added outside the app.
//
// The app's add flow pushes admins through /api/social/notify. A data bot (Grain_of_Truth,
// Right_Blind) inserts by SQL, so the trigger in sql/b120-added-to-db-trigger-migration.sql
// writes the `added_to_db` activity and THIS script sends the push -- from this machine,
// which holds the VAPID keys and the service role in .env.local (no pg_net on the project).
//
// Run it after any data-account insert (the verify-bottle skill's last step):
//   node scripts/notify_admin_adds.mjs            # send + mark
//   node scripts/notify_admin_adds.mjs --dry-run  # list what would be sent
//
// WHO: every users.role = 'admin' except the adder -- the same decision the notify route makes
// (keep the two in step). Each activity is marked details.admin_notified so a re-run is a no-op.
// Sending logic mirrors src/lib/push-server.ts sendPushTo(); that file stays canonical.

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const dryRun = process.argv.includes("--dry-run");

const envPath = process.env.ENV_LOCAL || resolve(process.cwd(), ".env.local");
const env = {};
for (const line of readFileSync(envPath, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const need = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"];
for (const k of need) if (!env[k]) { console.error(`missing ${k} in .env.local`); process.exit(1); }

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:admin@pourchoicesapp.com", env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

// 1. Un-notified adds by data accounts.
const { data: adds, error } = await db
  .from("activities")
  .select("id, user_id, bottle_id, created_at, details, users!activities_user_id_fkey!inner ( username, account_type ), bottles ( name )")
  .eq("action", "added_to_db")
  .is("variant_id", null)
  .eq("users.account_type", "data")
  .order("created_at", { ascending: true });
if (error) { console.error("read failed:", error.message); process.exit(1); }
const pending = (adds || []).filter((a) => !(a.details && a.details.admin_notified));
if (!pending.length) { console.log("nothing to send"); process.exit(0); }

// 2. Who hears it: every admin, minus the adder.
const { data: admins } = await db.from("users").select("id, username").eq("role", "admin");
const adminIds = (admins || []).map((a) => a.id);

let sent = 0, failed = 0;
for (const a of pending) {
  const who = Array.isArray(a.users) ? a.users[0] : a.users;
  const bottle = (Array.isArray(a.bottles) ? a.bottles[0] : a.bottles)?.name ?? "a bottle";
  const recipients = adminIds.filter((id) => id !== a.user_id);
  // Brian (2026-09-21): the bottle is the headline, the adder is the detail, and the tap lands on
  // THAT bottle's case file in Admin > Review (same deep link as the clean-up push), not /admin.
  const msg = { title: `${bottle} was added`, body: `by @${who.username} - tap to review it`, url: `/admin?tab=review&bottle=${a.bottle_id}` };
  console.log(`${dryRun ? "[dry] " : ""}${msg.title} -> ${recipients.length} admin(s)`);
  if (dryRun) continue;

  // Same shape as push-server.ts: subscriptions of recipients whose master switch is on.
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, users!inner ( notify_push )")
    .in("user_id", recipients)
    .eq("users.notify_push", true);
  const payload = JSON.stringify({ title: msg.title.slice(0, 80), body: msg.body.slice(0, 200), url: msg.url });
  const expired = [];
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent += 1;
    } catch (e) {
      failed += 1;
      if (e && (e.statusCode === 404 || e.statusCode === 410)) expired.push(s.id);
    }
  }
  if (expired.length) await db.from("push_subscriptions").delete().in("id", expired);

  await db.from("activities").update({ details: { ...(a.details || {}), admin_notified: new Date().toISOString() } }).eq("id", a.id);
}
console.log(`sent ${sent}, failed ${failed}, adds ${pending.length}`);
