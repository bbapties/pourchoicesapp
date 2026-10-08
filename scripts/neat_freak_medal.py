"""Neat Freak object (docs/BADGE_ART.md): Brian's backlit Glencairn photo
(public/badges/masters/parts/neat-glencairn.png, glass on a black studio backdrop with a glow)
cut out into ONE transparent overlay that Medal draws over the plate, like founders_reserve.

The backdrop is not keyable by colour (the halo is as bright as the glass edge), so the cutout is
the glass's own silhouette: per-row half-widths found from the sharp edge of the glass, symmetric
about the stem, smoothed, then feathered. Inside it the empty bowl is backlit white; that is made
partly see-through so the plate's wood reads through the glass and only the rim, walls, highlights
and the whiskey stay solid.

Outputs:
  public/badges/objects/neat_freak.webp          512, transparent (the app file)
  public/badges/masters/neat_freak-1024.webp     the same at 1024
  <preview-dir>/neat-<frame>-<size>.png           object on plates at 512 / 100 / 38
Usage: python3 scripts/neat_freak_medal.py [--preview-dir <dir>]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

SRC = "public/badges/masters/parts/neat-glencairn.png"
S = 1024
GLASS_H = 0.66      # glass height as a fraction of the disc
GLASS_CY = 0.52     # vertical centre of the glass on the disc
CLEAR_FROM = 0.48   # empty bowl: fraction of light let through at full white (0 = solid)
LIQUID_Y = 790      # source row of the whiskey surface; below it everything is solid
args = sys.argv[1:]
preview_dir = args[args.index("--preview-dir") + 1] if "--preview-dir" in args else "public/badges/review/neat"

src = Image.open(SRC).convert("RGB")
W, H = src.size
lum = np.asarray(src.convert("L").filter(ImageFilter.GaussianBlur(1.5))).astype(float)
grad = np.abs(np.diff(lum, axis=1))
cx = W // 2

# --- silhouette: outermost sharp edge per row, taken symmetric (max of the two sides)
rows = np.arange(H)
hw = np.full(H, np.nan)
for y in range(H):
    xs = np.where(grad[y] > 12)[0]
    if len(xs) < 2:
        continue
    l, r = cx - xs.min(), xs.max() - cx
    if l > 0 and r > 0:
        hw[y] = max(l, r) if abs(l - r) < 40 else max(min(l, r), 0) if max(l, r) > 400 else max(l, r)
top = int(np.nanargmax(~np.isnan(hw)))           # first row with an edge = rim
bot = H - 1 - int(np.argmax(~np.isnan(hw[::-1])))  # last row with an edge = base
# rows inside the glass where the edge went missing (the whiskey band, stem): interpolate
good = ~np.isnan(hw)
hw = np.interp(rows, rows[good], hw[good])
# a running max then median keeps the outline outside thin highlights and kills spikes
k = 25
hw = np.array([np.max(hw[max(0, y - 4):y + 5]) for y in rows])
hw = np.array([np.median(hw[max(0, y - k):y + k + 1]) for y in rows])

mask = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(mask)
for y in range(top, bot + 1):
    d.line([(cx - hw[y] + 1, y), (cx + hw[y] - 1, y)], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(2))
alpha = np.asarray(mask).astype(float) / 255

# --- see-through empty bowl: bright, neutral pixels above the whiskey let the plate through
rgb = np.asarray(src).astype(float)
L = rgb.mean(axis=2)
sat = rgb.max(axis=2) - rgb.min(axis=2)
bright = np.clip((L - 170) / 80, 0, 1) * np.clip(1 - sat / 60, 0, 1)
inner = np.asarray(mask.filter(ImageFilter.MinFilter(25))).astype(float) / 255  # keep the walls
upper = (rows[:, None] < LIQUID_Y - 10).astype(float)
alpha = alpha * (1 - CLEAR_FROM * bright * inner * upper)

out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
obj = Image.fromarray(out, "RGBA").crop((0, top, W, bot + 1))
obj = obj.crop(obj.getbbox())

gh = int(S * GLASS_H)
gw = int(obj.width * gh / obj.height)
obj = obj.resize((gw, gh), Image.LANCZOS)
canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
canvas.alpha_composite(obj, ((S - gw) // 2, int(S * GLASS_CY - gh / 2)))
canvas.save("public/badges/masters/neat_freak-1024.webp", lossless=False, quality=92)
small = canvas.resize((512, 512), Image.LANCZOS)
small.save("public/badges/objects/neat_freak.webp", lossless=False, quality=90)

import os
os.makedirs(preview_dir, exist_ok=True)
for frame in ["wood", "bronze", "silver", "gold", "diamond", "limited", "locked"]:
    plate = Image.open(f"public/badges/frames/{frame}.webp").convert("RGBA").resize((512, 512), Image.LANCZOS)
    o = small.copy()
    if frame == "locked":
        o.putalpha(o.getchannel("A").point(lambda v: int(v * 0.45)))
    plate.alpha_composite(o)
    for size in (512, 100, 38):
        plate.resize((size, size), Image.LANCZOS).save(f"{preview_dir}/neat-{frame}-{size}.png")
print("glass rows", top, bot, "->", gw, "x", gh)
