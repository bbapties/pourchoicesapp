// The database over HTTPS (#133). The claude.ai cloud sandbox cannot open a Postgres connection
// (its proxy only tunnels HTTPS), so scripts/_psql.mjs and the skill's run_sql_file.mjs fall
// back to PostgREST: POST /rest/v1/rpc/exec_sql_batch with the service-role key, statements
// split client-side and run in ONE transaction server-side (sql/exec-sql-http-migration.sql).
//
// Used automatically when psql cannot connect; forced with PC_DB_TRANSPORT=http.
// Never prints the key or the URL of the request beyond the host.
import { readFileSync } from "node:fs";

/** .env.local -> { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE } (also honours real env vars). */
export function readEnv(envPath = ".env.local") {
  const out = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE };
  try {
    const raw = readFileSync(envPath, "utf8").replace(/^﻿/, "");
    for (const l of raw.split(/\r?\n/)) {
      const i = l.indexOf("="); if (i < 0) continue;
      const k = l.slice(0, i).trim(), v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "NEXT_PUBLIC_SUPABASE_URL" && !out.url) out.url = v;
      if (k === "SUPABASE_SERVICE_ROLE" && !out.key) out.key = v;
    }
  } catch { /* env vars only */ }
  return out;
}

/**
 * Split SQL text into statements on top-level ';', honouring '...' strings, "..." identifiers,
 * $tag$...$tag$ dollar quotes, -- line comments and block comments. psql backslash commands
 * (\echo, \set ...) are dropped - PostgREST has no psql.
 */
export function splitStatements(sql) {
  const out = []; let cur = ""; let i = 0; const n = sql.length;
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    if (c === "-" && d === "-") { while (i < n && sql[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" ) { let j = i + 1; while (j < n) { if (sql[j] === "'" ) { if (sql[j + 1] === "'") { j += 2; continue; } break; } j++; } cur += sql.slice(i, j + 1); i = j + 1; continue; }
    if (c === '"') { const j = sql.indexOf('"', i + 1); const e = j < 0 ? n : j + 1; cur += sql.slice(i, e); i = e; continue; }
    if (c === "$") { const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i)); if (m) { const tag = m[0]; const j = sql.indexOf(tag, i + tag.length); const e = j < 0 ? n : j + tag.length; cur += sql.slice(i, e); i = e; continue; } }
    if (c === "\\" && (i === 0 || sql[i - 1] === "\n")) { while (i < n && sql[i] !== "\n") i++; continue; }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Run statements in one transaction over HTTPS. Returns the server's per-statement result list. */
export async function execBatch(statements, env = readEnv()) {
  if (!env.url || !env.key) throw new Error("HTTP transport needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE");
  const res = await fetch(`${env.url.replace(/\/$/, "")}/rest/v1/rpc/exec_sql_batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.key, Authorization: `Bearer ${env.key}` },
    body: JSON.stringify({ p_statements: statements }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { const j = JSON.parse(text); msg = j.message || j.hint || j.details || text; } catch { /* raw */ }
    throw new Error(`exec_sql_batch ${res.status}: ${msg}`);
  }
  return JSON.parse(text);
}

/** psql-ish rendering of one result list, for humans reading a plain call. */
export function render(results) {
  const lines = [];
  for (const r of results) {
    if (r.kind === "count") { lines.push(`${r.command} ${r.count}`); continue; }
    const rows = r.rows || [];
    if (!rows.length) { lines.push("(0 rows)"); continue; }
    const cols = Object.keys(rows[0]);
    const cell = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
    const w = cols.map((c) => Math.max(c.length, ...rows.map((x) => cell(x[c]).length)));
    lines.push(cols.map((c, i) => c.padEnd(w[i])).join(" | "));
    lines.push(w.map((x) => "-".repeat(x)).join("-+-"));
    for (const x of rows) lines.push(cols.map((c, i) => cell(x[c]).padEnd(w[i])).join(" | "));
    lines.push(`(${rows.length} row${rows.length === 1 ? "" : "s"})`);
  }
  return lines.join("\n") + "\n";
}

/** The last statement's rows (what --json callers want). */
export function lastRows(results) {
  for (let i = results.length - 1; i >= 0; i--) if (results[i].kind === "rows") return results[i].rows;
  return [];
}
