// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import init from "bbs-core";
import { readFileSync } from "node:fs";
import { chooseMode, isNarrow, MODE_25, MODE_132, scaledCellW } from "../src/modes";
import { classifySwipe, keysAt, rowAt, type Hot } from "../src/touch";
import { loginArt, menuArt, rotateArt } from "../src/board/art";
import { conferenceScreen } from "../src/board/screens";

// menuArt reads may_access out of the core to filter the menu by level, so
// the art cannot be built at all without the wasm loaded.
beforeAll(async () => {
  await init(readFileSync("../core/pkg/bbs_core_bg.wasm"));
});

/// The board's whole problem on a phone, as a number.
describe("mode selection", () => {
  const cases: [string, number, number, number][] = [
    // label, box width, box height, expected columns
    ["desktop at 1920", 1900, 700, 132],
    ["laptop at 1280", 1264, 620, 132],
    ["a 900px window", 884, 450, 80],
    ["phone, landscape", 852, 380, 80],
    ["phone, portrait", 393, 800, 80],
  ];

  for (const [label, w, h, cols] of cases) {
    it(`${label} gets ${cols} columns`, () => {
      expect(chooseMode(w, h).cols).toBe(cols);
    });
  }

  it("never blows the framebuffer up past its native size", () => {
    // A huge box must not scale beyond 1, or the board is just blurrier.
    expect(scaledCellW(MODE_132, 10000, 10000)).toBe(MODE_132.cellW);
  });

  /// WITHOUT HYSTERESIS THIS OSCILLATES.
  ///
  /// The iOS keyboard animating in and out sweeps the box height across
  /// whatever single threshold is chosen, and each crossing rebuilds
  /// sixteen glyph atlases. These two assertions are the same box size
  /// resolving differently depending on where it came from, which is the
  /// entire point.
  it("holds its mode across the switching point", () => {
    // A box that sits between the two thresholds.
    let w = 0;
    for (let probe = 600; probe < 1400; probe += 1) {
      const cell = scaledCellW(MODE_132, probe, 10000);
      if (cell >= 5.0 && cell < 5.6) { w = probe; break; }
    }
    expect(w, "no box width lands between the thresholds").toBeGreaterThan(0);

    expect(chooseMode(w, 10000, MODE_132).cols).toBe(132); // stays wide
    expect(chooseMode(w, 10000, MODE_25).cols).toBe(80); // stays narrow
  });

  it("knows which mode is the compact one", () => {
    expect(isNarrow(MODE_25)).toBe(true);
    expect(isNarrow(MODE_132)).toBe(false);
  });
});

describe("tapping the board", () => {
  const rect = { left: 0, top: 0, width: 800, height: 500 };

  it("resolves a pointer to the row under it", () => {
    expect(rowAt(rect, 0, 25)).toBe(0);
    expect(rowAt(rect, 250, 25)).toBe(12);
    expect(rowAt(rect, 499, 25)).toBe(24);
  });

  it("misses cleanly outside the canvas", () => {
    expect(rowAt(rect, -1, 25)).toBeNull();
    expect(rowAt(rect, 500, 25)).toBeNull();
  });

  it("presses only what the screen declared", () => {
    const hot: Hot[] = [{ row: 5, keys: ["W"] }, { row: 9, keys: ["1", "2", "Enter"] }];
    expect(keysAt(hot, 5)).toEqual(["W"]);
    expect(keysAt(hot, 9)).toEqual(["1", "2", "Enter"]);
    // Most of a screen is not a control, and a tap there must do nothing.
    expect(keysAt(hot, 6)).toBeNull();
    expect(keysAt(hot, null)).toBeNull();
  });
});

describe("swiping", () => {
  it("pages on a horizontal drag", () => {
    expect(classifySwipe(-120, 10)).toBe("N");
    expect(classifySwipe(120, -10)).toBe("P");
  });

  it("ignores a scroll", () => {
    // The failure this prevents: reading a long screen turns pages by
    // accident because a vertical drag wandered sideways.
    expect(classifySwipe(60, 200)).toBeNull();
  });

  it("ignores a shaky tap", () => {
    expect(classifySwipe(20, 2)).toBeNull();
  });
});

/// THE CHECK THAT GUARDS THE RE-AUTHORING.
///
/// art.ts composed on a fixed 132x50 grid with absolute coordinates - side
/// panels at column 70, hints at 36, footer rules at H-4. Nothing about
/// reading that file tells you whether an 80-column version of it fits,
/// and a screen that silently overflows its grid is invisible until
/// somebody looks at a phone.
describe("every compact screen fits 80x25", () => {
  const guest = { handle: "GUEST", sl: 10, flags: "" };
  const member = { handle: "SYSOP", sl: 100, flags: "G" };

  const screens: [string, () => { lines: string[] }][] = [
    ["login", () => loginArt("", "", true)],
    ["login with a meter", () => loginArt("TIME REMAINING THIS CALL: 60 MIN", "", true)],
    ["menu as a guest", () => menuArt(guest, "", "", "", true)],
    ["menu as a sysop", () => menuArt(member, "", "", "12", true)],
    ["rotate", () => rotateArt(MODE_25)],
  ];

  for (const [label, build] of screens) {
    it(`${label} is exactly 25 rows of at most 80`, () => {
      const { lines } = build();
      expect(lines.length).toBe(25);
      for (const [i, line] of lines.entries()) {
        expect(line.length, `row ${i} of the ${label} screen`).toBeLessThanOrEqual(80);
      }
    });
  }

  it("still draws the wide board at 132x50", () => {
    const { lines } = menuArt(guest, "", "", "", false);
    expect(lines.length).toBe(50);
    expect(lines.every((l) => l.length <= 132)).toBe(true);
  });

  /// A ROW CAN BE EXACTLY 80 WIDE AND STILL BE WRONG.
  ///
  /// Every check above passed while the footer drew "sister board:
  /// modem.dbhq.uk" at a fixed column 50, straight through the meter, which
  /// is 52 characters long: the caller's remaining time read "REQUESTS
  /// LEsister board: modem.dbhq.uk". The line length was untouched, because
  /// the collision is inside the row rather than past the end of it.
  const meter = "TIME REMAINING THIS CALL: 60 MIN     REQUESTS LEFT: 40";

  for (const [label, build] of [
    ["login", (m: string) => loginArt(m, "", true)],
    ["menu", (m: string) => menuArt(guest, m, "", "", true)],
  ] as const) {
    it(`the ${label} screen never draws over the meter`, () => {
      const { lines } = build(meter);
      expect(lines.some((l) => l.includes(meter))).toBe(true);
    });
  }

  it("keeps the cross-link on the wide board, where there is room", () => {
    const { lines } = menuArt(guest, meter, "", "", false);
    expect(lines.some((l) => l.includes(meter))).toBe(true);
    expect(lines.some((l) => l.includes("sister board: modem.dbhq.uk"))).toBe(true);
  });
});

describe("the compact menu stays operable", () => {
  const guest = { handle: "GUEST", sl: 10, flags: "" };

  it("offers a tappable row for every command it draws", () => {
    const { lines, hot } = menuArt(guest, "", "", "", true);
    expect(hot.length).toBeGreaterThan(0);
    for (const h of hot) {
      // A hot row that is blank is a control the caller cannot see.
      expect(lines[h.row].trim(), `row ${h.row} is hot but empty`).not.toBe("");
      expect(h.row).toBeLessThan(25);
    }
  });

  it("never draws a control over the command prompt", () => {
    // The list is packed by a running cursor, so a sysop - who sees more
    // entries than a guest - is the case that would run into the footer.
    const sysop = { handle: "SYSOP", sl: 100, flags: "G" };
    const { lines, hot } = menuArt(sysop, "", "", "", true);
    expect(lines[19]).toContain("COMMAND:");
    for (const h of hot) expect(h.row).toBeLessThan(19);
  });

  it("puts the gateway on the compact menu too", () => {
    const { hot } = menuArt(guest, "", "", "", true);
    expect(hot.some((h) => h.keys[0] === "W")).toBe(true);
  });
});

describe("the conference listing follows the mode", () => {
  const items = Array.from({ length: 60 }, (_, i) => ({
    title: `STORY ${i + 1}`,
    url: `https://example.com/${i + 1}`,
  }));

  it("shows fewer items on a compact screen", () => {
    const wide = conferenceScreen("HACKER NEWS", items, 0, "", "", 50, 132);
    const narrow = conferenceScreen("HACKER NEWS", items, 0, "", "", 25, 80);
    expect(wide.hot.length).toBe(41);
    expect(narrow.hot.length).toBe(16);
  });

  it("never overruns the screen it was given", () => {
    const narrow = conferenceScreen("HACKER NEWS", items, 0, "", "", 25, 80);
    expect(narrow.lines.length).toBeLessThanOrEqual(25);
    expect(narrow.lines.every((l) => l.length <= 80)).toBe(true);
  });

  it("types the item number and presses return", () => {
    // Item 12 on page 0, and item 1 of page 1 keeps its absolute number.
    const first = conferenceScreen("C", items, 0, "", "", 25, 80);
    expect(first.hot[11].keys).toEqual(["1", "2", "Enter"]);

    const second = conferenceScreen("C", items, 1, "", "", 25, 80);
    expect(second.hot[0].keys).toEqual(["1", "7", "Enter"]);
  });

  it("points every hot row at the item it sits on", () => {
    const listing = conferenceScreen("C", items, 0, "", "", 25, 80);
    for (const h of listing.hot) {
      const n = h.keys.slice(0, -1).join("");
      // The listing right-aligns the number in two columns, so item 1
      // draws as "[ 1]".
      expect(listing.lines[h.row]).toContain(`[${n.padStart(2)}]`);
    }
  });
});
