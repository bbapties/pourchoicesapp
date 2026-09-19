#!/usr/bin/env node
/**
 * The clean-up bot's gate (#133). Runs FIRST in every routine tick and answers one question:
 * is there work, and what kind? Prints one JSON line and exits, so a tick with nothing to do
 * costs one tool call.
 *
 *   node scripts/bot_gate.mjs                 -> {"mode":"urgent"|"idle"|"seed"|"none", ...}
 *   node scripts/bot_gate.mjs --finish <run_id> <outcome> ["note"]
 *
 * Brian's rules (2026-09-19):
 *   urgent  a REAL user (account_type = human, role <> admin) added a bottle that is unverified,
 *           never checked, with nothing pending -> clean it on THIS tick, whatever the clock says.
 *   idle    otherwise, if the last idle/seed run finished >= IDLE_HOURS ago: the oldest unverified
 *           never-checked bottle from anyone (Brian, the data accounts), then the recheck funnel.
 *   seed    idle is due but the queue is empty: add a common bourbon we do not have yet.
 *   none    idle is not due. Exit.
 *
 * Every non-none answer opens a bot_runs row; the skill closes it with --finish at the end.
 * Reads .env.local through scripts/_psql.mjs (never prints the URL).
 */
import { spawnSync } from "node:child_process";

const IDLE_HOURS = 6;
const RUNNER = process.env.BOT_RUNNER || (process.env.CLAUDE_CODE_REMOTE ? "cloud" : "local");

function sql(q) {
  const r = spawnSync(process.execPath, ["scripts/_psql.mjs", "--json", q], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "psql failed");
  const out = r.stdout.trim();
  return out ? JSON.parse(out) : [];
}
const lit = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);

const [, , flag, runId, outcome, note] = process.argv;
if (flag === "--finish") {
  if (!runId || !outcome) { console.error("usage: bot_gate.mjs --finish <run_id> <outcome> [note]"); process.exit(1); }
  sql(`UPDATE public.bot_runs SET finished_at = now(), outcome = ${lit(outcome)}, note = ${lit(note ?? null)} WHERE id = ${lit(runId)} RETURNING id;`);
  console.log(JSON.stringify({ finished: runId, outcome }));
  process.exit(0);
}

const pendingFree = `NOT EXISTS (SELECT 1 FROM public.suggested_edits se WHERE se.bottle_id = b.id AND se.status = 'pending')`;

// 1. urgent: a real user's bottle
const urgent = sql(`
  SELECT b.id, b.name, b.created_at, u.username
    FROM public.bottles b JOIN public.users u ON u.id = b.created_by
   WHERE b.verified = false AND b.dq_checked_at IS NULL AND ${pendingFree}
     AND u.account_type = 'human' AND u.role <> 'admin'
   ORDER BY b.created_at LIMIT 1;`);
if (urgent.length) open("urgent", urgent[0], "a real user added it");

// 2. is idle work due?
const last = sql(`SELECT max(coalesce(finished_at, started_at)) AS at FROM public.bot_runs WHERE mode IN ('idle','seed') AND outcome IS DISTINCT FROM 'failed';`);
const lastAt = last[0]?.at ? new Date(last[0].at) : null;
const hoursSince = lastAt ? (Date.now() - lastAt.getTime()) / 36e5 : Infinity;
if (hoursSince < IDLE_HOURS) {
  console.log(JSON.stringify({ mode: "none", reason: `idle work ran ${hoursSince.toFixed(1)}h ago; next at ${IDLE_HOURS}h` }));
  process.exit(0);
}

// 3. idle: oldest never-checked unverified from anyone (not Test_User), then the funnel
const live = sql(`
  SELECT b.id, b.name, b.created_at, u.username
    FROM public.bottles b LEFT JOIN public.users u ON u.id = b.created_by
   WHERE b.verified = false AND b.dq_checked_at IS NULL AND ${pendingFree}
     AND COALESCE(u.username, '') <> 'Test_User'
   ORDER BY b.created_at LIMIT 1;`);
if (live.length) open("idle", live[0], "oldest unverified, never checked");
const funnel = sql(`
  SELECT r.bottle_id AS id, r.name, r.gaps
    FROM public.bottle_dq_recheck r
   WHERE NOT EXISTS (SELECT 1 FROM public.suggested_edits se WHERE se.bottle_id = r.bottle_id AND se.status = 'pending')
   LIMIT 1;`);
if (funnel.length) open("idle", funnel[0], `recheck funnel: ${funnel[0].gaps ?? ""}`);

// 4. seed: nothing to clean - add a common bourbon we do not have
open("seed", null, "queue empty");

function open(mode, bottle, reason) {
  const row = sql(`INSERT INTO public.bot_runs (mode, bottle_id, runner, note) VALUES (${lit(mode)}, ${lit(bottle?.id ?? null)}, ${lit(RUNNER)}, ${lit(reason)}) RETURNING id;`);
  console.log(JSON.stringify({ mode, run_id: row[0].id, bottle: bottle ? { id: bottle.id, name: bottle.name, added_by: bottle.username ?? null } : null, reason }));
  process.exit(0);
}
