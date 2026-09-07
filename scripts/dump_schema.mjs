// Regenerates DB_Schema.txt.txt from the live database.
//
// WHY THIS EXISTS. The schema dump was hand-made on 2026-09-02 and by 2026-09-07 it knew none of
// the day's columns -- AGENTS.md had to carry a warning that it "may lag reality". A dump nobody
// can reproduce is a dump nobody trusts. Run this after any migration:
//
//     node scripts/dump_schema.mjs
//
// It reads DATABASE_URL from .env.local exactly as scripts/_psql.mjs does, and prints nothing
// secret. Beyond the tables it also records VIEWS (flagging which run as their owner rather than
// the caller -- load-bearing, see the score views), FUNCTIONS (flagging SECURITY DEFINER),
// TRIGGERS and every RLS POLICY, because on this project those are where the behaviour lives.
import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
const raw = readFileSync(".env.local", "utf8").replace(/^\uFEFF/, "");
const line = raw.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const v = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
const at = v.lastIndexOf("@"), schemeEnd = v.indexOf("://");
const userinfo = v.slice(schemeEnd + 3, at), colon = userinfo.lastIndexOf(":");
const user = userinfo.slice(0, colon), password = userinfo.slice(colon + 1);
const rest = v.slice(at + 1), slash = rest.indexOf("/");
const hostport = slash >= 0 ? rest.slice(0, slash) : rest.split("?")[0];
const colonH = hostport.lastIndexOf(":");
const host = colonH >= 0 ? hostport.slice(0, colonH) : hostport.split("?")[0];
const port = colonH >= 0 ? hostport.slice(colonH + 1).split("?")[0] : "5432";
const db = (slash >= 0 ? rest.slice(slash + 1).split("?")[0] : "postgres") || "postgres";
const q = (sql) => {
  const r = spawnSync("psql", ["-h", host, "-p", port, "-U", user, "-d", db, "-t", "-A", "-F", "\u0001", "-c", sql],
    { encoding: "utf8", timeout: 60000, env: { ...process.env, PGPASSWORD: password, PGSSLMODE: "require" } });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  return r.stdout.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split("\u0001"));
};

const today = new Date().toISOString().slice(0, 10);
let out = `-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Regenerated from the live prod DB on ${today} via scripts/_psql.mjs against information_schema/pg_catalog.
-- Column types are the information_schema rendering (e.g. USER-DEFINED shows the udt name).
`;

const cols = q(`SELECT table_name, column_name, CASE WHEN data_type='USER-DEFINED' THEN udt_name ELSE data_type END,
  is_nullable, COALESCE(column_default,''), ordinal_position
  FROM information_schema.columns c
  WHERE table_schema='public' AND EXISTS (SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema='public' AND t.table_name=c.table_name AND t.table_type='BASE TABLE')
  ORDER BY table_name, ordinal_position;`);
let cur = null;
for (const [t, c, ty, nul, def] of cols) {
  if (t !== cur) { if (cur) out += ");\n"; out += `\nCREATE TABLE public.${t} (\n`; cur = t; } else { out += ",\n"; }
  out += `  ${c} ${ty}${nul === "NO" ? " NOT NULL" : ""}${def ? " DEFAULT " + def : ""}`;
}
if (cur) out += "\n);\n";

out += "\n-- Views\n";
for (const [v2, opts] of q(`SELECT c.relname, COALESCE(array_to_string(c.reloptions,','),'')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v' ORDER BY c.relname;`))
  out += `--   ${v2}${opts ? "  [" + opts + "]" : "  [runs as owner]"}\n`;

out += "\n-- Functions\n";
for (const [f, args, sec] of q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid),
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE '' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' ORDER BY p.proname, 2;`))
  out += `--   ${f}(${args})${sec ? "  " + sec : ""}\n`;

out += "\n-- Triggers\n";
for (const [t, tbl] of q(`SELECT tgname, c.relname FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT tg.tgisinternal AND n.nspname='public'
  ORDER BY c.relname, tgname;`))
  out += `--   ${t} on ${tbl}\n`;

out += "\n-- RLS policies\n";
for (const [tbl, pol, cmd] of q(`SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public'
  ORDER BY tablename, cmd, policyname;`))
  out += `--   ${tbl}: ${pol} (${cmd})\n`;

writeFileSync("DB_Schema.txt.txt", out);
console.log("wrote DB_Schema.txt.txt", out.length, "bytes");
