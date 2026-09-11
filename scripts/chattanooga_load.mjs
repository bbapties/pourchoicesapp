/**
 * One-off loader for the Chattanooga Whiskey Experimental catalogue (2026-09-11, #100 context).
 *
 *   node scripts/chattanooga_load.mjs <scrape-dir> [--upload]
 *
 * Reads batches.json + singles.json (scraped from chattanoogawhiskey.com by the session that
 * wrote this), keeps only releases with producer tasting notes, prepares each Batch image
 * through the SAME cut-out pipeline as scripts/shelf_image.mjs (with --upload), and writes
 * <scrape-dir>/load.sql for review + `node scripts/_psql.mjs --file`. It never touches the DB.
 *
 * Two parents mirror the producer's two series:
 *   SB  = "Chattanooga Whiskey Experimental Single Barrel"  (existing row fdce97fc)
 *   BT  = "Chattanooga Whiskey Experimental Batch"          (new)
 * Single barrels share the producer's one stock bottle shot (already self-hosted on the
 * Unknown variant); each Batch has its own labelled bottle image.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prepareAndUpload } from "./shelf_image.mjs";

const dir = process.argv[2];
const UPLOAD = process.argv.includes("--upload");
if (!dir) { console.error("usage: node scripts/chattanooga_load.mjs <scrape-dir> [--upload]"); process.exit(1); }

const SB_PARENT = "fdce97fc-50dc-48cc-85b3-bc6e98f04ad0";
const SB_UNKNOWN = "e851f395-f309-4e49-85de-a5f8fd2c2779";
const SB_283 = "4990d7fb-5cc7-40b1-80db-b3e20a717e8b";
const BT_030 = "06cea5da-703b-46b6-8d98-136a5d79f500";
const STOCK_IMG = `https://bicpipgbspasxbtqjzvg.supabase.co/storage/v1/object/public/bottle-images/variants/${SB_UNKNOWN}/front.webp`;
// Generated ids persist in <dir>/ids.json so re-runs (429 retries) address the same rows and images.
const idsPath = path.join(dir, "ids.json");
const ids = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, "utf8")) : {};
const stableId = (key) => (ids[key] ??= randomUUID());
const BT_PARENT = stableId("BT_PARENT");
const BT_UNKNOWN = stableId("BT_UNKNOWN");

const batches = JSON.parse(fs.readFileSync(path.join(dir, "batches.json"), "utf8"));
const singles = JSON.parse(fs.readFileSync(path.join(dir, "singles.json"), "utf8"));

// Producer press-release notes for the early batches whose product pages carry none.
const PRESS_NOTES = {
  "Batch 002": "Dried fruit, smoke, chocolate cake and gingerbread",
  "Batch 003": "Maple, molasses, cocoa, chocolate malt and a light smoky finish",
  "Batch 004": "Earthy, herbal peat smoke, light berry fruit, shortbread cookie, honey and heather",
  "Batch 005": "Butterscotch, sweet cereal and dark toast",
  "Batch 007": "Vanilla, honey, nutmeg, orange cream and herbs on the nose; citrus, vanilla cola and baking spice on the palate, with a rich, warming rye-bread finish",
  "Batch 008": "Silky, smooth mouthfeel with a maple-like finish",
};

const q = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (s) => { const m = String(s || "").match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
const year = (s) => { const m = String(s || "").match(/(20\d\d)/); return m ? Number(m[1]) : null; };

/** Editorial split of the producer's single tasting line into the three columns the app shows. */
function splitNotes(line) {
  let s = line.trim().replace(/\.$/, "");
  const explicit = s.match(/^(.*?)\bon the nose\b[.,;]?\s*(?:with|and)?\s*(.*?)\bon the palate\b[.,;]?\s*(?:with|and)?\s*(.*)$/i);
  if (explicit) {
    const finish = explicit[3].replace(/^(a|an|with)\s+/i, "").trim();
    return { nose: cap(explicit[1].trim()), palate: cap(explicit[2].trim()), finish: finish ? cap(finish) : "Lingering " + explicit[2].split(",").pop().trim() };
  }
  if (!/,/.test(s) && /brains smashed/i.test(s)) {
    // Batch Alpha's note is a one-line joke; keep it verbatim rather than carve it up.
    return { nose: cap(s), palate: cap(s), finish: 'Golden (producer: "dipped in 42 karat gold")' };
  }
  let finish = null;
  const fm = s.match(/^(.*?)[,;]?\s+with\s+(?:a |an )?(.*\bfinish\b.*)$/i);
  if (fm) { finish = cap(fm[2].trim()); s = fm[1]; }
  const parts = s.split(/,\s*|\s+and\s+(?=[^,]*$)/).map((p) => p.replace(/^and\s+/, "").trim()).filter(Boolean);
  const half = Math.ceil(parts.length / 2);
  const nose = parts.slice(0, half).join(", ");
  const palate = parts.length > 1 ? parts.slice(half).join(", ") : nose;
  const last = parts[parts.length - 1].replace(/^(a |an )?(hint|touch|note) of\s+/i, "");
  return { nose: cap(nose), palate: cap(palate), finish: finish || "Lingering " + last };
}

const rows = [];   // variant rows to insert
const updates = []; // updates to existing variants
const skipped = [];

// ---------- Single barrels ----------
for (const s of singles) {
  const notes = s.kv["Tasting notes"] || s.kv["Tasting Notes"];
  if (!notes) { skipped.push(`SB ${s.barrel} (${s.pageTitle}): no producer tasting notes`); continue; }
  const proof = num(s.kv.Proof || (s.kv["Age/Proof"] || "").split("/")[1]);
  const age = s.kv.Age || (s.kv["Age/Proof"] || "").split("/")[0].trim() || null;
  const rel = s.kv["Release date"] || s.kv["Release Date"] || (s.text.find((t) => /Released/i.test(t)) || "");
  const split = splitNotes(notes);
  const desc = [
    `Experimental Single Barrel ${s.barrel}${rel ? ` (${rel})` : ""}${s.kv["Selected by"] ? `, selected by ${s.kv["Selected by"]}` : ""}.`,
    s.kv.Style ? `Producer style: ${s.kv.Style}.` : "",
    proof ? `${proof} proof${age ? `, ${age}` : ""}.` : "",
    s.kv["Mash Bill"] ? `Mash: ${s.kv["Mash Bill"]}.` : "",
    s.kv.Cooperage ? `Cooperage: ${s.kv.Cooperage}.` : "",
    s.kv["Selection notes"] || s.kv["Selection Notes"] || "",
    s.kv.Note || "",
    `Producer tasting note: "${notes}" (nose/palate/finish above are an editorial split of that line).`,
  ].filter(Boolean).join(" ");
  const row = {
    id: s.barrel === "283" ? SB_283 : stableId("SB " + s.barrel), parent: SB_PARENT, batch: s.barrel, proof, age,
    release_year: year(rel), ...split, notes: desc, img: STOCK_IMG, shelf_ready: true,
    review_note: "Producer stock image for the Experimental Single Barrel line (label shows Barrel #172; Chattanooga publishes no number-free shot).",
    existing: s.barrel === "283",
  };
  (row.existing ? updates : rows).push(row);
}

// ---------- Batches ----------
const batchRows = [];
for (const b of batches) {
  const notes = b.kv["Tasting notes"] || b.kv["Tasting Notes"] || PRESS_NOTES[b.batch];
  if (!notes) { skipped.push(`${b.batch}: no producer tasting notes`); continue; }
  const label = b.batch.replace(/^Batch\s+/i, "");
  const numeric = label === "XXIX" ? "029" : label === "XXXV" ? "035" : label;
  const subtitle = b.text[0] && b.text[0].length < 50 && !/^(Buy|Find)/.test(b.text[0]) ? b.text[0] : null;
  const rel = b.kv["Release Date"] || b.kv["Release date"] || "";
  const age = b.kv.Age || b.kv["Age of Whiskey"] || b.kv["Age of Blend"] || b.kv["Age of Bourbon"] || b.kv["Age of Malt Whiskey"] || null;
  const proof = num(b.kv.Proof);
  const split = splitNotes(notes);
  const card = Object.entries(b.kv).filter(([k]) => !/tasting/i.test(k)).map(([k, v]) => `${k}: ${v}`).join(". ");
  const extraText = b.text.slice(subtitle ? 1 : 0).filter((t) => !/^(Buy Online|Find near You)$/i.test(t)).join(" ");
  const desc = [
    `Experimental Batch ${label}${subtitle ? `: ${subtitle}` : ""}${rel ? ` (${rel})` : ""}.`,
    card ? card + "." : "",
    extraText,
    `Producer tasting note: "${notes}" (nose/palate/finish above are an editorial split of that line).`,
    b.kv["Tasting notes"] || b.kv["Tasting Notes"] ? "" : "Tasting note is from the producer's release announcement; the product page carries none.",
  ].filter(Boolean).join(" ");
  batchRows.push({
    id: label === "030" ? BT_030 : stableId("BT " + label), parent: BT_PARENT,
    batch: `${numeric}${subtitle ? `: ${subtitle}` : ""}`, proof, age, release_year: year(rel), ...split,
    notes: desc, src: b.img, existing: label === "030", subtitle, label,
  });
}

// ---------- Images for batches ----------
const manifestPath = path.join(dir, "images.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
for (const r of batchRows) {
  if (r.existing) continue; // 030 already has an approved cut-out
  if (manifest[r.label]?.url) { r.img = manifest[r.label].url; continue; }
  if (!UPLOAD) continue;
  try {
    const res = await prepareAndUpload(r.id, r.src);
    manifest[r.label] = { batch: r.batch, src: r.src, ...res };
    if (res.ok) r.img = res.url; else r.imgFail = `not a cut-out (clear ${(res.clearPct * 100).toFixed(1)}%)`;
    console.log(r.batch, res.ok ? `ok ${res.trimmed} aspect ${res.aspect.toFixed(2)}` : r.imgFail);
  } catch (e) { r.imgFail = String(e.message); console.log(r.batch, "ERR", r.imgFail); await new Promise((ok) => setTimeout(ok, 3000)); }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  await new Promise((ok) => setTimeout(ok, 400)); // be polite to their CDN; it 429s under a burst
}
fs.writeFileSync(idsPath, JSON.stringify(ids, null, 1));
// The Unknown batch variant stands on the Batch 001 shot (the archetype label) until Brian picks one.
// 001 itself is not loaded (no producer tasting note), so its image is prepared for the Unknown row.
let unknownImg = manifest.UNKNOWN?.url || null;
if (!unknownImg && UPLOAD) {
  const src = batches.find((b) => b.batch === "Batch 001")?.img;
  const res = await prepareAndUpload(BT_UNKNOWN, src);
  manifest.UNKNOWN = { batch: "Unknown (Batch 001 shot)", src, ...res };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  if (res.ok) unknownImg = res.url; else console.log("Unknown image not a cut-out");
}
const b001 = unknownImg ? { img: unknownImg } : null;

// ---------- SQL ----------
const L = [];
L.push("-- Generated by scripts/chattanooga_load.mjs -- review, then: node scripts/_psql.mjs --file <this>");
L.push("BEGIN;");
L.push(`INSERT INTO bottles (id, name, category, style, distillery, barcode, volume, verified, frontimage_url, nose, palate, finish, extras, created_at, updated_at) VALUES (
  ${q(BT_PARENT)}, 'Chattanooga Whiskey Experimental Batch', 'Whiskey',
  'Experimental (varies by batch: bourbon, malt and rye malt whiskey, finished whiskeys, bourbon and gin liqueurs)',
  'Chattanooga Whiskey', '853192006141', '750ml', false, ${q(b001?.img || null)},
  'Varies by batch; Chattanooga''s Tennessee High Malt base leans to honeyed malt, baked pastry and dried fruit, with each batch''s infusion or finish on top',
  'Malt-forward and rich; toasted grain and baking spice, then whatever the batch adds - fruit, botanicals, smoke, or a finishing cask',
  'Warm and sweet with toasted biscuit; each batch is different - see the batch variant',
  '{"series":"Chattanooga Whiskey Experimental Batch series (001 onward, plus Alpha) from the Experimental Distillery. Style, mash bill, proof, age and infusion differ per batch - see the batch variant.","barcodes":{"030":"853192006141"},"source":"https://chattanoogawhiskey.com/experimental-batches/"}',
  now(), now());`);
L.push(`INSERT INTO bottle_variants (id, bottles_id, batch, is_default, is_catchall, verified, frontimage_url, bottle_height, bottle_height_source, shelf_ready, image_reviewed_at, image_review_note, notes, created_at, updated_at) VALUES (
  ${q(BT_UNKNOWN)}, ${q(BT_PARENT)}, 'Unknown', true, true, false, ${q(b001?.img || null)}, 290, 'estimated', false, NULL,
  'Stands on the Batch 001 shot as the series archetype; every batch has its own label so no generic image exists. Approve or swap in Admin > Images.',
  'Use when the batch number is not known. Pick the numbered batch if you can read it off the label.', now(), now());`);
L.push(`-- Move Batch 030 from the Single Barrel parent to the Batch parent and give it the series label format.`);
L.push(`UPDATE bottle_variants SET bottles_id = ${q(BT_PARENT)}, batch = ${q(batchRows.find((r) => r.existing)?.batch || "030: Honey Infused")}, updated_at = now() WHERE id = ${q(BT_030)};`);
L.push(`UPDATE bottles SET extras = '{"series":"Chattanooga Whiskey Experimental Single Barrel releases from the Tennessee High Malt program. Mash bill, proof, age, style and cooperage differ per barrel - see the barrel variant.","barcodes":{"283":"853192006158"},"barcode_check":"UPC-A check digit PASS (2026-09-11)","source":"https://chattanoogawhiskey.com/experimental-single-barrels/"}', updated_at = now() WHERE id = ${q(SB_PARENT)};`);

for (const r of updates) {
  L.push(`UPDATE bottle_variants SET nose=${q(r.nose)}, palate=${q(r.palate)}, finish=${q(r.finish)}, notes=${q(r.notes)}, release_year=${r.release_year ?? "NULL"}, updated_at=now() WHERE id=${q(r.id)};`);
}
const all = [...rows, ...batchRows.filter((r) => !r.existing)];
for (const r of all) {
  if (!r.img) { skipped.push(`${r.parent === SB_PARENT ? "SB " : ""}${r.batch}: image not prepared (${r.imgFail || "run with --upload"})`); continue; }
  const sb = r.parent === SB_PARENT;
  L.push(`INSERT INTO bottle_variants (id, bottles_id, batch, is_default, is_catchall, verified, proof, age, release_year, frontimage_url, bottle_height, bottle_height_source, shelf_ready, image_reviewed_at, image_review_note, nose, palate, finish, notes, created_at, updated_at) VALUES (
  ${q(r.id)}, ${q(r.parent)}, ${q(r.batch)}, false, false, false, ${r.proof ?? "NULL"}, ${q(r.age)}, ${r.release_year ?? "NULL"}, ${q(r.img)}, 290, 'estimated',
  ${sb ? "true, now()" : "false, NULL"}, ${q(sb ? r.review_note : "Producer bottle shot, cut out by scripts/chattanooga_load.mjs; needs a look on a real shelf.")},
  ${q(r.nose)}, ${q(r.palate)}, ${q(r.finish)}, ${q(r.notes)}, now(), now());`);
}
L.push(`DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM bottle_variants v WHERE v.bottles_id IN (${q(SB_PARENT)}, ${q(BT_PARENT)}) AND (v.nose IS NULL OR v.palate IS NULL OR v.finish IS NULL) AND NOT v.is_catchall;
  IF n <> 0 THEN RAISE EXCEPTION '% loaded variants missing notes', n; END IF;
  SELECT count(*) INTO n FROM bottle_variants WHERE bottles_id = ${q(BT_PARENT)} AND is_default; IF n <> 1 THEN RAISE EXCEPTION 'batch parent default count %', n; END IF;
  SELECT count(*) INTO n FROM bottle_variants WHERE bottles_id = ${q(SB_PARENT)} AND is_default; IF n <> 1 THEN RAISE EXCEPTION 'sb parent default count %', n; END IF;
END $$;`);
L.push("COMMIT;");
fs.writeFileSync(path.join(dir, "load.sql"), L.join("\n\n"));
fs.writeFileSync(path.join(dir, "skipped.txt"), skipped.join("\n"));
console.log(`\nsingle barrels: ${rows.length} new + ${updates.length} updated; batches: ${batchRows.length} (${batchRows.filter((r) => r.img).length} with image)`);
console.log(`skipped ${skipped.length} -> skipped.txt; SQL -> load.sql`);
