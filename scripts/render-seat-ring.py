"""Render the bezel that rings a player's portrait.

A CSS gradient can only fade one colour into another along a line, which is not
what light does to a ring: a band of metal takes a bright catch where it faces
the lamp, a dark one where it turns away, and a narrow specular streak between
the two. So the ring is rendered here, once, the way the table is — a height
field, a normal at every pixel, and a light — and the app loads the picture.

    python3 scripts/render-seat-ring.py [--out PATH]

The result is square, transparent in the middle and outside, and drawn at four
times the size it is used at, so it stays crisp on a phone.
"""

import argparse

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

SIZE = 512
SS = 2  # supersampling

# The band, as fractions of the radius: where the metal starts and stops.
INNER = 0.925
OUTER = 1.0

# Steel rather than brass, and narrow: a rim round a portrait, the way ClubGG
# sets one. A wide gold bead made the frame louder than the face inside it,
# which is the wrong way round — the champagne stays on the lettering.
DARK = np.array([28, 28, 30], np.float32)
MID = np.array([116, 118, 122], np.float32)
LIT = np.array([238, 240, 244], np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='public/seat-ring.png')
    args = parser.parse_args()

    n = SIZE * SS
    axis = (np.arange(n, dtype=np.float32) + 0.5) / n * 2 - 1
    x, y = np.meshgrid(axis, axis)
    r = np.hypot(x, y)

    # The band's cross-section: a half-round bead, highest along its middle.
    mid = (INNER + OUTER) / 2
    half = (OUTER - INNER) / 2
    t = np.clip((r - mid) / half, -1, 1)
    height = np.sqrt(np.clip(1 - t * t, 0, 1))
    band = (r >= INNER) & (r <= OUTER)

    # The surface normal: the bead's own curve across the band, carried round
    # the circle. Straight from the height, which is what a normal is.
    slope = -t / np.maximum(height, 1e-3)
    radial = np.stack([x / np.maximum(r, 1e-6), y / np.maximum(r, 1e-6)], -1)
    normal = np.stack([radial[..., 0] * slope, radial[..., 1] * slope, np.ones_like(slope)], -1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)

    # One lamp, over the player's left shoulder — the same direction the table
    # and every plate on it are lit from.
    light = np.array([-0.45, -0.6, 0.66], np.float32)
    light /= np.linalg.norm(light)
    view = np.array([0.0, 0.0, 1.0], np.float32)
    half_vector = light + view
    half_vector /= np.linalg.norm(half_vector)

    lambert = np.clip(normal @ light, 0, 1)
    spec = np.clip(normal @ half_vector, 0, 1) ** 48

    # Metal is mostly reflection: a little of its own colour, a lot of the room.
    shade = np.clip(0.18 + 0.82 * lambert, 0, 1)[..., None]
    rgb = DARK + (MID - DARK) * shade
    rgb += (LIT - rgb) * np.clip(spec, 0, 1)[..., None] * 0.9

    # A hairline of black inside and out, so the ring reads as set into the
    # seat rather than painted onto it.
    edge = np.clip(1 - np.abs(r - INNER) / 0.012, 0, 1) + np.clip(1 - np.abs(r - OUTER) / 0.012, 0, 1)
    rgb *= 1 - 0.75 * np.clip(edge, 0, 1)[..., None]

    alpha = np.where(band, 1.0, 0.0).astype(np.float32)
    alpha = gaussian_filter(alpha, 1.2)  # antialiasing the two rims

    image = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    out = Image.fromarray(image, 'RGBA').convert('RGBa').resize((SIZE, SIZE), Image.LANCZOS)
    out.convert('RGBA').save(args.out, optimize=True)
    print('wrote', args.out, (SIZE, SIZE))


if __name__ == '__main__':
    main()
