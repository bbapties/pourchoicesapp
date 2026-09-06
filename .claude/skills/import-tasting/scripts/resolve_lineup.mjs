// Resolve a username + an ordered list of bottle names into concrete
// (bottle_id, variant_id) rows, and build the visual confirmation sheet.
//
//   node .claude/skills/import-tasting/scripts/resolve_lineup.mjs \
//        --user "<username|email>" --out <dir> [--name "<session label>"] \
//        "1st place bottle" "2nd place bottle" ...
//
// Names are given in FINISHING ORDER, best first. Writes <dir>/lineup.json (the
// machine-readable resolution) and <dir>/confirm.html (the contact sheet Brian
// eyeballs). Read-only against the database -- nothing is written until
// build_tasting_sql.mjs + run_sql_file.mjs run.
//
// Matching is deliberately done in Node rather than SQL: the catalog is small
// (low hundreds of variants), and doing it here means the script can explain
// WHY it picked a row, which is the whole point of the confirmation step.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";

// ---------------------------------------------------------------- connection
function conn() {
  const envPath = process.env.ENV_LOCAL || resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8").replace(/^﻿/, "");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) { console.error("missing DATABASE_URL in " + envPath); process.exit(1); }
  const v = line.trim().slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  const at = v.lastIndexOf("@");
  const userinfo = v.slice(v.indexOf("://") + 3, at);
  const colon = userinfo.lastIndexOf(":");
  const rest = v.slice(at + 1);
  const slash = rest.indexOf("/");
  const hostport = slash >= 0 ? rest.slice(0, slash) : rest.split("?")[0];
  const colonH = hostport.lastIndexOf(":");
  return {
    user: userinfo.slice(0, colon),
    password: userinfo.slice(colon + 1),
    host: colonH >= 0 ? hostport.slice(0, colonH) : hostport.split("?")[0],
    port: colonH >= 0 ? hostport.slice(colonH + 1).split("?")[0] : "5432",
    db: (slash >= 0 ? rest.slice(slash + 1).split("?")[0] : "postgres") || "postgres",
  };
}

/** Run a SELECT and return rows as objects. Uses JSON so no delimiter can ever bite us. */
function query(sql) {
  const c = conn();
  const r = spawnSync("psql", [
    "-h", c.host, "-p", c.port, "-U", c.user, "-d", c.db,
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c",
    `SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (${sql}) t;`,
  ], { encoding: "utf8", timeout: 30000, env: { ...process.env, PGPASSWORD: c.password, PGSSLMODE: "require" } });
  if (r.status !== 0) {
    process.stderr.write((r.stderr || "").replaceAll(c.password, "***"));
    process.exit(1);
  }
  return JSON.parse(r.stdout.trim() || "[]");
}

// ---------------------------------------------------------------- matching
const NOISE = new Set([
  "the", "and", "a", "of", "no", "nas",
  // Category words carry almost no discriminating power in a whiskey catalog:
  // nearly every row has them, so letting them score inflates every candidate.
  "bourbon", "whiskey", "whisky", "straight", "kentucky", "tennessee",
  "distillery", "distilling", "co", "company", "brand", "brands",
]);

/** Lowercase, strip punctuation, expand a few conventions, split into tokens. */
function tokens(s) {
  return String(s || "")
    .toLowerCase()
    // Drop apostrophes rather than splitting on them, so a typed "blantons"
    // and the catalog's "Blanton's" become the same token. Whiskey names are
    // full of these: Maker's, Michter's, Jack Daniel's, Weller's.
    .replace(/['‘’ʼ]/g, "")
    .replace(/&/g, " and ")
    .replace(/(\d+)\s*(?:yr|year|years)\b(?:\s*old)?/g, "$1year")
    .replace(/\bsingle\s*barrel\b/g, "singlebarrel")
    .replace(/\bsmall\s*batch\b/g, "smallbatch")
    .replace(/\bbarrel\s*proof\b/g, "barrelproof")
    .replace(/\bcask\s*strength\b/g, "caskstrength")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Dice coefficient over character bigrams -- forgiving of typos and word order. */
function dice(a, b) {
  const bg = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };
  const A = bg(a), B = bg(b);
  if (!A.size || !B.size) return 0;
  let hits = 0, total = 0;
  for (const [g, n] of A) { total += n; hits += Math.min(n, B.get(g) || 0); }
  for (const n of B.values()) total += n;
  return (2 * hits) / total;
}

/**
 * Score one query string against one catalog row, 0..1.
 *
 * Blends three signals so no single one can dominate:
 *   - token overlap on the SIGNIFICANT words (category noise stripped)
 *   - bigram similarity on the whole string (catches typos, plurals, spacing)
 *   - a bonus when the distillery is named in the query but not the bottle name
 * A number that appears in the query but NOT in the candidate is a hard penalty:
 * "Weller 12" and "Weller 107" are different bottles, and bigram similarity
 * alone rates them as near-identical.
 */
function score(qRaw, row) {
  const candRaw = [row.bottle_name, row.attr_store_pick_name].filter(Boolean).join(" ");
  const qTok = tokens(qRaw), cTok = tokens(candRaw);
  const qSig = qTok.filter((t) => !NOISE.has(t));
  const cSig = cTok.filter((t) => !NOISE.has(t));
  if (!qSig.length || !cSig.length) return 0;

  const cSet = new Set(cSig);
  const overlap = qSig.filter((t) => cSet.has(t)).length / qSig.length;
  const bigram = dice(qTok.join(" "), cTok.join(" "));

  // Distillery mentioned in the query ("Buffalo Trace Weller") but living in a
  // different column than the bottle name.
  const dTok = new Set(tokens(row.bottle_distillery));
  const distilleryHit = qSig.some((t) => dTok.has(t) && !cSet.has(t)) ? 0.08 : 0;

  const qNums = qSig.filter((t) => /^\d/.test(t));
  const cNums = new Set(cSig.filter((t) => /^\d/.test(t)));
  const numMiss = qNums.some((n) => !cNums.has(n)) ? 0.35 : 0;

  // A shared age statement is not a match. "Weller 12 Year" against
  // "Coureur des Bois Excellence 12 Year Maple Whisky" agrees on nothing but
  // "12year" and still scored 0.46 before this penalty. Demand that at least one
  // WORD -- a brand, an expression -- actually lands, in the name or the
  // distillery, before the row is a candidate at all.
  const qWords = qSig.filter((t) => !/^\d/.test(t));
  const wordHit = qWords.some((t) => cSet.has(t) || dTok.has(t));
  const noWordMatch = qWords.length && !wordHit ? 0.4 : 0;

  let s = 0.6 * overlap + 0.4 * bigram + distilleryHit - numMiss - noWordMatch;
  // Prefer the default variant when everything else ties: an importer naming a
  // bottle plainly means the standard release, not somebody's store pick.
  if (row.variant_is_default) s += 0.02;
  if (row.attr_store_pick_name && !tokens(qRaw).some((t) => tokens(row.attr_store_pick_name).includes(t))) s -= 0.06;
  return Math.max(0, Math.min(1, s));
}

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const username = flag("--user");
const outDir = flag("--out");
const sessionName = flag("--name");
const names = argv.filter((a, i) =>
  !a.startsWith("--") && !["--user", "--out", "--name"].includes(argv[i - 1]));

if (!username || !outDir || names.length < 2) {
  console.error('usage: resolve_lineup.mjs --user "<username|email>" --out <dir> [--name "<label>"] "1st" "2nd" ...');
  console.error("       (at least 2 bottles -- a tasting needs a pair to compare)");
  process.exit(1);
}
if (names.length > 10) {
  console.error(`refusing ${names.length} bottles: MAX_PICKS is 10 (src/lib/tastings.ts).`);
  process.exit(1);
}

// ---------------------------------------------------------------- resolve
const users = query(`
  SELECT id, username, email, account_type
    FROM public.users
   WHERE lower(username) = lower(${lit(username)}) OR lower(email) = lower(${lit(username)})
`);
if (users.length !== 1) {
  console.error(users.length === 0
    ? `No user matches ${JSON.stringify(username)}.`
    : `${users.length} users match ${JSON.stringify(username)} -- be more specific.`);
  process.exit(1);
}
const user = users[0];

const catalog = query(`
  SELECT variant_id, bottle_id, bottle_name, bottle_distillery, bottle_category,
         variant_is_default, attr_store_pick_name, attr_frontimage_url,
         attr_proof, attr_age, variant_verified
    FROM public.all_variant_details
`);

const picks = names.map((raw, i) => {
  const ranked = catalog
    .map((row) => ({ row, s: score(raw, row) }))
    .sort((a, b) => b.s - a.s);
  const best = ranked[0];
  const runnerUp = ranked[1];
  // "Ambiguous" = the top two are close enough that a human should look. The
  // confirmation sheet flags these rather than the script guessing silently.
  const ambiguous = best && runnerUp && best.s - runnerUp.s < 0.08 && runnerUp.s > 0.45;
  return {
    place: i + 1,
    query: raw,
    matched: best && best.s >= 0.45 ? best.row : null,
    confidence: best ? Number(best.s.toFixed(3)) : 0,
    ambiguous: Boolean(ambiguous),
    alternatives: ranked.slice(0, 4).filter((r) => r.s > 0.3).map((r) => ({
      variant_id: r.row.variant_id,
      label: label(r.row),
      confidence: Number(r.s.toFixed(3)),
    })),
  };
});

function label(row) {
  const bits = [row.bottle_name];
  if (row.attr_store_pick_name) bits.push(`(${row.attr_store_pick_name})`);
  return bits.join(" ");
}
function lit(s) { return `'${String(s).replace(/'/g, "''")}'`; }

// A variant may not appear twice: the pairwise generator would emit a
// self-comparison, which the Elo trigger skips, silently dropping a placement.
const seen = new Map();
for (const p of picks) {
  if (!p.matched) continue;
  const prev = seen.get(p.matched.variant_id);
  if (prev) p.duplicateOf = prev;
  else seen.set(p.matched.variant_id, p.place);
}

const lineup = {
  generatedAt: new Date().toISOString(),
  user: { id: user.id, username: user.username, account_type: user.account_type },
  sessionName: sessionName || null,
  picks,
  unresolved: picks.filter((p) => !p.matched).map((p) => p.query),
  needsAttention: picks.some((p) => !p.matched || p.ambiguous || p.duplicateOf),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "lineup.json"), JSON.stringify(lineup, null, 2));
// Inline every bottle shot as a data: URI. The sheet is sent to Brian through
// SendUserFile and rendered in a viewer that does NOT load remote images -- a
// sheet full of broken <img> tags is worse than useless, because the whole
// point of this step is that he confirms the bottle with his eyes. Embedding
// also means the file stays correct if Storage or a hotlinked CDN moves.
const shots = new Map();
for (const p of picks) {
  const url = p.matched?.attr_frontimage_url;
  if (!url || shots.has(url)) continue;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get("content-type")?.split(";")[0] || "image/webp";
    shots.set(url, `data:${type};base64,${buf.toString("base64")}`);
  } catch (e) {
    console.log(`  ! could not fetch image for place ${p.place}: ${e.message}`);
  }
}
writeFileSync(resolve(outDir, "confirm.html"), sheet(lineup, shots));

// ---------------------------------------------------------------- report
console.log(`user: ${user.username} (${user.account_type})  id=${user.id}`);
for (const p of picks) {
  const m = p.matched;
  const flags = [
    p.ambiguous ? "AMBIGUOUS" : null,
    p.duplicateOf ? `DUPLICATE of place ${p.duplicateOf}` : null,
    m && !m.variant_verified ? "unverified" : null,
    m && !m.attr_frontimage_url ? "NO IMAGE" : null,
  ].filter(Boolean).join(" ");
  console.log(
    `  ${String(p.place).padStart(2)}. ${p.query}\n` +
    `      -> ${m ? label(m) : "*** NOT FOUND ***"}` +
    `${m ? `  [${p.confidence}]` : ""}${flags ? `  ${flags}` : ""}` +
    `${m ? `\n         variant=${m.variant_id}` : ""}`
  );
}
console.log(`\nwrote ${resolve(outDir, "lineup.json")}`);
console.log(`wrote ${resolve(outDir, "confirm.html")}`);
if (lineup.needsAttention) console.log("\nNEEDS ATTENTION -- see flags above. Do not import until resolved.");

// ---------------------------------------------------------------- the sheet
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sheet(l, shots = new Map()) {
  const cards = l.picks.map((p) => {
    const m = p.matched;
    const medal = p.place === 1 ? "1st" : p.place === 2 ? "2nd" : p.place === 3 ? "3rd" : `${p.place}th`;
    const flags = [
      !m ? ["not-found", "NOT FOUND IN CATALOG"] : null,
      p.ambiguous ? ["warn", "Ambiguous &mdash; close second match"] : null,
      p.duplicateOf ? ["not-found", `Duplicate of place ${p.duplicateOf}`] : null,
      m && !m.variant_verified ? ["warn", "Bottle not verified"] : null,
      m && !m.attr_frontimage_url ? ["warn", "No image on file"] : null,
    ].filter(Boolean).map(([k, t]) => `<div class="flag ${k}">${t}</div>`).join("");

    const alts = p.alternatives.length > 1
      ? `<details class="alts"><summary>${p.alternatives.length - 1} other candidate(s)</summary>${
          p.alternatives.slice(1).map((a) =>
            `<div class="alt">${esc(a.label)} <span class="conf">${a.confidence}</span></div>`).join("")
        }</details>`
      : "";

    return `<li class="card${m ? "" : " missing"}">
      <div class="rank">${medal}</div>
      <div class="shot">${
        m && m.attr_frontimage_url
          ? `<img src="${esc(shots.get(m.attr_frontimage_url) || m.attr_frontimage_url)}" alt="${esc(m.bottle_name)}">`
          : `<div class="noimg">?</div>`
      }</div>
      <div class="meta">
        <div class="name">${m ? esc(label(m)) : "&mdash;"}</div>
        <div class="sub">${m ? esc([m.bottle_distillery, m.attr_proof ? `${m.attr_proof} proof` : null, m.attr_age ? `${m.attr_age} yr` : null].filter(Boolean).join(" &middot; ")) : ""}</div>
        <div class="asked">you said: <em>${esc(p.query)}</em>${m ? ` <span class="conf">match ${p.confidence}</span>` : ""}</div>
        ${flags}${alts}
      </div>
    </li>`;
  }).join("");

  return `<title>Tasting import &mdash; confirm lineup</title>
<style>
  :root{
    --bg:#f7f7f6; --card:#fff; --ink:#1a1a1a; --muted:#6b6b6b; --line:#e2e2df;
    --warn-bg:#fff6e0; --warn-ink:#7a5200; --bad-bg:#ffe9e6; --bad-ink:#8c2317; --accent:#2f2f2f;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --bg:#141414; --card:#1e1e1e; --ink:#ededed; --muted:#a0a0a0; --line:#333;
    --warn-bg:#3a2f10; --warn-ink:#ffd479; --bad-bg:#3d1a16; --bad-ink:#ff9c8f; --accent:#ededed;
  }}
  :root[data-theme="dark"]{
    --bg:#141414; --card:#1e1e1e; --ink:#ededed; --muted:#a0a0a0; --line:#333;
    --warn-bg:#3a2f10; --warn-ink:#ffd479; --bad-bg:#3d1a16; --bad-ink:#ff9c8f; --accent:#ededed;
  }
  body{background:var(--bg);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px;}
  h1{font-size:19px;margin:0 0 2px;letter-spacing:-.01em}
  .who{color:var(--muted);font-size:13px;margin-bottom:18px}
  .who b{color:var(--ink)}
  ol{list-style:none;padding:0;margin:0;display:grid;gap:10px;max-width:720px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;display:grid;grid-template-columns:44px 76px 1fr;gap:14px;align-items:center}
  .card.missing{border-color:var(--bad-ink)}
  .rank{font-weight:650;font-size:14px;color:var(--muted);text-align:center}
  .shot{height:96px;display:flex;align-items:center;justify-content:center}
  .shot img{max-height:96px;max-width:76px;object-fit:contain}
  .noimg{width:52px;height:80px;border:1px dashed var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:22px}
  .name{font-weight:600;letter-spacing:-.01em}
  .sub{color:var(--muted);font-size:13px;margin-top:1px}
  .asked{color:var(--muted);font-size:12px;margin-top:5px}
  .asked em{color:var(--ink);font-style:normal}
  .conf{color:var(--muted);font-variant-numeric:tabular-nums}
  .flag{margin-top:6px;font-size:12px;padding:3px 7px;border-radius:5px;display:inline-block}
  .flag.warn{background:var(--warn-bg);color:var(--warn-ink)}
  .flag.not-found{background:var(--bad-bg);color:var(--bad-ink);font-weight:600}
  .alts{margin-top:6px;font-size:12px;color:var(--muted)}
  .alts summary{cursor:pointer}
  .alt{padding:2px 0 0 10px}
  .foot{margin-top:20px;max-width:720px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:12px}
</style>
<h1>Confirm the tasting lineup</h1>
<div class="who">for <b>${esc(l.user.username)}</b>${l.sessionName ? ` &middot; ${esc(l.sessionName)}` : ""} &middot; ${l.picks.length} bottles, best first &middot; nothing has been written yet</div>
<ol>${cards}</ol>
<div class="foot">${
  l.needsAttention
    ? "Some rows need attention (flagged above). Those are resolved before anything is imported."
    : "All bottles resolved. Say the word and this gets written as a real tasting session."
}</div>`;
}
