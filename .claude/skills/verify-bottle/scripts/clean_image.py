#!/usr/bin/env python
"""Clean a bottle image for app display: trim to the bottle, center, transparent bg.
Usage: python clean_image.py <input> <output.png> [pad]

- If the source already has an alpha channel (official brand PNGs usually do),
  trims to the alpha bounding box and pads with transparent margin.
- If it's opaque (JPEG/flat white), keys out a near-white background first, then
  trims. Threshold is conservative; eyeball the result and adjust if needed.
"""
import sys
from PIL import Image

def main():
    if len(sys.argv) < 3:
        print("usage: clean_image.py <input> <output.png> [pad]"); sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    pad = int(sys.argv[3]) if len(sys.argv) > 3 else 12

    im = Image.open(src).convert("RGBA")
    alpha = im.getchannel("A")
    lo, hi = alpha.getextrema()
    if lo == 255 and hi == 255:
        # opaque -> key out near-white background
        px = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if r > 240 and g > 240 and b > 240:
                    px[x, y] = (r, g, b, 0)
        alpha = im.getchannel("A")

    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)
    canvas.save(out)
    print(f"cleaned: {canvas.size} -> {out}")

if __name__ == "__main__":
    main()
