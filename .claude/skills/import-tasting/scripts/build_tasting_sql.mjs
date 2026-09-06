// Turn a confirmed lineup.json into ONE reviewable, transactional .sql file.
//
//   node .claude/skills/import-tasting/scripts/build_tasting_sql.mjs \
//        <lineup.json> <out.sql> [--at "2026-09-01T19:30:00Z"]
//
// Writes nothing to the database -- it only emits SQL, which you read and then
// run with the verify-bottle helper:
//   node .claude/skills/verify-bottle/scripts/run_sql_file.mjs <out.sql>
//
// WHY A FILE, NOT DIRECT INSERTS: the whole point of this skill is to skip the
// UI, not to skip review. A generated file can be read in full before it runs,
// diffed, kept, and re-run. It is also the house pattern (verify-bottle does
// the same) and it keeps everything in one transaction.
//
// ---------------------------------------------------------------------------
// WHAT saveTasting() DOES THAT THIS MUST ALSO DO
//
// The Elo scoring is a DB trigger, so inserting tasting_results is enough to
// fire it. But `src/lib/tastings.ts` does three more things client-side, and an
// import that skipped them would leave the user in a state the UI can never
// produce. All three are replicated below:
//
//   1. tasting_results in ONE statement  -- trig_update_elo_after_session is
//      FOR EACH STATEMENT, so a row-at-a-time insert would score the session
//      once per pair, with each pass reading the previous pass's ratings.
//   2. B-47: delete the user's manual star guesses for the tasted variants --
//      a real blind tasting supersedes a guess.
//   3. B-51: post exactly ONE `tasted` activity for the session, anchored on
//      the winning bottle, so it lands on the Social feed and the per-variant
//      history.
//
// Plus one thing saveTasting does not: an `events` row recording that this
// session came from an import rather than the app.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "fs";

const [, , inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: build_tasting_sql.mjs <lineup.json> <out.sql> [--at "<ISO timestamp>"]');
  process.exit(1);
}
const atIdx = rest.indexOf("--at");
const at = atIdx >= 0 ? rest[atIdx + 1] : null;
if (at && Number.isNaN(Date.parse(at))) {
  console.error(`--at ${JSON.stringify(at)} is not a parseable timestamp`);
  process.exit(1);
}

const l = JSON.parse(readFileSync(inPath, "utf8"));

// ---- refuse anything the confirmation step was supposed to have cleared ----
const problems = [];
if (l.picks.length < 2) problems.push("fewer than 2 bottles");
if (l.picks.length > 10) problems.push(`${l.picks.length} bottles (MAX_PICKS is 10)`);
for (const p of l.picks) {
  if (!p.matched) problems.push(`place ${p.place} (${JSON.stringify(p.query)}) never resolved to a bottle`);
  if (p.duplicateOf) problems.push(`place ${p.place} is the same variant as place ${p.duplicateOf}`);
}
if (problems.length) {
  console.error("refusing to build SQL:\n  - " + problems.join("\n  - "));
  console.error("\nResolve these first -- add the missing bottle, or re-run resolve_lineup.mjs with better names.");
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ts = at ? q(new Date(at).toISOString()) + "::timestamptz" : "now()";
const picks = l.picks; // already in ranked order, index 0 = winner

// ---- pairwise: picks[i] ranked above picks[j] => i beats j -----------------
const pairs = [];
for (let i = 0; i < picks.length; i++) {
  for (let j = i + 1; j < picks.length; j++) {
    pairs.push([picks[i].matched, picks[j].matched, picks[i].place, picks[j].place]);
  }
}

const lines = [];
const w = (s = "") => lines.push(s);

w(`-- ============================================================================`);
w(`-- Imported blind tasting -- generated ${new Date().toISOString()}`);
w(`-- by .claude/skills/import-tasting from ${inPath}`);
w(`--`);
w(`-- User:    ${l.user.username}  (${l.user.id}, account_type=${l.user.account_type})`);
w(`-- Bottles: ${picks.length}, ${pairs.length} head-to-head pairs`);
w(`-- Dated:   ${at ? at + " (backdated)" : "now()"}`);
w(`--`);
w(`-- Finishing order:`);
for (const p of picks) {
  const m = p.matched;
  w(`--   ${String(p.place).padStart(2)}. ${m.bottle_name}${m.attr_store_pick_name ? ` (${m.attr_store_pick_name})` : ""}`);
  w(`--       variant ${m.variant_id}`);
}
w(`--`);
w(`-- This is ONE transaction. The Elo trigger is FOR EACH STATEMENT, so every`);
w(`-- pair must go in with a single INSERT or the session gets scored ${pairs.length} times.`);
w(`-- ============================================================================`);
w();
w(`BEGIN;`);
w();

// ---- 1. the session --------------------------------------------------------
w(`-- 1. The session. mode='self' rather than a new 'import' value: nothing reads`);
w(`--    this column today, and inventing a value here would be the kind of thing`);
w(`--    a later switch statement trips over. Provenance goes in the events row.`);
w(`CREATE TEMP TABLE _imported_session ON COMMIT DROP AS`);
w(`WITH ins AS (`);
w(`  INSERT INTO public.tasting_sessions`);
w(`    (user_id, is_blind, mode, name, bottle_ids, variant_ids, created_at)`);
w(`  VALUES (`);
w(`    ${q(l.user.id)},`);
w(`    true,`);
w(`    'self',`);
w(`    ${l.sessionName ? q(l.sessionName) : "NULL"},`);
w(`    ARRAY[${picks.map((p) => q(p.matched.bottle_id)).join(",\n           ")}]::uuid[],`);
w(`    ARRAY[${picks.map((p) => q(p.matched.variant_id)).join(",\n           ")}]::uuid[],`);
w(`    ${ts}`);
w(`  )`);
w(`  RETURNING id`);
w(`)`);
w(`SELECT id FROM ins;`);
w();

// ---- 2. details ------------------------------------------------------------
w(`-- 2. One row per glass. rank is the finishing position (0 = winner).`);
w(`--    glass_letter and pour_index stay NULL: an import supplies the RESULT,`);
w(`--    not the order the glasses were poured in, and inventing letters here`);
w(`--    would be fabricating data that reads as real. See board #11.`);
w(`INSERT INTO public.tasting_details`);
w(`  (tasting_session_id, bottle_id, variant_id, rank, glass_letter, pour_index, created_at)`);
w(`VALUES`);
w(picks.map((p) =>
  `  ((SELECT id FROM _imported_session), ${q(p.matched.bottle_id)}, ${q(p.matched.variant_id)}, ${p.place - 1}, NULL, NULL, ${ts})`
).join(",\n") + ";");
w();

// ---- 3. results (single statement -> trigger fires once) --------------------
w(`-- 3. Every pair, in ONE statement, so trig_update_elo_after_session fires`);
w(`--    exactly once over the whole set. ON CONFLICT DO NOTHING matches`);
w(`--    saveTasting's ignoreDuplicates: re-running this file cannot double-score.`);
w(`INSERT INTO public.tasting_results`);
w(`  (tasting_session_id, winner_bottle_id, loser_bottle_id, winner_variant_id, loser_variant_id, created_at)`);
w(`VALUES`);
// The label goes ABOVE each row, never trailing it: a `-- ...` at the end of a
// line swallows the comma that separates VALUES rows.
w(pairs.map(([a, b, pa, pb]) =>
  `  -- place ${pa} beats place ${pb}\n` +
  `  ((SELECT id FROM _imported_session), ${q(a.bottle_id)}, ${q(b.bottle_id)}, ${q(a.variant_id)}, ${q(b.variant_id)}, ${ts})`
).join(",\n"));
w(`ON CONFLICT (tasting_session_id, winner_bottle_id, loser_bottle_id) DO NOTHING;`);
w();

// ---- 4. B-47 ---------------------------------------------------------------
w(`-- 4. B-47: a real blind tasting supersedes a manual star guess. Same delete`);
w(`--    saveTasting does on the client.`);
w(`DELETE FROM public.user_ratings`);
w(` WHERE user_id = ${q(l.user.id)}`);
w(`   AND variant_id IN (${picks.map((p) => q(p.matched.variant_id)).join(", ")});`);
w();

// ---- 5. B-51 ---------------------------------------------------------------
w(`-- 5. B-51: exactly ONE 'tasted' activity per session, anchored on the winner,`);
w(`--    so it reaches the Social feed and the per-variant history. pour_type stays`);
w(`--    NULL -- logActivity only sets it for 'drank'.`);
w(`INSERT INTO public.activities (user_id, bottle_id, variant_id, action, pour_type, created_at)`);
w(`VALUES (${q(l.user.id)}, ${q(picks[0].matched.bottle_id)}, ${q(picks[0].matched.variant_id)}, 'tasted', NULL, ${ts});`);
w();

// ---- 6. provenance ---------------------------------------------------------
const meta = {
  source: "import-tasting-skill",
  bottles: picks.length,
  pairs: pairs.length,
  backdated: Boolean(at),
  finishing_order: picks.map((p) => p.matched.bottle_name),
};
w(`-- 6. Provenance. This is the ONE thing the app's own save path does not do:`);
w(`--    it records that the session arrived by import rather than through the UI,`);
w(`--    so nobody later mistakes it for organic usage. event_type is registered`);
w(`--    in TELEMETRY.md.`);
w(`INSERT INTO public.events (user_id, event_type, surface, target_type, target_id, metadata, created_at)`);
w(`VALUES (`);
w(`  ${q(l.user.id)},`);
w(`  'tasting_imported',`);
w(`  'agent_import',`);
w(`  'tasting_session',`);
w(`  (SELECT id::text FROM _imported_session),`);
w(`  ${q(JSON.stringify(meta))}::jsonb,`);
w(`  ${ts}`);
w(`);`);
w();

// ---- 7. read back ----------------------------------------------------------
w(`-- 7. Read back what the trigger produced, so the run is self-verifying.`);
w(`SELECT 'session' AS what, (SELECT id::text FROM _imported_session) AS value;`);
w();
w(`SELECT d.rank + 1 AS place, b.name AS bottle,`);
w(`       ub.elo AS personal_elo, bv.elo_global AS global_elo`);
w(`  FROM public.tasting_details d`);
w(`  JOIN public.bottle_variants bv ON bv.id = d.variant_id`);
w(`  JOIN public.bottles b ON b.id = d.bottle_id`);
w(`  LEFT JOIN public.user_bottles ub`);
w(`         ON ub.variant_id = d.variant_id AND ub.user_id = ${q(l.user.id)}`);
w(` WHERE d.tasting_session_id = (SELECT id FROM _imported_session)`);
w(` ORDER BY d.rank;`);
w();
w(`COMMIT;`);
w();

writeFileSync(outPath, lines.join("\n"));
console.log(`wrote ${outPath}`);
console.log(`  user     ${l.user.username} (${l.user.id})`);
console.log(`  bottles  ${picks.length}`);
console.log(`  pairs    ${pairs.length}`);
console.log(`  dated    ${at || "now()"}`);
console.log(`\nReview it, then run:`);
console.log(`  node .claude/skills/verify-bottle/scripts/run_sql_file.mjs ${outPath}`);
