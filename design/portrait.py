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

# A deep navy. Bright blue competes with the subject for attention and eats
# a palette entry that the face wants; dark enough and it reads as a ground
# rather than as a colour.
BACKGROUND = (10, 16, 66)


def _box(x, r, axis):
    """One box-blur pass along an axis, by cumulative sum."""
    x = np.moveaxis(x, axis, 0)
    pad = np.pad(x, ((r + 1, r), (0, 0)), mode="edge")
    c = np.cumsum(pad, axis=0)
    out = (c[2 * r + 1 :] - c[: -(2 * r + 1)]) / (2 * r + 1)
    return np.moveaxis(out, 0, axis)


def recover_chroma(img, subject, chroma_floor=26, blur=18.0):
    """Rebuilds colour in blown highlights from the skin around them.

    THE BLOB WAS A CHROMA PROBLEM, NOT A TONE ONE. The sun is behind him, so
    the rim along the jaw and neck clips - and clipping destroys colour, not
    just level: that region measured RGB (226,226,224), which is neutral,
    against skin at (156,111,106). Rolling the highlights off made it darker
    and just as grey, so the palette still spent an entry on a big flat
    desaturated patch and it still read as a lump stuck to his face.

    Pushing those pixels toward one median skin hue does not work either -
    it trades a grey flat patch for a warm flat patch. What works is taking
    the colour from the skin ADJACENT to each blown area and leaving the
    luminance alone.

    That is done here by normalised convolution: blur the colour of the
    valid pixels, blur the validity mask itself, and divide. Valid
    neighbours therefore vote in proportion to how close they are, and the
    blown region never votes on its own colour.
    """
    a = np.asarray(img).astype(np.float32)
    lum = a.mean(2)
    chroma = a.max(2) - a.min(2)

    blown = subject & (chroma < chroma_floor) & (lum > np.percentile(lum[subject], 75))
    if not blown.any():
        return img

    valid = subject & ~blown
    # Colour carried as an offset from luminance, so propagating it cannot
    # drag the brightness around with it.
    offset = a - lum[..., None]

    # PIL will not blur a float image, and rounding to 8-bit first would
    # throw away the small offsets this is trying to propagate. Three box
    # passes approximate a Gaussian closely enough and run on floats.
    def smear(x):
        out = x.astype(np.float32)
        r = max(1, int(blur))
        for _ in range(3):
            out = _box(_box(out, r, 0), r, 1)
        return out

    weight = smear(valid.astype(np.float32))
    spread = np.dstack([smear(offset[..., c] * valid) for c in range(3)])
    near = spread / np.maximum(weight, 1e-4)[..., None]

    # Feather the edge of the repair so it does not leave a seam.
    soft = smear(blown.astype(np.float32))
    w = np.clip(soft * 1.6, 0, 1)[..., None] * blown[..., None]

    fixed = lum[..., None] + offset * (1 - w) + near * w
    print(f"  chroma recovered over {100 * blown.mean():.1f}% of frame")
    return Image.fromarray(np.clip(fixed, 0, 255).astype(np.uint8))


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

    subject_mask = np.asarray(mask).astype(bool)
    crop = recover_chroma(crop, subject_mask)
    out = Image.composite(crop, Image.new("RGB", crop.size, BACKGROUND), mask)

    # Roll the highlights off before quantising.
    #
    # The sun is behind him, so the rim along the jaw and shoulder clips to
    # white in the source. Sixteen colours have nothing between "bright
    # skin" and "white", so a clipped region lands entirely on white and
    # reads as a blob stuck to his face rather than as light. Compressing
    # the top of the range gives the quantiser something to grade across.
    # Set from the SUBJECT's own distribution, not a guess. Measured on this
    # frame: median luminance 112, p90 142, p95 175, p99 232 - so the blown
    # rim is a 2.8% sliver sitting a full 100 levels above where the face
    # lives, and neutral grey rather than skin-coloured.
    #
    # A knee at 185 barely moved it and it still landed on the palette's
    # whitest entry, which is why it read as a flat white shape stuck to the
    # jaw. Coming down to the p90 with a hard ratio pulls 226 to about 158,
    # close enough to skin that the quantiser grades into it instead of
    # spending an entry on a highlight that carries no detail anyway.
    a2 = np.asarray(out).astype(np.float32)
    subject = np.asarray(mask).astype(bool)
    knee = float(np.percentile(a2.mean(2)[subject], 90))
    over = np.clip(a2 - knee, 0, None)
    a2 = np.minimum(a2, knee) + over * 0.28
    out = Image.fromarray(np.clip(a2, 0, 255).astype(np.uint8))
    print(f"  highlight knee {knee:.0f}")

    out = ImageEnhance.Contrast(out).enhance(1.12)
    out.save(out_path)
    covered = 100 * bg.mean()
    print(f"{out_path}  background {covered:.0f}% of frame")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else (
        "/home/devops/.paseo/worktrees/0a1k3qja/rebel-hippo/website/public/graphics/dan-square.jpg"
    )
    prepare(src, "/tmp/dan-prepped.png")
