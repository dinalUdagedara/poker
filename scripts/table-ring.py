"""Where a rendered table's rail falls, as the seat ring needs it.

The ring in `lib/table-seating.ts` is percentages of the felt box the seats are
positioned inside, and the table is a picture. Re-rendering the table moves the
rail, and the ring has to follow — which was guesswork until this measured it.

    python3 scripts/table-ring.py public/table-desktop-salon.png 8.5 6
    python3 scripts/table-ring.py public/table-mobile.png 7.5 6.5

The two numbers are `.table-felt`'s inset in `globals.css`, vertical first.
"""

import sys
import numpy as np
from PIL import Image

# Where the rail's middle sits in a rendered table, as the ring needs it: in
# percentages of the felt box the seats are positioned inside.
path, inset_y, inset_x = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
im = np.array(Image.open(path).convert('RGBA')).astype(np.int16)
a = im[..., 3]
h, w = a.shape
solid = a > 235
rows = np.where(solid.max(axis=1))[0]
cols = np.where(solid.max(axis=0))[0]
green = (im[..., 1] > im[..., 0] + 12) & (im[..., 1] > im[..., 2] + 6) & solid
gr = np.where(green.max(axis=1))[0]
gc = np.where(green.max(axis=0))[0]

rail = {
    'top': (rows[0] + gr[0]) / 2 / h,
    'bottom': (rows[-1] + gr[-1]) / 2 / h,
    'left': (cols[0] + gc[0]) / 2 / w,
    'right': (cols[-1] + gc[-1]) / 2 / w,
}
# The felt box is inset from the stage, and the ring is a percentage of it.
fx, fw = inset_x / 100, 1 - 2 * inset_x / 100
fy, fh = inset_y / 100, 1 - 2 * inset_y / 100
left = (rail['left'] - fx) / fw * 100
right = (rail['right'] - fx) / fw * 100
top = (rail['top'] - fy) / fh * 100
bottom = (rail['bottom'] - fy) / fh * 100
print(f"rx {(right - left) / 2:.1f}  ry {(bottom - top) / 2:.1f}  cy {(top + bottom) / 2:.1f}")
print(f"  (sides {left:.1f} and {right:.1f}, rails {top:.1f} and {bottom:.1f})")
