"""
Render the desktop table still (public/table-desktop.png).

The phone still came out of an image model on a pure black void, so it cut out
cleanly. The desktop one came back on a lit grey floor the same tone as the
rail, and the knock-out chewed the rim. This draws the table instead: an oval
felt and a padded rail, ray-marched as a heightfield through a tilted camera so
the near rail reads a little fuller and the far rail recedes. It lands on
transparency, so there is nothing to knock out.

The look is a card room's, not a render's: a slim near-black leather rail with
one thin catch of light along its inner lip, rather than a puffy grey tube, and
a rich green cloth lit brightest in the middle with its weave showing. The ends
are elliptical rather than half-circles, which rounds the oval off without
changing its width or depth — so the felt still lands where the seat ring
expects it.

The Salon skin is the same table in a private room's colours: a deeper racing
green, a champagne betting line, and a thin champagne strip set into the rail
where it meets the cloth. The geometry, camera and light are untouched, so the
seat ring lands on it exactly as it does on the house table.

    python3 scripts/render-table.py [--skin house|salon] [--pose desktop|mobile] [--out PATH]
"""

import argparse

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

# Output matches the desktop .table-stage (sm:aspect-2/1), so nothing stretches.
OUT_W, OUT_H = 1280, 640
SS = 2  # supersampling

# The phone pose: the same table stood on its end, in the 3:4 box the portrait
# stage gives it. Its extents are chosen to land on the oval the old hand-made
# picture had, because the seat ring in `table-seating.ts` was measured against
# that one — a table a few pixels wider would put every plate off the rail.
MOBILE = {
    'out_w': 864,
    'out_h': 1152,
    'half_straight': 188,  # the straight run, now up and down the screen
    'end_x': 248,  # semi-axis across the table
    'end_z': 188,  # semi-axis at each end
    'rail': 42,
    'tilt': 0.86,
    'out': 'public/table-mobile.png',
}

# Whether the straight run of the stadium lies across the screen (desktop) or
# up and down it (the phone).
VERTICAL = False

# Table, in plane units (≈ output px at the table's centre). The felt spans
# HALF_STRAIGHT + END_X either side and END_Z front and back — the same
# extents as before the ends were rounded.
HALF_STRAIGHT = 230  # half the straight run along the sides
END_X = 308  # each end's semi-axis across the table
END_Z = 238  # each end's semi-axis front to back
RAIL = 40  # rail width
RAIL_H = 30  # rail height
LINE_INSET = 48  # betting line distance inside the rail

# Camera.
PERSPECTIVE = 0.00075  # far side shrinks, near side grows
TILT = 0.7  # vertical squash of the plane
HEIGHT_SCALE = 1.0  # how far a raised point climbs the screen
CENTER_Y = 0.5  # table centre as a fraction of height

RAIL_DARK = np.array([8, 8, 9], np.float32)
RAIL_LIT = np.array([158, 155, 154], np.float32)

# What changes between skins: the cloth, the betting line, and whether the rail
# carries a metal inlay. `line_strength` is how strongly the line is printed
# and `line_width` how wide, in plane units.
SKINS = {
    'house': {
        'felt_edge': [22, 66, 26],
        'felt_hot': [70, 142, 64],
        'line': [150, 196, 140],
        'line_strength': 0.22,
        'line_width': 0.9,
        'inlay': None,
        'out': 'public/table-desktop.png',
    },
    'salon': {
        'felt_edge': [9, 33, 23],
        'felt_hot': [54, 120, 82],
        'line': [214, 196, 150],
        # A quarter of what it was: enough of an edge to hold the ring of
        # seats together, not enough to read as a drawn-on circle.
        'line_strength': 0.15,
        'line_width': 1.8,
        'inlay': [205, 184, 138],
        'out': 'public/table-desktop-salon.png',
    },
}


def felt_edge(X, Z):
    """Signed distance to the felt edge: a stadium whose ends are ellipses.

    iq's approximation for an ellipse, applied past the straight run. Exact along
    the sides and at the tips, and close enough between them that the rail's
    width does not visibly swell round the ends.

    Standing the table up is the same maths with the two axes exchanged: the
    straight run goes up and down the screen, and the ends are at the top and
    bottom.
    """
    if VERTICAL:
        a, b, ea, eb = Z, X, END_Z, END_X
    else:
        a, b, ea, eb = X, Z, END_X, END_Z
    q = np.maximum(np.abs(a) - HALF_STRAIGHT, 0.0)
    k0 = np.hypot(q / ea, b / eb)
    k1 = np.hypot(q / (ea * ea), b / (eb * eb))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def felt_normal(X, Z):
    """Unit gradient of the felt edge distance, taken numerically."""
    e = 0.5
    gx = (felt_edge(X + e, Z) - felt_edge(X - e, Z)) / (2 * e)
    gz = (felt_edge(X, Z + e) - felt_edge(X, Z - e)) / (2 * e)
    length = np.maximum(np.hypot(gx, gz), 1e-6)
    return gx / length, gz / length


def rail_profile(d):
    """Height across the rail: rises out of the felt, crowns, drops to a skirt."""
    t = np.clip(d / RAIL, 0.0, 1.0)
    dome = np.sqrt(np.clip(1.0 - ((t - 0.5) / 0.5) ** 2, 0.0, 1.0))
    inner = RAIL_H * dome
    outer = RAIL_H * (0.5 + 0.5 * dome)
    h = np.where(t < 0.5, inner, outer)
    h = np.where(d < 0, 0.0, h)
    return np.where(d > RAIL, -1.0, h)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skin', choices=sorted(SKINS), default='house')
    parser.add_argument('--pose', choices=['desktop', 'mobile'], default='desktop')
    parser.add_argument('--out')
    # Overrides, for trying a cloth without editing the skin: how strongly the
    # betting line is printed, and how far the overhead light spreads before it
    # falls away to the deep green under the rail.
    parser.add_argument('--line-strength', type=float)
    parser.add_argument('--spot', type=float, default=1.0)
    args = parser.parse_args()
    skin = SKINS[args.skin]
    out_path = args.out or skin['out']

    global OUT_W, OUT_H, HALF_STRAIGHT, END_X, END_Z, RAIL, TILT, VERTICAL
    if args.pose == 'mobile':
        OUT_W, OUT_H = MOBILE['out_w'], MOBILE['out_h']
        HALF_STRAIGHT = MOBILE['half_straight']
        END_X, END_Z = MOBILE['end_x'], MOBILE['end_z']
        RAIL = MOBILE['rail']
        TILT = MOBILE['tilt']
        VERTICAL = True
        out_path = args.out or MOBILE['out']
    FELT_EDGE = np.array(skin['felt_edge'], np.float32)
    FELT_HOT = np.array(skin['felt_hot'], np.float32)
    LINE = np.array(skin['line'], np.float32)

    W, H = OUT_W * SS, OUT_H * SS
    rng = np.random.default_rng(7)

    # Screen → plane, in output-pixel units centred on the table.
    xs = (np.arange(W, dtype=np.float32) + 0.5) / SS - OUT_W / 2
    ys = OUT_H * CENTER_Y - (np.arange(H, dtype=np.float32) + 0.5) / SS
    sx, sy = np.meshgrid(xs, ys)  # sy grows upward

    def plane_at(h):
        # sy = (TILT*Z + HEIGHT_SCALE*h) / (1 + PERSPECTIVE*Z), solved for Z.
        Z = (sy - HEIGHT_SCALE * h) / (TILT - sy * PERSPECTIVE)
        X = sx * (1.0 + PERSPECTIVE * Z)
        return X, Z

    # March from above the rail down to the felt; keep the first surface hit.
    hit = np.zeros((H, W), bool)
    HX = np.zeros((H, W), np.float32)
    HZ = np.zeros((H, W), np.float32)
    steps = 96
    for h in np.linspace(RAIL_H, 0.0, steps):
        X, Z = plane_at(h)
        d = felt_edge(X, Z)
        new = ~hit & (rail_profile(d) >= h - RAIL_H / steps)
        HX[new], HZ[new] = X[new], Z[new]
        hit |= new

    d = felt_edge(HX, HZ)
    gx, gz = felt_normal(HX, HZ)
    on_rail = hit & (d >= 0)
    on_felt = hit & (d < 0)

    # Rail: matte leather. Mostly dark, one thin catch of light on the inner
    # lip, a soft sheen on the crown, and a grain at two scales.
    eps = 0.5
    slope = (rail_profile(d + eps) - rail_profile(np.maximum(d - eps, 0))) / (2 * eps)
    n = np.stack([-slope * gx, np.ones_like(d), -slope * gz], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    light = np.array([-0.25, 1.0, -0.45])
    light /= np.linalg.norm(light)
    view = np.array([0.0, 0.75, -1.0])
    view /= np.linalg.norm(view)
    half = light + view
    half /= np.linalg.norm(half)
    lambert = np.clip(n @ light, 0, 1)
    spec = np.clip(n @ half, 0, 1) ** 60
    t = np.clip(d / RAIL, 0, 1)
    crease = 1.0 - 0.7 * np.exp(-t / 0.05)  # where the cushion meets the felt
    skirt = 1.0 - 0.6 * np.clip((t - 0.7) / 0.3, 0, 1)  # outer edge falls away
    lip = np.exp(-(((t - 0.17) / 0.06) ** 2)) * np.clip(n @ light, 0, 1)
    # A fainter catch along the outer rim, so the rail reads as a cushion with
    # an edge on both sides rather than a black band.
    rim = np.exp(-(((t - 0.8) / 0.07) ** 2)) * np.clip(n @ light, 0, 1)
    grain = (
        gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 1.0) * 0.07
        + gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 3.0) * 0.05
    )
    shade = (0.06 + 0.42 * lambert**3 + 0.34 * spec + 0.95 * lip + 0.34 * rim) * crease * skirt
    shade = np.clip(shade + grain, 0, 1)
    rail = RAIL_DARK + (RAIL_LIT - RAIL_DARK) * shade[..., None]

    # A strip of metal set into the leather just off the cloth. Lit like metal
    # rather than leather: it takes the same catch as the lip, only brighter, so
    # it reads on the far rail and is hidden behind the crown on the near one,
    # which is where a real inlay goes out of sight too.
    if skin['inlay'] is not None:
        inlay = np.clip(1.0 - np.abs(t - 0.075) / 0.022, 0, 1)
        sheen = np.clip(0.45 + 0.5 * lambert + 0.9 * spec + 0.6 * lip, 0, 1.3)
        metal = np.array(skin['inlay'], np.float32) * sheen[..., None]
        rail += (metal - rail) * inlay[..., None]

    # Felt: an overhead light brightest in the middle, falling off to a deep
    # green under the rail, one betting line, and the cloth's weave.
    spot = np.exp(-((HX / (620 * args.spot)) ** 2 + (HZ / (340 * args.spot)) ** 2))
    felt = FELT_EDGE + (FELT_HOT - FELT_EDGE) * spot[..., None]
    occlusion = 1.0 - 0.78 * np.exp(np.minimum(d, 0) / 22)
    felt *= occlusion[..., None]
    line_strength = skin['line_strength'] if args.line_strength is None else args.line_strength
    if line_strength > 0:
        line = np.clip(1.4 - np.abs(d + LINE_INSET) / skin['line_width'], 0, 1) * line_strength
        felt += (LINE - felt) * line[..., None]
    weave = (
        rng.normal(0, 3.2, (H, W)).astype(np.float32)
        + gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 0.7) * 5.0
    )
    felt += weave[..., None] * np.array([0.6, 1.0, 0.6], np.float32)

    rgb = np.zeros((H, W, 3), np.float32)
    rgb[on_felt] = felt[on_felt]
    rgb[on_rail] = rail[on_rail]
    alpha = hit.astype(np.float32) * 255

    img = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    out = Image.fromarray(img, 'RGBA').convert('RGBa')
    out = out.resize((OUT_W, OUT_H), Image.LANCZOS).convert('RGBA')


    # Perspective pulls the oval off-centre; sit it in the middle of the box.
    rows = np.where(np.array(out)[:, :, 3].max(axis=1) > 8)[0]
    shift = (OUT_H - 1 - rows[-1] - rows[0]) // 2
    centred = Image.new('RGBA', out.size)
    centred.paste(out, (0, shift))
    out = centred
    print('table rows', rows[0] + shift, '..', rows[-1] + shift)

    # Perspective pulls the oval off-centre; sit it in the middle of the box.
    rows = np.where(np.array(out)[:, :, 3].max(axis=1) > 8)[0]
    shift = (OUT_H - 1 - rows[-1] - rows[0]) // 2
    centred = Image.new('RGBA', out.size)
    centred.paste(out, (0, shift))
    out = centred
    print('table rows', rows[0] + shift, '..', rows[-1] + shift)

    # A table too big for its box is cut off flat at the canvas edge, which
    # reads as a table sliced through — and is easy to miss in a thumbnail.
    # Checked before the centring below, which slides a cut edge inboard and
    # leaves the flat cut looking like a deliberate straight rail.
    edge = np.array(out)[:, :, 3]
    touching = [
        name
        for name, strip in (
            ('top', edge[0]),
            ('bottom', edge[-1]),
            ('left', edge[:, 0]),
            ('right', edge[:, -1]),
        )
        if strip.max() > 8
    ]
    if touching:
        print('WARNING: the table runs off the', ', '.join(touching), '— it will look cut off')

    out.save(out_path, optimize=True)
    print('wrote', out_path, out.size)


if __name__ == '__main__':
    main()
