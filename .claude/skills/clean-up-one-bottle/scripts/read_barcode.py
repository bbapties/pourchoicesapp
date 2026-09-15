"""
Read the barcode off a bottle photo - the last rung of the barcode ladder.

  python .claude/skills/clean-up-one-bottle/scripts/read_barcode.py <image-or-url> [more...]

Prints one line per code found: FORMAT  DIGITS  check=ok|bad. Tries the image as-is, then
rotated, then upscaled, then each half - back-label shots are often tilted or the barcode is a
small strip. Exit 0 if any UPC-A/EAN-13 decoded, 1 if none. Uses zxing-cpp (pure wheel, no
system zbar), installed with: python -m pip install zxing-cpp pillow
"""
import io, sys, urllib.request
from PIL import Image, ImageOps
import zxingcpp

def load(src):
    if src.startswith("http"):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
        return Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read()))
    return Image.open(src)

def check_digit_ok(d):
    if not d.isdigit() or len(d) not in (12, 13): return False
    body, chk = d[:-1], int(d[-1])
    if len(d) == 12: s = sum(int(c) * (3 if i % 2 == 0 else 1) for i, c in enumerate(body))
    else:            s = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(body))
    return (10 - s % 10) % 10 == chk

def attempts(im):
    im = ImageOps.exif_transpose(im).convert("RGB")
    yield "as-is", im
    for a in (90, 180, 270): yield f"rot{a}", im.rotate(a, expand=True)
    w, h = im.size
    if max(w, h) < 2000: yield "x2", im.resize((w * 2, h * 2), Image.LANCZOS)
    yield "top", im.crop((0, 0, w, h // 2)); yield "bottom", im.crop((0, h // 2, w, h))
    yield "left", im.crop((0, 0, w // 2, h)); yield "right", im.crop((w // 2, 0, w, h))
    yield "gray-contrast", ImageOps.autocontrast(ImageOps.grayscale(im)).convert("RGB")

found = {}
for src in sys.argv[1:]:
    try: im = load(src)
    except Exception as e: print(f"{src}: could not open ({e})"); continue
    for label, cand in attempts(im):
        for r in zxingcpp.read_barcodes(cand):
            digits = r.text.strip()
            fmt = str(r.format).split(".")[-1].replace("-", "").upper()
            if fmt == "UPCE": continue
            # an EAN-13 with a leading 0 is a UPC-A: the DB stores the 12-digit form
            if fmt == "EAN13" and len(digits) == 13 and digits[0] == "0": fmt, digits = "UPCA", digits[1:]
            key = (fmt, digits)
            if key not in found:
                found[key] = (src, label)
                print(f"{fmt}  {digits}  check={'ok' if check_digit_ok(digits) else 'bad'}  ({label}, {src})")
if not any(f in ("UPCA", "EAN13") for f, _ in found): print("no UPC-A / EAN-13 found"); sys.exit(1)
