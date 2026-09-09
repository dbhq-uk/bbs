/// The ASCII and ANSI art generator.
///
/// Everything runs in the browser: the image is decoded with the browser's
/// own codecs, converted by the same Rust core the board uses, and never
/// sent anywhere. That is worth saying out loud on the page, because every
/// competitor for these searches uploads your photograph to a server.

import init, { font_bytes_for, render_ascii, render_image } from "bbs-core";
import { decodeToRgba } from "./images";
import { CELL_W, GLYPH_W, PALETTE_CSS, type Screen } from "./terminal";

type Mode = "ascii" | "ansi";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let source: { rgba: Uint8Array; w: number; h: number } | null = null;
let font16: Uint8Array;
let lastText = "";

async function boot() {
  await init();
  font16 = font_bytes_for(16);

  const drop = $("drop");
  const file = $<HTMLInputElement>("file");

  drop.addEventListener("click", () => file.click());
  drop.addEventListener("keydown", (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      file.click();
    }
  });
  file.addEventListener("change", () => {
    if (file.files?.[0]) load(file.files[0]);
  });

  // Drag and drop, plus paste, because a screenshot in the clipboard is the
  // commonest way people arrive at a tool like this.
  for (const type of ["dragenter", "dragover"]) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.remove("over");
    });
  }
  drop.addEventListener("drop", (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) load(f);
  });
  window.addEventListener("paste", (e) => {
    const item = [...((e as ClipboardEvent).clipboardData?.items ?? [])]
      .find((i) => i.type.startsWith("image/"));
    const f = item?.getAsFile();
    if (f) load(f);
  });

  for (const id of ["mode", "cols", "fine", "invert", "palette", "artfont"]) {
    $(id).addEventListener("input", render);
  }
  $("copy").addEventListener("click", copy);
  $("download").addEventListener("click", download);

  // A sample, so the page is not an empty box on arrival. Search visitors
  // who land here should see what it does before deciding to upload.
  await sample();
}

async function load(f: File) {
  if (!f.type.startsWith("image/")) {
    say("That is not an image file.");
    return;
  }
  say("Converting...");
  try {
    source = await decodeToRgba(await f.arrayBuffer());
    render();
  } catch {
    say("Could not read that image.");
  }
}

/// A small generated sample: a soft radial gradient, which shows the tonal
/// ramp off better than a flat colour and needs no asset to download.
async function sample() {
  const n = 320;
  const rgba = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x - n / 2) / (n / 2);
      const dy = (y - n / 2) / (n / 2);
      const d = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const v = Math.round(255 * d * d);
      const i = (y * n + x) * 4;
      rgba[i] = v;
      rgba[i + 1] = Math.round(v * 0.75);
      rgba[i + 2] = Math.round(v * 0.55);
      rgba[i + 3] = 255;
    }
  }
  source = { rgba, w: n, h: n };
  render();
}

function say(msg: string) {
  $("status").textContent = msg;
}

function render() {
  if (!source) return;
  const mode = $<HTMLSelectElement>("mode").value as Mode;
  const cols = Number($<HTMLInputElement>("cols").value);
  $("colsOut").textContent = String(cols);

  const text = $("out-text");
  const canvas = $<HTMLCanvasElement>("out-canvas");
  const asciiOnly = document.querySelectorAll<HTMLElement>("[data-ascii-only]");
  const ansiOnly = document.querySelectorAll<HTMLElement>("[data-ansi-only]");

  for (const el of asciiOnly) el.hidden = mode !== "ascii";
  for (const el of ansiOnly) el.hidden = mode !== "ansi";

  if (mode === "ascii") {
    text.hidden = false;
    canvas.hidden = true;
    lastText = render_ascii(
      source.rgba, source.w, source.h, cols,
      $<HTMLInputElement>("fine").checked,
      $<HTMLInputElement>("invert").checked,
    );
    text.textContent = lastText;
    say(`${cols} columns, plain text you can paste anywhere.`);
    return;
  }

  text.hidden = true;
  canvas.hidden = false;
  const img = render_image(
    source.rgba, source.w, source.h, cols, 400, false, 16,
    $<HTMLInputElement>("palette").checked,
    $<HTMLInputElement>("artfont").checked,
    $<HTMLInputElement>("artfont").checked ? "art" : "blocks",
  ) as { screen: Screen; palette: [number, number, number][] };

  paint(canvas, img.screen, img.palette);
  say(`${cols} columns, 16 colours chosen for this picture.`);
}

/// Draws a quantised screen. Deliberately simple - one fillRect for the
/// background and a per-pixel glyph blit - because this runs once per
/// change rather than per frame.
function paint(
  canvas: HTMLCanvasElement,
  screen: Screen,
  palette: [number, number, number][],
) {
  const css = palette.length === 16
    ? palette.map(([r, g, b]) => `rgb(${r},${g},${b})`)
    : PALETTE_CSS;
  const cw = CELL_W;
  const ch = 16;
  canvas.width = screen.w * cw;
  canvas.height = screen.h * ch;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < screen.h; y++) {
    for (let x = 0; x < screen.w; x++) {
      const cell = screen.cells[y * screen.w + x];
      if (!cell) continue;
      ctx.fillStyle = css[cell.bg];
      ctx.fillRect(x * cw, y * ch, cw, ch);
      if (cell.ch === 32) continue;
      ctx.fillStyle = css[cell.fg];
      for (let row = 0; row < ch; row++) {
        const bits = font16[cell.ch * ch + row];
        if (!bits) continue;
        for (let col = 0; col < GLYPH_W; col++) {
          if ((bits >> (7 - col)) & 1) ctx.fillRect(x * cw + col, y * ch + row, 1, 1);
        }
      }
    }
  }
}

async function copy() {
  const mode = $<HTMLSelectElement>("mode").value as Mode;
  if (mode !== "ascii") {
    say("Colour output is an image. Use Download.");
    return;
  }
  try {
    await navigator.clipboard.writeText(lastText);
    say("Copied.");
  } catch {
    say("Could not reach the clipboard. Select the text and copy it.");
  }
}

function download() {
  const mode = $<HTMLSelectElement>("mode").value as Mode;
  const a = document.createElement("a");
  if (mode === "ascii") {
    a.href = URL.createObjectURL(new Blob([lastText], { type: "text/plain" }));
    a.download = "ascii-art.txt";
  } else {
    a.href = $<HTMLCanvasElement>("out-canvas").toDataURL("image/png");
    a.download = "ansi-art.png";
  }
  a.click();
  URL.revokeObjectURL(a.href);
}

boot();
