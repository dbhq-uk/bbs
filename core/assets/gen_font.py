#!/usr/bin/env python3
"""Generate core/assets/cp437-8x16.bin.

The obvious route - curl a ROM dump off GitHub - was tried first and both
candidate URLs were dead (8 Sep 2026). A generator is better anyway: the
provenance is this script rather than a link that rots, and the block and
line-drawing glyphs come out geometrically exact rather than inheriting
whatever a particular BIOS dump happened to contain.

Output: 4096 bytes. 256 glyphs, 16 rows each, one byte per row, MSB is the
leftmost pixel. That is the layout core/src/font.rs expects.

Two sources, in order of precedence:

1. Geometric definitions for the shade, block and line-drawing range. These
   are the glyphs the image quantiser actually chooses between, so they must
   be exact - a half block has to be exactly half.
2. A system PSF console font for everything else, mapped through Python's
   cp437 codec so each CP437 byte gets the glyph for the right character.
"""

import gzip
import sys
from pathlib import Path

# Two heights, two files. 8x16 is the 80x25 mode; 8x8 is the 80x50 mode a
# VGA card could switch to, which doubles the rows and so doubles the
# vertical detail available to the image quantiser.
BUILDS = [
    ("/usr/share/consolefonts/Uni2-VGA16.psf.gz", 16, "cp437-8x16.bin"),
    ("/usr/share/consolefonts/Uni2-VGA8.psf.gz", 8, "cp437-8x8.bin"),
]

W = 8

# CP437 0x01-0x1F are SYMBOLS, not control codes.
#
# Python's cp437 codec disagrees: it maps those bytes to U+0000-U+001F,
# the actual control characters, so looking them up in a font finds
# nothing and every one came out blank. The board's arrows, the ► used as
# a menu pointer, the scroll triangles and the card suits were all missing
# and nothing reported it, because the blank-glyph warning below skipped
# everything under 0x20 as "expected".
LOW_SYMBOLS = {
    0x01: "\u263a", 0x02: "\u263b", 0x03: "\u2665", 0x04: "\u2666",
    0x05: "\u2663", 0x06: "\u2660", 0x07: "\u2022", 0x08: "\u25d8",
    0x09: "\u25cb", 0x0A: "\u25d9", 0x0B: "\u2642", 0x0C: "\u2640",
    0x0D: "\u266a", 0x0E: "\u266b", 0x0F: "\u263c", 0x10: "\u25ba",
    0x11: "\u25c4", 0x12: "\u2195", 0x13: "\u203c", 0x14: "\u00b6",
    0x15: "\u00a7", 0x16: "\u25ac", 0x17: "\u21a8", 0x18: "\u2191",
    0x19: "\u2193", 0x1A: "\u2192", 0x1B: "\u2190", 0x1C: "\u221f",
    0x1D: "\u2194", 0x1E: "\u25b2", 0x1F: "\u25bc", 0x7F: "\u2302",
}


def load_psf1(path, H):
    """Returns {unicode_char: [16 row bytes]} from a PSF1 font."""
    data = gzip.open(path, "rb").read()
    if data[:2] != b"\x36\x04":
        sys.exit(f"{path} is not PSF1")
    mode, height = data[2], data[3]
    count = 512 if mode & 0x01 else 256
    if height != H:
        sys.exit(f"expected {H}-row glyphs, got {height}")

    glyphs = [list(data[4 + i * H : 4 + (i + 1) * H]) for i in range(count)]
    if not mode & 0x02:
        sys.exit("font has no unicode table, cannot map reliably")

    table = data[4 + count * H :]
    by_char, i, glyph = {}, 0, 0
    seq = []
    while i + 1 < len(table) and glyph < count:
        v = table[i] | (table[i + 1] << 8)
        i += 2
        if v == 0xFFFF:
            for ch in seq:
                by_char.setdefault(ch, glyphs[glyph])
            seq = []
            glyph += 1
        elif v == 0xFFFE:
            seq = []  # start of a sequence, which we do not use
        else:
            seq.append(chr(v))
    return by_char


def geometric(H):
    """Exact definitions for the glyphs the quantiser picks between."""
    g = {}
    blank = [0x00] * H
    full = [0xFF] * H

    g[0x20] = blank
    g[0xDB] = full
    half = H // 2
    g[0xDF] = [0xFF] * half + [0x00] * (H - half)   # upper half
    g[0xDC] = [0x00] * half + [0xFF] * (H - half)   # lower half
    g[0xDD] = [0xF0] * H                       # left half
    g[0xDE] = [0x0F] * H                       # right half

    # Shades: 25%, 50%, 75% dot patterns on a 2x2 lattice.
    g[0xB0] = [0x88 if r % 2 == 0 else 0x22 for r in range(H)]
    g[0xB1] = [0xAA if r % 2 == 0 else 0x55 for r in range(H)]
    g[0xB2] = [0x77 if r % 2 == 0 else 0xDD for r in range(H)]

    # Small centred square.
    q = max(1, H // 4)
    g[0xFE] = [0x00] * q + [0x7E] * (H - 2 * q) + [0x00] * q

    # Single and double box drawing. Built from a shared helper so the
    # joins line up exactly; a hand-drawn set never quite does.
    V, Hz = 0x18, 0xFF          # vertical stem, horizontal bar
    VL, VR = 0x1C, 0xF8         # left/right stubs meeting the stem
    mid = H // 2

    def box(up, down, left, right, double=False):
        rows = [0x00] * H
        stem = 0x66 if double else V
        bar = 0xFF
        for r in range(H):
            v = 0
            if (up and r < mid) or (down and r > mid):
                v |= stem
            if r == mid:
                if left:
                    v |= 0xF0 | stem
                if right:
                    v |= 0x0F | stem
                if up or down:
                    v |= stem
                if left and right:
                    v |= bar
            rows[r] = v
        return rows

    singles = {
        0xB3: (1, 1, 0, 0), 0xC4: (0, 0, 1, 1), 0xDA: (0, 1, 0, 1),
        0xBF: (0, 1, 1, 0), 0xC0: (1, 0, 0, 1), 0xD9: (1, 0, 1, 0),
        0xC3: (1, 1, 0, 1), 0xB4: (1, 1, 1, 0), 0xC2: (0, 1, 1, 1),
        0xC1: (1, 0, 1, 1), 0xC5: (1, 1, 1, 1),
    }
    for code, (u, d, l, r) in singles.items():
        g[code] = box(u, d, l, r)

    doubles = {
        0xBA: (1, 1, 0, 0), 0xCD: (0, 0, 1, 1), 0xC9: (0, 1, 0, 1),
        0xBB: (0, 1, 1, 0), 0xC8: (1, 0, 0, 1), 0xBC: (1, 0, 1, 0),
        0xCC: (1, 1, 0, 1), 0xB9: (1, 1, 1, 0), 0xCB: (0, 1, 1, 1),
        0xCA: (1, 0, 1, 1), 0xCE: (1, 1, 1, 1),
    }
    for code, (u, d, l, r) in doubles.items():
        g[code] = box(u, d, l, r, double=True)

    # A double horizontal is two bars, not one.
    for code in (0xCD, 0xC9, 0xBB, 0xC8, 0xBC, 0xCB, 0xCA, 0xCE, 0xCC, 0xB9):
        rows = g[code]
        if code == 0xCD:
            rows = [0x00] * (mid - 1) + [0xFF, 0x00, 0xFF] + [0x00] * (H - mid - 2)
            g[code] = rows[:H]

    # The console font has no glyph for these, and a board needs them:
    # 0x10/0x11 are THE menu pointer in BBS art, and the lightbar work
    # depends on one. Drawn geometrically so they are crisp at 8x16 rather
    # than borrowed from whatever a substitute font happens to have.
    def triangle(right=True):
        # Widest in the middle row, tapering both ways. Sized from H so it
        # is the same shape at 8 rows as at 16.
        span = 7 if H >= 16 else 5
        rows = [0x00] * H
        top = (H - span) // 2
        for r in range(span):
            width = min(r, span - 1 - r) + 1
            mask = 0
            for c in range(width):
                mask |= 0x80 >> c if right else 0x01 << c
            rows[top + r] = mask
        return rows

    g[0x10] = triangle(right=True)    # >
    g[0x11] = triangle(right=False)   # <
    g[0x16] = [0x00] * (half - 1) + [0xFF, 0xFF] + [0x00] * (H - half - 1)
    circle = [0x3C, 0x66, 0xC3, 0xC3, 0xC3, 0xC3, 0x66, 0x3C]
    if H < len(circle):
        circle = [0x3C, 0x66, 0xC3, 0xC3, 0x66, 0x3C][:H]
    pad = (H - len(circle)) // 2
    g[0x09] = [0x00] * pad + circle + [0x00] * (H - pad - len(circle))

    _ = (VL, VR, Hz)  # kept for readability of the intent above
    return g


def build(psf, H, name):
    by_char = load_psf1(psf, H)
    geo = geometric(H)

    out = bytearray()
    missing = []
    for code in range(256):
        if code in geo:
            rows = geo[code]
        else:
            if code in LOW_SYMBOLS:
                ch = LOW_SYMBOLS[code]
            else:
                try:
                    ch = bytes([code]).decode("cp437")
                except UnicodeDecodeError:
                    ch = None
            rows = by_char.get(ch)
            if rows is None:
                rows = [0x00] * H
                # 0x00 is a blank cell and 0xFF is a non-breaking space;
                # everything else being blank is a real hole in the font.
                if code not in (0x00, 0xFF):
                    missing.append(code)
        out.extend(bytes(rows[:H]))

    expected = 256 * H
    assert len(out) == expected, (len(out), expected)
    path = Path(__file__).parent / name
    path.write_bytes(bytes(out))
    print(f"wrote {path} ({len(out)} bytes)")
    if missing:
        print(f"  blank glyphs for {len(missing)} codes: "
              + " ".join(f"{c:#04x}" for c in missing))


def main():
    for psf, H, name in BUILDS:
        build(psf, H, name)


if __name__ == "__main__":
    main()
