#!/usr/bin/env python3
"""Prepares the sysop portrait for the ANSI quantiser.

Committed because the result is a committed PNG and nobody can reproduce a
hand-edited one. Run from the repo root:

    python3 design/portrait.py

WHY THE SUBJECT IS TRACED BY HAND.

The photograph is backlit: the sun is directly behind his head, so it burns
through beside the hair and along the jaw. Four automatic approaches were
tried and every one failed on the same fact.

Measured on this frame - blue minus red, and luminance:

    open sky              +91   151
    glare wedge, jaw      +13   194
    glare streak, hair    -12   146
    backlit hair itself    ~0   150
    cheek                 -41    91

A colour threshold separates sky from skin with an enormous margin, and
misses both glare regions: the wedge is nearly neutral and the streak is
WARM, on the skin side of any colour test. A brightness threshold does
catch the glare - and catches the backlit hair with it, because they are
the same brightness. Growing the background into bright pixels removed
every white pixel and took a notch out of the back of the head doing it.
Loosening the colour test to reach the wedge at +13 pulled in the hair and
the shirt, both of which reflect blue skylight.

There is no threshold that separates them, because in this photograph they
are not separable by colour or by brightness. So the silhouette is traced
by hand, once. The photograph does not change, and the tracing is data
rather than a guess that has to hold on unseen input.
"""

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

# The region of the original the portrait is taken from.
CROP = (190, 50, 590, 545)

# The subject silhouette, in cropped coordinates, traced against a
# coordinate grid over the photograph. Head, ear, beard and shoulders in;
# sky and glare out.
SUBJECT = [
    (46, 108), (56, 74), (78, 50), (112, 32), (150, 24), (196, 22),
    (232, 30), (262, 46), (288, 68), (304, 94), (314, 124), (319, 155),
    (322, 190), (325, 224), (322, 258), (313, 290), (303, 324), (297, 362),
    (299, 402), (310, 428), (336, 440), (400, 448),
    (400, 495), (0, 495),
    (0, 452), (38, 442), (68, 430), (88, 408), (92, 380), (78, 350),
    (58, 318), (46, 285), (41, 250), (39, 215), (40, 180), (42, 148),
    (44, 126),
]

# A deep navy. Bright blue competes with the subject for attention and eats
# a palette entry the face wants; dark enough and it reads as a ground.
BACKGROUND = (10, 16, 66)


def _box(x, r, axis):
    """One box-blur pass along an axis, by cumulative sum."""
    x = np.moveaxis(x, axis, 0)
    pad = np.pad(x, ((r + 1, r), (0, 0)), mode="edge")
    c = np.cumsum(pad, axis=0)
    out = (c[2 * r + 1 :] - c[: -(2 * r + 1)]) / (2 * r + 1)
    return np.moveaxis(out, 0, axis)


def local_tone_map(img, subject, base_blur=34.0, base=0.52, detail=1.5):
    """Compresses large-scale brightness while keeping local detail.

    THIS IS WHAT THE EAR NEEDED. It is sunlit and sits about 68 levels
    brighter than the cheek, so under k-means it forms its own bright
    cluster, claims its own palette entries, and renders as a flat slab. It
    is not featureless - the folds are plainly there in the source - but
    that structure is small compared with the ear's OFFSET from the face, so
    every global tool missed it.

    A global highlight rolloff cannot fix it: pulling the top of the range
    down drags the ear's detail with it and flattens real highlights
    everywhere else, which is why an earlier version went dull with the slab
    still in it. The quantiser's own unsharp lifts local detail but leaves
    the offset alone, so the ear stayed a separate bright cluster - measured
    at 13 distinct colours either way.

    Splitting luminance into a blurred BASE and the residual DETAIL lets the
    two be treated separately: squash the base so the ear sits nearer the
    face, and lift the detail so the folds survive the squashing. Colour is
    carried by scaling, so hue is untouched.
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
    out_lum = np.clip(pivot + (b - pivot) * base + d * detail, 1.0, 255.0)
    return Image.fromarray(np.clip(a * (out_lum / lum)[..., None], 0, 255).astype(np.uint8))


def prepare(src_path, out_path):
    src = Image.open(src_path).convert("RGB")
    crop = src.crop(CROP)
    crop = ImageOps.autocontrast(crop, cutoff=1)
    # Lift the shadowed face. The gamma is generous because the sky it used
    # to have to protect is masked out rather than tone-mapped.
    crop = Image.eval(crop, lambda v: int(255 * ((v / 255) ** 0.70)))

    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).polygon(SUBJECT, fill=255)
    # Feather by a pixel so the edge does not stair-step against the ground.
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    subject = np.asarray(mask) > 127

    crop = local_tone_map(crop, subject)
    out = Image.composite(crop, Image.new("RGB", crop.size, BACKGROUND), mask)

    # Compressing the base costs global contrast, so some goes back on after.
    # This order matters: a contrast lift applied first would clip the ear
    # structure the tone map just recovered.
    out = ImageEnhance.Brightness(out).enhance(1.18)
    out = ImageEnhance.Contrast(out).enhance(1.32)
    out = ImageEnhance.Color(out).enhance(1.10)
    out.save(out_path)
    print(f"{out_path}  subject {100 * subject.mean():.0f}% of frame")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else (
        "/home/devops/.paseo/worktrees/0a1k3qja/rebel-hippo/website/public/graphics/dan-square.jpg"
    )
    prepare(src, "/tmp/dan-prepped.png")
