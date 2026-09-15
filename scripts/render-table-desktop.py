"""
Render the desktop table still (public/table-desktop.png).

The phone still came out of an image model on a pure black void, so it cut out
cleanly. The desktop one came back on a lit grey floor the same tone as the
rail, and the knock-out chewed the rim. This draws the table instead: a
stadium-shaped felt and a padded rail, ray-marched as a heightfield through a
tilted camera so the near rail reads fat and the far rail recedes. It lands on
transparency, so there is nothing to knock out.

Colours are sampled from public/table-mobile.png so both poses match.

    python3 scripts/render-table-desktop.py [--out public/table-desktop.png]
"""

import argparse

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

# Output matches the desktop .table-stage (sm:aspect-2/1), so nothing stretches.
OUT_W, OUT_H = 1280, 640
SS = 2  # supersampling

# Table, in plane units (≈ output px at the table's centre).
HALF_STRAIGHT = 300  # half the straight run of the stadium
RADIUS = 238  # felt end radius
RAIL = 50  # rail width
RAIL_H = 30  # rail height
LINE_INSET = 62  # betting line distance inside the rail

# Camera.
PERSPECTIVE = 0.00055  # far side shrinks, near side grows
TILT = 0.90  # vertical squash of the plane
HEIGHT_SCALE = 1.0  # how far a raised point climbs the screen
CENTER_Y = 0.5  # table centre as a fraction of height

FELT_EDGE = np.array([30, 74, 29], np.float32)
FELT_HOT = np.array([66, 128, 62], np.float32)
LINE = np.array([150, 185, 140], np.float32)
RAIL_DARK = np.array([14, 14, 15], np.float32)
RAIL_LIT = np.array([128, 126, 127], np.float32)


def stadium(X, Z):
    """Signed distance to the felt edge, and its unit gradient."""
    qx = np.maximum(np.abs(X) - HALF_STRAIGHT, 0.0)
    length = np.hypot(qx, Z)
    d = length - RADIUS
    safe = np.maximum(length, 1e-6)
    return d, np.sign(X) * qx / safe, Z / safe


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
    parser.add_argument('--out', default='public/table-desktop.png')
    args = parser.parse_args()

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
        d, _, _ = stadium(X, Z)
        new = ~hit & (rail_profile(d) >= h - RAIL_H / steps)
        HX[new], HZ[new] = X[new], Z[new]
        hit |= new

    d, gx, gz = stadium(HX, HZ)
    on_rail = hit & (d >= 0)
    on_felt = hit & (d < 0)

    # Rail: Blinn–Phong on the profile's normal, plus a leather grain.
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
    spec = np.clip(n @ half, 0, 1) ** 70
    t = np.clip(d / RAIL, 0, 1)
    crease = 1.0 - 0.6 * np.exp(-t / 0.05)  # where the cushion meets the felt
    skirt = 1.0 - 0.55 * np.clip((t - 0.72) / 0.28, 0, 1)  # outer edge falls away
    # The phone still's silver catch sits on the inner lip, not the crown.
    lip = np.exp(-(((t - 0.3) / 0.12) ** 2)) * np.clip(n @ light, 0, 1)
    grain = gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 1.2) * 0.05
    shade = (0.16 + 0.42 * lambert**2 + 0.6 * spec + 0.85 * lip) * crease * skirt
    shade = np.clip(shade + grain, 0, 1)
    rail = RAIL_DARK + (RAIL_LIT - RAIL_DARK) * shade[..., None]

    # Felt: an overhead spotlight, darkening into the rail, one betting line.
    spot = np.exp(-((HX / 560) ** 2 + (HZ / 300) ** 2))
    felt = FELT_EDGE + (FELT_HOT - FELT_EDGE) * spot[..., None]
    occlusion = 1.0 - 0.55 * np.exp(np.minimum(d, 0) / 16)
    felt *= occlusion[..., None]
    line = np.clip(1.4 - np.abs(d + LINE_INSET) / 0.9, 0, 1) * 0.28
    felt += (LINE - felt) * line[..., None]
    fibre = rng.normal(0, 2.2, (H, W)).astype(np.float32)
    felt += fibre[..., None]

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

    out.save(args.out, optimize=True)
    print('wrote', args.out, out.size)


if __name__ == '__main__':
    main()
