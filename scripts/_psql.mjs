import { readFileSync } from "fs";
import { spawnSync } from "child_process";

// Two modes:
//   node scripts/_psql.mjs "SELECT 1;"                 -- ad-hoc SQL on argv
//   node scripts/_psql.mjs --file sql/some-migration.sql  -- run a committed migration file
// The --file mode exists so a migration runs from the reviewed file in the repo rather than as
// one long opaque argv string. Same connection handling either way.
const args = process.argv.slice(2);
const fileFlag = args.findIndex((a) => a === "--file" || a === "-f");
let sql;
let sourceLabel;
if (fileFlag >= 0) {
  const path = args[fileFlag + 1];
  if (!path) {
    console.error("usage: node scripts/_psql.mjs --file <path.sql>");
    process.exit(1);
  }
  sql = readFileSync(path, "utf8");
  sourceLabel = path;
} else {
  sql = args.join(" ");
  sourceLabel = "<argv>";
}
if (!sql.trim()) {
  console.error("usage: node scripts/_psql.mjs <sql> | --file <path.sql>");
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
  // NOTE: -c (not -f) even in file mode, so psql runs the whole file as one implicit
  // transaction -- a migration must not half-apply.
  {
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, PGPASSWORD: password, PGSSLMODE: "require" },
  }
);
if (fileFlag >= 0) console.error(`-- ran ${sourceLabel}`);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr.replaceAll(password, "***"));
process.exit(r.status === 0 ? 0 : 1);
