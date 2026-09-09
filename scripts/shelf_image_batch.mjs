/**
 * Re-prepare every rejected bottle image whose stored URL is only being flattened onto white.
 *
 *   node scripts/shelf_image_batch.mjs [--apply]
 *
 * Without --apply this is a DRY RUN: it fetches, checks and reports, and writes nothing.
 *
 * WHY THIS EXISTS. A large share of "background not removed" rejections are not bad images at all.
 * The stored URL runs through the wsrv.nl proxy with `&bg=white&output=jpg`, which flattens a
 * transparent PNG source onto white. Dropping those two parameters brings the original cut-out
 * back — no AI, no re-shoot. This finds every rejection in that state and fixes it.
 *
 * It reuses `prepareAndUpload` from shelf_image.mjs rather than repeating the pipeline, so a
 * bottle processed in bulk goes through exactly the same checks as one processed by hand — the
 * transparency floor included. Anything that is genuinely opaque is REPORTED AND SKIPPED, and
 * stays rejected, which is the correct outcome.
 *
 * It never approves anything. Each fixed bottle is flagged for re-review so it surfaces at the top
 * of Admin > Images with its old rejection reasons intact as history. Approving is Brian's call,
 * made looking at a real shelf.
 */

import { prepareAndUpload } from "./shelf_image.mjs";
import { execFileSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");

function sql(query) {
  const out = execFileSync("node", ["scripts/_psql.mjs", query], { encoding: "utf8" });
  return out;
}

/** Rows come back as psql's aligned table; take the pipe-separated body. */
function rows(out) {
  return out
    .split("\n")
    .filter((l) => l.includes("|") && !l.includes("---") && !/^\s*(id|count|\?column\?)\s*\|/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()))
    .filter((c) => c[0] && c[0].length === 36);
}

const LIST = `
SELECT v.id, v.frontimage_url, b.name
FROM public.bottle_variants v
JOIN public.bottles b ON b.id = v.bottles_id
JOIN public.image_reject_reasons r ON r.id = ANY(v.image_reject_reason_ids)
WHERE r.slug = 'background_not_removed'
  AND v.frontimage_url LIKE '%bg=white%'
  AND v.frontimage_url LIKE '%.png%'
GROUP BY v.id, v.frontimage_url, b.name
ORDER BY b.name;`;

const targets = rows(sql(LIST));
console.log(`${targets.length} rejected images have a PNG source being flattened onto white`);
console.log(APPLY ? "APPLYING\n" : "DRY RUN — nothing will be written. Add --apply.\n");

let fixed = 0, skipped = 0, failed = 0;

for (const [id, url, name] of targets) {
  const label = (name || id).slice(0, 44).padEnd(46);
  try {
    const r = await prepareAndUpload(id, url);
    if (!r.ok) {
      skipped++;
      console.log(`${label} SKIP  genuinely opaque (${(r.clearPct * 100).toFixed(1)}% clear) — stays rejected`);
      continue;
    }
    fixed++;
    console.log(`${label} OK    ${r.trimmed} aspect ${r.aspect.toFixed(2)}  ${(r.bytes / 1024) | 0}KB`);

    if (APPLY) {
      // DELIBERATELY DOES NOT SET bottle_height. A trimmed aspect ratio cannot tell a short wide
      // bottle from a tall wide one -- Knob Creek is both wide AND ~11.5in, and a shape-based guess
      // called it 230mm. A wrong height would ride in under an image approval, where it is not what
      // is being looked at, and become invisible debt. Heights get filled deliberately, researched
      // or measured, as their own pass.
      //
      // The flag puts it back at the top of the queue WITHOUT clearing the rejection reasons --
      // those stay as the history of why it was turned down, and are what a cleanup job reads.
      sql(`UPDATE public.bottle_variants SET
             frontimage_url = '${r.url}',
             image_flagged_at = now(),
             image_flagged_by = (SELECT id FROM public.users WHERE username = 'The_Lake_House'),
             image_flag_note = 'Auto-fixed: the stored URL was flattening a transparent PNG onto white. Original cut-out restored, trimmed and self-hosted. Height not set - needs research.'
           WHERE id = '${id}';`);
    }
  } catch (e) {
    failed++;
    console.log(`${label} FAIL  ${String(e.message || e).slice(0, 70)}`);
  }
}

console.log(`\nfixed ${fixed} · skipped ${skipped} (genuinely opaque) · failed ${failed}`);
if (!APPLY && fixed) console.log("Re-run with --apply to write them and put them in the review queue.");
