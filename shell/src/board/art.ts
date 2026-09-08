/// The board's ANSI art.
///
/// Art-directed by Codex Astra, 8 Sep 2026. The direction: a cold cyan DBHQ
/// wordmark beside a violet doorway, with yellow reserved for entering or
/// choosing. The doorway is the recurring device - the welcome screen
/// announces it, the menu points at it.
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

/// The doorway occupies columns 60-75 on every screen that shows it.
const DOOR_A = 58;
const DOOR_B = 77;
const doorSpans: [number, number, string][] = [[DOOR_A, DOOR_B, K.BMAGENTA]];

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

const DOOR = [
  "                                                            ▄▄▄▄▄▄▄▄▄▄▄▄    ",
  "                                                          ▄██▀▀▀▀▀▀▀▀▀██▓   ",
  "                                                        ▄██▀          ██▓   ",
  "                                                        ██▌   ▄▄▄▄    ██▓   ",
  "                                                        ██▌   █  █    ██▓   ",
  "                                                        ██▌   █  █    ██▓   ",
  "                                                        ██▌   █  █    ██▓   ",
  "                                                        ██▌   █  █    ██▓   ",
  "                                                        ██▌   █  █    ██▓   ",
  "                                                        ██▌   █  █    ██▓   ",
  "                                                        ██▌▄▄▄█  █▄▄▄▄██▓   ",
  "                                                        ▀▀▀▀▀▀    ▀▀▀▀▀▀░   ",
];

/// Overlays the doorway onto a screen at a given first row.
function withDoor(lines: string[], top: number): string[] {
  const out = [...lines];
  for (let i = 0; i < DOOR.length; i++) {
    const y = top + i;
    if (y >= H) break;
    const left = pad(out[y] ?? "").slice(0, DOOR_A);
    out[y] = left + pad(DOOR[i]).slice(DOOR_A);
  }
  return out;
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
  lines = withDoor(lines, 3);

  const fg: string[] = [];
  const bg: string[] = [];
  for (let y = 0; y < H; y++) {
    let base = K.GREY;
    let spans: [number, number, string][] = [...doorSpans];
    if (y === 0 || y === lines.length - 1) base = K.DGREY;
    if (y === 1) spans.push([0, 30, K.BCYAN], [64, W, K.DGREY]);
    if (y >= 3 && y <= 10) spans.push([0, DOOR_A, K.BCYAN]);
    if (y === 16) spans.push([0, DOOR_A, K.WHITE]);
    if (y === 21) spans.push([0, 24, K.BYELLOW]);
    if (y === 23) spans.push([0, W, K.DGREY]);
    if (y === 24) spans.push([0, W, K.DGREY]);
    fg.push(row(base, spans));
    bg.push(row(K.BLACK));
  }
  // The [ ENTER ] key cap: yellow on black, the one call to action.
  const enterRow = lines.findIndex((l) => l.includes("[ ENTER ]"));
  if (enterRow >= 0) fg[enterRow] = row(K.GREY, [[4, 13, K.BYELLOW], ...doorSpans]);

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
  lines = withDoor(lines, 3);

  const fg: string[] = [];
  const bg: string[] = [];
  for (let y = 0; y < H; y++) {
    let base = K.GREY;
    const spans: [number, number, string][] = [...doorSpans];
    const text = lines[y] ?? "";
    if (y === 0 || y === H - 1) base = K.DGREY;
    if (y === 1) spans.push([0, 32, K.BCYAN], [64, W, K.DGREY]);
    if (y >= 3 && y <= 5) spans.push([0, 24, K.BCYAN]);
    if (/^\s{4}CONFERENCES/.test(text)) spans.push([0, DOOR_A, K.WHITE]);
    // Numbered conferences: the key is yellow, the name stays grey.
    if (/^\s{4}\d\)/.test(text)) spans.push([4, 6, K.BYELLOW]);
    if (/^\s{4}W\)/.test(text)) spans.push([0, DOOR_A, K.BMAGENTA], [4, 6, K.BYELLOW]);
    if (/^\s{7}Enter a URL/.test(text)) spans.push([0, DOOR_A, K.DGREY]);
    if (/─/.test(text)) spans.push([0, W, K.DGREY]);
    if (/COMMAND:/.test(text)) spans.push([4, 12, K.WHITE], [12, DOOR_A, K.BYELLOW]);
    fg.push(row(base, spans));
    bg.push(row(K.BLACK));
  }
  return frame(lines, fg, bg);
}
