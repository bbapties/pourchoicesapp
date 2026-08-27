#!/usr/bin/env python
"""Clean a bottle image for app display: isolate the bottle, transparent bg, tight+centered.
Usage: python clean_image.py <input> <output.png> [--crop L,T,R,B] [--pad N]

Strategy (best available):
  1. If the source already has real transparency (official brand PNGs), just trim+pad.
  2. Else if `rembg` is installed, use it to isolate the bottle from ANY background
     (studio, lifestyle, gradient) — install once: `python -m pip install rembg onnxruntime`.
  3. Else fall back to keying out a near-white background (works only on white/flat bg).

--crop trims the source first (e.g. to drop marketing text flanking the bottle in a banner)
before background removal. Coordinates are in source pixels: left,top,right,bottom.
"""
import sys
from PIL import Image


def parse_args(argv):
    src, out = argv[1], argv[2]
    crop = None
    pad = 14
    i = 3
    while i < len(argv):
        if argv[i] == "--crop":
            crop = tuple(int(x) for x in argv[i + 1].split(",")); i += 2
        elif argv[i] == "--pad":
            pad = int(argv[i + 1]); i += 2
        else:
            i += 1
    return src, out, crop, pad


def isolate(im: Image.Image) -> Image.Image:
    """Return an RGBA image with the bottle on a transparent background."""
    alpha = im.getchannel("A")
    lo, hi = alpha.getextrema()
    if not (lo == 255 and hi == 255):
        return im  # already has transparency
    try:
        from rembg import remove
        return remove(im)  # ML background removal — handles any background
    except Exception:
        px = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if r > 240 and g > 240 and b > 240:
                    px[x, y] = (r, g, b, 0)
        return im


def main():
    if len(sys.argv) < 3:
        print("usage: clean_image.py <input> <output.png> [--crop L,T,R,B] [--pad N]"); sys.exit(1)
    src, out, crop, pad = parse_args(sys.argv)

    im = Image.open(src).convert("RGBA")
    if crop:
        im = im.crop(crop)
    im = isolate(im)

    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)
    canvas.save(out)
    print(f"cleaned: {canvas.size} -> {out}")


if __name__ == "__main__":
    main()
