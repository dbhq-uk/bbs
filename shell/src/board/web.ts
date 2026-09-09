import { decodeToRgba } from "../images";
import { gwFetch, type Meter } from "../gw";
import { toRawNode } from "../parse";
import type { Screen } from "../terminal";
import { gatewayMessage, NO_DOCUMENT } from "./screens";

export type WebResult =
  | {
      ok: true;
      title: string;
      /// The URL AFTER redirects. Relative href and src values must be
      /// resolved against this, not against what the reader typed.
      finalUrl: string;
      pages: Screen[];
      /// Present only for images quantised with their own sixteen colours.
      /// The terminal must adopt it before drawing, because the cell values
      /// are indices into THIS palette, not the DOS one.
      palette?: [number, number, number][];
      links: { index: number; href: string }[];
      images: { index: number; src: string; alt: string }[];
      meter: Meter;
    }
  | { ok: false; message: string };

type Wasm = {
  render_document: (json: string, cols: number, rows: number) => unknown;
  render_image: (
    rgba: Uint8Array,
    w: number,
    h: number,
    cols: number,
    maxRows: number,
    mono: boolean,
    cellH: number,
    autoPalette: boolean,
    artFont: boolean,
  ) => unknown;
  render_ansi_art: (
    bytes: Uint8Array,
    rows: number,
  ) => unknown;
};

export async function openUrl(url: string, wasm: Wasm): Promise<WebResult> {
  const got = await gwFetch(url);
  if (!got.ok) return { ok: false, message: gatewayMessage(got.reason) };

  // Real ANSI art, drawn for an 80-column screen. It goes to the decoder
  // rather than the HTML projection: these files ARE screens already, and
  // projecting them would be like running a photograph through a spell
  // checker.
  if (got.contentType === "text/x-ansi") {
    const art = wasm.render_ansi_art(new Uint8Array(got.bytes), 24) as {
      pages: Screen[];
      title: string;
      author: string;
      group: string;
    };
    // SAUCE is how the scene credited itself, and showing it is the least
    // the board can do when displaying someone else's work.
    const credit = [art.title, art.author && `by ${art.author}`, art.group]
      .filter(Boolean)
      .join("  ");
    return {
      ok: true,
      title: credit || url,
      finalUrl: got.finalUrl,
      pages: art.pages,
      links: [],
      images: [],
      meter: got.meter,
    };
  }

  if (got.contentType.startsWith("image/")) {
    const { rgba, w, h } = await decodeToRgba(got.bytes);
    // Sixteen colours chosen for this picture, snapped to the VGA DAC.
    // The palette comes back with the screen because the cell values are
    // indices into it - see PaletteMode::Auto in the core.
    const img = wasm.render_image(rgba, w, h, 80, 24, false, 16, true, true) as {
      screen: Screen;
      palette: [number, number, number][];
    };
    return {
      ok: true,
      title: url,
      finalUrl: got.finalUrl,
      pages: [img.screen],
      palette: img.palette,
      links: [],
      images: [],
      meter: got.meter,
    };
  }

  const html = new TextDecoder("utf-8").decode(got.bytes);
  const result = wasm.render_document(toRawNode(html), 80, 23) as {
    title: string;
    pages: Screen[];
    empty_shell: boolean;
    links: { index: number; href: string }[];
    images: { index: number; src: string; alt: string }[];
  };

  if (result.empty_shell) return { ok: false, message: NO_DOCUMENT };

  return {
    ok: true,
    title: result.title,
    finalUrl: got.finalUrl,
    pages: result.pages,
    links: result.links,
    images: result.images,
    meter: got.meter,
  };
}

/// Fetches one image and quantises it. Returns null rather than throwing,
/// because a failed image must never take the page down with it.
export async function fetchImage(
  src: string,
  base: string,
  wasm: Wasm,
): Promise<Screen | null> {
  let abs: string;
  try {
    abs = new URL(src, base).toString();
  } catch {
    return null;
  }
  const got = await gwFetch(abs);
  if (!got.ok || !got.contentType.startsWith("image/")) return null;
  try {
    const { rgba, w, h } = await decodeToRgba(got.bytes);
    const img = wasm.render_image(rgba, w, h, 80, 24, false, 16, true, true) as {
      screen: Screen;
      palette: [number, number, number][];
    };
    return img.screen;
  } catch {
    return null;
  }
}
