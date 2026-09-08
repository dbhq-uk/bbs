/// The board's ANSI art.
///
/// Art-directed by Codex Astra, 8 Sep 2026, then edited. Astra's direction
/// was a cold cyan DBHQ wordmark beside a violet doorway, with yellow
/// reserved for entering or choosing. The wordmark and the colour rules
/// stayed; the doorway was cut, because at 16 cells wide in CP437 it read
/// as a stray lowercase letter rather than as a door, and an ambiguous
/// ornament is worse than none.
///
/// The space it occupied now carries a system status panel, which is what
/// a real board put there: node, connection, caller count, sysop presence.
/// Period-correct AND informative beats decorative.
///
/// The taste call, and it is deliberate: the drawing obeys 1992 hardware
/// completely, and the identity openly belongs to a board connected to
/// today's web. A faithful period reproduction would be the boring choice
/// for a product whose whole premise is an anachronism.
///
/// One technical detail that governs every block drawing here: in an 8x16
/// font `▀` and `▄` are 8x8 squares, but `▌` and `▐` are 4x16 strips. They
/// are not interchangeable drawing units, and the doorway's bevel depends
/// on the difference.

export const C = {
  black: 0, blue: 1, green: 2, cyan: 3,
  red: 4, magenta: 5, brown: 6, grey: 7,
  dgrey: 8, bblue: 9, bgreen: 10, bcyan: 11,
  bred: 12, bmagenta: 13, byellow: 14, white: 15,
} as const;

/// Palette index as a hex digit, for the colour rows below.
const K = {
  BLACK: "0", RED: "1", GREEN: "2", BROWN: "3",
  BLUE: "4", MAGENTA: "5", CYAN: "6", GREY: "7",
  DGREY: "8", BRED: "9", BGREEN: "a", BYELLOW: "b",
  BBLUE: "c", BMAGENTA: "d", BCYAN: "e", WHITE: "f",
};

export type Art = { lines: string[]; fg: string[]; bg: string[] };

const W = 80;
const H = 25;

function pad(s: string): string {
  return s.length >= W ? s.slice(0, W) : s + " ".repeat(W - s.length);
}

/// Builds a colour row: a default, then spans of [start, end, colour].
function row(base: string, spans: [number, number, string][] = []): string {
  const cells = new Array(W).fill(base);
  for (const [a, b, c] of spans) {
    for (let i = a; i < Math.min(b, W); i++) cells[i] = c;
  }
  return cells.join("");
}


/// Where the right-hand status panel starts.
const PANEL_A = 50;

/// The system status panel.
///
/// Real boards put exactly this in the corner: which node you got, what
/// your connection negotiated, how many callers there had been, and
/// whether the sysop was around. It is period-correct furniture that also
/// happens to tell you something true, which is a better use of the space
/// than an ornament.
function panel(rows: string[]): string[] {
  const w = 30;
  const line = "─".repeat(w - 2);
  return [
    "┌" + line + "┐",
    ...rows.map((r) => "│ " + r.padEnd(w - 4) + " │"),
    "└" + line + "┘",
  ];
}

/// Overlays a right-hand panel onto a screen at a given first row.
function withPanel(lines: string[], top: number, rows: string[]): string[] {
  const out = [...lines];
  const p = panel(rows);
  for (let i = 0; i < p.length; i++) {
    const y = top + i;
    if (y >= H) break;
    out[y] = pad(out[y] ?? "").slice(0, PANEL_A) + p[i];
  }
  return out;
}

/// The header and footer bars, top and bottom of every screen.
const BAR = "▀".repeat(W);
const BAR_LOW = "▄".repeat(W);

function frame(lines: string[], fg: string[], bg: string[]): Art {
  return {
    lines: lines.slice(0, H).map(pad),
    fg: fg.slice(0, H),
    bg: bg.slice(0, H),
  };
}

const WORDMARK = [
  "    ████████▄   ████████▄   ██      ██   ▄██████▄ ",
  "    ██▀    ▀██  ██▀    ▀██  ██      ██  ██▀    ▀██",
  "    ██      ██  ██     ▄██  ██      ██  ██      ██",
  "    ██      ██  ████████▀   ██████████  ██      ██",
  "    ██      ██  ██     ▀██  ██      ██  ██   ▄  ██",
  "    ██▄    ▄██  ██▄    ▄██  ██      ██  ██▄  ▀█▄██",
  "    ████████▀   ████████▀   ██      ██   ▀██████▀ ",
  "                                               ▀██ ",
];

export function loginArt(meterText: string, statusText: string): Art {
  let lines = [
    BAR,
    "    DBHQ / PUBLIC ACCESS                                        bbs.dbhq.uk",
    "",
    ...WORDMARK,
    "",
    "",
    "    THE WORLD WIDE WEB, AS A BOARD",
    "",
    "    A DBHQ EXPERIMENT",
    "",
    "",
    "    [ ENTER ]  LOG ON",
    "",
    "    " + "─".repeat(72),
    "    " + (meterText || statusText),
    "",
    "    1992 HARDWARE RULES / 2026 OUTSIDE",
    "",
    BAR_LOW,
  ];
  // Below the wordmark, not beside it - at 50 characters wide the
  // wordmark leaves no room for a panel on the same rows.
  lines = withPanel(lines, 12, [
    "SYSTEM     bbs.dbhq.uk",
    "NODE       1 OF 1",
    "CONNECT    WASM 80x25",
    "CHARSET    CP437, 16 COLOUR",
    "GATEWAY    CLOUDFLARE EDGE",
    "SYSOP      IN",
  ]);

  const fg: string[] = [];
  const bg: string[] = [];
  for (let y = 0; y < H; y++) {
    let base = K.GREY;
    let spans: [number, number, string][] = [];
    if (y === 0 || y === lines.length - 1) base = K.DGREY;
    if (y >= 12 && y <= 19) {
      // Panel frame dim, labels mid, values bright.
      spans.push([PANEL_A, W, K.DGREY], [PANEL_A + 2, PANEL_A + 13, K.CYAN],
                 [PANEL_A + 13, PANEL_A + 28, K.BCYAN]);
    }
    if (y === 1) spans.push([0, 30, K.BCYAN], [64, W, K.DGREY]);
    if (y >= 3 && y <= 10) spans.push([0, PANEL_A, K.BCYAN]);
    if (y === 16) spans.push([0, PANEL_A, K.WHITE]);
    if (y === 21) spans.push([0, 24, K.BYELLOW]);
    if (y === 23) spans.push([0, W, K.DGREY]);
    if (y === 24) spans.push([0, W, K.DGREY]);
    fg.push(row(base, spans));
    bg.push(row(K.BLACK));
  }
  // The [ ENTER ] key cap: yellow on black, the one call to action.
  const enterRow = lines.findIndex((l) => l.includes("[ ENTER ]"));
  if (enterRow >= 0) fg[enterRow] = row(K.GREY, [[4, 13, K.BYELLOW]]);

  return frame(lines, fg, bg);
}

export function menuArt(
  conferences: { key: string; name: string }[],
  meterText: string,
  statusText: string,
  input: string,
): Art {
  const small = [
    "    █▀▀▄ █▀▀▄ █  █ ▄▀▀▄",
    "    █  █ █▀▀▄ █▀▀█ █  █       MAIN MENU",
    "    ▀▀▀  ▀▀▀  ▀  ▀ ▀▀█▄",
  ];
  let lines = [
    BAR,
    "    DBHQ / CONFERENCE DIRECTORY                                 bbs.dbhq.uk",
    "",
    ...small,
    "",
    "    CONFERENCES",
    "",
    ...conferences.flatMap((c) => [`    ${c.key}) ${c.name}`, ""]),
    "",
    "    W) WORLD WIDE WEB GATEWAY",
    "       Enter a URL. Bring back a board.",
    "",
    "    " + "─".repeat(72),
    "    " + (meterText || statusText),
    "",
    `    COMMAND: ${input}█`,
    "",
    BAR_LOW,
  ];
  while (lines.length < H) lines.splice(lines.length - 5, 0, "");

  const fg: string[] = [];
  const bg: string[] = [];
  for (let y = 0; y < H; y++) {
    let base = K.GREY;
    const spans: [number, number, string][] = [];
    const text = lines[y] ?? "";
    if (y === 0 || y === H - 1) base = K.DGREY;
    if (y === 1) spans.push([0, 32, K.BCYAN], [64, W, K.DGREY]);
    if (y >= 3 && y <= 5) spans.push([0, 24, K.BCYAN]);
    if (/^\s{4}CONFERENCES/.test(text)) spans.push([0, PANEL_A, K.WHITE]);
    // Numbered conferences: the key is yellow, the name stays grey.
    if (/^\s{4}\d\)/.test(text)) spans.push([4, 6, K.BYELLOW]);
    if (/^\s{4}W\)/.test(text)) spans.push([0, PANEL_A, K.BMAGENTA], [4, 6, K.BYELLOW]);
    if (/^\s{7}Enter a URL/.test(text)) spans.push([0, PANEL_A, K.DGREY]);
    if (/─/.test(text)) spans.push([0, W, K.DGREY]);
    if (/COMMAND:/.test(text)) spans.push([4, 12, K.WHITE], [12, PANEL_A, K.BYELLOW]);
    fg.push(row(base, spans));
    bg.push(row(K.BLACK));
  }
  return frame(lines, fg, bg);
}
