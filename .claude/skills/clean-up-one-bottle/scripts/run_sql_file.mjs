// Run a .sql file transactionally against DATABASE_URL from ./.env.local (repo root).
// Splits userinfo on the LAST ':' and passes -h/-U/PGPASSWORD (see AGENTS.md psql note).
// Usage (from repo root): node .claude/skills/clean-up-one-bottle/scripts/run_sql_file.mjs <file.sql>
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";
import { execBatch, render, splitStatements, readEnv } from "../../../../scripts/_db_http.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: run_sql_file.mjs <file.sql>"); process.exit(1); }
const envPath = process.env.ENV_LOCAL || resolve(process.cwd(), ".env.local");

// ---- HTTPS transport (#133): the cloud sandbox cannot open a Postgres connection. The file is
// split into statements client-side and run in ONE transaction by exec_sql_batch, so the
// all-or-nothing guarantee below holds either way.
async function overHttp() {
  const results = await execBatch(splitStatements(readFileSync(file, "utf8")), readEnv(envPath));
  process.stdout.write(render(results));
  console.error(`-- ran ${file} (https, one transaction)`);
}
if (process.env.PC_DB_TRANSPORT === "http") {
  try { await overHttp(); process.exit(0); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}

const raw = readFileSync(envPath, "utf8").replace(/^﻿/, "");
const line = raw.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) { console.error("missing DATABASE_URL in " + envPath); process.exit(1); }
const v = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
const at = v.lastIndexOf("@");
const schemeEnd = v.indexOf("://");
const userinfo = v.slice(schemeEnd + 3, at);
const colon = userinfo.lastIndexOf(":");
const user = userinfo.slice(0, colon);
const password = userinfo.slice(colon + 1);
const rest = v.slice(at + 1);
const slash = rest.indexOf("/");
const hostport = slash >= 0 ? rest.slice(0, slash) : rest.split("?")[0];
const colonH = hostport.lastIndexOf(":");
const host = colonH >= 0 ? hostport.slice(0, colonH) : hostport.split("?")[0];
const port = colonH >= 0 ? hostport.slice(colonH + 1).split("?")[0] : "5432";
const db = (slash >= 0 ? rest.slice(slash + 1).split("?")[0] : "postgres") || "postgres";

const r = spawnSync(
  "psql",
  ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-f", file],
  { encoding: "utf8", timeout: 60000, env: { ...process.env, PGPASSWORD: password, PGSSLMODE: "require" } }
);
const cantConnect = r.status === null || /could not connect|Connection timed out|timeout expired|Network is unreachable|Connection refused|could not translate host name/i.test(r.stderr || "");
if (cantConnect) {
  try { await overHttp(); process.exit(0); }
  catch (e) { process.stderr.write((r.stderr || "").replaceAll(password, "***")); console.error(`https fallback failed: ${String(e.message || e)}`); process.exit(1); }
}
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr.replaceAll(password, "***"));
process.exit(r.status === 0 ? 0 : 1);
