/**
 * Punch a studio ring photo into a 512 circular WebP with a transparent well,
 * or key a black-void object into a 512 transparent WebP.
 *
 *   node scripts/medal_image.mjs frame <src> <out> [cx,cy,outer,hole]
 *   node scripts/medal_image.mjs object <src> <out>
 *
 * Limited / FR plates from the 2026-09-21 Imagine (832x1248):
 *   frame  415,608,292,158
 *   locked 414,608,310,175
 *   wood   412,608,320,180
 *
 * Photoreal badges (#150): the ring plate is a picture frame — alpha outside the
 * outer ring and inside the inner well, so the object sits behind and shows through.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SIZE = 512;
const [mode, src, out, geomArg] = process.argv.slice(2);
if (!mode || !src || !out || !["frame", "object"].includes(mode)) {
  console.error("usage: node scripts/medal_image.mjs <frame|object> <src> <out> [cx,cy,outer,hole]");
  process.exit(1);
}

const lumaAt = (data, i, channels) =>
  0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

async function raw(file) {
  const { data, info } = await sharp(file).removeAlpha().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function cornersBg(data, width, height, channels) {
  const s = 24;
  let sum = 0, n = 0;
  const add = (x0, y0) => {
    for (let y = y0; y < y0 + s; y++) {
      for (let x = x0; x < x0 + s; x++) {
        sum += lumaAt(data, (y * width + x) * channels, channels);
        n++;
      }
    }
  };
  add(0, 0);
  add(width - s, 0);
  add(0, height - s);
  add(width - s, height - s);
  return sum / n;
}

function findRings(data, width, height, channels) {
  const bg = cornersBg(data, width, height, channels);
  const T = Math.max(bg + 24, 48);
  let minX = width, minY = height, maxX = 0, maxY = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const L = lumaAt(data, (y * width + x) * channels, channels);
      if (L > T) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        n++;
      }
    }
  }
  if (n < 200) throw new Error("no ring pixels found — threshold too high?");
  // Bounding box of the ring, not the centroid of lit pixels — studio light
  // pulls a centroid onto the bright arc and the crop slices a chord of grain.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const maxR = Math.floor(Math.min(cx, cy, width - cx, height - cy));
  const mean = new Float64Array(maxR);
  const count = new Uint32Array(maxR);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = Math.round(Math.hypot(x - cx, y - cy));
      if (r > 0 && r < maxR) {
        mean[r] += lumaAt(data, (y * width + x) * channels, channels);
        count[r]++;
      }
    }
  }
  for (let r = 1; r < maxR; r++) if (count[r]) mean[r] /= count[r];
  const smooth = new Float64Array(maxR);
  for (let r = 1; r < maxR; r++) {
    let s = 0, k = 0;
    for (let d = -4; d <= 4; d++) {
      const i = r + d;
      if (i > 0 && i < maxR && count[i]) {
        s += mean[i];
        k++;
      }
    }
    smooth[r] = k ? s / k : 0;
  }

  const below = (r, n) => {
    for (let i = 0; i < n; i++) if (r - i < 1 || smooth[r - i] > T) return false;
    return true;
  };
  const above = (r, n) => {
    for (let i = 0; i < n; i++) if (r - i < 1 || smooth[r - i] <= T) return false;
    return true;
  };

  let outer = maxR - 1;
  while (outer > 16 && smooth[outer] < T) outer--;
  while (outer + 1 < maxR && smooth[outer + 1] > bg + 8) outer++;
  outer = Math.min(maxR - 1, outer + 2);

  // Walk inward through the outer ring. A sustained dark stretch is either the
  // well (solid wood/pewter disc) or the annulus before an inner metal ring.
  let r = outer;
  while (r > 24 && !below(r, 6)) r--;
  const afterOuter = r;
  let q = r;
  while (q > 24 && !above(q, 4)) q--;
  let hole;
  if (q > afterOuter * 0.4 && above(q, 4)) {
    while (q > 16 && !below(q, 6)) q--;
    hole = q;
  } else {
    hole = afterOuter;
  }
  hole = Math.max(12, hole);
  const ratio = hole / outer;
  if (ratio < 0.48 || ratio > 0.68) hole = Math.round(outer * 0.56);

  return { cx, cy, outer, hole, bg, T };
}

async function frameToWebp(srcPath, outPath) {
  const { data, width, height, channels } = await raw(srcPath);
  const { cx, cy, outer, hole } = geomArg
    ? (() => {
        const [a, b, c, d] = geomArg.split(",").map(Number);
        if (![a, b, c, d].every(Number.isFinite)) throw new Error("geom must be cx,cy,outer,hole");
        return { cx: a, cy: b, outer: c, hole: d };
      })()
    : findRings(data, width, height, channels);
  const pad = Math.ceil(outer) + 4;
  const padL = Math.max(0, Math.ceil(pad - cx));
  const padT = Math.max(0, Math.ceil(pad - cy));
  const padR = Math.max(0, Math.ceil(cx + pad - width));
  const padB = Math.max(0, Math.ceil(cy + pad - height));
  const side = Math.ceil(outer * 2);
  const left = Math.round(cx + padL - outer);
  const top = Math.round(cy + padT - outer);
  const cropped = await sharp(srcPath)
    .extend({ top: padT, left: padL, bottom: padB, right: padR, background: { r: 0, g: 0, b: 0 } })
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ocx = SIZE / 2;
  const ocy = SIZE / 2;
  const oR = SIZE / 2;
  const hR = (hole / outer) * (SIZE / 2);
  const px = cropped.data;
  const ch = cropped.info.channels;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - ocx, y - ocy);
      const a = y * SIZE + x;
      if (d > oR || d < hR) px[a * ch + 3] = 0;
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(px, { raw: { width: SIZE, height: SIZE, channels: ch } }).webp({ quality: 90, alphaQuality: 100 }).toFile(outPath);
  console.log(`${path.basename(outPath)}  cx=${cx.toFixed(1)} cy=${cy.toFixed(1)} outer=${outer.toFixed(0)} hole=${hole.toFixed(0)} pad=${padL},${padT},${padR},${padB} extract=${left},${top} ${side}x${side}`);
}

async function objectToWebp(srcPath, outPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const px = Buffer.from(data);
  const isVoidColor = (i) => {
    const o = i * channels;
    const r = px[o], g = px[o + 1], b = px[o + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L < 8 && r < 10 && g < 10 && b < 10;
  };
  const seen = new Uint8Array(width * height);
  const stack = [];
  const seed = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i] || !isVoidColor(i)) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i / width) | 0;
    seed(x - 1, y);
    seed(x + 1, y);
    seed(x, y - 1);
    seed(x, y + 1);
  }
  for (let i = 0; i < width * height; i++) px[i * channels + 3] = seen[i] ? 0 : 255;
  // trim to alpha, then sit the bottle in the well, centered, wax tucking under the inner ring
  const trimmed = await sharp(px, { raw: { width, height, channels } })
    .trim({ threshold: 8 })
    .png()
    .toBuffer();
  const meta = await sharp(trimmed).metadata();
  const targetH = Math.round(SIZE * 0.70);
  const scale = targetH / (meta.height || targetH);
  const w = Math.round((meta.width || targetH) * scale);
  const h = targetH;
  const left = Math.round((SIZE - w) / 2);
  const top = Math.round((SIZE - h) / 2 + SIZE * 0.02);
  const canvas = Buffer.alloc(SIZE * SIZE * 4);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(canvas, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .composite([{ input: await sharp(trimmed).resize(w, h).png().toBuffer(), left, top }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(outPath);
  console.log(`${path.basename(outPath)}  object ${w}x${h} on ${SIZE}`);
}

const absOut = path.resolve(out);
if (mode === "frame") await frameToWebp(src, absOut);
else await objectToWebp(src, absOut);
