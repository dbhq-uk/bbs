import { chooseMode, MODE_132, type Mode } from "./modes";

export { MODE_25, MODE_50, MODE_132, chooseMode, isNarrow, scaledCellW } from "./modes";
export type { Mode } from "./modes";

/// The glyph bitmap is 8 pixels wide. The CELL is sometimes 9.
///
/// Real VGA text mode drew 80 columns into 720 pixels, not 640: the
/// character generator emitted a ninth column after each glyph. For most
/// characters it was blank, which is the inter-character gap; for the
/// line-drawing range 0xC0-0xDF it repeated the eighth column, which is the
/// only reason box drawing joins up instead of showing a hairline seam
/// every eight pixels.
///
/// Drawing at 8 is what a modern terminal does and it is subtly wrong - the
/// aspect is off by 12% and every long box rule is dashed. The 132-column
/// VESA modes really are 8-dot, so the cell width belongs to the mode.
export const GLYPH_W = 8;

/// The 132-column cell, exported for the ASCII art tool, which is a
/// separate page in a fixed mode and does not switch.
export const CELL_W = 8;

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

/// The line-drawing range whose ninth column repeats the eighth.
function joinsAcross(code: number): boolean {
  return code >= 0xc0 && code <= 0xdf;
}

export function glyphAtlasLayout(cellH: number, cellW: number) {
  return { cols: 16, rows: 16, width: 16 * cellW, height: 16 * cellH };
}

export class Terminal {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  /// One pre-rendered atlas per palette colour, so drawing a cell is a
  /// single drawImage with no per-pixel work.
  private atlases: HTMLCanvasElement[] = [];
  private palette: string[] = PALETTE_CSS;
  private fonts: Record<number, Uint8Array>;
  private current: Mode = MODE_132;
  /// Set while fit() is applying a mode, so the resize it triggers cannot
  /// re-enter the chooser.
  private switching = false;

  /// `fonts` maps cell height to font bytes: 16 always, 8 for the 80x50
  /// mode. Both come from the core so there is one source for the glyphs.
  constructor(canvas: HTMLCanvasElement, fonts: Record<number, Uint8Array>) {
    this.canvas = canvas;
    this.fonts = fonts;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;

    this.apply(MODE_132);
  }

  get mode(): Mode {
    return this.current;
  }

  /// Switches text mode. A VGA card did this by loading a different font,
  /// which is exactly what happens here.
  private apply(m: Mode) {
    if (!this.fonts[m.cellH]) return;
    this.current = m;
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

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.current.cols * this.current.cellW;
    const h = this.current.rows * this.current.cellH;

    // The BACKING STORE stays at the mode's real pixel size, so glyphs are
    // drawn on exact pixel boundaries and stay crisp.
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.imageRendering = "pixelated";

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /// How much room the board actually has, which is not the same as how
  /// much room the layout gave it.
  ///
  /// iOS does NOT change window.innerHeight when the soft keyboard opens -
  /// the layout viewport stays exactly as it was and the keyboard is drawn
  /// over the top. Sizing to the container alone therefore puts the bottom
  /// of the board, which is where the input line is, underneath the
  /// keyboard the caller is typing on. visualViewport is the only thing
  /// that reports the shrink.
  private available(box: HTMLElement): { w: number; h: number } {
    // clientWidth and clientHeight INCLUDE padding, and #board has some.
    // Sizing the canvas to them therefore makes it taller than the space it
    // is sitting in by exactly the padding, every time - which is what made
    // the board page scroll when it is meant to fill the viewport exactly
    // and never scroll. On a phone that scrollbar is the difference between
    // the board filling the screen and being a band with black around it.
    const cs = getComputedStyle(box);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

    const w = box.clientWidth - padX;
    let h = box.clientHeight - padY;

    const vv = window.visualViewport;
    if (vv) {
      const top = box.getBoundingClientRect().top;
      h = Math.min(h, vv.offsetTop + vv.height - top - padY);
    }
    return { w: Math.max(0, w), h: Math.max(0, h) };
  }

  /// Picks the mode for the space available, then sizes the CSS box to fit
  /// it while keeping the aspect the mode is meant to have.
  ///
  /// Done in script rather than with max-width/max-height because a canvas
  /// takes its intrinsic size from its width and height ATTRIBUTES, and
  /// those are multiplied by devicePixelRatio here - so on a 2x display the
  /// intrinsic size is twice what CSS should be laying out, and every
  /// percentage rule is computed against the wrong number.
  ///
  /// The board fills the viewport between the header and footer and must
  /// never scroll, so this only ever scales DOWN: a small window shrinks the
  /// board rather than clipping it, and a large one does not blow it up past
  /// its native size, which would only make it blurrier.
  fit() {
    const box = this.canvas.parentElement;
    if (!box) return;
    // On first load the container can still be zero-height when this runs,
    // and scaling to that collapses the board to nothing. Wait for the next
    // frame rather than rendering a 0x0 canvas.
    if (box.clientHeight === 0 || box.clientWidth === 0) {
      requestAnimationFrame(() => this.fit());
      return;
    }

    const { w: boxW, h: boxH } = this.available(box);
    if (boxH === 0) return;

    if (!this.switching) {
      const want = chooseMode(boxW, boxH, this.current);
      if (want.cols !== this.current.cols || want.rows !== this.current.rows) {
        this.switching = true;
        this.apply(want);
        this.switching = false;
      }
    }

    const nativeW = this.current.cols * this.current.cellW;
    const nativeH = this.current.rows * this.current.cellH * this.current.pixelAspect;
    const scale = Math.min(1, boxW / nativeW, boxH / nativeH);
    this.canvas.style.width = `${Math.floor(nativeW * scale)}px`;
    this.canvas.style.height = `${Math.floor(nativeH * scale)}px`;
  }

  private rebuild() {
    const font = this.fonts[this.current.cellH];
    this.atlases = this.palette.map((css) =>
      buildAtlas(font, css, this.current.cellH, this.current.cellW),
    );
  }

  clear() {
    this.ctx.fillStyle = this.palette[0];
    this.ctx.fillRect(
      0, 0,
      this.current.cols * this.current.cellW,
      this.current.rows * this.current.cellH,
    );
  }

  draw(screen: Screen) {
    this.clear();
    const { cellW, cellH, cols, rows } = this.current;
    const layout = glyphAtlasLayout(cellH, cellW);
    for (let y = 0; y < Math.min(screen.h, rows); y++) {
      for (let x = 0; x < Math.min(screen.w, cols); x++) {
        const cell = screen.cells[y * screen.w + x];
        if (!cell) continue;
        const px = x * cellW;
        const py = y * cellH;

        if (cell.bg !== 0) {
          this.ctx.fillStyle = this.palette[cell.bg];
          this.ctx.fillRect(px, py, cellW, cellH);
        }
        if (cell.ch === 32) continue; // space: background only

        const sx = (cell.ch % layout.cols) * cellW;
        const sy = Math.floor(cell.ch / layout.cols) * cellH;
        this.ctx.drawImage(
          this.atlases[cell.fg],
          sx, sy, cellW, cellH,
          px, py, cellW, cellH,
        );
      }
    }
  }
}

/// Renders all 256 glyphs into a 16x16 grid in one colour.
function buildAtlas(
  fontBytes: Uint8Array,
  css: string,
  cellH: number,
  cellW: number,
): HTMLCanvasElement {
  const layout = glyphAtlasLayout(cellH, cellW);
  const c = document.createElement("canvas");
  c.width = layout.width;
  c.height = layout.height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(layout.width, layout.height);
  const [r, g, b] = hexToRgb(css);

  for (let code = 0; code < 256; code++) {
    const gx = (code % layout.cols) * cellW;
    const gy = Math.floor(code / layout.cols) * cellH;
    for (let row = 0; row < cellH; row++) {
      const bits = fontBytes[code * cellH + row];
      for (let col = 0; col < cellW; col++) {
        // The ninth column is not in the font. It repeats the eighth for
        // the line-drawing range and is blank otherwise - the VGA rule.
        // In an 8-dot mode there is no ninth column and this never fires.
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
