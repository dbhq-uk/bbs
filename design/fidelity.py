#!/usr/bin/env python3
"""Compares ways of getting more detail out of text mode, all period-correct.

Answers the question "how much higher can this go while staying realistic",
by rendering the same portrait four ways and letting the eye decide.

  A  what the board does now      80x25, 8x16 cells, fixed VGA palette
  B  custom palette               same cells, 16 colours chosen for THIS
                                  image and snapped to the VGA DAC's 6 bits
                                  per channel. This is what XBIN does, and
                                  what ACiD invented it for in 1996.
  C  80x50                        8x8 cells, fixed palette. A real VGA text
                                  mode; twice the rows, so twice the
                                  vertical samples.
  D  both                         8x8 cells and a custom palette.

Every one of these ran on 1990s hardware. Nothing here needs truecolour,
Unicode, or a terminal from this century.

Half-block rendering throughout: a cell drawn as the upper-half block glyph
carries two independent colours, one above the other, so a cell is two
colour samples rather than one. That is not a trick - it is how the scene
drew photographic ANSI.
"""

import os
import sys

import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "out")

# The board's fixed palette - see core/src/screen.rs.
VGA16 = np.array([
    (0, 0, 0), (170, 0, 0), (0, 170, 0), (170, 85, 0),
    (0, 0, 170), (170, 0, 170), (0, 170, 170), (170, 170, 170),
    (85, 85, 85), (255, 85, 85), (85, 255, 85), (255, 255, 85),
    (85, 85, 255), (255, 85, 255), (85, 255, 255), (255, 255, 255),
], dtype=np.float64)


def dac6(rgb):
    """Snap to the VGA DAC's 6 bits per channel.

    The hardware could show 262,144 colours and only 16 at a time. A custom
    palette is therefore period-correct in the strictest sense: it is what
    the DAC registers were for, and every XBIN piece relies on it.
    """
    return np.round(np.round(rgb / 255 * 63) / 63 * 255)


def kmeans_palette(pixels, k=16, iters=24, seed=0):
    """Sixteen colours chosen FOR this image rather than for DOS."""
    rng = np.random.default_rng(seed)
    centres = pixels[rng.choice(len(pixels), k, replace=False)].astype(np.float64)
    for _ in range(iters):
        d = ((pixels[:, None, :] - centres[None, :, :]) ** 2).sum(2)
        who = d.argmin(1)
        for i in range(k):
            hit = pixels[who == i]
            if len(hit):
                centres[i] = hit.mean(0)
    return dac6(centres)


def render(img, cols, cell_w, cell_h, palette, scale=1):
    """Half-block render: two colour samples per cell, stacked."""
    # Each cell is two samples tall, so the sample grid is cols x (rows*2).
    aspect = cell_h / cell_w
    rows = max(1, int(round(img.height / img.width * cols / aspect)))
    grid = img.resize((cols, rows * 2), Image.LANCZOS)
    a = np.asarray(grid, dtype=np.float64).reshape(-1, 3)

    d = ((a[:, None, :] - palette[None, :, :]) ** 2).sum(2)
    idx = d.argmin(1).reshape(rows * 2, cols)

    out = Image.new("RGB", (cols * cell_w, rows * cell_h))
    px = out.load()
    half = cell_h // 2
    for cy in range(rows):
        for cx in range(cols):
            top = tuple(int(v) for v in palette[idx[cy * 2, cx]])
            bot = tuple(int(v) for v in palette[idx[cy * 2 + 1, cx]])
            for y in range(cell_h):
                colour = top if y < half else bot
                for x in range(cell_w):
                    px[cx * cell_w + x, cy * cell_h + y] = colour
    if scale != 1:
        out = out.resize((out.width * scale, out.height * scale), Image.NEAREST)
    return out, rows


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/dan-black.png"
    img = Image.open(src).convert("RGB")
    os.makedirs(OUT, exist_ok=True)

    small = img.resize((160, 160), Image.LANCZOS)
    custom = kmeans_palette(np.asarray(small, dtype=np.float64).reshape(-1, 3))

    cols = 46
    jobs = [
        ("A-now", cols, 8, 16, VGA16),
        ("B-custom-palette", cols, 8, 16, custom),
        ("C-80x50", cols, 8, 8, VGA16),
        ("D-both", cols, 8, 8, custom),
    ]
    for name, c, cw, ch, pal in jobs:
        out, rows = render(img, c, cw, ch, pal)
        path = f"{OUT}/fidelity-{name}.png"
        out.save(path)
        print(f"{path:52} {c}x{rows} cells  {c}x{rows*2} colour samples")


if __name__ == "__main__":
    main()
