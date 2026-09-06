// Emit reviewable SQL that inserts ONE new bottle + its default variant, for a
// bottle named in an import that is not in the catalog yet.
//
//   node .claude/skills/import-tasting/scripts/build_new_bottle_sql.mjs \
//        <bottle.json> <out.sql>
//
// This is the import lane's counterpart to the verify-bottle skill. The
// difference is deliberate and worth understanding before you reach for it:
//
//   verify-bottle  files pending suggested_edits for Brian to approve in-app.
//                  Right for cleaning up bottles that already exist -- there is
//                  no hurry and the queue is the audit trail.
//   this script    inserts the row directly, VERIFIED, in one transaction.
//                  Right only when a tasting is blocked on the bottle existing
//                  and Brian has just approved the researched data on screen.
//                  His confirmation IS the review; the suggested_edits queue
//                  would only be reviewing data he already signed off on.
//
// So: never run this without an explicit confirmation for THIS bottle, and
// never run it for a bottle that already exists (resolve_lineup.mjs would have
// found it -- if it did not, fix the name, do not create a duplicate).
//
// bottle.json shape (every field except name/category is optional, but the
// skill's definition of done expects them filled from real research):
// {
//   "name": "Weller 12 Year Kentucky Straight Bourbon Whiskey",
//   "distillery": "Buffalo Trace Distillery",
//   "category": "Bourbon", "style": "Wheated", "volume": "750ml",
//   "barcode": "088004021429",
//   "proof": 90, "age": "12",
//   "nose": "...", "palate": "...", "finish": "...",
//   "extras": "{\"mashbill\":\"...\"}",
//   "frontimage_url": "https://.../variants/<id>/front.webp",
//   "created_by": "<public.users.id of the agent account>"
// }
import { readFileSync, writeFileSync } from "fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: build_new_bottle_sql.mjs <bottle.json> <out.sql>");
  process.exit(1);
}
const b = JSON.parse(readFileSync(inPath, "utf8"));

if (!b.name) { console.error("bottle.json needs at least a name"); process.exit(1); }
if (!b.created_by) {
  console.error("bottle.json needs created_by -- the PUBLIC users.id of the account filing this.");
  console.error("B-74: every person-column references public.users.id. An auth id is rejected by the FK.");
  process.exit(1);
}

// A barcode that is present must be a real UPC-A/EAN-13 with a valid check
// digit. A wrong one is worse than none: it makes the scanner resolve to this
// bottle forever.
if (b.barcode != null && b.barcode !== "") {
  const d = String(b.barcode).trim();
  if (!/^\d{12,13}$/.test(d)) {
    console.error(`barcode ${JSON.stringify(d)} is not 12 or 13 digits.`);
    process.exit(1);
  }
  const digits = d.split("").map(Number);
  const check = digits.pop();
  const weights = d.length === 13 ? [1, 3] : [3, 1];
  const sum = digits.reduce((acc, n, i) => acc + n * weights[i % 2], 0);
  if ((10 - (sum % 10)) % 10 !== check) {
    console.error(`barcode ${d} fails its check digit.`);
    process.exit(1);
  }
}

const q = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined || v === "" ? "NULL" : Number(v));

const L = [];
const w = (s = "") => L.push(s);

w(`-- ============================================================================`);
w(`-- New bottle for an import -- generated ${new Date().toISOString()}`);
w(`-- by .claude/skills/import-tasting`);
w(`--`);
w(`--   ${b.name}`);
w(`--   ${[b.distillery, b.category, b.style, b.proof ? `${b.proof} proof` : null].filter(Boolean).join(" | ")}`);
w(`--`);
w(`-- Inserted VERIFIED because it was researched and confirmed on screen before`);
w(`-- this ran. Guards below make it a no-op if a bottle of this name already`);
w(`-- exists, or if the barcode is already taken -- a duplicate bottle is a much`);
w(`-- worse outcome than a failed import.`);
w(`-- ============================================================================`);
w();
w(`BEGIN;`);
w();
w(`-- Guard 1: same name, same distillery. Case-insensitive, whitespace-normalised.`);
w(`DO $guard$`);
w(`BEGIN`);
w(`  IF EXISTS (`);
w(`    SELECT 1 FROM public.bottles`);
w(`     WHERE lower(regexp_replace(name, '\\s+', ' ', 'g')) = lower(regexp_replace(${q(b.name)}, '\\s+', ' ', 'g'))`);
w(`  ) THEN`);
w(`    RAISE EXCEPTION 'A bottle named % already exists -- resolve to it instead of creating a duplicate.', ${q(b.name)};`);
w(`  END IF;`);
w(`END`);
w(`$guard$;`);
w();
if (b.barcode) {
  w(`-- Guard 2: the barcode must not already be in use. (Batch releases legitimately`);
  w(`-- share a UPC -- if that is the case here, drop this guard deliberately and say so.)`);
  w(`DO $guard$`);
  w(`BEGIN`);
  w(`  IF EXISTS (SELECT 1 FROM public.bottles WHERE barcode = ${q(b.barcode)}) THEN`);
  w(`    RAISE EXCEPTION 'Barcode % is already on another bottle.', ${q(b.barcode)};`);
  w(`  END IF;`);
  w(`END`);
  w(`$guard$;`);
  w();
}
w(`CREATE TEMP TABLE _new_bottle ON COMMIT DROP AS`);
w(`WITH ins AS (`);
w(`  INSERT INTO public.bottles`);
w(`    (name, distillery, category, style, volume, barcode, extras, verified, created_by, updated_by)`);
w(`  VALUES (${q(b.name)}, ${q(b.distillery)}, ${q(b.category)}, ${q(b.style)}, ${q(b.volume)},`);
w(`          ${q(b.barcode)}, ${q(b.extras)}, true, ${q(b.created_by)}, ${q(b.created_by)})`);
w(`  RETURNING id`);
w(`)`);
w(`SELECT id FROM ins;`);
w();
w(`-- The default variant. is_default = true is what makes the global Elo rollup`);
w(`-- target resolve (see public.elo_global_target) -- a bottle with no default`);
w(`-- variant cannot be scored.`);
w(`INSERT INTO public.bottle_variants`);
w(`  (bottles_id, is_default, verified, proof, age, nose, palate, finish, frontimage_url, created_by, updated_by)`);
w(`VALUES ((SELECT id FROM _new_bottle), true, true, ${n(b.proof)}, ${q(b.age)},`);
w(`        ${q(b.nose)}, ${q(b.palate)}, ${q(b.finish)}, ${q(b.frontimage_url)},`);
w(`        ${q(b.created_by)}, ${q(b.created_by)});`);
w();
w(`-- Feed + telemetry, same as a bottle added through the app.`);
w(`INSERT INTO public.activities (user_id, bottle_id, variant_id, action, pour_type)`);
w(`SELECT ${q(b.created_by)}, (SELECT id FROM _new_bottle), bv.id, 'added_to_db', NULL`);
w(`  FROM public.bottle_variants bv WHERE bv.bottles_id = (SELECT id FROM _new_bottle);`);
w();
w(`INSERT INTO public.events (user_id, event_type, surface, target_type, target_id, metadata)`);
w(`SELECT ${q(b.created_by)}, 'bottle_submitted', 'agent_import', 'bottle',`);
w(`       (SELECT id::text FROM _new_bottle),`);
w(`       ${q(JSON.stringify({ source: "import-tasting-skill", reason: "named in a tasting but not in the catalog", name: b.name }))}::jsonb;`);
w();
w(`SELECT 'new bottle' AS what, b.id::text AS bottle_id, v.id::text AS variant_id, b.name, b.verified`);
w(`  FROM public.bottles b JOIN public.bottle_variants v ON v.bottles_id = b.id`);
w(` WHERE b.id = (SELECT id FROM _new_bottle);`);
w();
w(`COMMIT;`);
w();

writeFileSync(outPath, L.join("\n"));
console.log(`wrote ${outPath}`);
console.log(`  ${b.name}`);
console.log(`  barcode ${b.barcode || "(none)"}   image ${b.frontimage_url ? "yes" : "MISSING"}`);
if (!b.frontimage_url) console.log(`  ! no image -- clean and upload one first, the confirmation sheet needs it`);
console.log(`\nReview it, then run:`);
console.log(`  node .claude/skills/verify-bottle/scripts/run_sql_file.mjs ${outPath}`);
