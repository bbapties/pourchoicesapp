#!/usr/bin/env python
"""Clean a bottle image for app display: isolate the bottle, transparent bg, tight+centered,
then downscale and encode for the web.
Usage: python clean_image.py <input> <output.webp> [--crop L,T,R,B] [--pad N] [--max-edge N]

OUTPUT FORMAT: prefer a `.webp` output path. WebP keeps the transparency these images need
and is ~5-10x smaller than the equivalent PNG. Supabase Storage is metered and the project is
on the free tier, so an oversized upload is a real cost. `.png` still works if you need it.

SIZING: the image is downscaled to 1200px on its long edge (never upscaled), matching
`src/lib/compressImage.ts` in the app. That is sized off the largest place a bottle image is
ever rendered -- the detail view zoom at max-w-[500px] h-[75vh] -- and stays crisp there at a
3x device pixel ratio.

Strategy (best available):
  1. If the source already has real transparency (official brand PNGs), just trim+pad.
  2. Else if `rembg` is installed, use it to isolate the bottle from ANY background
     (studio, lifestyle, gradient) — install once: `python -m pip install rembg onnxruntime`.
  3. Else fall back to keying out a near-white background (works only on white/flat bg).

--crop trims the source first (e.g. to drop marketing text flanking the bottle in a banner)
before background removal. Coordinates are in source pixels: left,top,right,bottom.
"""
import os
import sys
from PIL import Image

# Keep these in step with src/lib/compressImage.ts so bot-uploaded and user-uploaded
# images land at the same size and quality.
MAX_EDGE = 1200
WEBP_QUALITY = 82


def parse_args(argv):
    src, out = argv[1], argv[2]
    crop = None
    pad = 14
    max_edge = MAX_EDGE
    i = 3
    while i < len(argv):
        if argv[i] == "--crop":
            crop = tuple(int(x) for x in argv[i + 1].split(",")); i += 2
        elif argv[i] == "--pad":
            pad = int(argv[i + 1]); i += 2
        elif argv[i] == "--max-edge":
            max_edge = int(argv[i + 1]); i += 2
        else:
            i += 1
    return src, out, crop, pad, max_edge


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
        print("usage: clean_image.py <input> <output.webp> [--crop L,T,R,B] [--pad N] [--max-edge N]"); sys.exit(1)
    src, out, crop, pad, max_edge = parse_args(sys.argv)

    im = Image.open(src).convert("RGBA")
    if crop:
        im = im.crop(crop)
    im = isolate(im)

    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)

    # Downscale to the shared long-edge budget. Never upscale a small source -- that only
    # inflates the file without adding detail.
    if max(canvas.size) > max_edge:
        scale = max_edge / max(canvas.size)
        canvas = canvas.resize(
            (max(1, round(canvas.width * scale)), max(1, round(canvas.height * scale))),
            Image.LANCZOS,
        )

    ext = os.path.splitext(out)[1].lower()
    if ext == ".webp":
        # Lossy WebP keeps the alpha channel; method=6 is the slowest/smallest setting.
        canvas.save(out, "WEBP", quality=WEBP_QUALITY, method=6)
    elif ext == ".png":
        canvas.save(out, "PNG", optimize=True)
        print("NOTE: .png output is ~5-10x larger than .webp for the same image. Prefer .webp.")
    else:
        canvas.save(out)

    kb = os.path.getsize(out) / 1024
    print(f"cleaned: {canvas.size} -> {out} ({kb:.0f} KB)")
    if kb > 250:
        print(f"WARNING: {kb:.0f} KB is large for a bottle image. Expect ~40-150 KB as .webp.")


if __name__ == "__main__":
    main()
