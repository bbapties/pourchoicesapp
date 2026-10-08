"""Rock Star object (docs/BADGE_ART.md): Brian's rocks glass photo
(public/badges/masters/parts/rocks-tumbler.png, a tumbler with one big cube, already cut out on
transparency) placed as ONE transparent overlay that Medal draws over the plate, like neat_freak.

The source alpha is already clean (the empty band above the whiskey is partly see-through), so
this only crops, scales and centres it. The tumbler is about as wide as it is tall, so it is sized
to fill the well between the metal rings with its rim just under the stars, not by height alone
like the Glencairn.

Outputs:
  public/badges/objects/rock_star.webp          512, transparent (the app file)
  public/badges/masters/rock_star-1024.webp     the same at 1024
  <preview-dir>/rocks-<frame>-<size>.png         object on plates at 512 / 100 / 38
Usage: python3 scripts/rock_star_medal.py [--preview-dir <dir>]
"""
import os
import sys
from PIL import Image

SRC = "public/badges/masters/parts/rocks-tumbler.png"
S = 1024
GLASS_H = 0.66      # glass height as a fraction of the disc
GLASS_CY = 0.52     # vertical centre of the glass on the disc (same as neat_freak)
args = sys.argv[1:]
preview_dir = args[args.index("--preview-dir") + 1] if "--preview-dir" in args else "public/badges/review/rocks"

obj = Image.open(SRC).convert("RGBA")
obj = obj.crop(obj.getchannel("A").getbbox())

gh = int(S * GLASS_H)
gw = int(obj.width * gh / obj.height)
obj = obj.resize((gw, gh), Image.LANCZOS)
canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
canvas.alpha_composite(obj, ((S - gw) // 2, int(S * GLASS_CY - gh / 2)))
canvas.save("public/badges/masters/rock_star-1024.webp", lossless=False, quality=92)
small = canvas.resize((512, 512), Image.LANCZOS)
small.save("public/badges/objects/rock_star.webp", lossless=False, quality=90)

os.makedirs(preview_dir, exist_ok=True)
for frame in ["wood", "bronze", "silver", "gold", "diamond", "limited", "locked"]:
    plate = Image.open(f"public/badges/frames/{frame}.webp").convert("RGBA").resize((512, 512), Image.LANCZOS)
    o = small.copy()
    if frame == "locked":
        o.putalpha(o.getchannel("A").point(lambda v: int(v * 0.45)))
    plate.alpha_composite(o)
    for size in (512, 100, 38):
        plate.resize((size, size), Image.LANCZOS).save(f"{preview_dir}/rocks-{frame}-{size}.png")
print("glass", gw, "x", gh)
