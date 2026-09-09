/**
 * Prepare one bottle image for the Home cabinet shelf (#83 / #82).
 *
 *   node scripts/shelf_image.mjs <variantId> <sourceUrl> [--height-mm 216 --height-source published]
 *
 * The shelf stands every bottle as a cut-out on a deck, so an image only works if it has a real
 * transparent background, is cropped tight to the glass, and sits on a baseline. This does the
 * mechanical part of that and refuses anything that would look wrong:
 *
 *   1. Fetch the source.
 *   2. REFUSE it if it has no meaningful transparency. A photo on a white card cannot be rescued
 *      here -- it needs actual background removal first -- and shipping it would put a white box on
 *      a shelf, which is the one failure the whole review flow exists to prevent.
 *   3. Trim to the alpha bounding box, so the stored image is glass and nothing else. Padding is
 *      what makes one bottle float above the wood while its neighbour stands on it.
 *   4. Downscale to a shelf-sized derivative and encode WebP with alpha.
 *   5. Upload to our own bucket. Self-hosting matters: a third-party URL can change, expire, or
 *      start returning a watermark, and the shelf would degrade with no warning.
 *
 * It deliberately does NOT write to the database. Approving an image is a judgement, and it belongs
 * in Admin > Images where it can be seen on a shelf first.
 *
 * ONE TRICK WORTH KNOWING, and the reason many "background not removed" rejections are false:
 * a lot of stored URLs run through the wsrv.nl proxy with `&bg=white&output=jpg`, which FLATTENS a
 * transparent PNG source onto white. Drop those two parameters and ask for `output=png` and the
 * original cut-out comes back. No AI, no re-shoot -- just a URL edit.
 */

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const BUCKET = "bottle-images";
const MAX_EDGE = 600;          // shelf-sized derivative; the shelf never renders bigger than this
const ALPHA_MIN_CLEAR = 0.06;  // at least 6% fully transparent, or it is not a cut-out

function env(name) {
  const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const m = raw.match(new RegExp("^\\uFEFF?" + name + "=(.*)$", "m"));
  if (!m) throw new Error(`${name} missing from .env.local`);
  return m[1].trim();
}

/** Drop the proxy parameters that flatten a transparent source onto white. */
export function unflatten(url) {
  if (!url.includes("wsrv.nl")) return url;
  return url
    .replace(/&bg=white/g, "")
    .replace(/&output=jpg/g, "&output=png")
    .concat(url.includes("output=") ? "" : "&output=png");
}

async function main() {
  const [variantId, srcUrlRaw] = process.argv.slice(2);
  const heightArg = process.argv.indexOf("--height-mm");
  const heightMm = heightArg > -1 ? Number(process.argv[heightArg + 1]) : null;
  const srcArg = process.argv.indexOf("--height-source");
  const heightSource = srcArg > -1 ? process.argv[srcArg + 1] : null;
  if (!variantId || !srcUrlRaw) {
    console.error(
      "usage: node scripts/shelf_image.mjs <variantId> <sourceUrl> " +
      "[--height-mm N --height-source measured|published|estimated]"
    );
    process.exit(1);
  }
  // A height with no provenance is exactly the ambiguity bottle_height_source exists to remove,
  // and the database rejects the pair anyway -- fail here rather than after the upload.
  if ((heightMm && !heightSource) || (heightSource && !heightMm)) {
    console.error("--height-mm and --height-source must be given together.");
    process.exit(1);
  }
  if (heightSource && !["measured", "published", "estimated"].includes(heightSource)) {
    console.error("--height-source must be measured, published or estimated.");
    process.exit(1);
  }

  const srcUrl = unflatten(srcUrlRaw);
  if (srcUrl !== srcUrlRaw) console.log("unflattened the proxy URL (was forcing a white background)");

  const res = await fetch(srcUrl, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`source fetch failed: HTTP ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());

  const img = sharp(input).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  // Is this actually a cut-out, and where does the glass sit?
  let clear = 0;
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (a < 16) { clear++; continue; }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const clearPct = clear / (info.width * info.height);
  console.log(`source ${info.width}x${info.height}, ${(clearPct * 100).toFixed(1)}% transparent`);

  if (clearPct < ALPHA_MIN_CLEAR) {
    console.error(
      "REFUSED: this image has no real transparency, so it would put a solid box on the shelf.\n" +
      "It needs background removal first — reject it in Admin > Images with 'Background not removed'."
    );
    process.exit(2);
  }
  if (maxX < 0) throw new Error("image is entirely transparent");

  const out = await sharp(input)
    .ensureAlpha()
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize({ height: MAX_EDGE, width: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();

  const meta = await sharp(out).metadata();
  console.log(`trimmed to ${maxX - minX + 1}x${maxY - minY + 1}, stored ${meta.width}x${meta.height}, ${(out.length / 1024) | 0}KB`);

  const base = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE");
  const objectPath = `variants/${variantId}/shelf-${Date.now().toString(36)}.webp`;

  const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
    },
    body: out,
  });
  if (!up.ok) throw new Error(`upload failed: HTTP ${up.status} ${await up.text()}`);

  const publicUrl = `${base}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  console.log("\nuploaded:", publicUrl);
  console.log("\nSQL to apply (review it on a shelf before approving):");
  console.log(
    `UPDATE public.bottle_variants SET frontimage_url = '${publicUrl}'` +
    (heightMm ? `, bottle_height = ${heightMm}, bottle_height_source = '${heightSource}'` : "") +
    ` WHERE id = '${variantId}';`
  );
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
