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


def local_tone_map(img, subject, base_blur=34.0, base=0.52, detail=1.5):
    """Compresses large-scale brightness while keeping local detail.

    THIS IS WHAT THE EAR NEEDED. It is sunlit and sits about 68 levels
    brighter than the cheek, so under k-means it forms its own bright
    cluster, takes its own palette entries, and renders as a flat slab. It
    is not actually featureless - the folds are clearly there in the source -
    but that structure is small compared with the ear's overall offset from
    the face, so every global tool missed it.
    
    A global highlight rolloff cannot fix that: pulling the top of the range
    down drags the ear's detail down with it and flattens the real highlights
    everywhere else, which is exactly what happened and why the picture went
    dull. The quantiser's own unsharp boosts local contrast but leaves the
    offset untouched, so the ear stayed a separate bright cluster.
    
    Splitting luminance into a blurred BASE and the residual DETAIL lets the
    two be treated separately: squash the base so the ear sits nearer the
    face and stops claiming its own palette entries, and lift the detail so
    the folds survive the squashing. Colour is carried by scaling, so hue is
    untouched.
    """
    a = np.asarray(img).astype(np.float32)
    lum = np.maximum(a.mean(2), 1.0)

    def blur(x):
        out = x.astype(np.float32)
        r = max(1, int(base_blur))
        for _ in range(3):
            out = _box(_box(out, r, 0), r, 1)
        return out

    b = blur(lum)
    d = lum - b
    pivot = float(np.median(lum[subject])) if subject.any() else float(np.median(lum))
    out_lum = pivot + (b - pivot) * base + d * detail
    out_lum = np.clip(out_lum, 1.0, 255.0)

    scaled = a * (out_lum / lum)[..., None]
    return Image.fromarray(np.clip(scaled, 0, 255).astype(np.uint8))


def _box(x, r, axis):
    """One box-blur pass along an axis, by cumulative sum."""
    x = np.moveaxis(x, axis, 0)
    pad = np.pad(x, ((r + 1, r), (0, 0)), mode="edge")
    c = np.cumsum(pad, axis=0)
    out = (c[2 * r + 1 :] - c[: -(2 * r + 1)]) / (2 * r + 1)
    return np.moveaxis(out, 0, axis)


def recover_chroma(img, subject, chroma_floor=32, blur=70.0):
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

    THE RADIUS HAS TO EXCEED THE HOLE. A first attempt used 18 pixels on a
    patch about 66 across, so the middle of it received almost no vote from
    real skin, the normalised result came out near zero, and the centre
    stayed exactly as neutral as before - a fix that worked only on the
    edges of the thing it was meant to remove.
    """
    a = np.asarray(img).astype(np.float32)
    lum = a.mean(2)
    chroma = a.max(2) - a.min(2)

    # The ear and the skin behind the jaw measure chroma about 26 against
    # 39-45 for ordinary skin, so the floor sits between them at 32.
    blown = subject & (chroma < chroma_floor) & (lum > np.percentile(lum[subject], 60))
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
    crop = local_tone_map(crop, subject_mask)
    crop = recover_chroma(crop, subject_mask)
    out = Image.composite(crop, Image.new("RGB", crop.size, BACKGROUND), mask)

    # Roll the highlights off before quantising.
    #
    # The sun is behind him, so the rim along the jaw and shoulder clips to
    # white in the source. Sixteen colours have nothing between "bright
    # skin" and "white", so a clipped region lands entirely on white and
    # reads as a blob stuck to his face rather than as light. Compressing
    # the top of the range gives the quantiser something to grade across.
    # NO HEAVY HIGHLIGHT ROLLOFF. An earlier version put the knee at the
    # subject's p90 with a hard ratio, which squeezed p95 and p99 - 151 and
    # 176 - into a ten-level band. It did not remove the pale patch, because
    # that was a chroma problem, and it flattened every real highlight in the
    # picture on the way past. The result was a dull portrait with the blob
    # still in it.
    #
    # A gentle knee near the top of the range is enough to stop the very
    # brightest pixels clipping to the palette's white entry.
    a2 = np.asarray(out).astype(np.float32)
    subject = np.asarray(mask).astype(bool)
    knee = float(np.percentile(a2.mean(2)[subject], 99))
    over = np.clip(a2 - knee, 0, None)
    a2 = np.minimum(a2, knee) + over * 0.7
    out = Image.fromarray(np.clip(a2, 0, 255).astype(np.uint8))

    # Lift it. The gamma and autocontrast above are set to protect the sky,
    # which is now gone, so the subject alone can carry more brightness.
    out = ImageEnhance.Brightness(out).enhance(1.18)
    # Compressing the base costs global contrast, so some goes back on
    # afterwards. Doing it this way round keeps the ear's structure, which
    # a global contrast lift on its own would have clipped straight off.
    out = ImageEnhance.Contrast(out).enhance(1.32)
    out = ImageEnhance.Color(out).enhance(1.10)
    out.save(out_path)
    covered = 100 * bg.mean()
    print(f"{out_path}  background {covered:.0f}% of frame")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else (
        "/home/devops/.paseo/worktrees/0a1k3qja/rebel-hippo/website/public/graphics/dan-square.jpg"
    )
    prepare(src, "/tmp/dan-prepped.png")
