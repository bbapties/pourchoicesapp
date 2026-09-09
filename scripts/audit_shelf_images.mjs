/**
 * Audit every shelf image for the two defects that survive an automated cut-out.
 *
 *   node scripts/audit_shelf_images.mjs
 *
 * WHY THIS EXISTS. Brian spotted background left on the left of the Bulleit image. The obvious
 * check — is the border of the frame empty? — passed it, because the leftover was INSIDE the frame:
 * rembg kept a slab of background, and the tight-trim then widened the box to contain it.
 *
 * The signature is the ASPECT RATIO. A bottle is tall and narrow, roughly 0.25–0.55 wide-to-tall.
 * The bad Bulleit was 454x478 — 0.95, nearly square. Nothing that shape is one bottle standing on
 * its own, so aspect is the check that actually catches this class of failure.
 *
 *   ratio > 0.70    -> almost certainly leftover background, or more than one bottle in frame
 *   ratio 0.55-0.70 -> suspicious; a very squat decanter can live here, so look at it
 *
 * A BORDER CHECK DOES NOT WORK HERE, and the first version of this script got it wrong: these
 * images are trimmed to the alpha bounding box, so the bottle touches all four edges BY
 * DEFINITION. That check flagged 26 of 30 good images before the mistake was obvious.
 *
 * Read-only. Prints what to re-do; changes nothing.
 */

import sharp from "sharp";
import { execFileSync } from "node:child_process";

const WIDE_BAD = 0.70;
const WIDE_WARN = 0.55;

const out = execFileSync("node", ["scripts/_psql.mjs", `
  SELECT v.id, v.frontimage_url, b.name,
         CASE WHEN v.shelf_ready THEN 'approved'
              WHEN v.image_flagged_at IS NOT NULL AND (v.image_reviewed_at IS NULL OR v.image_flagged_at > v.image_reviewed_at) THEN 'queued'
              ELSE 'other' END
  FROM public.bottle_variants v JOIN public.bottles b ON b.id = v.bottles_id
  WHERE v.frontimage_url LIKE '%/bottle-images/variants/%'
    AND (v.shelf_ready OR v.image_flagged_at IS NOT NULL)
  ORDER BY b.name;`], { encoding: "utf8" });

const rows = out.split("\n")
  .filter((l) => l.includes("|") && !l.includes("---"))
  .map((l) => l.split("|").map((c) => c.trim()))
  .filter((c) => c[0] && c[0].length === 36);

console.log(`auditing ${rows.length} self-hosted shelf images\n`);
const bad = [];

for (const [id, url, name, state] of rows) {
  try {
    const res = await fetch(url);
    if (!res.ok) { console.log(`${name.slice(0,40).padEnd(42)} FETCH ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;

    // How much of the bounding box the subject actually fills. A lone bottle is a narrow column
    // inside its box; a slab of leftover background fills far more of it.
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 32) opaque++;
    const fill = opaque / (W * H);

    const ratio = W / H;
    const verdict =
      ratio > WIDE_BAD ? "TOO WIDE — leftover background or >1 bottle"
      : ratio > WIDE_WARN && fill > 0.62 ? "wide and solid — probably leftover background"
      : ratio > WIDE_WARN ? "wide — check it (could be a squat decanter)"
      : "ok";

    if (verdict !== "ok") bad.push({ id, name, state, verdict });
    console.log(
      `${name.slice(0, 40).padEnd(42)} ${String(W).padStart(4)}x${String(H).padEnd(4)} ` +
      `r=${ratio.toFixed(2)} fill=${(fill * 100).toFixed(0)}% ${state.padEnd(9)} ${verdict}`
    );
  } catch (e) {
    console.log(`${name.slice(0, 40).padEnd(42)} ERROR ${String(e.message).slice(0, 50)}`);
  }
}

console.log(`\n${bad.length} need attention`);
for (const b of bad) console.log(`  ${b.state.padEnd(9)} ${b.name.slice(0, 44).padEnd(46)} ${b.verdict}`);
if (bad.length) console.log(`\nRe-do with a better source: node scripts/rembg_batch.mjs <id> --apply`);
