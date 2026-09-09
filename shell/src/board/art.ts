import { menuEntries } from "./menu-model";
/// The board's ANSI art, drawn for 132x50.
///
/// Art-directed by Codex Astra, 8 Sep 2026, then edited. Astra's direction
/// was a cold cyan DBHQ wordmark beside a violet doorway, with yellow
/// reserved for entering or choosing. The wordmark and the colour rules
/// stayed; the doorway was cut, because at 16 cells wide in CP437 it read
/// as a stray lowercase letter rather than as a door, and an ambiguous
/// ornament is worse than none.
///
/// The taste call, and it is deliberate: the drawing obeys 1992 hardware
/// completely, and the identity openly belongs to a board connected to
/// today's web. A faithful period reproduction would be the boring choice
/// for a product whose whole premise is an anachronism.
///
/// WHY THERE IS A CANVAS HERE NOW. These screens were built as parallel
/// arrays of hand-padded string literals: one for the text, one for
/// foreground colour, one for background, with absolute column numbers
/// counted by hand. That was survivable at 80 columns and is not at 132 -
/// every edit meant recounting spaces, and a colour span had to be kept in
/// step with a string it could not see. The canvas below emits exactly the
/// same three arrays; only the authoring changed.
///
/// One technical detail that governs every block drawing here: in an 8x16
/// cell `▀` and `▄` are 8x8 squares but `▌` and `▐` are 4x16 strips. They
/// are not interchangeable drawing units.

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

const W = 132;
const H = 50;

/// A cell grid that emits the three parallel arrays render_art expects.
class Canvas {
  private ch: string[][] = [];
  private fg: string[][] = [];
  private bg: string[][] = [];

  constructor() {
    for (let y = 0; y < H; y++) {
      this.ch.push(new Array(W).fill(" "));
      this.fg.push(new Array(W).fill(K.GREY));
      this.bg.push(new Array(W).fill(K.BLACK));
    }
  }

  put(x: number, y: number, s: string, fg = K.GREY, bg = K.BLACK) {
    if (y < 0 || y >= H) return;
    for (let i = 0; i < s.length; i++) {
      const cx = x + i;
      if (cx < 0 || cx >= W) continue;
      this.ch[y][cx] = s[i];
      this.fg[y][cx] = fg;
      this.bg[y][cx] = bg;
    }
  }

  fill(x: number, y: number, w: number, h: number, s: string, fg = K.GREY, bg = K.BLACK) {
    for (let yy = y; yy < Math.min(y + h, H); yy++) {
      this.put(x, yy, s.repeat(Math.max(0, w)), fg, bg);
    }
  }

  box(x: number, y: number, w: number, h: number, fg = K.DGREY) {
    this.put(x, y, "┌" + "─".repeat(Math.max(0, w - 2)) + "┐", fg);
    this.put(x, y + h - 1, "└" + "─".repeat(Math.max(0, w - 2)) + "┘", fg);
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      this.put(x, yy, "│", fg);
      this.put(x + w - 1, yy, "│", fg);
    }
  }

  art(): Art {
    return {
      lines: this.ch.map((r) => r.join("")),
      fg: this.fg.map((r) => r.join("")),
      bg: this.bg.map((r) => r.join("")),
    };
  }
}

/// The big wordmark. Seven rows of block halves so the strokes have weight.
const WORDMARK = [
  "████████▄   ████████▄   ██      ██   ▄██████▄ ",
  "██▀    ▀██  ██▀    ▀██  ██      ██  ██▀    ▀██",
  "██      ██  ██     ▄██  ██      ██  ██      ██",
  "██      ██  ████████▀   ██████████  ██      ██",
  "██      ██  ██     ▀██  ██      ██  ██   ▄  ██",
  "██▄    ▄██  ██▄    ▄██  ██      ██  ██▄  ▀█▄██",
  "████████▀   ████████▀   ██      ██   ▀██████▀ ",
];

/// A vertical ramp down the wordmark, lit from above the way a board's
/// logo always was. Colouring per letter instead reads as a ransom note.
const RAMP = [K.BBLUE, K.BBLUE, K.BCYAN, K.BCYAN, K.BCYAN, K.CYAN, K.CYAN];

/// The header every screen carries.
///
/// Drawn in two passes: every shadow first, then every letter. Painting a
/// letter's shadow immediately before its own row lets the next row's
/// glyphs cover it, which leaves a shadow visible only under the last row.
function header(c: Canvas, kicker: string, right: string): number {
  c.put(0, 0, "═".repeat(W), K.BBLUE);

  const x = 4;
  const y = 2;
  for (let r = 0; r < WORDMARK.length; r++) {
    for (let i = 0; i < WORDMARK[r].length; i++) {
      if (WORDMARK[r][i] !== " ") c.put(x + i + 1, y + r + 1, "▒", K.DGREY);
    }
  }
  for (let r = 0; r < WORDMARK.length; r++) {
    for (let i = 0; i < WORDMARK[r].length; i++) {
      const g = WORDMARK[r][i];
      if (g !== " ") c.put(x + i, y + r, g, RAMP[r]);
    }
  }

  const tx = 56;
  c.put(tx - 5, y + 1, "░▒▓█", K.CYAN);
  c.put(tx, y + 1, "B U L L E T I N   B O A R D   S Y S T E M", K.BCYAN);
  c.put(tx, y + 3, "the world wide web, as a board", K.WHITE);
  c.put(tx, y + 4, `${W} columns · sixteen colours · no javascript`, K.DGREY);
  c.put(tx, y + 6, kicker, K.BMAGENTA);
  c.put(W - 5, y + 1, "█▓▒░", K.CYAN);

  c.put(0, 10, "═".repeat(W), K.BBLUE);
  c.put(2, 11, "bbs.dbhq.uk", K.BCYAN);
  c.put(W - right.length - 2, 11, right, K.DGREY);
  c.put(0, 12, "─".repeat(W), K.DGREY);
  return 14;
}

function footer(c: Canvas, meterText: string, statusText: string) {
  c.put(0, H - 4, "─".repeat(W), K.DGREY);
  c.put(2, H - 3, meterText || statusText, K.WHITE);
  c.put(0, H - 1, "▄".repeat(W), K.DGREY);
  // The sister project, cross-linked as a board would list its affiliates.
  c.put(W - 30, H - 3, "sister board: modem.dbhq.uk", K.BMAGENTA);
}

/// A framed status panel. Real boards put exactly this in the corner: which
/// node you got, what your connection negotiated, how many callers there
/// had been, and whether the sysop was around. Period-correct furniture
/// that also happens to tell you something true.
function panel(c: Canvas, x: number, y: number, title: string, rows: [string, string][]) {
  const w = 40;
  c.box(x, y, w, rows.length + 4, K.DGREY);
  c.put(x + 2, y + 1, title, K.BMAGENTA);
  rows.forEach(([label, value], i) => {
    c.put(x + 2, y + 3 + i, label, K.CYAN);
    c.put(x + 20, y + 3 + i, value, K.BCYAN);
  });
}

export function loginArt(meterText: string, statusText: string): Art {
  const c = new Canvas();
  const top = header(c, "PUBLIC ACCESS · EST. 2026", "NODE 1 OF 1");

  c.put(4, top, "THE WORLD WIDE WEB, AS IT SHOULD HAVE BEEN", K.WHITE);
  c.put(4, top + 2, "Every page fetched is stripped of script, tracking and", K.GREY);
  c.put(4, top + 3, "chrome, then redrawn in CP437 on your own machine.", K.GREY);
  c.put(4, top + 4, "Images become ANSI art on the way past.", K.GREY);

  c.put(4, top + 7, "[ ENTER ]", K.BYELLOW);
  c.put(16, top + 7, "LOG ON", K.WHITE);
  c.put(4, top + 9, "[ N ]", K.BYELLOW);
  c.put(16, top + 9, "New user application", K.GREY);
  c.put(4, top + 11, "[ G ]", K.BYELLOW);
  c.put(16, top + 11, "Guest - browse the curated list", K.GREY);

  // The extra rows 132x60 buys are worth filling: a board's front screen
  // carried news and a caller list, and empty space reads as unfinished.
  c.put(4, top + 14, "╔═ BULLETINS ═╗", K.CYAN);
  const news: [string, string][] = [
    ["09 Sep", "ANSI art decoder live - the archive renders properly now"],
    ["09 Sep", "Board now 132x50, custom palettes on every image"],
    ["08 Sep", "Accounts open. Members reach any address, guests the list"],
  ];
  news.forEach(([when, what], i) => {
    c.put(6, top + 16 + i, when, K.DGREY);
    c.put(15, top + 16 + i, what, K.GREY);
  });

  c.put(4, top + 21, "╔═ LAST CALLERS ═╗", K.CYAN);
  const callers: [string, string, string][] = [
    ["SYSOP", "09 Sep 07:41", "412"],
    ["hopper", "09 Sep 06:02", "38"],
    ["kilroy", "08 Sep 23:17", "7"],
    ["ada", "08 Sep 21:50", "91"],
  ];
  callers.forEach(([who, when, calls], i) => {
    const y = top + 23 + i;
    c.put(6, y, who, who === "SYSOP" ? K.BCYAN : K.GREY);
    c.put(22, y, when, K.DGREY);
    c.put(40, y, calls.padStart(4) + " calls", K.DGREY);
  });

  panel(c, 70, top, "SYSTEM", [
    ["SYSTEM", "bbs.dbhq.uk"],
    ["NODE", "1 OF 1"],
    ["CONNECT", `WASM ${W}x${H}`],
    ["CHARSET", "CP437, 16 COLOUR"],
    ["GATEWAY", "CLOUDFLARE EDGE"],
    ["SYSOP", "IN"],
  ]);

  c.put(4, H - 6, "1992 HARDWARE RULES / 2026 OUTSIDE", K.DGREY);
  footer(c, meterText, statusText);
  return c.art();
}

export function menuArt(
  who: { handle: string; sl: number; flags: string },
  meterText: string,
  statusText: string,
  input: string,
): Art {
  const c = new Canvas();
  const tier = who.sl >= 100 ? "SYSOP" : who.sl >= 20 ? "MEMBER" : who.sl <= 0 ? "TWIT" : "GUEST";
  const top = header(c, "MAIN MENU", `${who.handle}  ·  ${tier}  ·  SL ${who.sl}`);

  // Entries come from the level model, so what is shown and what is
  // permitted are the same declaration and cannot disagree.
  const entries = menuEntries(who.sl, who.flags);
  const conferences = entries.filter((e) => /^[0-9]$/.test(e.key));
  const commands = entries.filter((e) => !/^[0-9]$/.test(e.key) && e.key !== "W");
  const gateway = entries.find((e) => e.key === "W");

  // Hints sit at column 40 and stop before the panel at 70. 28 characters
  // clipped "Enter a URL. Bring back a board." mid-word, which reads as a
  // rendering fault rather than a truncation.
  const HINT_X = 36;
  const HINT_W = 32;
  const hint = (h?: string) => (h ?? "").slice(0, HINT_W);

  c.put(4, top, "╔═ CONFERENCES ═╗", K.CYAN);
  conferences.forEach((e, i) => {
    const y = top + 2 + i;
    c.put(6, y, e.key, K.BYELLOW);
    c.put(9, y, e.label, K.GREY);
    if (e.hint) c.put(HINT_X, y, hint(e.hint), K.DGREY);
  });

  let y = top + 3 + conferences.length;
  if (gateway) {
    c.put(4, y, "╔═ THE GATEWAY ═╗", K.CYAN);
    c.put(6, y + 2, "W", K.BYELLOW);
    c.put(9, y + 2, gateway.label, K.BMAGENTA);
    if (gateway.hint) c.put(HINT_X, y + 2, hint(gateway.hint), K.DGREY);
    y += 4;
  }

  c.put(4, y, "╔═ COMMANDS ═╗", K.CYAN);
  commands.forEach((e, i) => {
    c.put(6, y + 2 + i, e.key, K.BYELLOW);
    c.put(9, y + 2 + i, e.label, K.GREY);
  });

  panel(c, 70, top, "THIS CALL", [
    ["HANDLE", who.handle],
    ["LEVEL", `${who.sl}  ${tier}`],
    ["FLAGS", who.flags || "-"],
    ["MODE", `${W}x${H}`],
    ["GATEWAY", gateway ? "OPEN" : "CLOSED"],
  ]);

  // The curated list, which a guest can reach without an account. Boards
  // published exactly this, and it fills rows that otherwise read as
  // unfinished.
  const sites = [
    "Wikipedia", "BBC News", "Hacker News", "GOV.UK",
    "textfiles.com", "The ANSI Art Archive", "DBHQ",
  ];
  c.put(4, top + 18, "╔═ OPEN TO EVERYONE ═╗", K.CYAN);
  // Two columns, split once. The first attempt drew every entry into
  // column one using i % 4 and THEN drew the overflow into column two, so
  // entries 4-6 overwrote entries 0-2 before appearing again on the right.
  const half = Math.ceil(sites.length / 2);
  sites.forEach((name, i) => {
    const col = i < half ? 6 : 34;
    const rowIndex = i < half ? i : i - half;
    c.put(col, top + 20 + rowIndex, name, K.GREY);
  });

  panel(c, 70, top + 18, "THE BOARD", [
    ["ENGINE", "Rust / WebAssembly"],
    ["RENDER", "on your machine"],
    ["IMAGES", "ANSI, custom palette"],
    ["SOURCE", "github.com/dbhq-uk"],
  ]);

  c.put(4, H - 6, "COMMAND:", K.WHITE);
  c.put(13, H - 6, input + "█", K.BYELLOW);
  footer(c, meterText, statusText);
  return c.art();
}
