#!/usr/bin/env python3
"""Composes 80x25 ANSI mockups for the board.

These are REAL ANSI, not pictures of ANSI. Anything approved here can be
lifted straight into shell/src/board/art.ts, and rendered to PNG with
core/tests/fixtures/ansi2png.py for review.

    python3 design/mockups.py && \
      for f in design/out/*.ans; do
        python3 core/tests/fixtures/ansi2png.py "$f" "${f%.ans}.png"
      done

Art direction carried over from art.ts (Codex Astra, 8 Sep 2026): a cold
cyan DBHQ wordmark, yellow reserved for entering or choosing, magenta as
the accent. The drawing obeys 1992 hardware; the identity openly belongs to
a board connected to today's web.
"""

import os
import re

W, H = 132, 60

# Palette indices, ANSI order - see core/src/screen.rs.
BLACK, RED, GREEN, BROWN, BLUE, MAGENTA, CYAN, GREY = range(8)
DGREY, BRED, BGREEN, BYELLOW, BBLUE, BMAGENTA, BCYAN, WHITE = range(8, 16)


class Canvas:
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.cells = [[(" ", GREY, BLACK) for _ in range(w)] for _ in range(h)]

    def put(self, x, y, s, fg=GREY, bg=BLACK):
        for i, ch in enumerate(s):
            if 0 <= x + i < self.w and 0 <= y < self.h:
                self.cells[y][x + i] = (ch, fg, bg)

    def fill(self, x, y, w, h, ch=" ", fg=GREY, bg=BLACK):
        for yy in range(y, min(y + h, self.h)):
            for xx in range(x, min(x + w, self.w)):
                self.cells[yy][xx] = (ch, fg, bg)

    def box(self, x, y, w, h, fg=CYAN, bg=BLACK, double=False):
        tl, tr, bl, br, hz, vt = ("╔╗╚╝═║" if double else "┌┐└┘─│")
        self.put(x, y, tl + hz * (w - 2) + tr, fg, bg)
        self.put(x, y + h - 1, bl + hz * (w - 2) + br, fg, bg)
        for yy in range(y + 1, y + h - 1):
            self.put(x, yy, vt, fg, bg)
            self.put(x + w - 1, yy, vt, fg, bg)

    def centre(self, y, s, fg=GREY, bg=BLACK):
        self.put((self.w - len(s)) // 2, y, s, fg, bg)

    def ansi(self):
        out = []
        for row in self.cells:
            line, cur = [], None
            for ch, fg, bg in row:
                if (fg, bg) != cur:
                    f = 30 + fg if fg < 8 else 90 + fg - 8
                    b = 40 + bg if bg < 8 else 100 + bg - 8
                    line.append(f"\x1b[{f};{b}m")
                    cur = (fg, bg)
                line.append(ch)
            out.append("".join(line) + "\x1b[0m")
        return "\n".join(out) + "\n"


SGR = re.compile(r"\x1b\[([0-9;]*)m")


def blit_ansi(c, path, x0, y0):
    """Draws an existing .ans (the quantised portrait) onto a canvas."""
    fg, bg = GREY, BLACK
    y = y0
    for line in open(path, encoding="utf-8", errors="replace").read().split("\n"):
        x = x0
        i = 0
        while i < len(line):
            m = SGR.match(line, i)
            if m:
                for p in m.group(1).split(";"):
                    if not p:
                        continue
                    n = int(p)
                    if n == 0:
                        fg, bg = GREY, BLACK
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
            if 0 <= x < c.w and 0 <= y < c.h:
                c.cells[y][x] = (line[i], fg, bg)
            x += 1
            i += 1
        y += 1


# A proper BBS header letterform: seven rows, drawn with block halves so
# the strokes have weight, and a drop shadow to the lower right. This is the
# idiom every board used - the logo was the first thing a caller saw at 2400
# baud and it had to be worth the wait.
BIG = {
    "D": ["██████▄ ", "██   ██ ", "██   ██ ", "██   ██ ", "██   ██ ", "██████▀ ", "        "],
    "B": ["██████▄ ", "██   ██ ", "██████  ", "██   ██ ", "██   ██ ", "██████▀ ", "        "],
    "H": ["██   ██ ", "██   ██ ", "███████ ", "██   ██ ", "██   ██ ", "██   ██ ", "        "],
    "Q": [" █████  ", "██   ██ ", "██   ██ ", "██ █ ██ ", "██  ███ ", " ███████", "        "],
    "S": [" ██████ ", "██      ", " █████  ", "     ██ ", "██   ██ ", " █████  ", "        "],
    "T": ["███████ ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", "        "],
    "A": [" █████  ", "██   ██ ", "██   ██ ", "███████ ", "██   ██ ", "██   ██ ", "        "],
    "N": ["██   ██ ", "███  ██ ", "████ ██ ", "██ ████ ", "██  ███ ", "██   ██ ", "        "],
    "I": ["███████ ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", "███████ ", "        "],
    " ": ["    ", "    ", "    ", "    ", "    ", "    ", "    "],
}


def big_text(c, x, y, text, ramp=(BBLUE, BCYAN, CYAN, WHITE), shadow=DGREY):
    """Large block lettering with a vertical colour ramp and a drop shadow.

    The ramp runs top to bottom rather than left to right: a board's logo
    read as lit from above, and colouring per letter instead makes it look
    like a ransom note.
    """
    # TWO passes. Drawing each letter's shadow immediately before its own
    # row means the next row's glyph paints straight over it, which left the
    # shadow visible only under the last row.
    for i, ch in enumerate(text):
        glyph = BIG.get(ch.upper())
        if not glyph:
            continue
        wide = len(glyph[0])
        for r, line in enumerate(glyph):
            for k, g in enumerate(line):
                if g != " ":
                    c.put(x + i * wide + k + 1, y + r + 1, "\u2592", shadow)
    for i, ch in enumerate(text):
        glyph = BIG.get(ch.upper())
        if not glyph:
            continue
        wide = len(glyph[0])
        for r, line in enumerate(glyph):
            fg = ramp[min(r * len(ramp) // max(1, len(glyph) - 1), len(ramp) - 1)]
            for k, g in enumerate(line):
                if g != " ":
                    c.put(x + i * wide + k, y + r, g, fg)
    return x + len(text) * 8


def banner(c, y=1):
    """The full header: rules, logo, tagline, and a marquee of block shades."""
    c.put(0, y, "\u2550" * W, BBLUE)
    big_text(c, 6, y + 2, "DBHQ")
    c.put(40, y + 3, "\u2591\u2592\u2593\u2588", CYAN)
    c.put(45, y + 3, "B U L L E T I N   B O A R D   S Y S T E M", BCYAN)
    c.put(45, y + 5, "the world wide web as it should have been", GREY)
    c.put(45, y + 6, f"{W} columns \u00b7 sixteen colours \u00b7 no javascript", DGREY)
    c.put(W - 8, y + 3, "\u2588\u2593\u2592\u2591", CYAN)
    c.put(0, y + 10, "\u2550" * W, BBLUE)
    return y + 12


def wordmark(c, x, y):
    """Kept for the smaller screens that do not carry the full banner."""
    big_text(c, x, y, "DBHQ")


def rule(c, y, fg=DGREY):
    c.put(0, y, "─" * W, fg)


def status_bar(c, y, left, right, fg=BLACK, bg=CYAN):
    c.fill(0, y, W, 1, " ", fg, bg)
    c.put(1, y, left, fg, bg)
    c.put(W - len(right) - 1, y, right, fg, bg)


# ---------------------------------------------------------------- screens


def welcome():
    c = Canvas()
    c.fill(0, 0, W, 1, " ", BLACK, CYAN)
    c.put(1, 0, "bbs.dbhq.uk", BLACK, CYAN)
    c.put(W - 29, 0, "NODE 1 · 2400 BAUD · 8-N-1", BLACK, CYAN)

    wordmark(c, 6, 3)
    c.put(28, 4, "░▒▓", DGREY)
    c.put(32, 3, "THE WORLD WIDE WEB", BCYAN)
    c.put(32, 4, "AS IT SHOULD HAVE BEEN", WHITE)
    c.put(32, 6, f"{W} columns · sixteen colours", DGREY)
    c.put(32, 7, "no javascript · no trackers", DGREY)

    rule(c, 9)

    c.put(3, 10, "LAST CALLERS", BYELLOW)
    callers = [
        ("SYSOP", "09 Sep 07:41", "412"),
        ("hopper", "09 Sep 06:02", "38"),
        ("kilroy", "08 Sep 23:17", "7"),
        ("ada", "08 Sep 21:50", "91"),
    ]
    for i, (who, when, calls) in enumerate(callers):
        y = 12 + i
        c.put(4, y, who.ljust(12), BCYAN if who == "SYSOP" else GREY)
        c.put(18, y, when, DGREY)
        c.put(34, y, calls.rjust(4) + " calls", DGREY)

    c.box(46, 10, 31, 7, DGREY)
    c.put(48, 11, "SYSTEM", BMAGENTA)
    c.put(48, 12, "callers today", DGREY)
    c.put(70, 12, "146", WHITE)
    c.put(48, 13, "pages served", DGREY)
    c.put(70, 13, "2.1k", WHITE)
    c.put(48, 14, "sysop", DGREY)
    c.put(70, 14, "  IN", BGREEN)
    c.put(48, 15, "uptime", DGREY)
    c.put(66, 15, "31d 4h", WHITE)

    rule(c, 18)
    c.put(3, 20, "[N]", BYELLOW)
    c.put(7, 20, "New user application", GREY)
    c.put(3, 21, "[L]", BYELLOW)
    c.put(7, 21, "Log on", GREY)
    c.put(3, 22, "[G]", BYELLOW)
    c.put(7, 22, "Guest - browse the curated list", GREY)

    c.put(40, 21, "Press", DGREY)
    c.put(46, 21, "ENTER", BYELLOW)
    c.put(52, 21, "to connect", DGREY)

    status_bar(c, 24, "CONNECT 2400/ARQ/V32/LAPM", "modem.dbhq.uk")
    return c


def main_menu():
    c = Canvas()
    c.fill(0, 0, W, 1, " ", BLACK, CYAN)
    c.put(1, 0, "MAIN MENU", BLACK, CYAN)
    c.put(W - 30, 0, "GRINIDX  ·  SL 100  ·  VGPS", BLACK, CYAN)

    c.put(3, 2, "╔═ CONFERENCES ═╗", CYAN)
    items = [
        ("1", "HACKER NEWS", "198 stories", False),
        ("2", "WIKIPEDIA - RANDOM", "the whole of it", False),
        ("3", "BBC NEWS", "64 headlines", True),
        ("4", "GITHUB - DBHQ", "12 repos", False),
    ]
    for i, (key, name, note, sel) in enumerate(items):
        y = 4 + i * 2
        if sel:
            # The lightbar: a full-width highlight, which is what makes a
            # board feel navigated rather than typed at.
            c.fill(3, y, 50, 1, " ", BLACK, CYAN)
            c.put(4, y, key, BLACK, CYAN)
            c.put(6, y, "\u25ba", BLACK, CYAN)
            c.put(8, y, name, BLACK, CYAN)
            c.put(38, y, note, BLACK, CYAN)
        else:
            c.put(4, y, key, BYELLOW)
            c.put(8, y, name, GREY)
            c.put(38, y, note, DGREY)

    c.box(56, 2, 22, 11, DGREY)
    c.put(58, 3, "TIME LEFT", BMAGENTA)
    c.put(58, 4, "28 min", WHITE)
    c.put(58, 6, "CALLS TODAY", BMAGENTA)
    c.put(58, 7, "146", WHITE)
    c.put(58, 9, "GATEWAY", BMAGENTA)
    c.put(58, 10, "OPEN", BGREEN)
    c.put(58, 11, "397 of 400 left", DGREY)

    rule(c, 13)
    c.put(3, 14, "╔═ DOORS ═╗", CYAN)
    doors = [
        ("W", "World Wide Web", "any address"),
        ("A", "ANSI Art Archive", "the scene's own"),
        ("P", "Profile", "who runs this"),
    ]
    for i, (key, name, note) in enumerate(doors):
        y = 16 + i
        c.put(4, y, key, BYELLOW)
        c.put(8, y, name.ljust(22), GREY)
        c.put(32, y, note, DGREY)

    rule(c, 20)
    c.put(3, 21, "\u2191\u2193", BCYAN)
    c.put(6, 21, "move", DGREY)
    c.put(13, 21, "ENTER", BCYAN)
    c.put(19, 21, "select", DGREY)
    c.put(28, 21, "hotkey", BCYAN)
    c.put(35, 21, "jump straight there", DGREY)
    c.put(60, 21, "Q", BCYAN)
    c.put(62, 21, "goodbye", DGREY)

    status_bar(c, 24, "bbs.dbhq.uk  ·  NODE 1", "modem.dbhq.uk")
    return c


def about(portrait="/tmp/portrait30.ans"):
    c = Canvas()
    c.fill(0, 0, W, 1, " ", BLACK, CYAN)
    c.put(1, 0, "PROFILE  ·  /about", BLACK, CYAN)
    c.put(W - 20, 0, "SYSOP  ·  SL 100", BLACK, CYAN)

    if os.path.exists(portrait):
        blit_ansi(c, portrait, 2, 2)

    x = 36
    c.put(x, 2, "DANIEL GRIMES", BCYAN)
    c.put(x, 3, "─" * 30, DGREY)
    c.put(x, 4, "SYSOP", BYELLOW)
    c.put(x, 6, "Director, DBHQ Consulting Ltd.", GREY)
    c.put(x, 7, "Fractional Engineering Lead.", GREY)
    c.put(x, 9, "Defence, banking, insurance,", DGREY)
    c.put(x, 10, "energy, commodities, healthcare", DGREY)
    c.put(x, 11, "and identity.", DGREY)

    c.box(x, 13, 40, 6, DGREY)
    c.put(x + 2, 14, "THIS BOARD", BMAGENTA)
    c.put(x + 2, 15, "Rust, compiled to WebAssembly.", DGREY)
    c.put(x + 2, 16, "Renders the live web as ANSI,", DGREY)
    c.put(x + 2, 17, "entirely on your machine.", DGREY)

    c.put(x, 20, "dan@dbhq.uk", BCYAN)
    c.put(x, 21, "dbhq.uk", BCYAN)

    rule(c, 22)
    c.put(2, 23, "Q", BYELLOW)
    c.put(4, 23, "back to the main menu", DGREY)
    # The sister project, as asked.
    c.put(44, 23, "Sister board:", DGREY)
    c.put(58, 23, "modem.dbhq.uk", BMAGENTA)

    status_bar(c, 24, "bbs.dbhq.uk  ·  PROFILE", "modem.dbhq.uk")
    return c


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "out")
    os.makedirs(out, exist_ok=True)
    for name, screen in (
        ("welcome", welcome()),
        ("menu", main_menu()),
        ("about", about()),
    ):
        with open(f"{out}/{name}.ans", "w", encoding="utf-8") as f:
            f.write(screen.ansi())
        print(f"{out}/{name}.ans")
