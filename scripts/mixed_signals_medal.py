"""Mixed Signals object (docs/BADGE_ART.md): Brian's old fashioned (rocks glass, big cube, cherry and
orange peel on a gold pick), public/badges/masters/parts/mixed-old-fashioned.png. The source is
already cut out (transparent PNG), so this only scales and places it - one transparent overlay that
Medal draws over the plate, like neat_freak.

Sized like the Glencairn (Brian, 2026-10-08: "fills the space just between the metal rings"): the
glass body is scaled so its corners sit just inside the inner ring, and the garnish pick rising to
the top right is kept clear of the stars at 12 o'clock.

Outputs:
  public/badges/objects/mixed_signals.webp          512, transparent (the app file)
  public/badges/masters/mixed_signals-1024.webp     the same at 1024
  <preview-dir>/mix-<frame>-<n>-<size>.png        object + baked stars on plates at 512 / 100 / 38
Usage: python3 scripts/mixed_signals_medal.py [--preview-dir <dir>]
"""
import os
import sys
from PIL import Image

SRC = "public/badges/masters/parts/mixed-old-fashioned.png"
S = 1024
GLASS_H = 0.56      # glass body height (rim to base, not the pick) as a fraction of the disc
GLASS_CY = 0.55     # vertical centre of the glass body on the disc
GLASS_TOP = 145     # source row of the glass rim (above it is only the pick and peel)
args = sys.argv[1:]
preview_dir = args[args.index("--preview-dir") + 1] if "--preview-dir" in args else "public/badges/review/mix"

src = Image.open(SRC).convert("RGBA")
obj = src.crop(src.getbbox())
x0, y0 = src.getbbox()[:2]
body_h = obj.height - (GLASS_TOP - y0)
k = S * GLASS_H / body_h
obj = obj.resize((round(obj.width * k), round(obj.height * k)), Image.LANCZOS)
# centre the glass body (not the pick) horizontally on the disc
body_cx = (src.width / 2 - x0) * k
top = S * GLASS_CY - S * GLASS_H / 2 - (GLASS_TOP - y0) * k
canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
canvas.alpha_composite(obj, (round(S / 2 - body_cx), round(top)))
canvas.save("public/badges/masters/mixed_signals-1024.webp", lossless=False, quality=92)
small = canvas.resize((512, 512), Image.LANCZOS)
small.save("public/badges/objects/mixed_signals.webp", lossless=False, quality=90)

os.makedirs(preview_dir, exist_ok=True)
for frame in ["wood", "bronze", "silver", "gold", "diamond", "limited", "locked"]:
    for n in ([0, 4] if frame not in ("limited", "locked") else [0]):
        plate = Image.open(f"public/badges/frames/{frame}.webp").convert("RGBA").resize((512, 512), Image.LANCZOS)
        o = small.copy()
        if frame == "locked":
            o.putalpha(o.getchannel("A").point(lambda v: int(v * 0.45)))
        plate.alpha_composite(o)
        if n:
            plate.alpha_composite(Image.open(f"public/badges/stars/{frame}-{n}.webp").convert("RGBA").resize((512, 512), Image.LANCZOS))
        for size in (512, 100, 38):
            plate.resize((size, size), Image.LANCZOS).save(f"{preview_dir}/mix-{frame}-{n}-{size}.png")
print("object", obj.size, "on", S)
