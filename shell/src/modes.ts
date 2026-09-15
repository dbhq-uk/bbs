/// The text modes the board can be in, and how it picks one.
///
/// Kept free of the DOM so the choice can be tested without a browser, a
/// canvas or a layout. Terminal re-exports these so nothing else has to
/// know the split.

export type Mode = {
  cols: number;
  rows: number;
  cellH: number;
  cellW: number;
  /// How much taller than wide a pixel was. These modes were displayed on
  /// 4:3 glass, so the pixels were rarely square: the framebuffer was wide
  /// and the tube stretched it back.
  pixelAspect: number;
};

export const MODE_25: Mode = { cols: 80, rows: 25, cellH: 16, cellW: 9, pixelAspect: 1.35 };
export const MODE_50: Mode = { cols: 80, rows: 50, cellH: 8, cellW: 9, pixelAspect: 1.35 };
export const MODE_132: Mode = { cols: 132, rows: 50, cellH: 16, cellW: 8, pixelAspect: 1.0 };

/// How wide one character ends up on the glass, in CSS pixels, once the mode
/// has been scaled to fit the box it is given.
///
/// This mirrors Terminal.fit() exactly, and must keep mirroring it: the
/// board only ever scales DOWN, so a large window does not blow the
/// framebuffer up past its native size and make it blurrier.
export function scaledCellW(m: Mode, boxW: number, boxH: number): number {
  const nativeW = m.cols * m.cellW;
  const nativeH = m.rows * m.cellH * m.pixelAspect;
  return m.cellW * Math.min(1, boxW / nativeW, boxH / nativeH);
}

/// Below this many CSS pixels per character, 132 columns stops being text
/// and becomes a texture. Measured on the live site at a 393px viewport,
/// where it lands at 2.6.
const NARROW_BELOW = 5.0;

/// And back to 132 only once there is real headroom.
///
/// WITHOUT THE GAP THIS OSCILLATES. A single threshold flips mode on the
/// exact box width where the two are equal, and the iOS keyboard animating
/// in and out crosses it on almost every frame - each crossing calling
/// setMode, which reloads the font and rebuilds sixteen glyph atlases.
const WIDE_ABOVE = 5.6;

/// Picks the mode from the space available, never from the device.
///
/// Deliberately not a touch or user-agent test. A narrow desktop window has
/// exactly the same problem as a phone and deserves the same answer, which
/// also means the whole thing is testable by dragging a window edge rather
/// than by picking up a handset.
export function chooseMode(boxW: number, boxH: number, current: Mode = MODE_132): Mode {
  const wide = scaledCellW(MODE_132, boxW, boxH);
  const threshold = current.cols === MODE_132.cols ? NARROW_BELOW : WIDE_ABOVE;
  return wide >= threshold ? MODE_132 : MODE_25;
}

/// True when the board is in the compact mode, which is the one question
/// the rest of the shell actually asks.
export function isNarrow(m: Mode): boolean {
  return m.cols < MODE_132.cols;
}
