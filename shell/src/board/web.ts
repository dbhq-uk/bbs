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
  ) => unknown;
};

export async function openUrl(url: string, wasm: Wasm): Promise<WebResult> {
  const got = await gwFetch(url);
  if (!got.ok) return { ok: false, message: gatewayMessage(got.reason) };

  if (got.contentType.startsWith("image/")) {
    const { rgba, w, h } = await decodeToRgba(got.bytes);
    const screen = wasm.render_image(rgba, w, h, 80, 24, false) as Screen;
    return {
      ok: true,
      title: url,
      finalUrl: got.finalUrl,
      pages: [screen],
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
    return wasm.render_image(rgba, w, h, 80, 24, false) as Screen;
  } catch {
    return null;
  }
}
