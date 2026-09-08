export type Decoded = { rgba: Uint8Array; w: number; h: number };

/// Decodes with the browser's own codecs, which cover JPEG, PNG, GIF, WebP
/// and AVIF for zero bundle bytes. This is why the core does not ship the
/// Rust image crate.
export async function decodeToRgba(bytes: ArrayBuffer): Promise<Decoded> {
  const blob = new Blob([bytes]);
  const bitmap = await createImageBitmap(blob);

  // Cap the working size. A 6000px source gains nothing at 80 columns and
  // costs real time in getImageData.
  const MAX = 1200;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context for image decode");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const data = ctx.getImageData(0, 0, w, h).data;
  return { rgba: new Uint8Array(data.buffer.slice(0)), w, h };
}
