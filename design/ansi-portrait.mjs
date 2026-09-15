#!/usr/bin/env node
/**
 * Renders the sysop portrait on /about/ through the board's own quantiser.
 *
 * The caption on that page says "converted by the board's own quantiser",
 * and until this script existed that was true but unrepeatable: the PNG had
 * been exported from the ASCII art tool by hand, so nobody could reproduce
 * it, and the repo's own rule is that generated assets come from a
 * generator you edit rather than from output you touch up.
 *
 * WHY 8x8 CELLS AND NOT 8x16.
 *
 * The portrait looked squashed, and the aspect ratio was not the reason -
 * the frame and the subject box both match the source crop to within about
 * one percent. What was wrong is the sampling.
 *
 * A cell is one glyph, so a cell is one sample. At 8x16 a 76-column
 * portrait gets 76 samples across and only 47 down, and the quantiser's
 * rows come straight from that: rows = h*cols*8 / (w*cell_h). Horizontal
 * detail is then two-thirds finer than vertical, so eyes, brows and mouth -
 * all of which are wide and thin - are smeared into the rows above and
 * below them while the outline stays honest. A face reads as squashed long
 * before an outline does.
 *
 * 8x8 is the 80x50 VGA text mode, as real as the 8x16 one, and it doubles
 * the rows for the same width: 94 instead of 47, at the same 608x752 PNG.
 * design/fidelity.py exists to compare exactly this and reached the same
 * answer.
 *
 *   node design/ansi-portrait.mjs            # writes shell/public/dan-ansi.png
 *
 * Run design/portrait.py first: it does the crop, the background removal
 * and the tone mapping this reads.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import init, { font_bytes_for, render_image } from "../core/pkg/bbs_core.js";

const PREPPED = process.argv[2] ?? "/tmp/dan-prepped.png";
const OUT = process.argv[3] ?? "shell/public/dan-ansi.png";

/// Matches the width the tool was driven at, and the width the committed
/// PNG has always had. Changing it changes the file's dimensions, which the
/// about page states in width/height attributes.
const COLS = 76;
/// 8x8: the 80x50 mode. See the note above on why this is not 16.
const CELL_H = 8;

await init(readFileSync(new URL("../core/pkg/bbs_core_bg.wasm", import.meta.url)));

// PIL does the decoding and the encoding. The board does that part in the
// browser, which has better codecs than anything worth bundling here, and
// this script is not the browser.
const raw = JSON.parse(
  execFileSync("python3", ["-c", `
import json, sys
import numpy as np
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
a = np.asarray(im, dtype=np.uint8)
print(json.dumps({"w": im.width, "h": im.height, "rgba": a.reshape(-1).tolist()}))
`, PREPPED], { maxBuffer: 1 << 30 }).toString(),
);

const { screen, palette } = render_image(
  new Uint8Array(raw.rgba), raw.w, raw.h,
  COLS, 400, false, CELL_H,
  true,   // sixteen colours chosen for this picture, snapped to the VGA DAC
  true,   // the art font
  "art",
);

const font = font_bytes_for(CELL_H);
const W = screen.w * 8;
const H = screen.h * CELL_H;
const px = Buffer.alloc(W * H * 3);

for (let cy = 0; cy < screen.h; cy++) {
  for (let cx = 0; cx < screen.w; cx++) {
    const cell = screen.cells[cy * screen.w + cx];
    const fg = palette[cell.fg];
    const bg = palette[cell.bg];
    for (let row = 0; row < CELL_H; row++) {
      const bits = font[cell.ch * CELL_H + row];
      for (let col = 0; col < 8; col++) {
        // The ninth column belongs to the 720x400 80-column mode. This is an
        // 8-dot render, so every column comes from the glyph itself.
        const on = (bits >> (7 - col)) & 1;
        const [r, g, b] = on ? fg : bg;
        const i = ((cy * CELL_H + row) * W + cx * 8 + col) * 3;
        px[i] = r; px[i + 1] = g; px[i + 2] = b;
      }
    }
  }
}

const ppm = "/tmp/dan-ansi.ppm";
writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), px]));
execFileSync("python3", ["-c", `
import sys
from PIL import Image
Image.open(sys.argv[1]).save(sys.argv[2], optimize=True)
`, ppm, OUT]);

console.log(`${OUT}  ${screen.w}x${screen.h} cells of 8x${CELL_H}  ->  ${W}x${H}`);
