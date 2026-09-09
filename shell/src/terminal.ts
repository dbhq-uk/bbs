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

/// THE BOARD RUNS AT 132x60.
///
/// VESA text mode 10Ch: 1056x480 with an 8x8 cell. It is the largest of the
/// standard extended text modes, and DOS terminal programs - Telix, Qmodem,
/// Telemate - used exactly these to show more of a screen at once. Nearly
/// four times the cells of 80x25, which is what the image quantiser and the
/// web projection both wanted.
///
/// The cell is 8 wide here, not 9. The ninth column belongs to the 720x400
/// 80-column mode, where it carried the inter-character gap and repeated
/// the eighth column for box drawing; the 132-column modes are 8-dot, and a
/// 9x8 cell would be wider than it is tall and distort every image.
export const CELL_W = 8;
export const COLS = 132;

/// The real text modes this board can be in.
///
/// `pixelAspect` is how much taller than wide a pixel was, and it is not
/// decoration - without it 132x60 draws as 1056x480, which is 2.20:1 and
/// looks stretched flat, because no monitor of the era was that shape.
/// These modes were displayed on 4:3 glass, so the pixels were never
/// square: the framebuffer was wide and the tube stretched it back.
///
/// 1056 / (4/3) / 480 = 1.65, and 720 / (4/3) / 400 = 1.35.
///
/// This is applied at DISPLAY time only. The framebuffer keeps its real
/// dimensions, so a cell is still 8x8 to the quantiser and to every glyph
/// mask; only the CSS box is taller. Baking it into the cell instead would
/// distort the glyphs and change what the quantiser is matching against.
export const MODE_25 = { cols: 80, rows: 25, cellH: 16, cellW: 9, pixelAspect: 1.35 } as const;
export const MODE_50 = { cols: 80, rows: 50, cellH: 8, cellW: 9, pixelAspect: 1.35 } as const;
export const MODE_132 = { cols: 132, rows: 60, cellH: 8, cellW: 8, pixelAspect: 1.65 } as const;

export const CELL_H = MODE_132.cellH;
export const ROWS = MODE_132.rows;

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
  private cellH: number = MODE_132.cellH;
  private rows: number = MODE_132.rows;
  private pixelAspect: number = MODE_132.pixelAspect;

  /// `fonts` maps cell height to font bytes: 16 always, 8 for the 80x50
  /// mode. Both come from the core so there is one source for the glyphs.
  constructor(canvas: HTMLCanvasElement, fonts: Record<number, Uint8Array>) {
    this.canvas = canvas;
    this.fonts = fonts;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;

    this.setMode(MODE_132.rows, MODE_132.cellH, MODE_132.pixelAspect);
  }

  /// Switches text mode. A VGA card did this by loading a different font,
  /// which is exactly what happens here.
  setMode(rows: number, cellH: number, pixelAspect = this.pixelAspect) {
    if (!this.fonts[cellH]) return;
    this.rows = rows;
    this.cellH = cellH;
    this.pixelAspect = pixelAspect;
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

    // The BACKING STORE stays at the mode's real pixel size, so glyphs are
    // drawn on exact pixel boundaries and stay crisp.
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;

    // The CSS box is taller. This is the tube doing the stretching, which
    // is where it happened, and `image-rendering: pixelated` keeps the
    // scale-up hard-edged rather than blurring it.
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${Math.round(h * this.pixelAspect)}px`;
    this.canvas.style.imageRendering = "pixelated";

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
