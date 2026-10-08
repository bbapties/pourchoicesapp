"""Badge stars (Brian, 2026-10-08): 1-4 stars baked per plate, drawn by Medal over the plate + object.
Four looks, by frame:
  wood            branded black into the face, top of each star on the hoop's inner rim
  bronze, silver  stamped into the ring band, black epoxy fill
  gold            stamped, amber epoxy fill
  diamond         stamped, black diamond dust fill
Metal stars sit midway between the ring's two grooves at 12 o'clock (GEOM, measured off the 1024
plates) and turn to follow the radius. Limited and Locked never show stars on the ladder, so Medal
keeps its flat SVG stars for those.
Output: public/badges/stars/<frame>-<n>.webp, 512 transparent - only the pixels the stars change
(the burn / stamp / fill), so the file can sit over the plate and object.
Usage: python3 scripts/badge_stars.py
"""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
S = 2048
STAR = [(5,.4),(6.35,3.55),(9.75,3.85),(7.15,6.1),(7.95,9.45),(5,7.7),(2.05,9.45),(2.85,6.1),(.25,3.85),(3.65,3.55)]
# star centre radius, star size, angular gap - fractions of the disc, measured off the 1024 plates
# (metal: midway between the two ring grooves at 12 o'clock; wood: top of the star at the hoop's inner rim)
GEOM = dict(
  wood=(.372, .080, 19),
  bronze=(.411, .067, 13), silver=(.410, .067, 13), gold=(.407, .067, 13), diamond=(.407, .067, 13))
FILL = dict(bronze="black", silver="black", gold="amber", diamond="dust", wood="brand")
def angles(n, gap):
    span = gap*(n-1); return [-90 - span/2 + i*gap for i in range(n)] if n else []
def star_mask(n, r, s, gap):
    m = Image.new("L", (S,S), 0); d = ImageDraw.Draw(m)
    for a in angles(n, gap):
        cx = S/2 + r*math.cos(math.radians(a)); cy = S/2 + r*math.sin(math.radians(a))
        rot = math.radians(a + 90)
        pts = [(cx + (px-5)*s/10*math.cos(rot) - (py-5.2)*s/10*math.sin(rot),
                cy + (px-5)*s/10*math.sin(rot) + (py-5.2)*s/10*math.cos(rot)) for px,py in STAR]
        d.polygon(pts, fill=255)
    return m
def layer(mask, color, mul=1.0):
    l = Image.new("RGBA", (S,S), color + (0,)); l.putalpha(mask.point(lambda v: int(min(255, v*mul)))); return l
def radial_fill(m, r, s, top, bot):
    yy, xx = np.mgrid[0:S,0:S]
    k = np.clip((r + s*.5 - np.hypot(xx-S/2, yy-S/2))/s, 0, 1)[...,None]
    f = Image.fromarray((np.array(top)*k + np.array(bot)*(1-k)).astype(np.uint8), "RGB").convert("RGBA"); f.putalpha(m); return f
def stamped(out, m, kind, r, s):
    o = int(S*.0025)
    ring = ImageChops.subtract(m.filter(ImageFilter.MaxFilter(5)), m)
    out.alpha_composite(layer(ring, (0,0,0), .45))
    out.alpha_composite(layer(ImageChops.multiply(ring, ImageChops.offset(m, o, o)).filter(ImageFilter.GaussianBlur(1)), (255,255,255), .85))
    if kind == "black":
        out.alpha_composite(radial_fill(m, r, s, (34,34,37), (3,3,4)))
    elif kind == "amber":
        out.alpha_composite(radial_fill(m, r, s, (232,146,44), (104,40,6)))
    else:  # black diamond dust: near-black ground, dense grey grit, a few hard white glints
        out.alpha_composite(radial_fill(m, r, s, (30,30,34), (6,6,8)))
        rng = np.random.default_rng(7)
        grit = (rng.random((S,S)) ** 6 * 255 * 1.4).clip(0,255).astype(np.uint8)
        g = Image.fromarray(grit, "L").filter(ImageFilter.GaussianBlur(.6))
        out.alpha_composite(layer(ImageChops.multiply(g, m), (200,205,215), 1.6))
        glint = Image.fromarray(((rng.random((S,S)) > .9985) * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
        out.alpha_composite(layer(ImageChops.multiply(glint, m.filter(ImageFilter.MinFilter(5))), (255,255,255), 2.5))
    inner = ImageChops.subtract(m, ImageChops.offset(m.filter(ImageFilter.GaussianBlur(S*.0025)), o, o))
    out.alpha_composite(layer(ImageChops.multiply(inner, m), (0,0,0), .7))
    if kind != "dust":
        core = m.filter(ImageFilter.MinFilter(7))
        gloss = ImageChops.subtract(core, ImageChops.offset(core, int(S*.0035), int(S*.006))).filter(ImageFilter.GaussianBlur(S*.0018))
        out.alpha_composite(layer(gloss, (255,255,255), .45))
def branded(out, m):
    # scorch halo, then a charred core that keeps a hint of the grain (multiply), crisp-ish edge
    halo = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(S*.006))
    out.alpha_composite(layer(halo, (40,22,10), .55))
    base = out.convert("RGB")
    burnt = ImageChops.multiply(base, Image.new("RGB", (S,S), (38,30,26)))
    b = burnt.convert("RGBA"); b.putalpha(m.filter(ImageFilter.GaussianBlur(1.2)))
    out.alpha_composite(b)
    out.alpha_composite(layer(m.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(2)), (8,6,5), .7))
def overlay(frame, n):
    plate = Image.open(f"public/badges/masters/plates-1024/{frame}.webp").convert("RGBA").resize((S,S), Image.LANCZOS)
    rf, sf, gap = GEOM[frame]; r, s = rf*S, sf*S
    m = star_mask(n, r, s, gap)
    out = plate.copy()
    if frame == "wood": branded(out, m)
    else: stamped(out, m, FILL[frame], r, s)
    # keep only the star region (plus the scorch / stamp wall around it)
    region = m.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(4))
    region = ImageChops.multiply(region, plate.getchannel("A"))
    out.putalpha(region)
    return out.resize((512,512), Image.LANCZOS)

if __name__ == "__main__":
    import os
    os.makedirs("public/badges/stars", exist_ok=True)
    for frame in GEOM:
        for n in range(1, 5):
            overlay(frame, n).save(f"public/badges/stars/{frame}-{n}.webp", quality=90)
    print("wrote", len(GEOM) * 4, "star overlays")
