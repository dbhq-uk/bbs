#!/usr/bin/env python3
"""Prepares the sysop portrait for the ANSI quantiser.

Kept in the repo because the result is committed and nobody can reproduce a
hand-edited PNG. Run from the repo root:

    python3 design/portrait.py <source.jpg>

WHY THE BACKGROUND IS SEGMENTED AND NOT JUST DARKENED.

The photograph is backlit against a bright sky. A first attempt keyed the
background on "blue channel beats red", which caught the sky and missed the
sun's rim light around the head - that came out as a white halo, because it
is bright and NOT blue-dominant, so the colour test had no opinion on it.

A flood fill from the border catches it. The background is connected to the
edge of the frame and the head is not, so a fill that spreads through
anything bright reaches the halo and stops at the hair, wherever the colour
test alone would have given up.
"""

import sys
from collections import deque

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

# The board's blue, so the portrait sits in the palette the rest of the
# board uses rather than introducing a colour of its own.
BACKGROUND = (0, 0, 120)


def prepare(src_path, out_path):
    src = Image.open(src_path).convert("RGB")
    crop = src.crop((190, 50, 590, 545))
    crop = ImageOps.autocontrast(crop, cutoff=1)
    # Lift the shadowed face without blowing the sky.
    crop = Image.eval(crop, lambda v: int(255 * ((v / 255) ** 0.70)))

    a = np.asarray(crop).astype(np.int16)
    r, b = a[..., 0].astype(int), a[..., 2].astype(int)

    # MEASURED, not guessed. Sampling the frame gives blue-minus-red of
    # about +91 across the sky and NEGATIVE everywhere on the subject:
    # forehead -50, cheek -53, beard -35, shirt -39, and the darkest fringe
    # beside the hair -6. So one channel-difference threshold separates them
    # with enormous margin, and +20 sits in the middle of a 26-point gap.
    #
    # An earlier version also treated "bright and almost colourless" as
    # background, reasoning that the sun's rim light is white. It is - and so
    # is sunlit skin, so the flood fill walked through the rim light into the
    # face and ate half of it. The extra clause bought nothing the channel
    # difference did not already have.
    passable = (b - r) > 20

    h, w = passable.shape
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x]:
                q.append((y, x))
                bg[y, x] = True
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x]:
                q.append((y, x))
                bg[y, x] = True

    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and passable[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))

    # Close pinholes, then pull the subject edge in by a pixel.
    #
    # The white fringe around the head was never sky OR subject: it is the
    # blend between them, so its channel difference lands between the two
    # and no threshold catches it. Eroding by one pixel sends that ring to
    # the background, which is where it belongs.
    mask = Image.fromarray(((~bg) * 255).astype(np.uint8))
    mask = mask.filter(ImageFilter.MedianFilter(5))
    mask = mask.filter(ImageFilter.MinFilter(3))

    out = Image.composite(crop, Image.new("RGB", crop.size, BACKGROUND), mask)

    # Roll the highlights off before quantising.
    #
    # The sun is behind him, so the rim along the jaw and shoulder clips to
    # white in the source. Sixteen colours have nothing between "bright
    # skin" and "white", so a clipped region lands entirely on white and
    # reads as a blob stuck to his face rather than as light. Compressing
    # the top of the range gives the quantiser something to grade across.
    a2 = np.asarray(out).astype(np.float32)
    knee = 185.0
    over = np.clip(a2 - knee, 0, None)
    a2 = np.minimum(a2, knee) + over * 0.45
    out = Image.fromarray(np.clip(a2, 0, 255).astype(np.uint8))

    out = ImageEnhance.Contrast(out).enhance(1.12)
    out.save(out_path)
    covered = 100 * bg.mean()
    print(f"{out_path}  background {covered:.0f}% of frame")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else (
        "/home/devops/.paseo/worktrees/0a1k3qja/rebel-hippo/website/public/graphics/dan-square.jpg"
    )
    prepare(src, "/tmp/dan-prepped.png")
