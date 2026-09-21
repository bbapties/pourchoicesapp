// Founder's Reserve object (#150): Brian's cut-out parts (public/badges/masters/parts/)
// stacked into ONE transparent overlay that Medal draws over the signed Limited plate.
//   eagle (back)  ->  glass (front)  ->  "Pour Choices" etched on the bowl
// The wings deliberately cross the inner gold ring, so unlike the locked "object behind
// the plate" plan this object sits IN FRONT of the plate. Output:
//   public/badges/objects/founders_reserve.webp   512, transparent (the app file)
//   public/badges/masters/founders_reserve-1024.webp  the same at 1024 (parts are upscaled)
//   <scratch>/fr-preview-*.png   object on the Limited plate at 512 / 100 / 38 for review
// Usage: node scripts/founders_reserve_medal.mjs [--preview-dir <dir>]
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const S = 1024; // work at master size, downsize once
const parts = "public/badges/masters/parts";
const args = process.argv.slice(2);
const previewDir = args.includes("--preview-dir") ? args[args.indexOf("--preview-dir") + 1] : "public/badges/review/fr";

// Layout in fractions of the disc, read off Brian's mockup (fr-mockup.webp):
// wings span ~73% of the width, head top at ~24%, glass 23% wide from 47% to 86% down.
const EAGLE_W = 0.74;
const EAGLE_TOP = 0.20;
const GLASS_W = 0.27;
const GLASS_TOP = 0.45;

async function fit(file, w) {
  const buf = await sharp(path.join(parts, file)).trim().toBuffer();
  const m = await sharp(buf).metadata();
  const h = Math.round((m.height / m.width) * w);
  return { buf: await sharp(buf).resize(w, h, { kernel: "lanczos3" }).png().toBuffer(), w, h };
}

// The eagle part has a rectangular hole where the glass goes (cols 125-275, rows 156-208 of the
// trimmed 401x363 png; below that the wings open). The mockup shows the chest continuing behind
// the glass, so fill the hole with the chest band just above it, flipped, and let it fade out
// down the tail gap. It sits behind the glass bowl - only the corners ever show.
async function eagleWithChest() {
  const trimmed = await sharp(path.join(parts, "fr-eagle.png")).trim().png().toBuffer();
  const m = await sharp(trimmed).metadata();
  const band = { left: 125, top: 118, width: 150, height: 40 };
  const chest = await sharp(trimmed).extract(band).flip().png().toBuffer();
  const layers = [];
  for (let y = 156, i = 0; y < Math.round(m.height * 0.9); y += band.height, i++) {
    const h = Math.min(band.height, m.height - y);
    // fade the fill once it is past the rectangle, so the tail gap softens into the wood
    const alpha = y < 208 ? 1 : Math.max(0.15, 1 - (y - 208) / 130);
    const piece = await sharp(i % 2 ? await sharp(chest).flip().png().toBuffer() : chest)
      .extract({ left: 0, top: 0, width: band.width, height: h })
      .ensureAlpha()
      .composite([{ input: Buffer.from([255, 255, 255, Math.round(alpha * 255)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
      .png().toBuffer();
    layers.push({ input: piece, left: band.left, top: y });
  }
  // fill first, then the original eagle on top so the hole's edge is the eagle's own edge
  return sharp({ create: { width: m.width, height: m.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([...layers, { input: trimmed }]).png().toBuffer();
}

async function fitBuf(buf, w) {
  const m = await sharp(buf).metadata();
  const h = Math.round((m.height / m.width) * w);
  return { buf: await sharp(buf).resize(w, h, { kernel: "lanczos3" }).png().toBuffer(), w, h };
}

const eagle = await fitBuf(await eagleWithChest(), Math.round(S * EAGLE_W));
const glass = await fit("fr-glass.png", Math.round(S * GLASS_W));

const eagleLeft = Math.round((S - eagle.w) / 2);
const eagleTop = Math.round(S * EAGLE_TOP);
const glassLeft = Math.round((S - glass.w) / 2);
const glassTop = Math.round(S * GLASS_TOP);

// The etching: white serif, low alpha, softened, stacked on two lines ("Pour" over "Choices")
// centred just above the whiskey line, each line on a gentle arc so it follows the bowl.
// librsvg (sharp) does not render <textPath>, so each letter is placed and rotated along the
// arc by hand from a Georgia-italic advance table.
const fontSize = Math.round(glass.w * 0.135);
const ADV = { P: 0.6, o: 0.5, u: 0.53, r: 0.4, C: 0.62, h: 0.53, i: 0.28, c: 0.42, e: 0.44, s: 0.38 };
const cx = S / 2;
const R = glass.w * 1.7; // arc radius: a shallow smile, centre well above the glass
// the whiskey line sits ~52% down the glass part; the second line's baseline sits just above it
const line2Y = glassTop + Math.round(glass.h * 0.50);
const line1Y = line2Y - Math.round(fontSize * 1.05);
function arcWord(word, baseY) {
  const widths = [...word].map((ch) => (ADV[ch] ?? 0.5) * fontSize + 2);
  const total = widths.reduce((a, b) => a + b, 0);
  const arcCy = baseY - R;
  let out = "";
  let x = -total / 2;
  for (let i = 0; i < word.length; i++) {
    const mid = x + widths[i] / 2;
    const ang = -(mid / R) * (180 / Math.PI); // degrees around the arc centre (negative = smile)
    out += `<text x="${cx}" y="${baseY}" transform="rotate(${ang.toFixed(3)} ${cx} ${arcCy})">${word[i]}</text>`;
    x += widths[i];
  }
  return out;
}
const letters = arcWord("Pour", line1Y) + arcWord("Choices", line2Y);
const textAttrs = `font-family="Georgia" font-style="italic" font-size="${fontSize}" text-anchor="middle"`;
const etch = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs><filter id="soft"><feGaussianBlur stdDeviation="0.7" /></filter></defs>
  <g ${textAttrs} fill="#000000" fill-opacity="0.25" transform="translate(0,1.5)">${letters}</g>
  <g ${textAttrs} fill="#ffffff" fill-opacity="0.78" filter="url(#soft)">${letters}</g>
</svg>`);

const object = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([
    { input: eagle.buf, left: eagleLeft, top: eagleTop },
    { input: glass.buf, left: glassLeft, top: glassTop },
    { input: etch, left: 0, top: 0 },
  ])
  .png()
  .toBuffer();

await sharp(object).webp({ quality: 92, alphaQuality: 100 }).toFile("public/badges/masters/founders_reserve-1024.webp");
await sharp(object).resize(512, 512, { kernel: "lanczos3" }).webp({ quality: 92, alphaQuality: 100 }).toFile("public/badges/objects/founders_reserve.webp");

// Review comps: object on the Limited plate at the sizes that must hold.
fs.mkdirSync(previewDir, { recursive: true });
const plate = await sharp("public/badges/masters/plates-1024/limited.webp").png().toBuffer();
const comp = await sharp(plate).composite([{ input: object }]).png().toBuffer();
for (const px of [512, 100, 38]) {
  await sharp(comp).resize(px, px, { kernel: "lanczos3" }).png().toFile(path.join(previewDir, `fr-preview-${px}.png`));
}
await sharp(comp).extract({ left: 300, top: 420, width: 424, height: 424 }).png().toFile(path.join(previewDir, "fr-preview-glass.png"));
console.log("wrote objects/founders_reserve.webp, masters/founders_reserve-1024.webp, previews in", previewDir);
