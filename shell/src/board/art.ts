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

/// `hot` is the rows a pointer can press, and what pressing one sends.
/// Reported rather than re-derived: menuArt already computes the row each
/// entry lands on, and a second copy of that arithmetic in the tap handler
/// is a copy that goes out of step.
export type Art = {
  lines: string[];
  fg: string[];
  bg: string[];
  hot: import("../touch").Hot[];
};

/// A cell grid that emits the three parallel arrays render_art expects.
class Canvas {
  private ch: string[][] = [];
  private fg: string[][] = [];
  private bg: string[][] = [];
  /// Collected as entries are placed, so a row and its key are recorded by
  /// the same call that draws it.
  readonly hot: import("../touch").Hot[] = [];
  readonly w: number;
  readonly h: number;

  // Written out rather than declared as constructor parameters: the build
  // sets erasableSyntaxOnly, so a parameter property is a compile error.
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    for (let y = 0; y < h; y++) {
      this.ch.push(new Array(w).fill(" "));
      this.fg.push(new Array(w).fill(K.GREY));
      this.bg.push(new Array(w).fill(K.BLACK));
    }
  }

  /// Marks a row as pressable. Separate from put() because a control is
  /// usually two calls - the key and its label - and only one row.
  hits(row: number, ...keys: string[]) {
    if (row < 0 || row >= this.h) return;
    this.hot.push({ row, keys });
  }

  put(x: number, y: number, s: string, fg = K.GREY, bg = K.BLACK) {
    if (y < 0 || y >= this.h) return;
    for (let i = 0; i < s.length; i++) {
      const cx = x + i;
      if (cx < 0 || cx >= this.w) continue;
      this.ch[y][cx] = s[i];
      this.fg[y][cx] = fg;
      this.bg[y][cx] = bg;
    }
  }

  fill(x: number, y: number, w: number, h: number, s: string, fg = K.GREY, bg = K.BLACK) {
    for (let yy = y; yy < Math.min(y + h, this.h); yy++) {
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
      hot: this.hot,
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
  const W = c.w;
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
  const W = c.w;
  const H = c.h;
  const text = meterText || statusText;
  c.put(0, H - 4, "─".repeat(W), K.DGREY);
  c.put(2, H - 3, text, K.WHITE);
  c.put(0, H - 1, "▄".repeat(W), K.DGREY);

  // The sister project, cross-linked as a board would list its affiliates -
  // but only when the row has room for both.
  //
  // It was placed at a fixed W-30. At 132 columns that is far clear of the
  // meter; at 80 it lands on column 50, and the meter line is 52 characters
  // long, so the caller's remaining time was overwritten mid-word:
  // "REQUESTS LEsister board: modem.dbhq.uk". No length check can see this,
  // because the row is still exactly 80 wide - the collision is inside it.
  const sister = "sister board: modem.dbhq.uk";
  const at = W - sister.length - 3;
  if (at > text.length + 3) c.put(at, H - 3, sister, K.BMAGENTA);
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

function wideLoginArt(meterText: string, statusText: string): Art {
  const c = new Canvas(132, 50);
  const W = c.w;
  const H = c.h;
  const top = header(c, "PUBLIC ACCESS · EST. 2026", "NODE 1 OF 1");

  c.put(4, top, "THE WORLD WIDE WEB, AS IT SHOULD HAVE BEEN", K.WHITE);
  c.put(4, top + 2, "Every page fetched is stripped of script, tracking and", K.GREY);
  c.put(4, top + 3, "chrome, then redrawn in CP437 on your own machine.", K.GREY);
  c.put(4, top + 4, "Images become ANSI art on the way past.", K.GREY);

  c.hits(top + 7, "Enter");
  c.put(4, top + 7, "[ ENTER ]", K.BYELLOW);
  c.put(16, top + 7, "LOG ON", K.WHITE);
  c.hits(top + 9, "N");
  c.put(4, top + 9, "[ N ]", K.BYELLOW);
  c.put(16, top + 9, "New user application", K.GREY);
  c.hits(top + 11, "G");
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

function wideMenuArt(
  who: { handle: string; sl: number; flags: string },
  meterText: string,
  statusText: string,
  input: string,
): Art {
  const c = new Canvas(132, 50);
  const W = c.w;
  const H = c.h;
  const tier = tierOf(who.sl);
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
    c.hits(y, e.key);
    c.put(6, y, e.key, K.BYELLOW);
    c.put(9, y, e.label, K.GREY);
    if (e.hint) c.put(HINT_X, y, hint(e.hint), K.DGREY);
  });

  let y = top + 3 + conferences.length;
  if (gateway) {
    c.put(4, y, "╔═ THE GATEWAY ═╗", K.CYAN);
    c.hits(y + 2, "W");
    c.put(6, y + 2, "W", K.BYELLOW);
    c.put(9, y + 2, gateway.label, K.BMAGENTA);
    if (gateway.hint) c.put(HINT_X, y + 2, hint(gateway.hint), K.DGREY);
    y += 4;
  }

  c.put(4, y, "╔═ COMMANDS ═╗", K.CYAN);
  commands.forEach((e, i) => {
    c.hits(y + 2 + i, e.key);
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

function tierOf(sl: number): string {
  return sl >= 100 ? "SYSOP" : sl >= 20 ? "MEMBER" : sl <= 0 ? "TWIT" : "GUEST";
}

/// The compact header: three rows against the wide one's fourteen.
///
/// At 25 rows the wordmark cannot be both present and affordable on the
/// menu, so only the login screen draws it. Everything else gets a title
/// bar, which is what a board with 25 lines to spend actually did.
function narrowHeader(c: Canvas, left: string, right: string): number {
  const W = c.w;
  c.put(0, 0, "═".repeat(W), K.BBLUE);
  c.put(2, 1, left, K.BCYAN);
  if (right) c.put(Math.max(0, W - right.length - 2), 1, right, K.DGREY);
  c.put(0, 2, "─".repeat(W), K.DGREY);
  return 4;
}

function narrowLoginArt(meterText: string, statusText: string): Art {
  const c = new Canvas(80, 25);
  const W = c.w;
  const H = c.h;

  c.put(0, 0, "═".repeat(W), K.BBLUE);

  // The wordmark is 46 wide and survives the move to 80 columns intact,
  // which is the whole reason the login screen keeps it and the menu does
  // not - it is the board's face and it costs 7 of the 25 rows.
  const x = 2;
  const y = 1;
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

  // Unspaced, unlike the wide header. "B U L L E T I N   B O A R D   S Y S
  // T E M" is 41 columns and there are only 28 to the right of the
  // wordmark here.
  c.put(52, y + 1, "BULLETIN BOARD SYSTEM", K.BCYAN);
  c.put(52, y + 3, "the world wide web,", K.WHITE);
  c.put(52, y + 4, "as a board", K.WHITE);
  c.put(52, y + 6, "PUBLIC ACCESS", K.BMAGENTA);

  c.put(0, 9, "═".repeat(W), K.BBLUE);
  c.put(2, 10, "bbs.dbhq.uk", K.BCYAN);
  c.put(W - 13, 10, "NODE 1 OF 1", K.DGREY);
  c.put(0, 11, "─".repeat(W), K.DGREY);

  c.hits(13, "Enter");
  c.put(4, 13, "[ ENTER ]", K.BYELLOW);
  c.put(16, 13, "LOG ON", K.WHITE);
  c.hits(14, "N");
  c.put(4, 14, "[ N ]", K.BYELLOW);
  c.put(16, 14, "New user application", K.GREY);
  c.hits(15, "G");
  c.put(4, 15, "[ G ]", K.BYELLOW);
  c.put(16, 15, "Guest - browse the curated list", K.GREY);

  c.put(4, 17, "Every page is stripped of script and tracking, then", K.GREY);
  c.put(4, 18, "redrawn in CP437 on your own machine.", K.GREY);

  c.put(4, H - 5, "1992 HARDWARE RULES / 2026 OUTSIDE", K.DGREY);
  footer(c, meterText, statusText);
  return c.art();
}

function narrowMenuArt(
  who: { handle: string; sl: number; flags: string },
  meterText: string,
  statusText: string,
  input: string,
): Art {
  const c = new Canvas(80, 25);
  const H = c.h;
  const tier = tierOf(who.sl);
  let y = narrowHeader(c, "MAIN MENU", `${who.handle} · ${tier} · SL ${who.sl}`);

  const entries = menuEntries(who.sl, who.flags);
  const conferences = entries.filter((e) => /^[0-9]$/.test(e.key));
  const commands = entries.filter((e) => !/^[0-9]$/.test(e.key) && e.key !== "W");
  const gateway = entries.find((e) => e.key === "W");

  // The last row a list may use. Below it are the command prompt and the
  // footer, and a list that ran into them would draw over the input line -
  // the one row on this screen that has to be legible.
  const LAST = H - 7;

  // Laid out by a running cursor rather than absolute rows, because the
  // entries come from the level model and a sysop sees more of them than a
  // guest. The wide screen can afford to reserve space for the maximum;
  // at 25 rows it has to pack.
  const section = (title: string, items: { key: string; label: string }[]) => {
    if (!items.length || y > LAST) return;
    c.put(2, y, title, K.CYAN);
    y += 1;
    for (const e of items) {
      if (y > LAST) return;
      c.hits(y, e.key);
      c.put(4, y, e.key, K.BYELLOW);
      c.put(7, y, e.label.slice(0, 70), e.key === "W" ? K.BMAGENTA : K.GREY);
      y += 1;
    }
    y += 1;
  };

  section("╔═ CONFERENCES ═╗", conferences);
  if (gateway) section("╔═ THE GATEWAY ═╗", [gateway]);
  section("╔═ COMMANDS ═╗", commands);

  c.put(2, H - 6, "COMMAND:", K.WHITE);
  c.put(11, H - 6, input + "█", K.BYELLOW);
  footer(c, meterText, statusText);
  return c.art();
}

/// PORTRAIT, WITH A WAY OUT.
///
/// A phone held upright gives the board about 4.9 CSS pixels per character,
/// which is legible only in the sense that the glyphs are technically
/// present. Landscape roughly doubles it.
///
/// The dismiss key is not a courtesy. Orientation lock is common, and a
/// tablet in a case may never report landscape at all; a hard block would
/// simply lose those readers with no way for them to disagree.
export function rotateArt(mode: { cols: number; rows: number }): Art {
  const c = new Canvas(mode.cols, mode.rows);
  const W = c.w;
  const H = c.h;
  const mid = Math.floor(H / 2) - 3;
  const centre = (s: string) => Math.max(0, Math.floor((W - s.length) / 2));

  c.put(0, 0, "═".repeat(W), K.BBLUE);
  c.put(2, 1, "bbs.dbhq.uk", K.BCYAN);
  c.put(0, 2, "─".repeat(W), K.DGREY);

  const title = "TURN YOUR HANDSET SIDEWAYS";
  c.put(centre(title), mid, title, K.BCYAN);

  const body = "This board is 80 columns wide. It was always going to want";
  const body2 = "a landscape screen.";
  c.put(centre(body), mid + 2, body, K.GREY);
  c.put(centre(body2), mid + 3, body2, K.GREY);

  const key = "[ C ]  CARRY ON ANYWAY";
  c.hits(mid + 5, "C");
  c.put(centre(key), mid + 5, key, K.BYELLOW);

  c.put(0, H - 1, "▄".repeat(W), K.DGREY);
  return c.art();
}

/// The board's screens, in whichever mode the terminal is currently in.
///
/// Two compositions rather than one that stretches. 132x50 has 6,600 cells
/// and 80x25 has 2,000, and a layout that reads as generous at one is
/// either cramped or half empty at the other.
export function loginArt(meterText: string, statusText: string, narrow: boolean): Art {
  return narrow ? narrowLoginArt(meterText, statusText) : wideLoginArt(meterText, statusText);
}

export function menuArt(
  who: { handle: string; sl: number; flags: string },
  meterText: string,
  statusText: string,
  input: string,
  narrow: boolean,
): Art {
  return narrow
    ? narrowMenuArt(who, meterText, statusText, input)
    : wideMenuArt(who, meterText, statusText, input);
}
