#!/usr/bin/env python3
"""Renders a golden ANSI snapshot to PNG, so it can actually be looked at.

The golden snapshots are only worth something if someone judges them by
eye - an unexamined snapshot defends mush forever. `cat` shows them in a
terminal, but that does not work over a tool boundary or in a review, so
this draws one with the board's own 8x16 CP437 font and 16-colour VGA
palette. What you see here is what the browser draws.

    python3 core/tests/fixtures/ansi2png.py <snapshot.snap> <out.png>
"""

import os
import re
import sys

from PIL import Image

FONT = os.environ.get("BBS_FONT", "core/assets/cp437-8x16.bin")

# Must match PALETTE in core/src/screen.rs.
PALETTE = [
    (0, 0, 0), (170, 0, 0), (0, 170, 0), (170, 85, 0),
    (0, 0, 170), (170, 0, 170), (0, 170, 170), (170, 170, 170),
    (85, 85, 85), (255, 85, 85), (85, 255, 85), (255, 255, 85),
    (85, 85, 255), (255, 85, 255), (85, 255, 255), (255, 255, 255),
]

# CP437 uses 0x01-0x1F for symbols, not control codes: arrows, suits, notes.
# Without these the arrow keys in a menu hint render as blank, which is how
# they were first missed.
LOW = "\u263a\u263b\u2665\u2666\u2663\u2660\u2022\u25d8\u25cb\u25d9\u2642\u2640\u266a\u266b\u263c"
LOW += "\u25ba\u25c4\u2195\u203c\u00b6\u00a7\u25ac\u21a8\u2191\u2193\u2192\u2190\u221f\u2194\u25b2\u25bc"

# Same table as ansi::cp437_to_char, so a rendered glyph maps back to the
# byte the core chose.
HIGH = (
    "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»"
    "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀"
    "αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
)
UNI_TO_CP437 = {c: 128 + i for i, c in enumerate(HIGH)}
UNI_TO_CP437.update({c: 1 + i for i, c in enumerate(LOW)})

SGR = re.compile(r"\x1b\[([0-9;]*)m")


def cp437(ch):
    if ch in UNI_TO_CP437:
        return UNI_TO_CP437[ch]
    o = ord(ch)
    return o if o < 128 else 0


def parse(text):
    """ANSI text -> rows of (byte, fg, bg)."""
    rows = []
    fg, bg = 7, 0
    for line in text.split("\n"):
        row = []
        i = 0
        while i < len(line):
            m = SGR.match(line, i)
            if m:
                for part in m.group(1).split(";"):
                    if not part:
                        continue
                    n = int(part)
                    if n == 0:
                        fg, bg = 7, 0
                    elif 30 <= n <= 37:
                        fg = n - 30
                    elif 90 <= n <= 97:
                        fg = n - 90 + 8
                    elif 40 <= n <= 47:
                        bg = n - 40
                    elif 100 <= n <= 107:
                        bg = n - 100 + 8
                i = m.end()
                continue
            row.append((cp437(line[i]), fg, bg))
            i += 1
        if row:
            rows.append(row)
    return rows


def render(rows, font_bytes, scale=1, pixel_aspect=1.0):
    """`pixel_aspect` matches what the browser does at display time.

    These text modes ran on 4:3 glass, so their pixels were taller than
    wide - 1056x480 is 2.20:1 and no monitor was that shape. Without this a
    preview looks stretched flat and nothing like the board.
    """
    cell_h = len(font_bytes) // 256
    w = max(len(r) for r in rows) * 8
    h = len(rows) * cell_h
    im = Image.new("RGB", (w, h), (0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, (byte, fg, bg) in enumerate(row):
            glyph = font_bytes[byte * cell_h : (byte + 1) * cell_h]
            for gy in range(cell_h):
                bits = glyph[gy]
                for gx in range(8):
                    on = bits & (0x80 >> gx)
                    px[x * 8 + gx, y * cell_h + gy] = PALETTE[fg if on else bg]
    if scale != 1:
        im = im.resize((w * scale, h * scale), Image.NEAREST)
    if pixel_aspect != 1.0:
        im = im.resize((im.width, round(im.height * pixel_aspect)), Image.NEAREST)
    return im


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    # A custom palette makes the cell values indices into sixteen colours
    # that exist only for that image, so it has to travel with the art.
    if len(sys.argv) > 3:
        hexes = sys.argv[3].split(",")
        PALETTE[:] = [
            (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)) for h in hexes
        ]
    text = open(src, encoding="utf-8").read()
    # insta snapshots carry a YAML header ending in a `---` line.
    if text.startswith("---"):
        text = text.split("---\n", 2)[-1]
    with open(FONT, "rb") as f:
        font_bytes = f.read()
    aspect = float(os.environ.get("BBS_PIXEL_ASPECT", "1"))
    render(parse(text), font_bytes, pixel_aspect=aspect).save(out)
    print(f"{out}")
