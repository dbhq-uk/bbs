export const CELL_W = 8;
export const CELL_H = 16;
export const COLS = 80;
export const ROWS = 25;

/// Must match core/src/screen.rs PALETTE exactly. These are the standard
/// VGA values, not a modern terminal's reinterpretation of them.
export const PALETTE_CSS = [
  "#000000", "#aa0000", "#00aa00", "#aa5500",
  "#0000aa", "#aa00aa", "#00aaaa", "#aaaaaa",
  "#555555", "#ff5555", "#55ff55", "#ffff55",
  "#5555ff", "#ff55ff", "#55ffff", "#ffffff",
];

export type Cell = { ch: number; fg: number; bg: number };
export type Screen = { w: number; h: number; cells: Cell[] };

export function cellRect(cx: number, cy: number) {
  return { x: cx * CELL_W, y: cy * CELL_H, w: CELL_W, h: CELL_H };
}

export function glyphAtlasLayout() {
  return { cols: 16, rows: 16, width: 16 * CELL_W, height: 16 * CELL_H };
}

export class Terminal {
  private ctx: CanvasRenderingContext2D;
  /// One pre-rendered atlas per palette colour, so drawing a cell is a
  /// single drawImage with no per-pixel work.
  private atlases: HTMLCanvasElement[] = [];

  constructor(canvas: HTMLCanvasElement, fontBytes: Uint8Array) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = COLS * CELL_W * dpr;
    canvas.height = ROWS * CELL_H * dpr;
    canvas.style.width = `${COLS * CELL_W}px`;
    canvas.style.height = `${ROWS * CELL_H}px`;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d context");
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    for (let c = 0; c < 16; c++) {
      this.atlases.push(buildAtlas(fontBytes, PALETTE_CSS[c]));
    }
  }

  clear() {
    this.ctx.fillStyle = PALETTE_CSS[0];
    this.ctx.fillRect(0, 0, COLS * CELL_W, ROWS * CELL_H);
  }

  draw(screen: Screen) {
    this.clear();
    const layout = glyphAtlasLayout();
    for (let y = 0; y < Math.min(screen.h, ROWS); y++) {
      for (let x = 0; x < Math.min(screen.w, COLS); x++) {
        const cell = screen.cells[y * screen.w + x];
        if (!cell) continue;
        const { x: px, y: py } = cellRect(x, y);

        if (cell.bg !== 0) {
          this.ctx.fillStyle = PALETTE_CSS[cell.bg];
          this.ctx.fillRect(px, py, CELL_W, CELL_H);
        }
        if (cell.ch === 32) continue; // space: background only

        const sx = (cell.ch % layout.cols) * CELL_W;
        const sy = Math.floor(cell.ch / layout.cols) * CELL_H;
        this.ctx.drawImage(
          this.atlases[cell.fg], sx, sy, CELL_W, CELL_H, px, py, CELL_W, CELL_H,
        );
      }
    }
  }
}

/// Renders all 256 glyphs into a 16x16 grid in one colour.
function buildAtlas(fontBytes: Uint8Array, css: string): HTMLCanvasElement {
  const layout = glyphAtlasLayout();
  const c = document.createElement("canvas");
  c.width = layout.width;
  c.height = layout.height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(layout.width, layout.height);
  const [r, g, b] = hexToRgb(css);

  for (let code = 0; code < 256; code++) {
    const gx = (code % layout.cols) * CELL_W;
    const gy = Math.floor(code / layout.cols) * CELL_H;
    for (let row = 0; row < CELL_H; row++) {
      const bits = fontBytes[code * CELL_H + row];
      for (let col = 0; col < CELL_W; col++) {
        // MSB is the leftmost pixel.
        if (!((bits >> (7 - col)) & 1)) continue;
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

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
