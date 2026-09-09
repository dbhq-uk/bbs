#!/usr/bin/env python3
"""Prepares the sysop portrait for the ANSI quantiser.

Committed because the result is a committed PNG and nobody can reproduce a
hand-edited one. Run from the repo root:

    python3 design/portrait.py

THE PROBLEM. The sun is directly behind his head, so it burns through beside
the hair and along the jaw. Measured on this frame, as blue-minus-red and
luminance:

    open sky                +91   151
    glare wedge, jaw        +13   194    must go
    glare streak, hair      -12   146    must go
    backlit hair itself      ~0   150    must stay
    cheek                   -41    91    must stay
    dark shirt              +15    60    must stay

No threshold on colour or brightness separates those. A colour test misses
both glare regions - one is nearly neutral, the other is WARM, on the skin
side of any such test. A brightness test takes the glare and the backlit hair
together, because they are the same brightness. Loosening the colour test to
reach the wedge pulls in the shirt, which reflects skylight. Each was tried
and each failed.

THE ANSWER IS NOT A BETTER THRESHOLD ON THE PIXEL. It is that the sky is a
smooth gradient and a person is not. Fit the sky as a quadratic surface over
the pixels that are unambiguously sky, then ask every pixel how far it sits
from what the sky ought to be at that position:

    sky                7.9
    glare wedge       34.3
    glare streak      56.6
    cheek             83.0
    backlit hair     118.3

The glare is sky - blown out, but still sky, and still close to what the
fitted surface predicts there. Hair and skin are nowhere near it. One
threshold now separates them with room to spare, and because the mask is a
flood fill from the frame edge the boundary is the photograph's own, following
individual strands of hair.

A hand-traced polygon was tried before this and is what NOT to do: 37 straight
segments cannot follow hair, so it changed the shape of his head. The edge has
to come from the picture.
"""

import sys
from collections import deque

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

CROP = (190, 50, 590, 545)

# A deep navy. Bright blue competes with the subject for attention and eats a
# palette entry the face wants; dark enough and it reads as a ground.
BACKGROUND = (10, 16, 66)

# How far from the fitted sky a pixel may sit and still count as sky. 55 falls
# between the glare streak at 56.6 and the cheek at 83. At 65 it leaks into
# the forehead, which is obvious the moment the mask is viewed as an overlay.
SKY_RESIDUAL = 55.0


def _box(x, r, axis):
    """One box-blur pass along an axis, by cumulative sum."""
    x = np.moveaxis(x, axis, 0)
    pad = np.pad(x, ((r + 1, r), (0, 0)), mode="edge")
    c = np.cumsum(pad, axis=0)
    out = (c[2 * r + 1 :] - c[: -(2 * r + 1)]) / (2 * r + 1)
    return np.moveaxis(out, 0, axis)


def subject_mask(a):
    """The subject, as a boolean, by fitting the sky and flood-filling.

    The fit is refined once with outliers dropped, so a bright cloud cannot
    drag the surface toward itself and widen what counts as sky.
    """
    h, w, _ = a.shape
    r, b = a[..., 0], a[..., 2]
    ys, xs = np.mgrid[0:h, 0:w]
    X = np.stack([np.ones_like(ys), xs, ys, xs**2, xs * ys, ys**2], -1).astype(float)

    sure = (b - r) > 35
    pred = np.zeros_like(a)
    fit_on = sure.copy()
    for _ in range(2):
        for ch in range(3):
            coef, *_ = np.linalg.lstsq(X[fit_on], a[..., ch][fit_on], rcond=None)
            pred[..., ch] = X @ coef
        resid = np.abs(a - pred).mean(2)
        fit_on = sure & (resid < np.percentile(resid[sure], 90))

    passable = np.abs(a - pred).mean(2) < SKY_RESIDUAL

    # Only what is connected to the frame edge. Anything sky-coloured but
    # enclosed by the subject - a catchlight in an eye - stays.
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and passable[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return ~bg


def local_tone_map(img, subject, base_blur=34.0, base=0.68, detail=1.35):
    """Compresses large-scale brightness while keeping local detail.

    This is what the ear needed. It is sunlit and sits about 68 levels
    brighter than the cheek, so under k-means it forms its own bright cluster,
    claims its own palette entries, and renders as a flat slab. It is not
    featureless - the folds are plainly there - but that structure is small
    compared with the ear's OFFSET from the face, so every global tool missed
    it.

    Splitting luminance into a blurred BASE and the residual DETAIL lets them
    be treated separately: squash the base so the ear sits nearer the face,
    lift the detail so the folds survive. Colour rides along by scaling, so
    hue is untouched.

    `base` is deliberately mild. An earlier 0.52 flattened the modelling of
    the entire face to fix one ear, which is a bad trade.
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


def prepare(src_path, out_path, overlay_path=None):
    src = Image.open(src_path).convert("RGB")
    crop = ImageOps.autocontrast(src.crop(CROP), cutoff=1)
    crop = Image.eval(crop, lambda v: int(255 * ((v / 255) ** 0.70)))

    subject = subject_mask(np.asarray(crop).astype(float))

    # The mask is checked as an OVERLAY on the photograph before anything is
    # rendered. Every failed attempt at this was obvious in the mask and
    # invisible in the output, which is where I kept looking instead.
    if overlay_path:
        ov = np.asarray(crop).copy()
        ov[~subject] = (ov[~subject] * 0.25 + np.array([255, 0, 0]) * 0.75).astype(np.uint8)
        Image.fromarray(ov).save(overlay_path)

    m = Image.fromarray((subject * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3))
    m = m.filter(ImageFilter.GaussianBlur(0.6))

    toned = local_tone_map(crop, subject)
    out = Image.composite(toned, Image.new("RGB", crop.size, BACKGROUND), m)

    # Contrast goes back on AFTER the tone map. The other order clips the ear
    # structure the tone map has just recovered.
    out = ImageEnhance.Brightness(out).enhance(1.06)
    out = ImageEnhance.Contrast(out).enhance(1.14)
    out = ImageEnhance.Color(out).enhance(1.06)
    out.save(out_path)
    print(f"{out_path}  subject {100 * subject.mean():.0f}% of frame")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else (
        "/home/devops/.paseo/worktrees/0a1k3qja/rebel-hippo/website/public/graphics/dan-square.jpg"
    )
    prepare(src, "/tmp/dan-prepped.png", "/tmp/dan-mask-overlay.png")
