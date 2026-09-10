/**
 * Run rembg over bottle images that were rejected purely for having a background.
 *
 *   node scripts/rembg_batch.mjs <variantId>[,<variantId>...] [--apply]
 *   node scripts/rembg_batch.mjs --rejected-bg [--apply]
 *
 * "Background not removed" does not mean the photograph is bad -- it usually means a perfectly good
 * packshot is sitting on a white or studio background. That is what rembg is for, and it is the one
 * case `shelf_image.mjs` deliberately refuses (it only trims images that are ALREADY cut out).
 *
 * Pipeline per bottle: fetch the current image -> `clean_image.py` (rembg isolates the bottle, then
 * tight-trims and centres on transparency) -> upload to our own bucket -> flag for re-review.
 *
 * It never approves. Each bottle goes back to the top of Admin > Images with its rejection reasons
 * intact, because whether rembg did a clean job is a judgement only Brian makes, looking at a shelf.
 * rembg fails in specific, visible ways -- a dark bottle on a dark background loses its edges, a
 * bottle held in a hand keeps the hand -- so this must not be trusted blind.
 */

import { execFileSync } from "node:child_process";
import sharp from "sharp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ALL_BG = process.argv.includes("--rejected-bg");
const ALL_REJ = process.argv.includes("--all-rejected");
const idArg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rembg-"));
const sql = (q) => execFileSync("node", ["scripts/_psql.mjs", q], { encoding: "utf8" });

function rows(out) {
  return out.split("\n")
    .filter((l) => l.includes("|") && !l.includes("---"))
    .map((l) => l.split("|").map((c) => c.trim()))
    .filter((c) => c[0] && c[0].length === 36);
}

const WHERE = ALL_REJ
  ? `cardinality(v.image_reject_reason_ids) > 0 AND NOT v.shelf_ready`
  : ALL_BG
  ? `EXISTS (SELECT 1 FROM public.image_reject_reasons r
              WHERE r.id = ANY(v.image_reject_reason_ids) AND r.slug='background_not_removed')`
  : `v.id IN (${idArg.split(",").map((s) => `'${s.trim()}'`).join(",")})`;

const list = rows(sql(`
  SELECT v.id, v.frontimage_url, b.name
  FROM public.bottle_variants v JOIN public.bottles b ON b.id=v.bottles_id
  WHERE ${WHERE} AND v.frontimage_url IS NOT NULL
  ORDER BY b.name;`));

console.log(`${list.length} to process`);
console.log(APPLY ? "APPLYING\n" : "DRY RUN — nothing written. Add --apply.\n");

let ok = 0, bad = 0, rejected = 0;
for (const [id, url, name] of list) {
  const label = (name || id).slice(0, 42).padEnd(44);
  const raw = path.join(TMP, `${id}.bin`);
  const out = path.join(TMP, `${id}.webp`);
  try {
    // The proxy trick first: if the source is only being flattened, we get a real cut-out for free
    // and rembg never has to guess an edge.
    const src = url.includes("wsrv.nl")
      ? url.replace(/&bg=white/g, "").replace(/&output=jpg/g, "&output=png")
      : url;
    const res = await fetch(src, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));

    execFileSync("python", [".claude/skills/verify-bottle/scripts/clean_image.py", raw, out],
      { encoding: "utf8", stdio: "pipe" });

    // GATE: reject rembg's own failures before they reach Brian's queue. A bottle is a narrow
    // column; a cut-out that comes out wide, or wide and solidly filled, means rembg kept a slab
    // of background and the tight trim widened the box around it. Applying those would just move
    // the work rather than do it.
    const { data: px, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 32) opaque++;
    const ratio = info.width / info.height;
    const fill = opaque / (info.width * info.height);
    if (ratio > 0.70 || (ratio > 0.55 && fill > 0.62)) {
      rejected++;
      console.log(`${label} BAD  ${info.width}x${info.height} r=${ratio.toFixed(2)} fill=${(fill*100)|0}% — rembg kept background, needs a better source`);
      continue;
    }

    const kb = (fs.statSync(out).size / 1024) | 0;
    const publicUrl = execFileSync("node",
      [".claude/skills/verify-bottle/scripts/upload_image.mjs", out, "bottle-images",
       `variants/${id}/front.webp`], { encoding: "utf8" }).trim().split("\n").pop();

    ok++;
    console.log(`${label} OK   ${kb}KB r=${ratio.toFixed(2)}`);

    if (APPLY) {
      sql(`UPDATE public.bottle_variants SET
             frontimage_url='${publicUrl}',
             image_flagged_at=now(),
             image_flagged_by=(SELECT id FROM public.users WHERE username='The_Lake_House'),
             image_flag_note='Background removed with rembg from the previously rejected source, trimmed and self-hosted. CHECK THE EDGES on the checker backdrop - rembg loses a dark bottle on a dark ground.'
           WHERE id='${id}';`);
    }
  } catch (e) {
    bad++;
    console.log(`${label} FAIL ${String(e.message || e).split("\n")[0].slice(0, 60)}`);
  }
}
console.log(`\nok ${ok} · failed ${bad}`);
