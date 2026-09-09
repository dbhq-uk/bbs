#!/usr/bin/env python3
"""Renders a golden ANSI snapshot to PNG, so it can actually be looked at.

The golden snapshots are only worth something if someone judges them by
eye - an unexamined snapshot defends mush forever. `cat` shows them in a
terminal, but that does not work over a tool boundary or in a review, so
this draws one with the board's own 8x16 CP437 font and 16-colour VGA
palette. What you see here is what the browser draws.

    python3 core/tests/fixtures/ansi2png.py <snapshot.snap> <out.png>
"""

import re
import sys

from PIL import Image

FONT = "core/assets/cp437-8x16.bin"

# Must match PALETTE in core/src/screen.rs.
PALETTE = [
    (0, 0, 0), (170, 0, 0), (0, 170, 0), (170, 85, 0),
    (0, 0, 170), (170, 0, 170), (0, 170, 170), (170, 170, 170),
    (85, 85, 85), (255, 85, 85), (85, 255, 85), (255, 255, 85),
    (85, 85, 255), (255, 85, 255), (85, 255, 255), (255, 255, 255),
]

# Same table as ansi::cp437_to_char, so a rendered glyph maps back to the
# byte the core chose.
HIGH = (
    "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»"
    "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀"
    "αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
)
UNI_TO_CP437 = {c: 128 + i for i, c in enumerate(HIGH)}

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


def render(rows, font_bytes, scale=1):
    w = max(len(r) for r in rows) * 8
    h = len(rows) * 16
    im = Image.new("RGB", (w, h), (0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, (byte, fg, bg) in enumerate(row):
            glyph = font_bytes[byte * 16 : byte * 16 + 16]
            for gy in range(16):
                bits = glyph[gy]
                for gx in range(8):
                    on = bits & (0x80 >> gx)
                    px[x * 8 + gx, y * 16 + gy] = PALETTE[fg if on else bg]
    if scale != 1:
        im = im.resize((w * scale, h * scale), Image.NEAREST)
    return im


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    text = open(src, encoding="utf-8").read()
    # insta snapshots carry a YAML header ending in a `---` line.
    if text.startswith("---"):
        text = text.split("---\n", 2)[-1]
    with open(FONT, "rb") as f:
        font_bytes = f.read()
    render(parse(text), font_bytes).save(out)
    print(f"{out}")
