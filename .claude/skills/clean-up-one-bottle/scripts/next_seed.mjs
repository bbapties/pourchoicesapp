#!/usr/bin/env node
// SEED mode (#133): which common bourbon do we not have yet? Walks seed_bourbons.json in order
// and prints the first one with no bottle whose name matches (loose: first three words, case-
// insensitive), so the bot researches ONE bottle and inserts it. Prints {"done":true} when the
// list is exhausted - then extend the list, do not invent names.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const list = JSON.parse(readFileSync(join(here, "..", "seed_bourbons.json"), "utf8"));
const r = spawnSync(process.execPath, ["scripts/_psql.mjs", "--json", "SELECT lower(name) AS name FROM public.bottles"], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr || "psql failed"); process.exit(1); }
const have = JSON.parse(r.stdout.trim() || "[]").map((x) => x.name);
const key = (s) => s.toLowerCase().replace(/[’']/g, "'").split(/\s+/).slice(0, 3).join(" ");
for (const b of list) {
  const k = key(b.name);
  if (!have.some((n) => n.replace(/[’']/g, "'").startsWith(k))) { console.log(JSON.stringify(b)); process.exit(0); }
}
console.log(JSON.stringify({ done: true }));
