"""Render the Showdown app icons from the crest master.

    npm run icons          # from the repository root

Reads `assets/logo-crest.png` and writes every icon the app serves, so there is
one drawing of the mark rather than one per size. Requires Pillow and numpy,
which are not project dependencies — this is run by hand when the art changes,
not as part of the build, and its output is committed.

The crest arrives on a flat #1e2323 card. That grey-green is not a colour this
app owns, so it is lifted off here and the crest is set on the house ground
instead: the same oxblood radial the room is painted with, under the same brass
hairline every raised object in the app wears along its top edge.
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = "assets/logo-crest.png"

# The room, in sRGB — the values app/opengraph-image.tsx already converts from
# the oklch tokens in globals.css.
ROOM_LIT = (87, 18, 22)  # the lit centre
ROOM_MID = (44, 8, 11)
ROOM_DARK = (27, 4, 5)  # --background
BRASS = (233, 180, 75)  # --brass

# How far a pixel has to sit from the plate colour before it counts as crest.
# Below this it is background, above it is art, and in between it is an
# antialiased edge that gets partly carried over.
EDGE_SPAN = 42.0


def knockout(path):
    """The crest on transparency, with the plate colour divided back out.

    Every edge pixel in the source is some mix of crest and plate. Replacing
    only the pixels that are exactly the plate colour would leave that mix
    behind as a grey-green halo, which on a dark red ground is the one thing
    that would give away that this was cut out of something else. So coverage
    is estimated from distance to the plate, and the plate's own contribution
    is then removed from the colour rather than left in it.
    """
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    rgb = a[..., :3]
    plate = rgb[0, 0].copy()

    dist = np.abs(rgb - plate).max(axis=-1)
    cov = np.clip(dist / EDGE_SPAN, 0.0, 1.0)

    # C = cov*F + (1-cov)*plate  ->  F = (C - (1-cov)*plate) / cov
    safe = np.maximum(cov, 1e-3)[..., None]
    fg = (rgb - (1.0 - cov)[..., None] * plate) / safe
    fg = np.clip(fg, 0, 255)

    out = np.dstack([fg, cov * 255.0]).astype(np.uint8)
    cut = Image.fromarray(out, "RGBA")
    return cut.crop(cut.getbbox())


def room(size, radius):
    """The oxblood ground: one surface lit from above, falling off to the corners."""
    n = size
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    # The centre and radii of .table-room, resolved against a square.
    d = np.sqrt(((x - n * 0.5) / (n * 0.80)) ** 2 + ((y - n * 0.28) / (n * 0.80)) ** 2)
    d = np.clip(d, 0, 1)

    lit, mid, dark = map(np.array, (ROOM_LIT, ROOM_MID, ROOM_DARK))
    t1 = np.clip(d / 0.55, 0, 1)[..., None]
    t2 = np.clip((d - 0.55) / 0.45, 0, 1)[..., None]
    rgb = lit * (1 - t1) + mid * t1
    rgb = rgb * (1 - t2) + dark * t2

    tile = Image.fromarray(np.dstack([rgb, np.full((n, n), 255.0)]).astype(np.uint8), "RGBA")

    if radius:
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=radius, fill=255)
        tile.putalpha(mask)
    return tile


def lit_edge(tile, radius):
    """The brass hairline along the top. Light in this room comes from above, so
    it is drawn across the top arc only and fades out before the sides."""
    n = tile.size[0]
    layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = max(1, round(n / 90))
    d.rounded_rectangle([w / 2, w / 2, n - 1 - w / 2, n - 1 - w / 2], radius=radius, outline=BRASS + (255,), width=w)

    falloff = np.clip(1.0 - (np.mgrid[0:n, 0:n][0].astype(np.float32) / (n * 0.16)), 0, 1) ** 1.6
    arr = np.asarray(layer).astype(np.float32)
    arr[..., 3] *= falloff * 0.5
    return Image.alpha_composite(tile, Image.fromarray(arr.astype(np.uint8), "RGBA"))


def icon(crest, size, radius_frac=0.22, fill=0.78, shadow=True):
    n = size
    radius = round(n * radius_frac)
    tile = lit_edge(room(n, radius), radius) if radius else room(n, 0)

    # Fitted by height: the crest is taller than it is wide, and it is the
    # vertical axis that decides whether it looks cramped in the square.
    h = round(n * fill)
    w = round(crest.size[0] * h / crest.size[1])
    art = crest.resize((w, h), Image.LANCZOS)
    pos = ((n - w) // 2, (n - h) // 2)

    if shadow:
        # The crest sits on the ground rather than in it, so it casts.
        cast = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        cast.paste((0, 0, 0, 150), pos, art)
        cast = cast.filter(ImageFilter.GaussianBlur(n / 64))
        tile = Image.alpha_composite(tile, cast)

    out = tile.copy()
    out.alpha_composite(art, pos)
    return out


crest = knockout(SRC)
print("crest cut to", crest.size)

crest.save("public/mark.png")
icon(crest, 512).save("app/icon.png")
icon(crest, 192).save("public/icon-192.png")
icon(crest, 512).save("public/icon-512.png")
# iOS masks the Apple icon to its own squircle, so this one is drawn full-bleed
# and pulled in a little to survive that crop.
icon(crest, 180, radius_frac=0, fill=0.72, shadow=True).convert("RGB").save("app/apple-icon.png")
print("written")
