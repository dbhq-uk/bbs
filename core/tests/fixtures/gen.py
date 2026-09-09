#!/usr/bin/env python3
"""Generates the synthetic golden-snapshot fixtures.

Kept in the repo, like core/assets/gen_font.py, so the fixtures are
reproducible rather than mystery binaries. Run from the repo root:

    python3 core/tests/fixtures/gen.py

Two of the four fixtures are generated here. The other two are not:

  portrait.png  a real photograph, because a synthetic face cannot tell you
                whether the quantiser makes a recognisable portrait or mush,
                which is the entire question. Commodore Grace Hopper, USN,
                photographed by James S. Davis - public domain as a work of
                the US Federal Government, and about as apt as a test image
                for a bulletin board gets.

  logo.png      the shell's own hero asset, so the fixture stays in step
                with something the project actually ships.
"""

from PIL import Image, ImageDraw, ImageFont

HERE = __file__.rsplit("/", 1)[0]

SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def gradient():
    """Smooth tone in two directions at once.

    This is the fixture that catches banding and dither artefacts. A flat
    colour proves nothing - every quantiser gets that right - and a photo
    has too much going on to see stepping. A clean ramp does not.
    """
    w, h = 320, 200
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            # Horizontal hue sweep against a vertical light ramp, so both
            # colour and luminance stepping show up.
            t = x / (w - 1)
            v = y / (h - 1)
            r = int(255 * t * (1 - v * 0.7))
            g = int(255 * (1 - abs(t - 0.5) * 2) * (1 - v * 0.5))
            b = int(255 * (1 - t) * (1 - v * 0.3))
            px[x, y] = (r, g, b)
    im.save(f"{HERE}/gradient.png")
    return im.size


def screenshot():
    """A UI panel with genuinely small text.

    The hard case for a glyph quantiser: 11px type is close to the cell
    size, so it either resolves into something with the texture of text or
    turns to grey mush. Flat UI fills and hard edges alongside it check
    that solid areas stay solid while the text is being fought over.
    """
    w, h = 640, 400
    im = Image.new("RGB", (w, h), (250, 250, 248))
    d = ImageDraw.Draw(im)

    title = ImageFont.truetype(SANS, 17)
    body = ImageFont.truetype(SANS, 11)
    mono = ImageFont.truetype(MONO, 11)

    d.rectangle([0, 0, w, 44], fill=(26, 32, 58))
    d.text((16, 13), "Bulletin Board System", font=title, fill=(255, 255, 255))
    d.text((w - 92, 17), "sign in", font=body, fill=(150, 190, 255))

    d.text((16, 60), "Recent activity", font=title, fill=(20, 20, 30))

    rows = [
        ("14:02", "grace", "posted to the ANSI art conference"),
        ("13:47", "hopper", "uploaded COBOL-STANDARD.TXT to /files"),
        ("13:31", "sysop", "raised the daily download limit to 40"),
        ("12:58", "kilroy", "left a message for all callers"),
        ("12:19", "modem", "connected at 2400 baud, no carrier at 12:24"),
        ("11:40", "ada", "replied in thread 'best terminal fonts'"),
    ]
    y = 92
    for i, (t, who, what) in enumerate(rows):
        if i % 2 == 0:
            d.rectangle([12, y - 4, w - 12, y + 16], fill=(240, 242, 246))
        d.text((20, y), t, font=mono, fill=(120, 124, 136))
        d.text((72, y), who, font=body, fill=(30, 90, 200))
        d.text((140, y), what, font=body, fill=(40, 42, 50))
        y += 22

    d.rectangle([12, y + 10, w - 12, y + 74], outline=(200, 204, 212), width=1)
    d.text((22, y + 20), "Paragraph text at eleven pixels, which is the size", font=body, fill=(40, 42, 50))
    d.text((22, y + 36), "most of the web actually uses for body copy, and", font=body, fill=(40, 42, 50))
    d.text((22, y + 52), "therefore the size that decides this whole test.", font=body, fill=(40, 42, 50))

    d.rectangle([12, h - 44, 120, h - 14], fill=(30, 90, 200))
    d.text((34, h - 36), "Read new", font=body, fill=(255, 255, 255))

    im.save(f"{HERE}/screenshot.png")
    return im.size


if __name__ == "__main__":
    print("gradient.png  ", gradient())
    print("screenshot.png", screenshot())
