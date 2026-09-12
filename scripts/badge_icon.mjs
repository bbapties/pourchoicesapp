// Renders the monochrome notification badge: a white Glencairn silhouette on transparent.
// Android draws the status-bar badge from the alpha channel only, so a full-colour logo there
// shows as a solid white square. Run: node scripts/badge_icon.mjs
import sharp from 'sharp';

// Glencairn: tulip bowl, short waist, stubby foot. Drawn in a 96x96 box.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <g fill="#fff">
    <path d="M33 8 H63 C66 18 72 26 72 36 C72 52 62 61 53 64 L53 74 H43 L43 64 C34 61 24 52 24 36 C24 26 30 18 33 8 Z"/>
    <path d="M32 78 H64 C68 78 70 81 70 84 V88 H26 V84 C26 81 28 78 32 78 Z"/>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).resize(96, 96).png().toFile('public/icons/badge-96.png');
console.log('wrote public/icons/badge-96.png');
