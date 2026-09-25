# Bake die-cut vinyl stickers for the sticker wall and the reaction slot.
# The sprite manifest (sprites/manifest.json, contact sheet sprites/index.html) is the list of what
# exists. Every manifest id is either baked or named in SKIP; anything else fails the run.
# SPRITES only overrides the source PNG (and cut kind) for a manifest id: the bigger originals
# bake cleaner than the committed webps. Output: src/stickers/w_*.webp (wall, 272px),
# src/stickers/h_*.webp (reaction, 440px) and src/stickers/cast.json {id, family, gender, mood, note}.
# The white die-cut rim also fills see-through bodies.
# Run: python3 scripts/bake_stickers.py [id ...]   (needs Pillow, numpy, scipy)
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

T = "/Users/olety/Desktop/temp/yard3-20260925/"
MANIFEST = T + "sprites/manifest.json"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "stickers")
os.makedirs(OUT, exist_ok=True)

SPRITES = {
    # manifest id: (source png, kind)   kind = "bust" (body cut by the frame) or "free" (whole figure)
    "soy_crying": (T + "archetypes/s2.png", "bust"),
    "soy_gaping": (T + "archetypes/s3.png", "bust"),
    "soy_shrimphug": (T + "archetypes/s4.png", "bust"),
    "soy_smug_calc": (T + "archetypes/s5.png", "bust"),
    "soy_crying_soldier": (T + "archetypes/s6.png", "bust"),
    "soy_ewhore": (T + "archetypes/5a.png", "bust"),
    "soy_doomer_otaku": (T + "archetypes/6a.png", "bust"),
    "soldierA_v1_open": (T + "art/cut/soldierA_v1.png", "bust"),
    "soldierA_v1_closed": (T + "art/frames/cut/soldierA_v1_closed.png", "bust"),
    "soldierB_v1_open": (T + "art/cut/soldierB_v1.png", "bust"),
    "soldierB_v1_closed": (T + "art/frames/cut/soldierB_v1_closed.png", "bust"),
    "bug_shrimp": (T + "art/cut/bug_shrimp.png", "free"),
    "bug_ant": (T + "art/cut/bug_ant.png", "free"),
    "bug_bee": (T + "art/cut/bug_bee.png", "free"),
    "bug_bsf": (T + "art/cut/bug_bsf.png", "free"),
    "bug_mealworm": (T + "art/cut/bug_mealworm.png", "free"),
    # second batch (sprites/cut): women in the cast, clean pointing pairs, NPC, chad, trollface head
    "soy_pointing_pair": (T + "sprites/cut/soy_pointing_pair.png", "free"),
    "sjette_pointing_pair": (T + "sprites/cut/sjette_pointing_pair.png", "free"),
    "sjette_pointing": (T + "sprites/cut/sjette_pointing.png", "free"),
    "sjette_crying": (T + "sprites/cut/sjette_crying.png", "bust"),
    "soy_crying_ant": (T + "sprites/cut/soy_crying_ant.png", "bust"),
    "ewhore_delighted": (T + "sprites/cut/ewhore_delighted.png", "bust"),
    "ewhore_selfie": (T + "sprites/cut/ewhore_selfie.png", "bust"),
    "polycule": (T + "sprites/cut/polycule.png", "free"),
    "doomer_girl": (T + "sprites/cut/doomer_girl.png", "bust"),
    "npc_wojak": (T + "sprites/cut/npc_wojak.png", "bust"),
    "chad_yes": (T + "sprites/cut/chad_yes.png", "bust"),
    "trollface_head": (T + "sprites/cut/trollface_head.png", "free"),
    # the purple room: two head-bob frames, cropped to a rounded card by troll()
    "room_1": (T + "art/raw/room.png", "room"),
    "room_2": (T + "art/frames/room_tiltR.png", "room"),
}
# Output name for a manifest id, where the page's name differs.
NAME = {"soldierA_v1_open": "soldierA", "soldierA_v1_closed": "soldierA_closed",
        "soldierB_v1_open": "soldierB", "soldierB_v1_closed": "soldierB_closed",
        "room_1": "troll_1", "room_2": "troll_2"}
# Manifest ids with no sticker: door-scene props and speech bubbles (the page draws its own),
# and soy_pointing (see-through bodies, replaced by soy_pointing_pair).
SKIP = {"door", "door_seethrough", "soy_pointing"}
SKIP_PREFIX = ("bubble_",)
# Also baked at reaction size (h_*), by output name.
HERO = {"soy_crying", "soy_crying_ant", "soy_shrimphug", "soy_smug_calc", "soy_doomer_otaku", "soy_ewhore",
        "soldierA", "soldierA_closed", "soldierB", "soldierB_closed", "troll_1", "troll_2", "sjette_crying",
        "ewhore_selfie", "ewhore_delighted", "polycule", "doomer_girl", "npc_wojak", "chad_yes"}


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def figure_mask(im: Image.Image, kind: str) -> np.ndarray:
    """Solid silhouette of the figure: ink + everything the ink encloses (bodies included)."""
    a = np.asarray(im.getchannel("A")).astype(int)
    rgb = np.asarray(im.convert("RGB")).astype(int)
    if (a < 250).mean() > 0.05:  # already cut RGBA
        solid = a > 24
    else:  # white-ground line art
        solid = rgb.min(axis=2) < 232
    h, w = solid.shape
    solid = ndimage.binary_opening(solid, structure=disk(1))  # drop JPEG-ish specks
    lab, n = ndimage.label(solid)
    if n > 1:  # drop tiny islands far from the figure (noise)
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 60])
        solid = keep
    P = 8
    m = np.pad(solid, P)
    m = ndimage.binary_closing(m, structure=disk(4))
    img = Image.fromarray((m * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    H, W = m.shape
    edge = 3
    if kind == "bust":
        bot = np.where(solid[h - edge:, :].any(axis=0))[0]
        lft = np.where(solid[:, :edge].any(axis=1))[0]
        rgt = np.where(solid[:, w - edge:].any(axis=1))[0]
        lft = lft[lft > h * 0.35]
        rgt = rgt[rgt > h * 0.35]
        pts = []
        if len(lft):
            pts += [(P, P + lft.min()), (P, P + h - 1)]
        elif len(bot):
            pts += [(P + bot.min(), P + h - 1)]
        if len(rgt):
            pts += [(P + w - 1, P + h - 1), (P + w - 1, P + rgt.min())]
        elif len(bot):
            pts += [(P + bot.max(), P + h - 1)]
        if len(pts) >= 2:
            d.line(pts, fill=255, width=6)
    m = np.asarray(img) > 127
    m = ndimage.binary_fill_holes(m)
    return m[P:-P, P:-P] if kind != "bust" else m[P:-P, P:-P]


def sticker(im: Image.Image, fig: np.ndarray, out_long: int, rim_frac=0.034) -> Image.Image:
    ys, xs = np.where(fig)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    long = max(y1 - y0, x1 - x0)
    rim = max(6, int(long * rim_frac))
    pad = rim + 12
    rgba = Image.new("RGBA", im.size, (255, 255, 255, 255))
    rgba.alpha_composite(im)
    rgb = np.asarray(rgba.convert("RGB"))[y0:y1, x0:x1]
    f = fig[y0:y1, x0:x1]
    rgb = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)), constant_values=255)
    f = np.pad(f, pad)
    # White rim = distance-based dilation of the silhouette, smoothed for a die-cut curve.
    dist = ndimage.distance_transform_edt(~f)
    cut = dist <= rim
    cut = ndimage.binary_closing(cut, structure=disk(max(3, rim // 2)))
    cut = ndimage.binary_fill_holes(cut)
    soft = np.asarray(Image.fromarray((cut * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.4))).astype(float)
    alpha = np.clip((soft - 60) * 255 / 135, 0, 255)
    # Keep the art itself: pixels outside the figure but inside the cut are white vinyl.
    art = np.where(f[..., None], rgb, 255).astype(np.uint8)
    # Faint edge line where the vinyl ends.
    edge_d = ndimage.distance_transform_edt(~cut)
    ring = (edge_d > 0) & (edge_d <= max(2, rim * 0.16))
    ring_a = np.where(ring, 70, 0)
    out = np.zeros(art.shape[:2] + (4,), np.uint8)
    out[..., :3] = art
    out[..., 3] = alpha.astype(np.uint8)
    edge = np.zeros_like(out)
    edge[..., :3] = (70, 60, 90)
    edge[..., 3] = ring_a.astype(np.uint8)
    base = Image.fromarray(edge, "RGBA")
    base.alpha_composite(Image.fromarray(out, "RGBA"))
    return finish(base, out_long)


def finish(base: Image.Image, out_long: int) -> Image.Image:
    """Downscale, then add a soft purple-black drop shadow under the vinyl."""
    sh_pad = int(out_long * 0.06)
    inner = out_long - 2 * sh_pad
    base = base.copy()
    base.thumbnail((inner, inner), Image.LANCZOS)
    W, H = base.size
    canvas = Image.new("RGBA", (W + 2 * sh_pad, H + 2 * sh_pad), (0, 0, 0, 0))
    a = base.getchannel("A")
    shadow = Image.new("RGBA", canvas.size, (24, 8, 44, 0))
    sa = Image.new("L", canvas.size, 0)
    off = max(2, int(out_long * 0.022))
    sa.paste(a, (sh_pad, sh_pad + off))
    sa = sa.filter(ImageFilter.GaussianBlur(max(1.5, out_long * 0.018)))
    sa = sa.point(lambda v: int(v * 0.42))
    shadow.putalpha(sa)
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(base, (sh_pad, sh_pad))
    return canvas


def troll(frame_path: str, out_long: int) -> Image.Image:
    im = Image.open(frame_path).convert("RGB")
    s = im.width / 1200
    box = tuple(int(v * s) for v in (300, 70, 1010, 780))
    crop = im.crop(box)
    w, h = crop.size
    r = int(w * 0.09)
    rim = int(w * 0.035)
    W, H = w + 2 * rim, h + 2 * rim
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, W - 1, H - 1), radius=r + rim, fill=255)
    white = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    base.paste(white, (0, 0), m)
    pm = Image.new("L", (w, h), 0)
    ImageDraw.Draw(pm).rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    base.paste(crop, (rim, rim), pm)
    ring = Image.new("RGBA", (W + 4, H + 4), (0, 0, 0, 0))
    rm = Image.new("L", (W + 4, H + 4), 0)
    ImageDraw.Draw(rm).rounded_rectangle((0, 0, W + 3, H + 3), radius=r + rim + 2, fill=70)
    ring.putalpha(rm)
    ring.alpha_composite(base, (2, 2))
    return finish(ring, out_long)


def save(img: Image.Image, name: str, q: int):
    p = os.path.join(OUT, name + ".webp")
    img.save(p, "WEBP", quality=q, method=6, alpha_quality=85)
    return os.path.getsize(p)


def skipped(sid: str) -> bool:
    return sid in SKIP or sid.startswith(SKIP_PREFIX)


manifest = json.load(open(MANIFEST))
unknown = [m["id"] for m in manifest if not skipped(m["id"]) and m["id"] not in SPRITES and not m.get("path")]
if unknown:
    sys.exit(f"manifest ids neither baked nor skipped: {', '.join(unknown)}")

only = set(sys.argv[1:])
total = 0
cast = []
for m in manifest:
    sid = m["id"]
    if skipped(sid):
        continue
    name = NAME.get(sid, sid)
    path, kind = SPRITES.get(sid, (m["path"], "free"))
    if not os.path.exists(path):
        sys.exit(f"{sid}: source missing: {path}")
    if not name.endswith("_closed"):
        cast.append({"id": "w_" + name, "family": m["family"], "gender": m["gender"], "mood": m["mood"], "note": m["note"]})
    if only and sid not in only and name not in only:
        continue
    if kind == "room":
        total += save(troll(path, 272), "w_" + name, 74)
        total += save(troll(path, 440), "h_" + name, 78)
        continue
    im = Image.open(path).convert("RGBA")
    fig = figure_mask(im, kind)
    if not name.endswith("_closed"):
        total += save(sticker(im, fig, 272), "w_" + name, 78)
    if name in HERO:
        total += save(sticker(im, fig, 440), "h_" + name, 80)

with open(os.path.join(OUT, "cast.json"), "w") as f:
    json.dump(cast, f, indent=1)
print("baked", round(total / 1024), "KB;", len(cast), "cast entries")
