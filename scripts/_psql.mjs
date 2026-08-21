import { readFileSync } from "fs";
import { spawnSync } from "child_process";

const sql = process.argv.slice(2).join(" ");
if (!sql) {
  console.error("usage: node scripts/_psql.mjs <sql>");
  process.exit(1);
}

const raw = readFileSync(".env.local", "utf8").replace(/^\uFEFF/, "");
const line = raw.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}
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
  ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql],
  {
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, PGPASSWORD: password, PGSSLMODE: "require" },
  }
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr.replaceAll(password, "***"));
process.exit(r.status === 0 ? 0 : 1);
