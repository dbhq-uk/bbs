/// The glyph bitmap is 8 pixels wide. The CELL is 9.
///
/// Real VGA text mode drew 80 columns into 720 pixels, not 640: the
/// character generator emitted a ninth column after each glyph. For most
/// characters it was blank, which is the inter-character gap; for the
/// line-drawing range 0xC0-0xDF it repeated the eighth column, which is the
/// only reason box drawing joins up instead of showing a hairline seam
/// every eight pixels.
///
/// Drawing at 8 is what a modern terminal does and it is subtly wrong - the
/// aspect is off by 12% and every long box rule is dashed.
export const GLYPH_W = 8;
export const CELL_W = 9;
export const COLS = 80;

/// The two real VGA text modes. 80x25 uses a 16-row cell, 80x50 an 8-row
/// one; the card switched fonts, it did not scale anything.
export const MODE_25 = { rows: 25, cellH: 16 } as const;
export const MODE_50 = { rows: 50, cellH: 8 } as const;

export const CELL_H = MODE_25.cellH;
export const ROWS = MODE_25.rows;

/// The line-drawing range whose ninth column repeats the eighth.
function joinsAcross(code: number): boolean {
  return code >= 0xc0 && code <= 0xdf;
}

/// Must match core/src/screen.rs PALETTE exactly. These are the standard
/// VGA values, not a modern terminal's reinterpretation of them.
///
/// Only the DEFAULT, though. An image quantised with PaletteMode::Auto
/// carries its own sixteen, and drawing it with these would show something
/// quite unlike what the quantiser measured - see setPalette.
export const PALETTE_CSS = [
  "#000000", "#aa0000", "#00aa00", "#aa5500",
  "#0000aa", "#aa00aa", "#00aaaa", "#aaaaaa",
  "#555555", "#ff5555", "#55ff55", "#ffff55",
  "#5555ff", "#ff55ff", "#55ffff", "#ffffff",
];

export type Cell = { ch: number; fg: number; bg: number };
export type Screen = { w: number; h: number; cells: Cell[] };
export type Rgb = [number, number, number];

export function cellRect(cx: number, cy: number, cellH: number = CELL_H) {
  return { x: cx * CELL_W, y: cy * cellH, w: CELL_W, h: cellH };
}

export function glyphAtlasLayout(cellH: number = CELL_H) {
  return { cols: 16, rows: 16, width: 16 * CELL_W, height: 16 * cellH };
}

export class Terminal {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  /// One pre-rendered atlas per palette colour, so drawing a cell is a
  /// single drawImage with no per-pixel work.
  private atlases: HTMLCanvasElement[] = [];
  private palette: string[] = PALETTE_CSS;
  private fonts: Record<number, Uint8Array>;
  private cellH: number = MODE_25.cellH;
  private rows: number = MODE_25.rows;

  /// `fonts` maps cell height to font bytes: 16 always, 8 for the 80x50
  /// mode. Both come from the core so there is one source for the glyphs.
  constructor(canvas: HTMLCanvasElement, fonts: Record<number, Uint8Array>) {
    this.canvas = canvas;
    this.fonts = fonts;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;

    this.setMode(MODE_25.rows, MODE_25.cellH);
  }

  /// Switches text mode. A VGA card did this by loading a different font,
  /// which is exactly what happens here.
  setMode(rows: number, cellH: number) {
    if (!this.fonts[cellH]) return;
    this.rows = rows;
    this.cellH = cellH;
    this.resize();
    this.rebuild();
  }

  /// Adopts a palette that arrived with an image. Passing null restores the
  /// DOS sixteen.
  setPalette(rgb: Rgb[] | null) {
    const next = rgb && rgb.length === 16
      ? rgb.map(([r, g, b]) => `#${[r, g, b].map(hex2).join("")}`)
      : PALETTE_CSS;
    if (next.every((c, i) => c === this.palette[i])) return; // nothing to do
    this.palette = next;
    this.rebuild();
  }

  get mode() {
    return { rows: this.rows, cellH: this.cellH };
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = COLS * CELL_W;
    const h = this.rows * this.cellH;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  private rebuild() {
    const font = this.fonts[this.cellH];
    this.atlases = this.palette.map((css) => buildAtlas(font, css, this.cellH));
  }

  clear() {
    this.ctx.fillStyle = this.palette[0];
    this.ctx.fillRect(0, 0, COLS * CELL_W, this.rows * this.cellH);
  }

  draw(screen: Screen) {
    this.clear();
    const layout = glyphAtlasLayout(this.cellH);
    for (let y = 0; y < Math.min(screen.h, this.rows); y++) {
      for (let x = 0; x < Math.min(screen.w, COLS); x++) {
        const cell = screen.cells[y * screen.w + x];
        if (!cell) continue;
        const { x: px, y: py } = cellRect(x, y, this.cellH);

        if (cell.bg !== 0) {
          this.ctx.fillStyle = this.palette[cell.bg];
          this.ctx.fillRect(px, py, CELL_W, this.cellH);
        }
        if (cell.ch === 32) continue; // space: background only

        const sx = (cell.ch % layout.cols) * CELL_W;
        const sy = Math.floor(cell.ch / layout.cols) * this.cellH;
        this.ctx.drawImage(
          this.atlases[cell.fg],
          sx, sy, CELL_W, this.cellH,
          px, py, CELL_W, this.cellH,
        );
      }
    }
  }
}

/// Renders all 256 glyphs into a 16x16 grid in one colour, nine pixels wide.
function buildAtlas(
  fontBytes: Uint8Array,
  css: string,
  cellH: number,
): HTMLCanvasElement {
  const layout = glyphAtlasLayout(cellH);
  const c = document.createElement("canvas");
  c.width = layout.width;
  c.height = layout.height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(layout.width, layout.height);
  const [r, g, b] = hexToRgb(css);

  for (let code = 0; code < 256; code++) {
    const gx = (code % layout.cols) * CELL_W;
    const gy = Math.floor(code / layout.cols) * cellH;
    for (let row = 0; row < cellH; row++) {
      const bits = fontBytes[code * cellH + row];
      for (let col = 0; col < CELL_W; col++) {
        // The ninth column is not in the font. It repeats the eighth for
        // the line-drawing range and is blank otherwise - the VGA rule.
        const on = col < GLYPH_W
          ? (bits >> (7 - col)) & 1
          : joinsAcross(code) && (bits & 1);
        if (!on) continue;
        const i = ((gy + row) * layout.width + (gx + col)) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
